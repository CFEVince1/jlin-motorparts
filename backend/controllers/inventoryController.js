const db = require('../config/db');

exports.getInventory = async (req, res) => {
    try {
        const [variants] = await db.query(`
            SELECT pv.id, p.product_name, pv.stock, pv.brand, pv.price 
            FROM product_variants pv
            JOIN products p ON pv.product_id = p.id
            WHERE p.is_active = true AND pv.is_active = true
        `);
        res.json(variants);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching inventory', error: err.message });
    }
};

exports.stockIn = async (req, res) => {
    const { product_id, quantity } = req.body;
    if (!product_id || !quantity || quantity <= 0) return res.status(400).json({ message: 'Invalid variant or quantity' });

    try {
        const [result] = await db.query('UPDATE product_variants SET stock = stock + ? WHERE id = ?', [quantity, product_id]);
        if (result.affectedRows === 0) return res.status(404).json({ message: 'Variant not found' });
        res.json({ message: 'Stock added successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Error updating stock', error: err.message });
    }
};

exports.stockOut = async (req, res) => {
    const { product_id, quantity } = req.body;
    if (!product_id || !quantity || quantity <= 0) return res.status(400).json({ message: 'Invalid variant or quantity' });

    try {
        const [variant] = await db.query('SELECT stock FROM product_variants WHERE id = ?', [product_id]);
        if (variant.length === 0) return res.status(404).json({ message: 'Variant not found' });

        if (variant[0].stock < quantity) {
            return res.status(400).json({ message: 'Insufficient stock' });
        }

        await db.query('UPDATE product_variants SET stock = stock - ? WHERE id = ?', [quantity, product_id]);
        res.json({ message: 'Stock deducted successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Error updating stock', error: err.message });
    }
};
