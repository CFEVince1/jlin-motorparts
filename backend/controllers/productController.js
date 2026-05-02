const db = require('../config/db');

// ==========================================
// GET ALL ACTIVE PRODUCTS
// ==========================================
exports.getAllProducts = async (req, res) => {
    try {
        // We alias the columns to temporarily match what your React frontend expects
        const [products] = await db.query(`
            SELECT 
                id, 
                name AS product_name, 
                category, 
                brand, 
                selling_price AS price, 
                stock, 
                reorder_level, 
                is_serialized 
            FROM products 
            WHERE is_active = true 
            ORDER BY created_at DESC
        `);
        res.json(products);
    } catch (err) {
        console.error('Error fetching products:', err);
        res.status(500).json({ message: 'Error fetching products', error: err.message });
    }
};

// ==========================================
// CREATE PRODUCT (Handles Serialized & Non-Serialized)
// ==========================================
exports.createProduct = async (req, res) => {
    const { name, brand, category, cost_price, selling_price, reorder_level, is_serialized, stock, serial_numbers } = req.body;
    
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [productResult] = await connection.query(
            `INSERT INTO products (name, brand, category, cost_price, selling_price, stock, reorder_level, is_serialized) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [name, brand, category, cost_price, selling_price, stock || 0, reorder_level || 5, is_serialized || false]
        );
        
        const productId = productResult.insertId;

        if (is_serialized && serial_numbers && serial_numbers.length > 0) {
            if (serial_numbers.length !== Number(stock)) {
                throw new Error("Stock quantity must exactly match the number of serial numbers provided.");
            }
            const serialValues = serial_numbers.map(sn => [productId, sn, 'available']);
            await connection.query(`INSERT INTO product_serials (product_id, serial_number, status) VALUES ?`, [serialValues]);
        }

        await connection.commit();
        res.status(201).json({ message: 'Product created successfully', productId });
    } catch (err) {
        await connection.rollback();
        console.error('Error creating product:', err);
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Duplicate serial number detected. Serials must be unique.' });
        res.status(400).json({ message: err.message || 'Error creating product' });
    } finally {
        connection.release();
    }
};

// ==========================================
// UPDATE PRODUCT (Basic Details Only)
// ==========================================
exports.updateProduct = async (req, res) => {
    const { id } = req.params;
    const { name, brand, category, cost_price, selling_price, reorder_level } = req.body;
    
    try {
        const [result] = await db.query(
            `UPDATE products SET name = ?, brand = ?, category = ?, cost_price = ?, selling_price = ?, reorder_level = ? WHERE id = ? AND is_active = true`,
            [name, brand, category, cost_price, selling_price, reorder_level, id]
        );
        if (result.affectedRows === 0) return res.status(404).json({ message: 'Product not found' });
        res.json({ message: 'Product updated successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Error updating product', error: err.message });
    }
};

// ==========================================
// DELETE PRODUCT (Soft Delete)
// ==========================================
exports.deleteProduct = async (req, res) => {
    const { id } = req.params;
    try {
        const [result] = await db.query('UPDATE products SET is_active = false WHERE id = ?', [id]);
        if (result.affectedRows === 0) return res.status(404).json({ message: 'Product not found' });
        res.json({ message: 'Product deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Error deleting product', error: err.message });
    }
};

// ==========================================
// GET AVAILABLE SERIALS (Used by POS)
// ==========================================
exports.getProductSerials = async (req, res) => {
    const { id } = req.params;
    try {
        const [serials] = await db.query('SELECT id, serial_number FROM product_serials WHERE product_id = ? AND status = "available"', [id]);
        res.json(serials);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching serial numbers', error: err.message });
    }
};
