const db = require('../config/db');

exports.getDashboardData = async (req, res) => {
    try {
        const userId = req.user.id;
        const role = req.user.role;
        const userFilter = role !== 'admin' && role !== 'super_admin' ? 'AND s.user_id = ?' : '';
        const userParams = userFilter ? [userId] : [];

        const [todayRevData] = await db.query(`
            SELECT COALESCE(SUM(total_amount), 0) AS todaysRevenue
            FROM sales s
            WHERE DATE(s.sale_date) = CURDATE()
            ${userFilter}
        `, userParams);

        const [topMovingData] = await db.query(`
            SELECT
                si.part_number,
                si.product_name,
                si.brand,
                si.size,
                SUM(si.quantity) AS total_sold
            FROM sale_items si
            JOIN sales s ON si.sale_id = s.id
            WHERE s.sale_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
            ${userFilter}
            GROUP BY si.part_number, si.product_name, si.brand, si.size
            ORDER BY total_sold DESC
            LIMIT 1
        `, userParams);

        const topMovingProduct = topMovingData.length > 0
            ? `${topMovingData[0].part_number} - ${topMovingData[0].product_name}`
            : 'N/A';

        const [salesTrendsRaw] = await db.query(`
            SELECT
                DATE(s.sale_date) AS date,
                s.payment_method,
                SUM(s.total_amount) AS amount
            FROM sales s
            WHERE s.sale_date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
            ${userFilter}
            GROUP BY DATE(s.sale_date), s.payment_method
            ORDER BY DATE(s.sale_date) ASC
        `, userParams);

        const salesTrendsMap = {};
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            const displayDate = d.toLocaleDateString('en-US', { weekday: 'short' });
            salesTrendsMap[dateStr] = { date: displayDate, _dateStr: dateStr, Cash: 0, GCash: 0, Card: 0, Total: 0 };
        }

        salesTrendsRaw.forEach(row => {
            const dateStr = new Date(row.date).toISOString().split('T')[0];
            const paymentMethod = row.payment_method || 'Cash';
            if (salesTrendsMap[dateStr]) {
                salesTrendsMap[dateStr][paymentMethod] += Number(row.amount);
                salesTrendsMap[dateStr].Total += Number(row.amount);
            }
        });

        const salesTrends = Object.values(salesTrendsMap).sort((a, b) => a._dateStr.localeCompare(b._dateStr));

        const [lowStock] = await db.query(`
            SELECT
                p.part_number,
                p.name AS product_name,
                p.brand,
                p.size,
                p.stock,
                p.reorder_level
            FROM products p
            WHERE p.is_active = true
              AND p.stock <= p.reorder_level
            ORDER BY p.stock ASC
            LIMIT 10
        `);

        const [dailyTransactions] = await db.query(`
            SELECT s.id, s.total_amount, s.payment_method, s.sale_date, u.username as cashier
            FROM sales s
            JOIN users u ON s.user_id = u.id
            WHERE DATE(s.sale_date) = CURDATE()
            ${userFilter}
            ORDER BY s.sale_date DESC
        `, userParams);

        const [costVsProfitRows] = await db.query(`
            SELECT
                p.part_number,
                p.name AS product_name,
                p.brand,
                p.cost_price AS cost,
                p.selling_price AS retail_price
            FROM products p
            WHERE p.is_active = true
            ORDER BY p.name ASC
            LIMIT 20
        `);

        const costVsProfit = costVsProfitRows.map(item => ({
            name: `${item.part_number} - ${item.product_name}`,
            brand: item.brand,
            cost: Number(item.cost),
            price: Number(item.retail_price)
        }));

        res.json({
            kpis: {
                todaysRevenue: todayRevData[0].todaysRevenue,
                topMovingProduct,
                refurbROI: '0.0'
            },
            costVsProfit,
            salesTrends,
            lowStock,
            dailyTransactions
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching analytics dashboard data', error: err.message });
    }
};
