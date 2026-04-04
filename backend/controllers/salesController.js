const db = require('../config/db');

exports.createSale = async (req, res) => {
    const { items } = req.body; // array of { variant_id, quantity }
    const user_id = req.user.id;

    if (!items || items.length === 0) {
        return res.status(400).json({ message: 'No items in sale' });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        let total_amount = 0;
        const itemsToInsert = [];

        for (let item of items) {
            const [variantRows] = await connection.query('SELECT stock, price FROM product_variants WHERE id = ? FOR UPDATE', [item.variant_id]);

            if (variantRows.length === 0) {
                throw new Error(`Variant ID ${item.variant_id} not found`);
            }

            const variant = variantRows[0];
            if (variant.stock < item.quantity) {
                throw new Error(`Insufficient stock for variant ID ${item.variant_id}`);
            }

            const subtotal = variant.price * item.quantity;
            total_amount += subtotal;

            itemsToInsert.push({
                variant_id: item.variant_id,
                quantity: item.quantity,
                price: variant.price,
                subtotal
            });

            // Deduct stock
            await connection.query('UPDATE product_variants SET stock = stock - ? WHERE id = ?', [item.quantity, item.variant_id]);
        }

        // Create sale record
        const [saleResult] = await connection.query(
            'INSERT INTO sales (user_id, total_amount) VALUES (?, ?)',
            [user_id, total_amount]
        );

        const sale_id = saleResult.insertId;

        // Create sale items
        for (let item of itemsToInsert) {
            await connection.query(
                'INSERT INTO sales_items (sale_id, variant_id, quantity, price, subtotal) VALUES (?, ?, ?, ?, ?)',
                [sale_id, item.variant_id, item.quantity, item.price, item.subtotal]
            );
        }

        await connection.commit();
        res.status(201).json({ message: 'Sale processed successfully', sale_id });

    } catch (err) {
        await connection.rollback();
        res.status(400).json({ message: err.message || 'Transaction failed' });
    } finally {
        connection.release();
    }
};

exports.getSales = async (req, res) => {
    try {
        const [sales] = await db.query(`
      SELECT s.id, s.total_amount, s.sale_date, u.username as cashier
      FROM sales s
      JOIN users u ON s.user_id = u.id
      ORDER BY s.sale_date DESC
    `);
        res.json(sales);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching sales', error: err.message });
    }
};

exports.getSaleById = async (req, res) => {
    const { id } = req.params;
    try {
        const [saleRows] = await db.query(`
      SELECT s.id, s.total_amount, s.sale_date, u.username as cashier
      FROM sales s
      JOIN users u ON s.user_id = u.id
      WHERE s.id = ?
    `, [id]);

        if (saleRows.length === 0) return res.status(404).json({ message: 'Sale not found' });

        const [items] = await db.query(`
      SELECT si.quantity, si.price, si.subtotal, p.product_name, pv.brand
      FROM sales_items si
      JOIN product_variants pv ON si.variant_id = pv.id
      JOIN products p ON pv.product_id = p.id
      WHERE si.sale_id = ?
    `, [id]);

        res.json({ ...saleRows[0], items });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching sale details', error: err.message });
    }
};
