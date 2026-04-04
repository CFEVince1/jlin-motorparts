const db = require('../config/db');

exports.getAllProducts = async (req, res) => {
    try {
        // Fetch products
        const [products] = await db.query(`SELECT id, product_name, category FROM products WHERE is_active = true`);
        
        // Fetch variants
        const [variants] = await db.query(`
            SELECT v.*, s.supplier_name 
            FROM product_variants v
            LEFT JOIN suppliers s ON v.supplier_id = s.id
            WHERE v.is_active = true
        `);

        const formatted = products.map(p => ({
            ...p,
            variants: variants.filter(v => v.product_id === p.id)
        })).filter(p => p.variants.length > 0); // Only return active groupings

        res.json(formatted);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching products', error: err.message });
    }
};

exports.createProduct = async (req, res) => {
    const { product_name, brand, category, price, stock, supplier_id } = req.body;
    try {
        let productId;

        // Try to find the generic parent product
        const [existingProduct] = await db.query('SELECT id FROM products WHERE LOWER(product_name) = LOWER(?)', [product_name]);
        
        if (existingProduct.length > 0) {
            productId = existingProduct[0].id;

            // Make sure the brand doesn't already exist under this product
            const [existingVariant] = await db.query(
                'SELECT id FROM product_variants WHERE product_id = ? AND LOWER(brand) = LOWER(?) AND is_active = true',
                [productId, brand]
            );
            
            if (existingVariant.length > 0) return res.status(400).json({ message: 'This brand already exists for this product.' });
        } else {
            // Create parent
            const [newProduct] = await db.query('INSERT INTO products (product_name, category) VALUES (?, ?)', [product_name, category]);
            productId = newProduct.insertId;
        }

        // Insert variant
        await db.query(`
            INSERT INTO product_variants (product_id, brand, price, stock, supplier_id) 
            VALUES (?, ?, ?, ?, ?)
        `, [productId, brand, price, stock || 0, supplier_id || null]);

        res.status(201).json({ message: 'Variant added successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Error creating product', error: err.message });
    }
};

exports.updateProduct = async (req, res) => {
    // Note: ID passed here is actually the variant ID
    const { id } = req.params;
    const { brand, price, supplier_id } = req.body;
    try {
        const [result] = await db.query(`
            UPDATE product_variants SET brand = ?, price = ?, supplier_id = ? WHERE id = ?
        `, [brand, price, supplier_id || null, id]);
        
        if (result.affectedRows === 0) return res.status(404).json({ message: 'Variant not found' });
        res.json({ message: 'Variant updated successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Error updating variant', error: err.message });
    }
};

exports.deleteProduct = async (req, res) => {
    // Note: ID passed here is variant ID
    const { id } = req.params;
    try {
        // Soft delete variant
        // Check if there are sales records pointing to it?
        // Actually, soft delete is completely safe regardless of sales reference!
        const [result] = await db.query('UPDATE product_variants SET is_active = false WHERE id = ?', [id]);
        if (result.affectedRows === 0) return res.status(404).json({ message: 'Variant not found' });
        res.json({ message: 'Variant deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Error deleting', error: err.message });
    }
};

exports.deleteParentProduct = async (req, res) => {
    const { id } = req.params;
    try {
        // Soft delete parent AND cascade soft delete variants
        await db.query('UPDATE products SET is_active = false WHERE id = ?', [id]);
        await db.query('UPDATE product_variants SET is_active = false WHERE product_id = ?', [id]);
        res.json({ message: 'Product group deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Error deleting', error: err.message });
    }
};
