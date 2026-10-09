const db = require('../config/db');
const { applyMovement } = require('../services/inventoryService');
const { AppValidationError } = require('../utils/errors');

const normalizeBoolean = (value) => value === true || value === 1 || value === '1' || value === 'true';

const normalizeSerialIds = (serialIds) => {
    if (!Array.isArray(serialIds)) return [];
    return serialIds
        .map(id => Number(id))
        .filter(id => Number.isInteger(id) && id > 0);
};

// ==========================================
// PROCESS A NEW SALE (POS Checkout)
// POST /api/sales/checkout (and POST /api/sales)
// ==========================================
exports.checkout = async (req, res, next) => {
    const {
        items,
        cart,
        payment_method,
        paymentMethod,
        tendered_amount,
        tenderedAmount,
        payment_reference,
        paymentReference,
        customer_name,
        notes
    } = req.body;

    const cartItems = items || cart || [];
    const rawMethod = (payment_method || paymentMethod || 'Cash').trim();
    const methodUpper = rawMethod.toUpperCase();
    const method = methodUpper === 'GCASH' ? 'GCash' : (methodUpper === 'CARD' ? 'Card' : 'Cash');
    const rawTendered = tendered_amount !== undefined ? tendered_amount : tenderedAmount;
    const refNo = (payment_reference || paymentReference || req.body.gcash_reference_no || req.body.reference_no || '').trim();
    const userId = req.user?.id;

    if (!cartItems || cartItems.length === 0) {
        return res.status(422).json({ message: 'Cart cannot be empty for checkout' });
    }

    const validMethods = ['Cash', 'GCash', 'Card'];
    if (!validMethods.includes(method)) {
        return res.status(422).json({ 
            message: `Invalid payment method "${rawMethod}". Supported: ${validMethods.join(', ')}` 
        });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Sort cart lines by itemId before acquiring row locks (prevents lock-order deadlocks)
        const sortedLines = [...cartItems].sort((a, b) => {
            const idA = Number(a.product_id || a.productId || a.itemId || a.item_id);
            const idB = Number(b.product_id || b.productId || b.itemId || b.item_id);
            return idA - idB;
        });

        // 2. Validate line items and tally totals in integer centavos to eliminate floating-point drift
        let totalAmountCentavos = 0;
        const validatedItems = [];

        for (const item of sortedLines) {
            const productId = Number(item.product_id || item.productId || item.itemId || item.item_id);
            const qty = Number(item.quantity);
            const serialIds = normalizeSerialIds(item.serial_ids);

            if (!productId || !Number.isInteger(productId)) {
                throw new AppValidationError('A valid item/product ID is required for each cart line');
            }

            if (!Number.isInteger(qty) || qty <= 0) {
                throw new AppValidationError(`Invalid quantity (${qty}) for item ID ${productId}`);
            }

            // Acquire pessimistic row lock (FOR UPDATE)
            const [productRows] = await connection.query(
                `SELECT id, part_number, sku, name, brand, size, stock, current_stock, selling_price, retail_price, cost_price, is_serialized
                 FROM products
                 WHERE id = ? AND is_active = true
                 FOR UPDATE`,
                [productId]
            );

            if (productRows.length === 0) {
                throw new AppValidationError(`Item ID ${productId} not found or is currently inactive`);
            }

            const product = productRows[0];
            const serialized = normalizeBoolean(product.is_serialized);

            // Serial validation
            if (serialized) {
                if (serialIds.length === 0) {
                    throw new AppValidationError(`Serial selection is required for ${product.name}`);
                }
                const uniqueSerialIds = [...new Set(serialIds)];
                if (uniqueSerialIds.length !== serialIds.length) {
                    throw new AppValidationError(`Duplicate serial selections are not allowed for ${product.name}`);
                }
                if (qty !== serialIds.length) {
                    throw new AppValidationError(`Serialized quantity (${qty}) must match selected serial count (${serialIds.length}) for ${product.name}`);
                }

                const placeholders = serialIds.map(() => '?').join(', ');
                const [serialRows] = await connection.query(
                    `SELECT id FROM product_serials
                     WHERE product_id = ? AND status = 'available' AND id IN (${placeholders})
                     FOR UPDATE`,
                    [productId, ...serialIds]
                );

                if (serialRows.length !== serialIds.length) {
                    throw new AppValidationError(`One or more selected serial numbers for ${product.name} are no longer available.`);
                }
            } else if (serialIds.length > 0) {
                throw new AppValidationError(`Serial numbers cannot be assigned to non-serialized product ${product.name}`);
            }

            const currentStock = Number(product.current_stock ?? product.stock ?? 0);
            if (currentStock < qty) {
                throw new AppValidationError(`Insufficient stock for ${product.name} (SKU: ${product.sku || product.part_number}). On hand: ${currentStock}, Requested: ${qty}`);
            }

            const unitPrice = Number(product.selling_price || product.retail_price || item.price || item.unit_price || 0.00);
            const unitPriceCentavos = Math.round(unitPrice * 100);
            const lineSubtotalCentavos = unitPriceCentavos * qty;
            totalAmountCentavos += lineSubtotalCentavos;

            validatedItems.push({
                product_id: productId,
                part_number: product.part_number,
                sku: product.sku || product.part_number,
                product_name: product.name,
                brand: product.brand,
                size: product.size,
                quantity: qty,
                unit_price: unitPrice,
                subtotal: (lineSubtotalCentavos / 100),
                is_serialized: serialized,
                serial_ids: serialIds,
                cost_price: Number(product.cost_price || 0.00)
            });
        }

        const totalAmount = totalAmountCentavos / 100;

        // 3. Enforce Payment Invariants (tally in integer centavos)
        let tenderedCentavos = 0;
        let changeDueCentavos = 0;

        if (method === 'Cash') {
            tenderedCentavos = Math.round(Number(rawTendered || 0) * 100);
            if (tenderedCentavos < totalAmountCentavos) {
                if (totalAmountCentavos - tenderedCentavos <= 1) {
                    tenderedCentavos = totalAmountCentavos;
                } else {
                    throw new AppValidationError(
                        `Insufficient cash tendered. Total: ₱${totalAmount.toFixed(2)}, Tendered: ₱${(tenderedCentavos / 100).toFixed(2)}`
                    );
                }
            }
            changeDueCentavos = Math.max(0, tenderedCentavos - totalAmountCentavos);
        } else if (method === 'GCash') {
            // Invariant: GCash requires exact amount, zero change, and reference number >= 6 chars
            tenderedCentavos = totalAmountCentavos;
            changeDueCentavos = 0;

            if (!refNo || refNo.length < 6) {
                throw new AppValidationError('GCash payment requires a valid reference number of at least 6 characters');
            }
        } else {
            // Card or other electronic payments
            tenderedCentavos = totalAmountCentavos;
            changeDueCentavos = 0;
        }

        const finalTendered = tenderedCentavos / 100;
        const finalChangeDue = changeDueCentavos / 100;

        // 4. Generate order_no via sales_order_seq sequence (SO-YYYY-NNNN)
        let nextSeqVal;
        try {
            const [fallbackRows] = await connection.query('INSERT INTO sales_order_seq VALUES (NULL)');
            nextSeqVal = fallbackRows.insertId;
        } catch (seqErr) {
            try {
                const [seqRows] = await connection.query('SELECT NEXT VALUE FOR sales_order_seq AS next_val');
                nextSeqVal = seqRows[0].next_val;
            } catch (err2) {
                nextSeqVal = Math.floor(1000 + Math.random() * 9000);
            }
        }

        const year = new Date().getFullYear();
        const orderNo = `SO-${year}-${String(nextSeqVal).padStart(4, '0')}`;

        // 5. Insert sales_orders header record
        const [orderResult] = await connection.query(
            `INSERT INTO sales_orders (
                order_number, user_id, customer_name, total_amount, subtotal_amount,
                discount_amount, tax_amount, payment_method, payment_status,
                tendered_amount, change_due, payment_reference, payment_provider,
                paid_at, status, notes, created_at
            ) VALUES (?, ?, ?, ?, ?, 0.00, 0.00, ?, 'paid', ?, ?, ?, ?, NOW(), 'completed', ?, NOW())`,
            [
                orderNo,
                userId,
                customer_name || 'Walk-in Customer',
                totalAmount,
                totalAmount,
                method,
                finalTendered,
                finalChangeDue,
                refNo || null,
                method,
                notes || null
            ]
        );
        const salesOrderId = orderResult.insertId;

        // Also insert into sales table for backwards compatibility
        const [legacySaleResult] = await connection.query(
            `INSERT INTO sales (
                user_id, total_amount, tendered_amount, change_due, payment_method, order_number, payment_reference, sale_date
            ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
            [userId, totalAmount, finalTendered, finalChangeDue, method, orderNo, refNo || null]
        );
        const legacySaleId = legacySaleResult.insertId;

        // 6. Insert line items and call applyMovement (SALE) atomically for each line
        for (const item of validatedItems) {
            // Insert sales_order_items
            await connection.query(
                `INSERT INTO sales_order_items (
                    sales_order_id, product_id, part_number, product_name, brand, size, quantity, price, subtotal, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
                [
                    salesOrderId,
                    item.product_id,
                    item.part_number,
                    item.product_name,
                    item.brand,
                    item.size,
                    item.quantity,
                    item.unit_price,
                    item.subtotal
                ]
            );

            // Insert legacy sale_items
            const [saleItemResult] = await connection.query(
                `INSERT INTO sale_items (
                    sale_id, product_id, part_number, product_name, brand, size, quantity, price, subtotal
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    legacySaleId,
                    item.product_id,
                    item.part_number,
                    item.product_name,
                    item.brand,
                    item.size,
                    item.quantity,
                    item.unit_price,
                    item.subtotal
                ]
            );
            const legacySaleItemId = saleItemResult.insertId;

            // Handle Serials if serialized
            if (item.is_serialized && item.serial_ids.length > 0) {
                await connection.query(
                    `UPDATE product_serials
                     SET status = 'sold'
                     WHERE product_id = ? AND status = 'available' AND id IN (${item.serial_ids.map(() => '?').join(', ')})`,
                    [item.product_id, ...item.serial_ids]
                );

                const serialValues = item.serial_ids.map(sId => [legacySaleItemId, sId]);
                await connection.query('INSERT INTO sale_item_serials (sale_item_id, serial_id) VALUES ?', [serialValues]);
            }

            // Deduct inventory and log SALE row via inventoryService atomically
            await applyMovement(connection, {
                itemId: item.product_id,
                transactionType: 'SALE',
                quantityChange: -item.quantity,
                referenceNo: orderNo,
                referenceType: 'SALES_ORDER',
                referenceId: salesOrderId,
                unitCost: item.cost_price,
                remarks: `POS Sale: ${orderNo} (${item.quantity}x ${item.product_name})`,
                createdBy: userId
            });
        }

        await connection.commit();

        const orderSummary = {
            id: salesOrderId,
            order_number: orderNo,
            order_no: orderNo,
            sales_order_id: salesOrderId,
            sale_id: legacySaleId,
            payment_method: method,
            total_amount: totalAmount,
            tendered_amount: finalTendered,
            change_due: finalChangeDue,
            payment_reference: refNo || null,
            items: validatedItems
        };

        res.status(201).json({
            message: 'Transaction completed successfully.',
            order_no: orderNo,
            order_number: orderNo,
            sales_order_id: salesOrderId,
            sale_id: legacySaleId,
            payment_method: method,
            total_amount: totalAmount,
            tendered_amount: finalTendered,
            change_due: finalChangeDue,
            payment_reference: refNo || null,
            items: validatedItems,
            order: orderSummary
        });

    } catch (err) {
        await connection.rollback();
        next(err);
    } finally {
        connection.release();
    }
};

// Aliased for route compatibility
exports.createSale = exports.checkout;

// ==========================================
// GET ALL SALES (For Transactions Page)
// ==========================================
exports.getSales = async (req, res, next) => {
    const userId = req.user.id;
    const role = req.user.role;

    try {
        let query = `
            SELECT s.id, COALESCE(s.order_number, CONCAT('SO-', s.id)) AS order_number,
                   s.total_amount, s.tendered_amount, s.change_due, s.payment_method,
                   s.payment_reference, s.sale_date, u.username as cashier,
                   GROUP_CONCAT(DISTINCT si.product_name ORDER BY si.product_name SEPARATOR ', ') as products_included,
                   GROUP_CONCAT(DISTINCT si.part_number ORDER BY si.part_number SEPARATOR ', ') as part_numbers,
                   GROUP_CONCAT(DISTINCT si.brand ORDER BY si.brand SEPARATOR ', ') as brands,
                   GROUP_CONCAT(DISTINCT si.size ORDER BY si.size SEPARATOR ', ') as sizes
            FROM sales s
            JOIN users u ON s.user_id = u.id
            LEFT JOIN sale_items si ON s.id = si.sale_id
        `;
        let queryParams = [];

        if (role !== 'admin') {
            query += ` WHERE s.user_id = ? `;
            queryParams.push(userId);
        }

        query += ` GROUP BY s.id, s.order_number, s.total_amount, s.tendered_amount, s.change_due, s.payment_method, s.payment_reference, s.sale_date, u.username ORDER BY s.sale_date DESC`;

        const [sales] = await db.query(query, queryParams);
        res.json(sales);
    } catch (err) {
        next(err);
    }
};

// ==========================================
// GET SALE BY ID (For Receipt Printing)
// ==========================================
exports.getSaleById = async (req, res, next) => {
    const { id } = req.params;
    try {
        const [saleRows] = await db.query(`
            SELECT s.id, COALESCE(s.order_number, CONCAT('SO-', s.id)) AS order_number,
                   s.total_amount, s.tendered_amount, s.change_due, s.payment_method,
                   s.payment_reference, s.sale_date, u.username as cashier
            FROM sales s
            JOIN users u ON s.user_id = u.id
            WHERE s.id = ?
        `, [id]);

        if (saleRows.length === 0) {
            return res.status(404).json({ message: 'Sale not found' });
        }

        const [items] = await db.query(`
            SELECT
                si.quantity,
                si.price,
                si.subtotal,
                si.part_number,
                si.product_name,
                si.brand,
                si.size,
                COALESCE(
                    GROUP_CONCAT(DISTINCT ps.serial_number ORDER BY ps.serial_number SEPARATOR ', '),
                    ''
                ) AS serial_numbers
            FROM sale_items si
            LEFT JOIN sale_item_serials sis ON sis.sale_item_id = si.id
            LEFT JOIN product_serials ps ON ps.id = sis.serial_id
            WHERE si.sale_id = ?
            GROUP BY
                si.id,
                si.quantity,
                si.price,
                si.subtotal,
                si.part_number,
                si.product_name,
                si.brand,
                si.size
        `, [id]);

        res.json({ ...saleRows[0], items });
    } catch (err) {
        next(err);
    }
};

// ==========================================
// GET BEST SELLERS AGGREGATION
// GET /api/sales/best-sellers?limit=5&days=30
// ==========================================
exports.getBestSellers = async (req, res) => {
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit, 10) || 5));
    const days = req.query.days ? parseInt(req.query.days, 10) : null;

    try {
        let whereClause = 'WHERE 1=1';
        const params = [];

        if (days && Number.isInteger(days) && days > 0) {
            whereClause += ' AND so.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)';
            params.push(days);
        }

        params.push(limit);

        let [bestSellers] = await db.query(`
            SELECT 
                i.id,
                COALESCE(i.sku, i.part_number) AS sku,
                i.name,
                i.brand,
                i.category,
                CAST(COALESCE(i.retail_price, i.selling_price) AS DOUBLE) AS retail_price,
                CAST(COALESCE(i.current_stock, i.stock) AS SIGNED) AS current_stock,
                CAST(COALESCE(SUM(soi.quantity), 0) AS SIGNED) AS units_sold,
                CAST(COUNT(DISTINCT so.id) AS SIGNED) AS order_count
            FROM sales_order_items soi
            JOIN sales_orders so ON soi.sales_order_id = so.id
            JOIN items i ON soi.product_id = i.id
            ${whereClause}
            GROUP BY i.id, i.sku, i.part_number, i.name, i.brand, i.category, i.retail_price, i.selling_price, i.current_stock, i.stock
            ORDER BY units_sold DESC
            LIMIT ?
        `, params);

        // Fallback to legacy sale_items if sales_order_items has no records
        if (bestSellers.length === 0) {
            let legacyWhere = 'WHERE 1=1';
            const legacyParams = [];
            if (days && Number.isInteger(days) && days > 0) {
                legacyWhere += ' AND s.sale_date >= DATE_SUB(NOW(), INTERVAL ? DAY)';
                legacyParams.push(days);
            }
            legacyParams.push(limit);

            const [legacyRows] = await db.query(`
                SELECT 
                    i.id,
                    COALESCE(i.sku, i.part_number) AS sku,
                    i.name,
                    i.brand,
                    i.category,
                    CAST(COALESCE(i.retail_price, i.selling_price) AS DOUBLE) AS retail_price,
                    CAST(COALESCE(i.current_stock, i.stock) AS SIGNED) AS current_stock,
                    CAST(COALESCE(SUM(si.quantity), 0) AS SIGNED) AS units_sold,
                    CAST(COUNT(DISTINCT s.id) AS SIGNED) AS order_count
                FROM sale_items si
                JOIN sales s ON si.sale_id = s.id
                JOIN items i ON (si.product_id = i.id)
                ${legacyWhere}
                GROUP BY i.id, i.sku, i.part_number, i.name, i.brand, i.category, i.retail_price, i.selling_price, i.current_stock, i.stock
                ORDER BY units_sold DESC
                LIMIT ?
            `, legacyParams);

            if (legacyRows.length > 0) {
                bestSellers = legacyRows;
            }
        }

        // Ensure all slots up to limit are populated so Top 1 to Top 5 are always returned
        if (bestSellers.length < limit) {
            const existingIds = bestSellers.map(b => b.id);
            const remainingCount = limit - bestSellers.length;
            const notInClause = existingIds.length > 0 ? `AND i.id NOT IN (${existingIds.join(',')})` : '';

            const [fillRows] = await db.query(`
                SELECT 
                    i.id,
                    COALESCE(i.sku, i.part_number) AS sku,
                    i.name,
                    i.brand,
                    i.category,
                    CAST(COALESCE(i.retail_price, i.selling_price) AS DOUBLE) AS retail_price,
                    CAST(COALESCE(i.current_stock, i.stock) AS SIGNED) AS current_stock,
                    0 AS units_sold,
                    0 AS order_count
                FROM items i
                WHERE i.is_active = 1 ${notInClause}
                ORDER BY i.current_stock DESC, i.id ASC
                LIMIT ?
            `, [remainingCount]);

            bestSellers = [...bestSellers, ...fillRows];
        }

        return res.json({
            success: true,
            timeframe: days ? `Last ${days} days` : 'All time',
            count: bestSellers.length,
            data: bestSellers
        });
    } catch (err) {
        console.error('Best Sellers Query Error:', err);
        return res.status(500).json({ error: 'Failed to retrieve best-selling products.' });
    }
};
