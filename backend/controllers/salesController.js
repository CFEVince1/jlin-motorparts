const db = require('../config/db');

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

            // Lock the product row so no one else buys it at the exact same millisecond
            const [productRows] = await connection.query(
                'SELECT stock, selling_price, is_serialized FROM products WHERE id = ? AND is_active = true FOR UPDATE', 
                [item.variant_id] // Note: the frontend sends variant_id, but it's just the product.id now
            );

            if (productRows.length === 0) {
                throw new Error(`Product ID ${item.variant_id} not found or inactive`);
            }

            const product = productRows[0];
            
            if (product.stock < qty) {
                throw new Error(`Insufficient stock for Product ID ${item.variant_id}`);
            }

            const subtotal = product.selling_price * qty;
            total_amount += subtotal;

            itemsToInsert.push({
                product_id: item.variant_id,
                quantity: qty,
                price: product.selling_price,
                subtotal,
                is_serialized: product.is_serialized
            });

            // Deduct stock from main products table
            await connection.query('UPDATE products SET stock = stock - ? WHERE id = ?', [qty, item.variant_id]);
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
                'INSERT INTO sale_items (sale_id, product_id, quantity, price, subtotal) VALUES (?, ?, ?, ?, ?)',
                [sale_id, item.product_id, item.quantity, item.price, item.subtotal]
            );
            
            const saleItemId = saleItemResult.insertId;

            // If the item is serialized, automatically grab 'n' available serials and mark them sold
            if (item.is_serialized) {
                const [availableSerials] = await connection.query(
                    'SELECT id FROM product_serials WHERE product_id = ? AND status = "available" LIMIT ? FOR UPDATE',
                    [item.product_id, item.quantity]
                );

                if (availableSerials.length < item.quantity) {
                    throw new Error(`CRITICAL: Not enough available serial numbers mapped to Product ID ${item.product_id}.`);
                }

                for (let serial of availableSerials) {
                    // Mark serial as sold
                    await connection.query('UPDATE product_serials SET status = "sold" WHERE id = ?', [serial.id]);
                    // Map it to the exact sale item
                    await connection.query('INSERT INTO sale_item_serials (sale_item_id, serial_id) VALUES (?, ?)', [saleItemId, serial.id]);
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
                   GROUP_CONCAT(p.name SEPARATOR ', ') as products_included
            FROM sales s
            JOIN users u ON s.user_id = u.id
            LEFT JOIN sale_items si ON s.id = si.sale_id
            LEFT JOIN products p ON si.product_id = p.id
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
            SELECT si.quantity, si.price, si.subtotal, p.name AS product_name, '' AS brand
            FROM sale_items si
            JOIN products p ON si.product_id = p.id
            WHERE si.sale_id = ?
        `, [id]);

        res.json({ ...saleRows[0], items });
    } catch (err) {
        console.error('Error fetching sale details:', err);
        res.status(500).json({ message: 'Error fetching sale details', error: err.message });
    }
};
