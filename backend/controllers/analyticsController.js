const db = require('../config/db');

exports.getDashboardData = async (req, res) => {
    try {
        const connection = await db.getConnection();
        
        // 1. High-Level KPIs
        // Today's Revenue
        const [todayRevData] = await connection.query(`
            SELECT COALESCE(SUM(total_amount), 0) AS todaysRevenue
            FROM sales
            WHERE DATE(sale_date) = CURDATE()
        `);
        const todaysRevenue = todayRevData[0].todaysRevenue;

        // Top Moving Product (Last 30 days)
        const [topMovingData] = await connection.query(`
            SELECT p.product_name, pv.brand, SUM(si.quantity) as total_sold
            FROM sales_items si
            JOIN sales s ON si.sale_id = s.id
            JOIN product_variants pv ON si.variant_id = pv.id
            JOIN products p ON pv.product_id = p.id
            WHERE s.sale_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
            GROUP BY pv.id
            ORDER BY total_sold DESC
            LIMIT 1
        `);
        const topMovingProduct = topMovingData.length > 0 ? `${topMovingData[0].product_name} (${topMovingData[0].brand})` : 'N/A';

        // Overall Refurbishment ROI %
        // ROI = (Total Revenue from Refurbished - Total Repair Cost of Sold Refurbished) / Total Repair Cost
        // For simplicity, let's grab total sales amount of refurbished items and their base repair_cost
        const [refurbData] = await connection.query(`
            SELECT 
                COALESCE(SUM(si.subtotal), 0) as total_refurb_revenue,
                COALESCE(SUM(pv.repair_cost * si.quantity), 0) as total_refurb_cost
            FROM sales_items si
            JOIN product_variants pv ON si.variant_id = pv.id
            WHERE pv.part_condition = 'refurbished'
        `);
        
        let refurbROI = 0;
        const totalRefurbRev = parseFloat(refurbData[0].total_refurb_revenue);
        const totalRefurbCost = parseFloat(refurbData[0].total_refurb_cost);
        if (totalRefurbCost > 0) {
            refurbROI = ((totalRefurbRev - totalRefurbCost) / totalRefurbCost) * 100;
        } else if (totalRefurbRev > 0) {
            refurbROI = 100; // if cost was 0 but we made money
        }

        const kpis = {
            todaysRevenue,
            topMovingProduct,
            refurbROI: refurbROI.toFixed(1)
        };

        // 2. Cost vs Profit Tracking (Bar Chart Data)
        const [refurbItems] = await connection.query(`
            SELECT 
                p.product_name as name, 
                pv.brand,
                pv.repair_cost as cost, 
                pv.price as retail_price
            FROM product_variants pv
            JOIN products p ON pv.product_id = p.id
            WHERE pv.part_condition = 'refurbished'
        `);
        const costVsProfit = refurbItems.map(item => ({
            name: item.brand ? `${item.name} (${item.brand})` : item.name,
            cost: Number(item.cost),
            price: Number(item.retail_price)
        }));

        // 3. Sales Metrics (Line Chart Data for last 7 days)
        const [salesTrendsRaw] = await connection.query(`
            SELECT 
                DATE(sale_date) as date,
                payment_method,
                SUM(total_amount) as amount
            FROM sales
            WHERE sale_date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
            GROUP BY DATE(sale_date), payment_method
            ORDER BY DATE(sale_date) ASC
        `);

        // Format for recharts: { date: 'Mon', Cash: 500, GCash: 200, Card: 0 }
        const salesTrendsMap = {};
        // Initialize last 7 days
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            const displayDate = d.toLocaleDateString('en-US', { weekday: 'short' });
            salesTrendsMap[dateStr] = { date: displayDate, _dateStr: dateStr, Cash: 0, GCash: 0, Card: 0, Total: 0 };
        }

        salesTrendsRaw.forEach(row => {
            const dateStr = new Date(row.date).toISOString().split('T')[0];
            const pMethod = row.payment_method || 'Cash';
            if (salesTrendsMap[dateStr]) {
                salesTrendsMap[dateStr][pMethod] += Number(row.amount);
                salesTrendsMap[dateStr].Total += Number(row.amount);
            }
        });
        const salesTrends = Object.values(salesTrendsMap).sort((a,b) => a._dateStr.localeCompare(b._dateStr));

        // 4. Low Stock Alerts
        const [lowStock] = await connection.query(`
            SELECT p.product_name, pv.brand, pv.stock
            FROM product_variants pv
            JOIN products p ON pv.product_id = p.id
            WHERE pv.stock <= 5
            ORDER BY pv.stock ASC
        `);

        // 5. Daily Transactions
        const userId = req.user.id;
        const role = req.user.role;
        
        let dailyTxQuery = `
            SELECT s.id, s.total_amount, s.payment_method, s.sale_date, u.username as cashier
            FROM sales s
            JOIN users u ON s.user_id = u.id
            WHERE DATE(s.sale_date) = CURDATE()
        `;
        let dailyTxParams = [];

        if (role !== 'admin') {
            dailyTxQuery += ` AND s.user_id = ?`;
            dailyTxParams.push(userId);
        }
        dailyTxQuery += ` ORDER BY s.sale_date DESC`;

        const [dailyTransactions] = await connection.query(dailyTxQuery, dailyTxParams);

        connection.release();

        res.json({
            kpis,
            costVsProfit,
            salesTrends,
            lowStock,
            dailyTransactions
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching analytics dashboard data' });
    }
};
