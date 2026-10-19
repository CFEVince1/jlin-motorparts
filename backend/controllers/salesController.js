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
    let method = 'Cash';
    if (methodUpper === 'GCASH') method = 'GCash';
    else if (methodUpper === 'CARD') method = 'Card';
    else if (methodUpper === 'SPLIT' || methodUpper === 'CASH + GCASH') method = 'Split';
    else method = 'Cash';

    const rawTendered = tendered_amount !== undefined ? tendered_amount : tenderedAmount;
    const refNo = (payment_reference || paymentReference || req.body.gcash_reference_no || req.body.reference_no || '').trim();
    const userId = req.user?.id;

    if (!cartItems || cartItems.length === 0) {
        return res.status(422).json({ message: 'Cart cannot be empty for checkout' });
    }

    const validMethods = ['Cash', 'GCash', 'Card', 'Split'];
    if (!validMethods.includes(method)) {
        return res.status(422).json({ 
            message: `Invalid payment method "${rawMethod}". Supported: ${validMethods.join(', ')}` 
        });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Merge cart lines by product ID first (prevents duplicate key errors on transaction_number and race conditions)
        const mergedMap = new Map();
        for (const item of cartItems) {
            const productId = Number(item.product_id || item.productId || item.itemId || item.item_id);
            if (!productId || !Number.isInteger(productId) || productId <= 0) {
                throw new AppValidationError('A valid item/product ID is required for each cart line');
            }
            const qty = Number(item.quantity ?? item.qty);
            if (!Number.isInteger(qty) || qty <= 0) {
                throw new AppValidationError(`Invalid quantity (${item.quantity ?? item.qty}) for item ID ${productId}`);
            }
            const serialIds = normalizeSerialIds(item.serial_ids || item.serialIds);

            if (mergedMap.has(productId)) {
                const existing = mergedMap.get(productId);
                existing.quantity += qty;
                existing.serial_ids = [...existing.serial_ids, ...serialIds];
            } else {
                mergedMap.set(productId, {
                    ...item,
                    product_id: productId,
                    quantity: qty,
                    serial_ids: serialIds
                });
            }
        }

        // Sort merged cart lines by product_id to prevent lock-order deadlocks
        const sortedLines = Array.from(mergedMap.values()).sort((a, b) => a.product_id - b.product_id);

        // 2. Validate line items and tally totals in integer centavos to eliminate floating-point drift
        let totalAmountCentavos = 0;
        const validatedItems = [];

        for (const item of sortedLines) {
            const productId = item.product_id;
            const qty = item.quantity;
            const serialIds = item.serial_ids;

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

            const currentStock = Number(
                product.current_stock !== null && product.current_stock !== undefined && (product.current_stock > 0 || (product.stock ?? 0) <= 0)
                    ? product.current_stock
                    : (product.stock ?? 0)
            );
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
        let cashAmountCentavos = null;
        let gcashAmountCentavos = null;

        if (method === 'Cash') {
            if (rawTendered === null || rawTendered === undefined || rawTendered === '') {
                throw new AppValidationError('A valid numeric cash amount tendered is required');
            }
            const numericTendered = Number(rawTendered);
            if (!Number.isFinite(numericTendered) || numericTendered < 0) {
                throw new AppValidationError('A valid numeric cash amount tendered is required');
            }
            tenderedCentavos = Math.round(numericTendered * 100);
            // Strict invariant: Cash tendered must be greater than or equal to total amount in centavos (no shortfall allowance)
            if (tenderedCentavos < totalAmountCentavos) {
                throw new AppValidationError(
                    `Insufficient cash tendered. Total: ₱${totalAmount.toFixed(2)}, Tendered: ₱${(tenderedCentavos / 100).toFixed(2)}`
                );
            }
            changeDueCentavos = tenderedCentavos - totalAmountCentavos;
            cashAmountCentavos = totalAmountCentavos;
            gcashAmountCentavos = 0;
        } else if (method === 'GCash') {
            // Invariant: GCash requires exact amount, zero change, and reference number >= 6 chars
            tenderedCentavos = totalAmountCentavos;
            changeDueCentavos = 0;
            cashAmountCentavos = 0;
            gcashAmountCentavos = totalAmountCentavos;

            if (!refNo || refNo.length < 6) {
                throw new AppValidationError('GCash payment requires a valid reference number of at least 6 characters');
            }

            // Invariant: GCash reference number must be unique across all sales
            const [existingSales] = await connection.query(
                'SELECT id, order_number FROM sales WHERE payment_reference = ? LIMIT 1',
                [refNo]
            );
            if (existingSales.length > 0) {
                throw new AppValidationError(
                    `GCash reference already used: "${refNo}" has already been used on order ${existingSales[0].order_number || ('#' + existingSales[0].id)}`
                );
            }
        } else if (method === 'Split') {
            const rawCash = req.body.cash_amount !== undefined ? req.body.cash_amount : req.body.cashAmount;
            const rawGcash = req.body.gcash_amount !== undefined ? req.body.gcash_amount : req.body.gcashAmount;
            const rawCashTendered = rawTendered !== undefined && rawTendered !== '' ? rawTendered : rawCash;

            const numCash = Number(rawCash);
            const numGcash = Number(rawGcash);
            const numCashTendered = Number(rawCashTendered);

            if (!Number.isFinite(numCash) || numCash <= 0) {
                throw new AppValidationError('A valid numeric cash portion is required for split payment');
            }
            if (!Number.isFinite(numGcash) || numGcash <= 0) {
                throw new AppValidationError('A valid numeric GCash portion is required for split payment');
            }
            if (!Number.isFinite(numCashTendered) || numCashTendered < numCash) {
                throw new AppValidationError(`Cash tendered must be at least the cash portion (₱${numCash.toFixed(2)})`);
            }

            cashAmountCentavos = Math.round(numCash * 100);
            gcashAmountCentavos = Math.round(numGcash * 100);
            const cashTenderedCentavos = Math.round(numCashTendered * 100);

            if (cashAmountCentavos + gcashAmountCentavos < totalAmountCentavos) {
                throw new AppValidationError(
                    `Combined cash and GCash (₱${((cashAmountCentavos + gcashAmountCentavos) / 100).toFixed(2)}) is less than total amount (₱${totalAmount.toFixed(2)})`
                );
            }

            if (!refNo || refNo.length < 6) {
                throw new AppValidationError('GCash reference number of at least 6 characters is required for the GCash portion');
            }

            // Invariant: GCash reference number must be unique across all sales
            const [existingSales] = await connection.query(
                'SELECT id, order_number FROM sales WHERE payment_reference = ? LIMIT 1',
                [refNo]
            );
            if (existingSales.length > 0) {
                throw new AppValidationError(
                    `GCash reference already used: "${refNo}" has already been used on order ${existingSales[0].order_number || ('#' + existingSales[0].id)}`
                );
            }

            tenderedCentavos = cashTenderedCentavos + gcashAmountCentavos;
            changeDueCentavos = cashTenderedCentavos - cashAmountCentavos;
        } else {
            // Card or other electronic payments
            tenderedCentavos = totalAmountCentavos;
            changeDueCentavos = 0;
        }

        const finalTendered = tenderedCentavos / 100;
        const finalChangeDue = changeDueCentavos / 100;
        const finalCashAmount = cashAmountCentavos !== null ? (cashAmountCentavos / 100) : null;
        const finalGcashAmount = gcashAmountCentavos !== null ? (gcashAmountCentavos / 100) : null;
        const paymentReferenceToSave = (method === 'Cash') ? null : (refNo || null);

        // 4. Insert single source of truth sales record first to obtain atomic auto-increment ID
        const [saleResult] = await connection.query(
            `INSERT INTO sales (
                user_id, total_amount, tendered_amount, change_due, payment_method, order_number, payment_reference, sale_date, cash_amount, gcash_amount
            ) VALUES (?, ?, ?, ?, ?, NULL, ?, NOW(), ?, ?)`,
            [userId, totalAmount, finalTendered, finalChangeDue, method, paymentReferenceToSave, finalCashAmount, finalGcashAmount]
        );
        const saleId = saleResult.insertId;

        // 5. Generate deterministic, collision-free order_no from saleId (SO-YYYY-NNNN)
        const year = new Date().getFullYear();
        const orderNo = `SO-${year}-${String(saleId).padStart(4, '0')}`;
        await connection.query('UPDATE sales SET order_number = ? WHERE id = ?', [orderNo, saleId]);

        // 6. Insert line items into sale_items and call applyMovement (SALE) atomically for each line
        for (const item of validatedItems) {
            const [saleItemResult] = await connection.query(
                `INSERT INTO sale_items (
                    sale_id, product_id, part_number, product_name, brand, size, quantity, price, cost_price, subtotal
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    saleId,
                    item.product_id,
                    item.part_number,
                    item.product_name,
                    item.brand,
                    item.size,
                    item.quantity,
                    item.unit_price,
                    item.cost_price,
                    item.subtotal
                ]
            );
            const saleItemId = saleItemResult.insertId;

            // Handle Serials if serialized
            if (item.is_serialized && item.serial_ids.length > 0) {
                await connection.query(
                    `UPDATE product_serials
                     SET status = 'sold'
                     WHERE product_id = ? AND status = 'available' AND id IN (${item.serial_ids.map(() => '?').join(', ')})`,
                    [item.product_id, ...item.serial_ids]
                );

                const serialValues = item.serial_ids.map(sId => [saleItemId, sId]);
                await connection.query('INSERT INTO sale_item_serials (sale_item_id, serial_id) VALUES ?', [serialValues]);
            }

            // Deduct inventory and log SALE row via inventoryService atomically
            await applyMovement(connection, {
                itemId: item.product_id,
                transactionType: 'SALE',
                quantityChange: -item.quantity,
                referenceNo: orderNo,
                referenceType: 'SALE',
                referenceId: saleId,
                unitCost: item.cost_price,
                remarks: `POS Sale: ${orderNo} (${item.quantity}x ${item.product_name})`,
                createdBy: userId
            });
        }

        await connection.commit();

        const orderSummary = {
            id: saleId,
            order_number: orderNo,
            order_no: orderNo,
            sale_id: saleId,
            payment_method: method,
            total_amount: totalAmount,
            tendered_amount: finalTendered,
            change_due: finalChangeDue,
            payment_reference: refNo || null,
            cash_amount: finalCashAmount,
            gcash_amount: finalGcashAmount,
            items: validatedItems
        };

        res.status(201).json({
            message: 'Transaction completed successfully.',
            id: saleId,
            order_no: orderNo,
            order_number: orderNo,
            sale_id: saleId,
            payment_method: method,
            total_amount: totalAmount,
            tendered_amount: finalTendered,
            change_due: finalChangeDue,
            payment_reference: refNo || null,
            cash_amount: finalCashAmount,
            gcash_amount: finalGcashAmount,
            items: validatedItems,
            order: orderSummary
        });

    } catch (err) {
        await connection.rollback();
        const rawMsg = String(err.message || err.sqlMessage || '').toLowerCase();
        const isDuplicatePaymentRef = (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) && 
            (rawMsg.includes('payment_reference') || rawMsg.includes('uq_sales_payment_reference') || Boolean(paymentReferenceToSave));
        if (isDuplicatePaymentRef) {
            return res.status(422).json({
                error: 'Unprocessable Entity',
                message: 'Payment reference already used: this reference has already been used on another transaction.'
            });
        }
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
    const userId = req.user?.id;
    const role = req.user?.role;

    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.max(1, Math.min(500, parseInt(req.query.limit, 10) || 20));
        const offset = (page - 1) * limit;

        const whereClauses = [];
        const whereParams = [];

        if (role !== 'admin') {
            whereClauses.push('s.user_id = ?');
            whereParams.push(userId);
        }

        if (req.query.date) {
            whereClauses.push('DATE(s.sale_date) = ?');
            whereParams.push(req.query.date);
        }

        if (req.query.startDate) {
            whereClauses.push('DATE(s.sale_date) >= ?');
            whereParams.push(req.query.startDate);
        }

        if (req.query.endDate) {
            whereClauses.push('DATE(s.sale_date) <= ?');
            whereParams.push(req.query.endDate);
        }

        if (req.query.search && req.query.search.trim()) {
            const rawSearch = req.query.search.trim();
            const searchPattern = `%${rawSearch}%`;
            const searchId = Number(rawSearch);

            if (Number.isInteger(searchId) && searchId > 0) {
                whereClauses.push(`(
                    s.id = ? 
                    OR s.order_number LIKE ? 
                    OR s.payment_reference LIKE ?
                    OR EXISTS (
                        SELECT 1 FROM users u_s WHERE u_s.id = s.user_id AND u_s.username LIKE ?
                    )
                    OR EXISTS (
                        SELECT 1 FROM sale_items si_s 
                        WHERE si_s.sale_id = s.id 
                        AND (
                            si_s.product_name LIKE ? 
                            OR si_s.part_number LIKE ? 
                            OR si_s.brand LIKE ? 
                            OR si_s.size LIKE ?
                        )
                    )
                )`);
                whereParams.push(
                    searchId,
                    searchPattern,
                    searchPattern,
                    searchPattern,
                    searchPattern,
                    searchPattern,
                    searchPattern,
                    searchPattern
                );
            } else {
                whereClauses.push(`(
                    s.order_number LIKE ? 
                    OR s.payment_reference LIKE ?
                    OR EXISTS (
                        SELECT 1 FROM users u_s WHERE u_s.id = s.user_id AND u_s.username LIKE ?
                    )
                    OR EXISTS (
                        SELECT 1 FROM sale_items si_s 
                        WHERE si_s.sale_id = s.id 
                        AND (
                            si_s.product_name LIKE ? 
                            OR si_s.part_number LIKE ? 
                            OR si_s.brand LIKE ? 
                            OR si_s.size LIKE ?
                        )
                    )
                )`);
                whereParams.push(
                    searchPattern,
                    searchPattern,
                    searchPattern,
                    searchPattern,
                    searchPattern,
                    searchPattern,
                    searchPattern
                );
            }
        }

        const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        // High-performance count query
        const countQuery = `SELECT COUNT(*) AS total FROM sales s ${whereSQL}`;
        const [countRows] = await db.query(countQuery, whereParams);
        const total = countRows[0]?.total || 0;

        // Subquery-optimized pagination: paginate sales first, then join users & sale_items
        const dataQuery = `
            SELECT s.id, COALESCE(s.order_number, CONCAT('SO-', s.id)) AS order_number,
                   s.total_amount, s.tendered_amount, s.change_due, s.payment_method,
                   s.payment_reference, s.cash_amount, s.gcash_amount, COALESCE(s.status, 'COMPLETED') AS status, s.sale_date, u.username as cashier,
                   GROUP_CONCAT(DISTINCT si.product_name ORDER BY si.product_name SEPARATOR ', ') as products_included,
                   GROUP_CONCAT(DISTINCT COALESCE(NULLIF(si.part_number, ''), p.part_number, p.sku) ORDER BY si.part_number SEPARATOR ', ') as part_numbers,
                   GROUP_CONCAT(DISTINCT COALESCE(NULLIF(si.part_number, ''), p.part_number, p.sku) ORDER BY si.part_number SEPARATOR ', ') as part_number,
                   GROUP_CONCAT(DISTINCT si.brand ORDER BY si.brand SEPARATOR ', ') as brands,
                   GROUP_CONCAT(DISTINCT si.size ORDER BY si.size SEPARATOR ', ') as sizes
            FROM (
                SELECT s.id, s.user_id, s.order_number, s.total_amount, s.tendered_amount,
                       s.change_due, s.payment_method, s.payment_reference, s.cash_amount, s.gcash_amount, s.status, s.sale_date
                FROM sales s
                ${whereSQL}
                ORDER BY s.sale_date DESC, s.id DESC
                LIMIT ? OFFSET ?
            ) s
            JOIN users u ON s.user_id = u.id
            LEFT JOIN sale_items si ON s.id = si.sale_id
            LEFT JOIN products p ON p.id = si.product_id
            GROUP BY s.id, s.order_number, s.total_amount, s.tendered_amount, s.change_due, s.payment_method, s.payment_reference, s.status, s.sale_date, u.username
            ORDER BY s.sale_date DESC, s.id DESC
        `;

        const [sales] = await db.query(dataQuery, [...whereParams, limit, offset]);

        res.json({
            success: true,
            data: sales,
            sales: sales,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        next(err);
    }
};

// ==========================================
// GET SALE BY ID (For Receipt Printing)
// ==========================================
exports.getSaleById = async (req, res, next) => {
    const { id } = req.params;
    const userId = req.user?.id;
    const role = req.user?.role;

    try {
        let query = `
            SELECT s.id, COALESCE(s.order_number, CONCAT('SO-', s.id)) AS order_number,
                   s.total_amount, s.tendered_amount, s.change_due, s.payment_method,
                   s.payment_reference, s.cash_amount, s.gcash_amount, COALESCE(s.status, 'COMPLETED') AS status, s.sale_date, u.username as cashier
            FROM sales s
            JOIN users u ON s.user_id = u.id
            WHERE s.id = ?
        `;
        const queryParams = [id];

        if (role !== 'admin') {
            query += ` AND s.user_id = ? `;
            queryParams.push(userId);
        }

        const [saleRows] = await db.query(query, queryParams);

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
            whereClause += ' AND s.sale_date >= DATE_SUB(NOW(), INTERVAL ? DAY)';
            params.push(days);
        }

        params.push(limit);

        let [bestSellers] = await db.query(`
            SELECT 
                COALESCE(p.id, si.product_id) AS id,
                COALESCE(p.sku, si.part_number) AS sku,
                COALESCE(p.name, si.product_name) AS name,
                COALESCE(p.brand, si.brand) AS brand,
                COALESCE(p.category, 'General') AS category,
                CAST(COALESCE(p.selling_price, si.price) AS DOUBLE) AS retail_price,
                CAST(COALESCE(p.current_stock, p.stock, 0) AS SIGNED) AS current_stock,
                CAST(COALESCE(SUM(si.quantity), 0) AS SIGNED) AS units_sold,
                CAST(COUNT(DISTINCT s.id) AS SIGNED) AS order_count
            FROM sale_items si
            JOIN sales s ON si.sale_id = s.id
            LEFT JOIN products p ON si.product_id = p.id
            ${whereClause}
            GROUP BY 
                p.id, si.product_id, p.sku, si.part_number, p.name, si.product_name,
                p.brand, si.brand, p.category, p.selling_price, si.price, p.current_stock, p.stock
            ORDER BY units_sold DESC
            LIMIT ?
        `, params);

        // Ensure all slots up to limit are populated so Top 1 to Top 5 are always returned
        if (bestSellers.length < limit) {
            const existingIds = bestSellers.map(b => b.id).filter(Boolean);
            const remainingCount = limit - bestSellers.length;
            const notInClause = existingIds.length > 0 ? `AND p.id NOT IN (${existingIds.join(',')})` : '';

            const [fillRows] = await db.query(`
                SELECT 
                    p.id,
                    COALESCE(p.sku, p.part_number) AS sku,
                    p.name,
                    p.brand,
                    p.category,
                    CAST(p.selling_price AS DOUBLE) AS retail_price,
                    CAST(COALESCE(p.current_stock, p.stock, 0) AS SIGNED) AS current_stock,
                    0 AS units_sold,
                    0 AS order_count
                FROM products p
                WHERE p.is_active = 1 ${notInClause}
                ORDER BY COALESCE(p.current_stock, p.stock, 0) DESC, p.id ASC
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

// ==========================================
// VOID SALE AND REOPEN ITEMS INTO CART
// POST /api/sales/:id/void-and-reopen
// ==========================================
exports.voidAndReopen = async (req, res, next) => {
    const saleId = Number(req.params.id);
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!saleId || !Number.isInteger(saleId) || saleId <= 0) {
        return res.status(400).json({ message: 'Valid sale ID is required' });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Fetch sale with pessimistic lock
        const [sales] = await connection.query(
            'SELECT * FROM sales WHERE id = ? FOR UPDATE',
            [saleId]
        );

        if (sales.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Sale record not found' });
        }

        const sale = sales[0];

        // Authorization check: Cashier who created the sale or any Admin
        if (userRole !== 'admin' && sale.user_id !== userId) {
            await connection.rollback();
            return res.status(403).json({ 
                message: 'Unauthorized: Only the cashier who made this sale or an administrator can void and reopen it' 
            });
        }

        if (sale.status === 'VOIDED') {
            await connection.rollback();
            return res.status(422).json({ message: 'This transaction has already been voided' });
        }

        // 2. Fetch all sale items with current product metadata
        const [saleItems] = await connection.query(
            `SELECT si.*, p.name as current_product_name, p.is_serialized, p.cost_price as current_cost_price, p.selling_price, p.retail_price
             FROM sale_items si
             JOIN products p ON si.product_id = p.id
             WHERE si.sale_id = ?`,
            [saleId]
        );

        // 3. Reverse inventory movements & release serials
        for (const item of saleItems) {
            // Restore inventory using immutable 'RETURN' ledger movement
            await applyMovement(connection, {
                itemId: item.product_id,
                transactionType: 'RETURN',
                quantityChange: item.quantity,
                referenceNo: sale.order_number || `SO-${sale.id}`,
                referenceType: 'SALE_VOID',
                referenceId: sale.id,
                unitCost: Number(item.cost_price || 0),
                remarks: `Sale Void & Reopen: ${sale.order_number || sale.id} (${item.quantity}x ${item.product_name})`,
                createdBy: userId
            });

            // If item has serial numbers, restore them to available
            const [serials] = await connection.query(
                'SELECT serial_id FROM sale_item_serials WHERE sale_item_id = ?',
                [item.id]
            );

            if (serials.length > 0) {
                const serialIds = serials.map(s => s.serial_id);
                const placeholders = serialIds.map(() => '?').join(', ');
                await connection.query(
                    `UPDATE product_serials SET status = 'available' WHERE id IN (${placeholders})`,
                    serialIds
                );
            }
        }

        // 4. Mark sale as VOIDED in database
        const reason = req.body.reason || 'Customer requested additional forgotten items (Reopened into cart)';
        await connection.query(
            "UPDATE sales SET status = 'VOIDED', voided_at = NOW(), void_reason = ? WHERE id = ?",
            [reason, saleId]
        );

        await connection.commit();

        // 5. Structure items so the POS frontend can directly populate the cart
        const cartItems = saleItems.map(item => ({
            id: item.product_id,
            product_id: item.product_id,
            productId: item.product_id,
            name: item.product_name,
            product_name: item.product_name,
            part_number: item.part_number,
            brand: item.brand,
            size: item.size,
            price: Number(item.price || item.selling_price || item.retail_price || 0),
            quantity: Number(item.quantity),
            is_serialized: normalizeBoolean(item.is_serialized),
            serial_ids: []
        }));

        res.status(200).json({
            success: true,
            message: `Order ${sale.order_number || ('#' + sale.id)} voided successfully. Items returned to cart.`,
            orderNumber: sale.order_number || ('SO-' + sale.id),
            saleId: sale.id,
            items: cartItems
        });

    } catch (err) {
        await connection.rollback();
        next(err);
    } finally {
        connection.release();
    }
};

