const db = require('../config/db');

exports.getDailySales = async (req, res) => {
    try {
        let query = `
            SELECT DATE(sale_date) as date, COALESCE(SUM(total_amount), 0) as total_revenue, COUNT(id) as total_transactions
            FROM sales WHERE DATE(sale_date) = CURDATE()
        `;
        const params = [];
        
        // Scope to user if not admin
        if (req.user.role !== 'admin') {
            query += ` AND user_id = ?`;
            params.push(req.user.id);
        }

        const [sales] = await db.query(query, params);
        res.json(sales[0] || { date: new Date().toISOString().split('T')[0], total_revenue: 0, total_transactions: 0 });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching daily sales', error: err.message });
    }
};

exports.getMonthlySales = async (req, res) => {
    try {
        const [sales] = await db.query(`
            SELECT DATE_FORMAT(sale_date, '%Y-%m') as month, COALESCE(SUM(total_amount), 0) as total_revenue, COUNT(id) as total_transactions
            FROM sales WHERE YEAR(sale_date) = YEAR(CURDATE()) AND MONTH(sale_date) = MONTH(CURDATE())
        `);
        res.json(sales[0] || { month: new Date().toISOString().slice(0, 7), total_revenue: 0, total_transactions: 0 });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching monthly sales', error: err.message });
    }
};

exports.getLowStock = async (req, res) => {
    try {
        const [products] = await db.query(`
            SELECT id, name AS product_name, '' AS brand, stock 
            FROM products 
            WHERE stock <= reorder_level AND is_active = true 
            ORDER BY stock ASC
        `);
        res.json(products);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching low stock', error: err.message });
    }
};

exports.getBestSelling = async (req, res) => {
    try {
        const { startDate, endDate, category } = req.query;
        let query = `
            SELECT p.name AS product_name, p.brand, SUM(si.quantity) as total_sold
            FROM sale_items si
            JOIN products p ON si.product_id = p.id
            JOIN sales s ON si.sale_id = s.id
            WHERE 1=1
        `;
        const params = [];

        if (startDate) {
            query += ` AND DATE(s.sale_date) >= ?`;
            params.push(startDate);
        }
        if (endDate) {
            query += ` AND DATE(s.sale_date) <= ?`;
            params.push(endDate);
        }
        if (category && category !== 'All') {
            query += ` AND p.category = ?`;
            params.push(category);
        }

        query += `
            GROUP BY p.id
            ORDER BY total_sold DESC
            LIMIT 10
        `;

        const [products] = await db.query(query, params);
        res.json(products);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching best selling products', error: err.message });
    }
};

exports.getCategories = async (req, res) => {
    try {
        const [categories] = await db.query('SELECT DISTINCT category FROM products WHERE is_active = true');
        res.json(categories.map(c => c.category).filter(Boolean));
    } catch (err) {
        res.status(500).json({ message: 'Error fetching categories', error: err.message });
    }
};

exports.getSalesByCashier = async (req, res) => {
    try {
        const [sales] = await db.query(`
            SELECT u.username as cashier, COUNT(s.id) as total_transactions, COALESCE(SUM(s.total_amount), 0) as total_revenue
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

exports.getAdminStats = async (req, res) => {
    try {
        // Total Sales & Transactions (All Time)
        const [overallSalesData] = await db.query(`
            SELECT 
                COALESCE(SUM(total_amount), 0) AS total_revenue,
                COUNT(id) AS total_transactions
            FROM sales
        `);

        // Total Profit (All Time)
        const [profitData] = await db.query(`
            SELECT 
                COALESCE(SUM((si.price - p.cost_price) * si.quantity), 0) AS total_profit
            FROM sale_items si
            JOIN products p ON si.product_id = p.id
        `);

        res.json({
            total_sales: overallSalesData[0].total_revenue,
            total_transactions: overallSalesData[0].total_transactions,
            total_profit: profitData[0].total_profit
        });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching admin stats', error: err.message });
    }
};
