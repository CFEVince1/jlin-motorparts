const db = require('../config/db');

exports.getInventory = async (req, res) => {
    try {
        const [products] = await db.query(`
            SELECT 
                p.id,
                p.part_number,
                p.name AS product_name,
                p.brand,
                p.category,
                p.size,
                p.is_serialized,
                p.stock,
                p.reorder_level,
                p.selling_price AS price,
                COALESCE(
                    GROUP_CONCAT(
                        DISTINCT TRIM(CONCAT(mu.model, ' ', COALESCE(mu.year_model, '')))
                        ORDER BY mu.model, mu.year_model
                        SEPARATOR ', '
                    ),
                    ''
                ) AS compatibility_display
            FROM products p
            LEFT JOIN product_compatibility pc ON pc.product_id = p.id
            LEFT JOIN motorcycle_units mu ON mu.id = pc.motorcycle_unit_id
            WHERE p.is_active = true
            GROUP BY 
                p.id,
                p.part_number,
                p.name,
                p.brand,
                p.category,
                p.size,
                p.is_serialized,
                p.stock,
                p.reorder_level,
                p.selling_price
            ORDER BY p.name ASC
        `);
        res.json(products);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching inventory', error: err.message });
    }
};

exports.stockIn = async (req, res) => {
    const { product_id, quantity } = req.body;
    if (!product_id || !quantity || quantity <= 0) return res.status(400).json({ message: 'Invalid product or quantity' });

    try {
        const [result] = await db.query('UPDATE products SET stock = stock + ? WHERE id = ?', [quantity, product_id]);
        if (result.affectedRows === 0) return res.status(404).json({ message: 'Product not found' });
        res.json({ message: 'Stock added successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Error updating stock', error: err.message });
    }
};

exports.stockOut = async (req, res) => {
    const { product_id, quantity } = req.body;
    if (!product_id || !quantity || quantity <= 0) return res.status(400).json({ message: 'Invalid product or quantity' });

    try {
        const [product] = await db.query('SELECT stock FROM products WHERE id = ?', [product_id]);
        if (product.length === 0) return res.status(404).json({ message: 'Product not found' });

        if (product[0].stock < quantity) {
            return res.status(400).json({ message: 'Insufficient stock' });
        }

        await db.query('UPDATE products SET stock = stock - ? WHERE id = ?', [quantity, product_id]);
        res.json({ message: 'Stock deducted successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Error updating stock', error: err.message });
    }
};
