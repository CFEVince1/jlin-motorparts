const db = require('../config/db');

const normalizeBoolean = (value) => value === true || value === 1 || value === '1' || value === 'true';

const normalizeSerialIds = (serialIds) => {
    if (!Array.isArray(serialIds)) return [];
    return serialIds
        .map(id => Number(id))
        .filter(id => Number.isInteger(id) && id > 0);
};

// ==========================================
// PROCESS A NEW SALE (POS Checkout)
// ==========================================
exports.createSale = async (req, res) => {
    const { items, payment_method, tendered_amount } = req.body;
    const user_id = req.user.id;

    if (!items || items.length === 0) {
        return res.status(400).json({ message: 'No items in sale' });
    }

    const validMethods = ['Cash', 'GCash', 'Card'];
    if (!validMethods.includes(payment_method)) {
        return res.status(400).json({ message: "Invalid payment method selected." });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        let total_amount = 0;
        const itemsToInsert = [];

        // 1. Validate stock and calculate totals
        for (let item of items) {
            const qty = Number(item.quantity); // Guarantee it is treated as a number
            const productId = item.product_id || item.variant_id;
            const serialIds = normalizeSerialIds(item.serial_ids);

            if (!productId) {
                throw new Error('Product ID is required for each sale item');
            }

            if (!Number.isInteger(qty) || qty <= 0) {
                throw new Error(`Invalid quantity for Product ID ${productId}`);
            }

            // Lock the product row so no one else buys it at the exact same millisecond
            const [productRows] = await connection.query(
                `SELECT
                    id,
                    part_number,
                    name,
                    brand,
                    size,
                    stock,
                    selling_price,
                    is_serialized
                FROM products
                WHERE id = ? AND is_active = true
                FOR UPDATE`,
                [productId]
            );

            if (productRows.length === 0) {
                throw new Error(`Product ID ${productId} not found or inactive`);
            }

            const product = productRows[0];
            const serialized = normalizeBoolean(product.is_serialized);

            if (serialized) {
                if (serialIds.length === 0) {
                    throw new Error(`Serial selection is required for ${product.name}`);
                }

                const uniqueSerialIds = [...new Set(serialIds)];
                if (uniqueSerialIds.length !== serialIds.length) {
                    throw new Error(`Duplicate serial selections are not allowed for ${product.name}`);
                }

                if (qty !== serialIds.length) {
                    throw new Error(`Serialized quantity must match selected serial count for ${product.name}`);
                }
            } else if (serialIds.length > 0) {
                throw new Error(`Serial numbers cannot be submitted for non-serialized product ${product.name}`);
            }

            if (product.stock < qty) {
                throw new Error(`Insufficient stock for Product ID ${productId}`);
            }

            const subtotal = product.selling_price * qty;
            total_amount += subtotal;

            itemsToInsert.push({
                product_id: productId,
                part_number: product.part_number,
                product_name: product.name,
                brand: product.brand,
                size: product.size,
                quantity: qty,
                price: product.selling_price,
                subtotal,
                is_serialized: serialized,
                serial_ids: serialIds
            });

            if (serialized) {
                const placeholders = serialIds.map(() => '?').join(', ');
                const [serialRows] = await connection.query(
                    `SELECT id
                     FROM product_serials
                     WHERE product_id = ?
                       AND status = "available"
                       AND id IN (${placeholders})
                     FOR UPDATE`,
                    [productId, ...serialIds]
                );

                if (serialRows.length !== serialIds.length) {
                    throw new Error(`One or more selected serial numbers are unavailable or do not belong to ${product.name}`);
                }
            }
        }

        // 2. Validate Payment
        let change_due = 0;
        let final_tendered = Number(tendered_amount) || 0;

        if (payment_method === 'Cash') {
            if (final_tendered < total_amount) {
                throw new Error("Insufficient payment. Transaction cancelled.");
            }
            change_due = final_tendered - total_amount;
        } else {
            final_tendered = total_amount;
            change_due = 0;
        }

        // 3. Create the Main Sale Record
        const [saleResult] = await connection.query(
            'INSERT INTO sales (user_id, total_amount, tendered_amount, change_due, payment_method) VALUES (?, ?, ?, ?, ?)',
            [user_id, total_amount, final_tendered, change_due, payment_method]
        );
        const sale_id = saleResult.insertId;

        // 4. Insert Sale Items (and handle Serials if needed)
        for (let item of itemsToInsert) {
            const [saleItemResult] = await connection.query(
                `INSERT INTO sale_items (
                    sale_id,
                    product_id,
                    part_number,
                    product_name,
                    brand,
                    size,
                    quantity,
                    price,
                    subtotal
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    sale_id,
                    item.product_id,
                    item.part_number,
                    item.product_name,
                    item.brand,
                    item.size,
                    item.quantity,
                    item.price,
                    item.subtotal
                ]
            );

            const saleItemId = saleItemResult.insertId;

            if (item.is_serialized) {
                await connection.query(
                    `UPDATE product_serials
                     SET status = "sold"
                     WHERE product_id = ?
                       AND status = "available"
                       AND id IN (${item.serial_ids.map(() => '?').join(', ')})`,
                    [item.product_id, ...item.serial_ids]
                );

                const serialValues = item.serial_ids.map(serialId => [saleItemId, serialId]);
                await connection.query(
                    'INSERT INTO sale_item_serials (sale_item_id, serial_id) VALUES ?',
                    [serialValues]
                );
            }

            await connection.query(
                'UPDATE products SET stock = stock - ? WHERE id = ?',
                [item.quantity, item.product_id]
            );
        }

        for (let item of itemsToInsert) {
            if (item.is_serialized) {
                const [soldRows] = await connection.query(
                    `SELECT COUNT(*) AS sold_count
                     FROM product_serials
                     WHERE product_id = ?
                       AND status = "sold"
                       AND id IN (${item.serial_ids.map(() => '?').join(', ')})`,
                    [item.product_id, ...item.serial_ids]
                );

                if (soldRows[0].sold_count !== item.serial_ids.length) {
                    throw new Error(`Failed to mark selected serials as sold for ${item.product_name}`);
                }
            }
        }

        await connection.commit();

        return res.status(201).json({
            message: "Transaction completed successfully.",
            sale_id: sale_id,
            payment_method: payment_method,
            total_amount: total_amount,
            tendered_amount: final_tendered,
            change_due: change_due
        });

    } catch (err) {
        await connection.rollback();
        console.error("Sale Error:", err);
        res.status(400).json({ message: err.message || 'Transaction failed' });
    } finally {
        connection.release();
    }
};

// ==========================================
// GET ALL SALES (For Transactions Page)
// ==========================================
exports.getSales = async (req, res) => {
    const userId = req.user.id;
    const role = req.user.role;

    try {
        let query = `
            SELECT s.id, s.total_amount, s.payment_method, s.sale_date, u.username as cashier,
                   GROUP_CONCAT(DISTINCT si.product_name ORDER BY si.product_name SEPARATOR ', ') as products_included,
                   GROUP_CONCAT(DISTINCT si.part_number ORDER BY si.part_number SEPARATOR ', ') as part_numbers,
                   GROUP_CONCAT(DISTINCT si.brand ORDER BY si.brand SEPARATOR ', ') as brands,
                   GROUP_CONCAT(DISTINCT si.size ORDER BY si.size SEPARATOR ', ') as sizes,
                   COALESCE(
                       GROUP_CONCAT(
                           DISTINCT TRIM(CONCAT(mu.model, ' ', COALESCE(mu.year_model, '')))
                           ORDER BY mu.model, mu.year_model
                           SEPARATOR ', '
                       ),
                       ''
                   ) AS compatibility_display
            FROM sales s
            JOIN users u ON s.user_id = u.id
            LEFT JOIN sale_items si ON s.id = si.sale_id
            LEFT JOIN product_compatibility pc ON pc.product_id = si.product_id
            LEFT JOIN motorcycle_units mu ON mu.id = pc.motorcycle_unit_id
        `;
        let queryParams = [];

        // Staff can only see their own transactions; Admin sees all
        if (role !== 'admin') {
            query += ` WHERE s.user_id = ? `;
            queryParams.push(userId);
        }

        // CRITICAL FIX: Expanded GROUP BY to prevent ONLY_FULL_GROUP_BY strict mode errors in MySQL
        query += ` GROUP BY s.id, s.total_amount, s.payment_method, s.sale_date, u.username ORDER BY s.sale_date DESC`;

        const [sales] = await db.query(query, queryParams);
        res.json(sales);
    } catch (err) {
        console.error('Error fetching sales:', err);
        res.status(500).json({ message: 'Error fetching sales', error: err.message });
    }
};

// ==========================================
// GET SALE BY ID (For Receipt Printing)
// ==========================================
exports.getSaleById = async (req, res) => {
    const { id } = req.params;
    try {
        const [saleRows] = await db.query(`
            SELECT s.id, s.total_amount, s.tendered_amount, s.change_due, s.payment_method, s.sale_date, u.username as cashier
            FROM sales s
            JOIN users u ON s.user_id = u.id
            WHERE s.id = ?
        `, [id]);

        if (saleRows.length === 0) return res.status(404).json({ message: 'Sale not found' });

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
                    GROUP_CONCAT(
                        DISTINCT TRIM(CONCAT(mu.model, ' ', COALESCE(mu.year_model, '')))
                        ORDER BY mu.model, mu.year_model
                        SEPARATOR ', '
                    ),
                    ''
                ) AS compatibility_display,
                COALESCE(
                    GROUP_CONCAT(DISTINCT ps.serial_number ORDER BY ps.serial_number SEPARATOR ', '),
                    ''
                ) AS serial_numbers
            FROM sale_items si
            LEFT JOIN product_compatibility pc ON pc.product_id = si.product_id
            LEFT JOIN motorcycle_units mu ON mu.id = pc.motorcycle_unit_id
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
        console.error('Error fetching sale details:', err);
        res.status(500).json({ message: 'Error fetching sale details', error: err.message });
    }
};
