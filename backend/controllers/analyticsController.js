const db = require('../config/db');

// Helper to format dates strictly in Philippine Standard Time (PST / UTC+8)
const phtFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' });

const getPHTDateString = (dateVal) => {
    if (!dateVal) return null;
    if (typeof dateVal === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateVal)) {
        return dateVal;
    }
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return null;
    return phtFormatter.format(d);
};

exports.getDashboardData = async (req, res) => {
    try {
        const userId = req.user.id;
        const role = req.user.role;

        // Security check: Only admins may access analytics dashboard and wholesale cost data
        if (role !== 'admin' && role !== 'super_admin') {
            return res.status(403).json({ message: 'Access denied: Insufficient permissions' });
        }

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

        // Dynamic 30-day ROI calculation based on revenue and cost of goods sold
        const [roiData] = await db.query(`
            SELECT
                COALESCE(SUM(si.subtotal), 0) AS totalRevenue,
                COALESCE(SUM(COALESCE(NULLIF(si.cost_price, 0), p.cost_price, 0) * si.quantity), 0) AS totalCost
            FROM sale_items si
            JOIN sales s ON si.sale_id = s.id
            LEFT JOIN products p ON si.product_id = p.id
            WHERE s.sale_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
            ${userFilter}
        `, userParams);

        const totalRevenue = Number(roiData[0]?.totalRevenue || 0);
        const totalCost = Number(roiData[0]?.totalCost || 0);
        const refurbROI = totalCost > 0
            ? (((totalRevenue - totalCost) / totalCost) * 100).toFixed(1)
            : '0.0';

        // Sales trends over past 7 days formatted strictly in PHT
        const [salesTrendsRaw] = await db.query(`
            SELECT
                DATE_FORMAT(s.sale_date, '%Y-%m-%d') AS date_str,
                s.payment_method,
                SUM(s.total_amount) AS amount
            FROM sales s
            WHERE s.sale_date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
            ${userFilter}
            GROUP BY DATE_FORMAT(s.sale_date, '%Y-%m-%d'), s.payment_method
            ORDER BY date_str ASC
        `, userParams);

        const salesTrendsMap = {};
        const now = new Date();
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now.getTime() - i * 86400000);
            const dateStr = phtFormatter.format(d);
            const displayDate = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Asia/Manila' });
            salesTrendsMap[dateStr] = { date: displayDate, _dateStr: dateStr, Cash: 0, GCash: 0, Card: 0, Total: 0 };
        }

        salesTrendsRaw.forEach(row => {
            const dateStr = row.date_str || getPHTDateString(row.date);
            const paymentMethod = row.payment_method || 'Cash';
            if (dateStr && salesTrendsMap[dateStr]) {
                salesTrendsMap[dateStr][paymentMethod] += Number(row.amount);
                salesTrendsMap[dateStr].Total += Number(row.amount);
            }
        });

        const salesTrends = Object.values(salesTrendsMap).sort((a, b) => a._dateStr.localeCompare(b._dateStr));

        const [lowStock] = await db.query(`
            SELECT
                p.id,
                p.part_number,
                p.name AS product_name,
                p.brand,
                p.size,
                COALESCE(p.current_stock, p.stock) AS current_stock,
                COALESCE(p.current_stock, p.stock) AS stock,
                p.reorder_level
            FROM products p
            WHERE p.is_active = true
              AND COALESCE(p.current_stock, p.stock) <= p.reorder_level
            ORDER BY COALESCE(p.current_stock, p.stock) ASC
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

        // Defense-in-depth: Never expose cost prices or profit margins to non-admins
        const costVsProfit = (role === 'admin' || role === 'super_admin')
            ? costVsProfitRows.map(item => ({
                name: `${item.part_number} - ${item.product_name}`,
                brand: item.brand,
                cost: Number(item.cost),
                price: Number(item.retail_price)
            }))
            : [];

        res.json({
            kpis: {
                todaysRevenue: todayRevData[0].todaysRevenue,
                topMovingProduct,
                refurbROI
            },
            costVsProfit,
            salesTrends,
            lowStock,
            dailyTransactions
        });
    } catch (err) {
        console.error('Error fetching analytics dashboard data:', err);
        res.status(500).json({ message: 'Error fetching analytics dashboard data' });
    }
};

