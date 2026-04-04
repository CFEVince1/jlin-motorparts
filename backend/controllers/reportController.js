const db = require('../config/db');

exports.getDailySales = async (req, res) => {
    try {
        const [sales] = await db.query(`
      SELECT DATE(sale_date) as date, SUM(total_amount) as total_revenue, COUNT(id) as total_transactions
      FROM sales
      WHERE DATE(sale_date) = CURDATE()
      GROUP BY DATE(sale_date)
    `);
        res.json(sales[0] || { date: new Date().toISOString().split('T')[0], total_revenue: 0, total_transactions: 0 });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching daily sales', error: err.message });
    }
};

exports.getMonthlySales = async (req, res) => {
    try {
        const [sales] = await db.query(`
      SELECT DATE_FORMAT(sale_date, '%Y-%m') as month, SUM(total_amount) as total_revenue, COUNT(id) as total_transactions
      FROM sales
      WHERE YEAR(sale_date) = YEAR(CURDATE()) AND MONTH(sale_date) = MONTH(CURDATE())
      GROUP BY MONTH(sale_date)
    `);
        res.json(sales[0] || { month: new Date().toISOString().slice(0, 7), total_revenue: 0, total_transactions: 0 });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching monthly sales', error: err.message });
    }
};

exports.getLowStock = async (req, res) => {
    try {
        const [products] = await db.query(`
      SELECT pv.id, p.product_name, pv.stock, pv.brand 
      FROM product_variants pv
      JOIN products p ON pv.product_id = p.id
      WHERE pv.stock <= 5 AND pv.is_active = true AND p.is_active = true
      ORDER BY pv.stock ASC
    `);
        res.json(products);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching low stock', error: err.message });
    }
};

exports.getBestSelling = async (req, res) => {
    try {
        const [products] = await db.query(`
      SELECT p.product_name, pv.brand, SUM(si.quantity) as total_sold
      FROM sales_items si
      JOIN product_variants pv ON si.variant_id = pv.id
      JOIN products p ON pv.product_id = p.id
      GROUP BY pv.id
      ORDER BY total_sold DESC
      LIMIT 10
    `);
        res.json(products);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching best selling products', error: err.message });
    }
};

exports.getSalesByCashier = async (req, res) => {
    try {
        const [sales] = await db.query(`
            SELECT 
                u.username as cashier, 
                COUNT(s.id) as total_transactions, 
                SUM(s.total_amount) as total_revenue
            FROM sales s
            JOIN users u ON s.user_id = u.id
            WHERE DATE(s.sale_date) = CURDATE()
            GROUP BY u.id
            ORDER BY total_revenue DESC
        `);
        res.json(sales);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching sales by cashier', error: err.message });
    }
};
