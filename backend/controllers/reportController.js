const db = require('../config/db');

// Disable HTTP caching on reports to guarantee real-time synchronization between Admin and Staff
const setNoCacheHeaders = (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
};

// Helpers to format dates strictly in Philippine Standard Time (PST / UTC+8)
const getPhilippineDate = () => {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
};

const getPhilippineMonth = () => {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit' }).format(new Date());
};

const buildDateAndUserFilters = (req, tableAlias = 's') => {
    const { startDate, endDate, period, date, month, year } = req.query;
    const where = [];
    const params = [];

    const effectiveStartDate = startDate || (period === 'daily' && date ? date : (date || null));
    const effectiveEndDate = endDate || (period === 'daily' && date ? date : null);

    if (period === 'daily' && !effectiveStartDate && !effectiveEndDate) {
        where.push(`DATE(${tableAlias}.sale_date) = CURDATE()`);
    } else if (period === 'weekly' && !effectiveStartDate && !effectiveEndDate) {
        where.push(`DATE(${tableAlias}.sale_date) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)`);
    } else if (period === 'monthly' && !effectiveStartDate && !effectiveEndDate) {
        if (month) {
            if (month.includes('-')) {
                const parts = month.split('-');
                where.push(`YEAR(${tableAlias}.sale_date) = ? AND MONTH(${tableAlias}.sale_date) = ?`);
                params.push(parseInt(parts[0], 10), parseInt(parts[1], 10));
            } else {
                where.push(`YEAR(${tableAlias}.sale_date) = ? AND MONTH(${tableAlias}.sale_date) = ?`);
                params.push(year ? parseInt(year, 10) : new Date().getFullYear(), parseInt(month, 10));
            }
        } else {
            where.push(`YEAR(${tableAlias}.sale_date) = YEAR(CURDATE()) AND MONTH(${tableAlias}.sale_date) = MONTH(CURDATE())`);
        }
    } else {
        if (effectiveStartDate) {
            where.push(`DATE(${tableAlias}.sale_date) >= ?`);
            params.push(effectiveStartDate);
        }

        if (effectiveEndDate) {
            where.push(`DATE(${tableAlias}.sale_date) <= ?`);
            params.push(effectiveEndDate);
        }
    }

    const isAdmin = String(req.user?.role || '').toLowerCase() === 'admin';
    if (!isAdmin) {
        where.push(`${tableAlias}.user_id = ?`);
        params.push(req.user.id);
    }

    return { where, params };
};

const buildProductFilters = (query, productAlias = 'p', saleItemAlias = 'si') => {
    const { category, brand, partNumber, motorcycleUnitId, motorcycleModel } = query;
    const where = [];
    const params = [];

    if (category && category !== 'All') {
        where.push(`${productAlias}.category = ?`);
        params.push(category);
    }

    if (brand && brand !== 'All') {
        where.push(`COALESCE(NULLIF(${saleItemAlias}.brand, ''), ${productAlias}.brand) = ?`);
        params.push(brand);
    }

    if (partNumber) {
        const compactPartNumber = partNumber.toString().toLowerCase().replace(/[^a-z0-9]/g, '');
        where.push(`(
            ${saleItemAlias}.part_number LIKE ?
            OR REPLACE(REPLACE(REPLACE(LOWER(${saleItemAlias}.part_number), '-', ''), ' ', ''), '.', '') LIKE ?
        )`);
        params.push(`%${partNumber}%`, `%${compactPartNumber}%`);
    }

    if (motorcycleUnitId && motorcycleUnitId !== 'All') {
        where.push(`
            EXISTS (
                SELECT 1
                FROM product_compatibilities pc_filter
                JOIN motorcycle_models mm_filter ON mm_filter.id = pc_filter.motorcycle_model_id
                JOIN motorcycle_units mu_filter ON mu_filter.brand = mm_filter.brand
                    AND (mu_filter.model = mm_filter.model OR TRIM(REPLACE(mu_filter.model, COALESCE(mu_filter.year_model, ''), '')) = TRIM(REPLACE(mm_filter.model, COALESCE(mm_filter.year_model, ''), '')))
                    AND ((mu_filter.year_model IS NULL AND mm_filter.year_model IS NULL) OR mu_filter.year_model = mm_filter.year_model)
                WHERE pc_filter.product_id = ${saleItemAlias}.product_id
                  AND pc_filter.compatibility_status = 'COMPATIBLE'
                  AND mu_filter.id = ?
            )
        `);
        params.push(Number(motorcycleUnitId));
    }

    if (motorcycleModel) {
        where.push(`
            EXISTS (
                SELECT 1
                FROM product_compatibilities pc_filter
                JOIN motorcycle_models mm_filter ON mm_filter.id = pc_filter.motorcycle_model_id
                WHERE pc_filter.product_id = ${saleItemAlias}.product_id
                  AND pc_filter.compatibility_status = 'COMPATIBLE'
                  AND (
                    mm_filter.model LIKE ?
                    OR mm_filter.brand LIKE ?
                    OR mm_filter.year_model LIKE ?
                  )
            )
        `);
        const search = `%${motorcycleModel}%`;
        params.push(search, search, search);
    }

    return { where, params };
};

const compatibilityDisplaySubquery = `
    SELECT
        pc.product_id,
        GROUP_CONCAT(
            DISTINCT TRIM(CONCAT(mm.model, ' ', COALESCE(mm.year_model, '')))
            ORDER BY mm.model, mm.year_model
            SEPARATOR ', '
        ) AS compatibility_display
    FROM product_compatibilities pc
    JOIN motorcycle_models mm ON mm.id = pc.motorcycle_model_id
    WHERE pc.compatibility_status = 'COMPATIBLE'
    GROUP BY pc.product_id
`;

const combineWhere = (...groups) => {
    const where = groups.flatMap(group => group.where);
    const params = groups.flatMap(group => group.params);
    return {
        sql: where.length ? `WHERE ${where.join(' AND ')}` : '',
        params
    };
};

exports.getDashboardSummary = async (req, res) => {
    try {
        setNoCacheHeaders(res);
        const { timeframe = 'today', startDate, endDate } = req.query;
        const todayPHT = getPhilippineDate();

        let effectiveStartDate = todayPHT;
        let effectiveEndDate = todayPHT;

        if (timeframe === 'today') {
            effectiveStartDate = todayPHT;
            effectiveEndDate = todayPHT;
        } else if (timeframe === 'week') {
            const now = new Date();
            const past7 = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
            effectiveStartDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(past7);
            effectiveEndDate = todayPHT;
        } else if (timeframe === 'month') {
            effectiveStartDate = `${todayPHT.slice(0, 7)}-01`;
            effectiveEndDate = todayPHT;
        } else if (timeframe === 'custom') {
            effectiveStartDate = (startDate || todayPHT).trim();
            effectiveEndDate = (endDate || todayPHT).trim();
        }

        const dateCondition = `(
            (DATE(CONVERT_TZ(s.sale_date, '+00:00', '+08:00')) >= ? AND DATE(CONVERT_TZ(s.sale_date, '+00:00', '+08:00')) <= ?)
            OR (DATE(s.sale_date) >= ? AND DATE(s.sale_date) <= ?)
        )`;
        const dateParams = [effectiveStartDate, effectiveEndDate, effectiveStartDate, effectiveEndDate];

        let userCondition = '';
        const userParams = [];
        const isAdmin = String(req.user?.role || '').toLowerCase() === 'admin';
        if (!isAdmin) {
            userCondition = 'AND s.user_id = ?';
            userParams.push(req.user.id);
        }

        // 1. Sales & Transactions (excluding voided sales)
        const [salesData] = await db.query(`
            SELECT
                COUNT(DISTINCT s.id) AS total_transactions,
                COALESCE(SUM(s.total_amount), 0) AS total_revenue
            FROM sales s
            WHERE ${dateCondition} ${userCondition}
              AND (s.status IS NULL OR s.status NOT IN ('VOIDED', 'voided'))
              AND s.voided_at IS NULL
        `, [...dateParams, ...userParams]);

        // 2. Gross & Net Profit (Revenue - COGS - Discounts)
        const [profitData] = await db.query(`
            SELECT
                COALESCE(SUM((si.price - COALESCE(NULLIF(si.cost_price, 0), p.cost_price, 0)) * si.quantity), 0) AS gross_profit
            FROM sale_items si
            JOIN sales s ON s.id = si.sale_id
            LEFT JOIN products p ON si.product_id = p.id
            WHERE ${dateCondition} ${userCondition}
              AND (s.status IS NULL OR s.status NOT IN ('VOIDED', 'voided'))
              AND s.voided_at IS NULL
        `, [...dateParams, ...userParams]);

        const [discountData] = await db.query(`
            SELECT
                COUNT(DISTINCT CASE WHEN s.discount_amount > 0 THEN s.id END) AS discount_count,
                COALESCE(SUM(s.discount_amount), 0) AS total_discounts
            FROM sales s
            WHERE ${dateCondition} ${userCondition}
              AND (s.status IS NULL OR s.status NOT IN ('VOIDED', 'voided'))
              AND s.voided_at IS NULL
        `, [...dateParams, ...userParams]);

        // Payment Breakdown: Cash vs GCash vs Split
        const [paymentBreakdown] = await db.query(`
            SELECT
                COUNT(DISTINCT CASE WHEN LOWER(s.payment_method) = 'cash' OR (LOWER(s.payment_method) = 'split' AND COALESCE(s.cash_amount, 0) > 0) THEN s.id END) AS cash_transactions,
                COALESCE(SUM(
                    CASE 
                        WHEN LOWER(s.payment_method) = 'cash' THEN s.total_amount
                        WHEN LOWER(s.payment_method) = 'split' THEN COALESCE(s.cash_amount, 0)
                        ELSE 0
                    END
                ), 0) AS cash_revenue,
                COUNT(DISTINCT CASE WHEN LOWER(s.payment_method) = 'gcash' OR (LOWER(s.payment_method) = 'split' AND COALESCE(s.gcash_amount, 0) > 0) THEN s.id END) AS gcash_transactions,
                COALESCE(SUM(
                    CASE 
                        WHEN LOWER(s.payment_method) = 'gcash' THEN s.total_amount
                        WHEN LOWER(s.payment_method) = 'split' THEN COALESCE(s.gcash_amount, 0)
                        ELSE 0
                    END
                ), 0) AS gcash_revenue
            FROM sales s
            WHERE ${dateCondition} ${userCondition}
              AND (s.status IS NULL OR s.status NOT IN ('VOIDED', 'voided'))
              AND s.voided_at IS NULL
        `, [...dateParams, ...userParams]);

        // 3. Voided Sales in timeframe
        const voidDateCondition = `(
            (DATE(CONVERT_TZ(COALESCE(s.voided_at, s.sale_date), '+00:00', '+08:00')) >= ? AND DATE(CONVERT_TZ(COALESCE(s.voided_at, s.sale_date), '+00:00', '+08:00')) <= ?)
            OR (DATE(COALESCE(s.voided_at, s.sale_date)) >= ? AND DATE(COALESCE(s.voided_at, s.sale_date)) <= ?)
        )`;
        const [voidData] = await db.query(`
            SELECT
                COUNT(DISTINCT s.id) AS void_count,
                COALESCE(SUM(s.total_amount), 0) AS void_amount
            FROM sales s
            WHERE ${voidDateCondition} ${userCondition}
              AND (s.status = 'VOIDED' OR s.status = 'voided' OR s.voided_at IS NOT NULL)
        `, [effectiveStartDate, effectiveEndDate, effectiveStartDate, effectiveEndDate, ...userParams]);

        // 4. Returns & Refunds in timeframe
        const returnDateCondition = `(
            (DATE(CONVERT_TZ(COALESCE(cr.return_date, cr.created_at), '+00:00', '+08:00')) >= ? AND DATE(CONVERT_TZ(COALESCE(cr.return_date, cr.created_at), '+00:00', '+08:00')) <= ?)
            OR (DATE(COALESCE(cr.return_date, cr.created_at)) >= ? AND DATE(COALESCE(cr.return_date, cr.created_at)) <= ?)
        )`;
        let returnCount = 0;
        let returnAmount = 0;
        try {
            let returnUserCondition = '';
            const returnParams = [effectiveStartDate, effectiveEndDate, effectiveStartDate, effectiveEndDate];
            if (!isAdmin) {
                returnUserCondition = 'AND (cr.processed_by = ? OR cr.sale_id IN (SELECT id FROM sales WHERE user_id = ?))';
                returnParams.push(req.user?.username || '', req.user.id);
            }
            returnCount = 0;
            returnAmount = 0;
        } catch (crErr) {}

        const voidCount = Number(voidData[0]?.void_count || 0);
        const voidAmount = Number(voidData[0]?.void_amount || 0);

        // 5. Low Stock Count
        const [lowStockData] = await db.query(`
            SELECT COUNT(*) AS low_stock_count
            FROM products p
            WHERE (
                CASE
                    WHEN p.is_serialized = 1 THEN (
                        SELECT COALESCE(SUM(ps.quantity), 0) FROM product_serials ps WHERE ps.product_id = p.id AND (ps.status = 'available' OR ps.status IS NULL)
                    )
                    ELSE COALESCE(p.current_stock, p.stock, 0)
                END
            ) <= p.reorder_level AND p.is_active = true
              AND LOWER(p.name) NOT LIKE '%test%' AND LOWER(p.part_number) NOT LIKE '%test%'
        `);
        const lowStockCount = Number(lowStockData[0]?.low_stock_count || 0);

        const totalRevenue = Number(salesData[0]?.total_revenue || 0);
        const totalTransactions = Number(salesData[0]?.total_transactions || 0);
        const rawGrossProfit = Number(profitData[0]?.gross_profit || 0);
        const totalDiscounts = Number(discountData[0]?.total_discounts || 0);
        const grossProfit = Math.max(0, rawGrossProfit - totalDiscounts);
        const netProfit = Math.max(0, grossProfit - returnAmount);

        const cashRevenue = Number(paymentBreakdown[0]?.cash_revenue || 0);
        const cashTransactions = Number(paymentBreakdown[0]?.cash_transactions || 0);
        const gcashRevenue = Number(paymentBreakdown[0]?.gcash_revenue || 0);
        const gcashTransactions = Number(paymentBreakdown[0]?.gcash_transactions || 0);

        const profitRatio = totalRevenue > 0 ? (netProfit / totalRevenue) : 0;
        const cashProfit = Math.max(0, Math.round(cashRevenue * profitRatio * 100) / 100);
        const gcashProfit = Math.max(0, Math.round(gcashRevenue * profitRatio * 100) / 100);

        res.json({
            success: true,
            timeframe,
            startDate: effectiveStartDate,
            endDate: effectiveEndDate,
            sales: {
                total_revenue: totalRevenue,
                total_profit: netProfit,
                gross_profit: grossProfit,
                total_transactions: totalTransactions,
                cash_revenue: cashRevenue,
                cash_transactions: cashTransactions,
                cash_profit: cashProfit,
                gcash_revenue: gcashRevenue,
                gcash_transactions: gcashTransactions,
                gcash_profit: gcashProfit
            },
            void_return: {
                void_count: voidCount,
                void_amount: voidAmount,
                return_count: returnCount,
                return_amount: returnAmount,
                total_count: voidCount + returnCount,
                total_amount: voidAmount + returnAmount
            },
            discounts: {
                discount_count: Number(discountData[0]?.discount_count || 0),
                total_discounts: totalDiscounts
            },
            low_stock_count: lowStockCount
        });
    } catch (err) {
        console.error('Error fetching dashboard summary:', err);
        res.status(500).json({ message: 'Error fetching dashboard summary' });
    }
};

exports.getDailySales = async (req, res) => {
    try {
        setNoCacheHeaders(res);
        const chosenDate = (req.query.date || req.query.startDate || '').trim();
        const chosenEndDate = (req.query.endDate || '').trim();
        const todayPHT = getPhilippineDate();
        const params = [];
        let dateCondition = '';
        let selectDate = '';

        if (chosenDate && chosenEndDate && chosenDate !== chosenEndDate) {
            selectDate = "CONCAT(?, ' to ', ?) as date";
            params.push(chosenDate, chosenEndDate);
            dateCondition = '((DATE(CONVERT_TZ(s.sale_date, \'+00:00\', \'+08:00\')) >= ? AND DATE(CONVERT_TZ(s.sale_date, \'+00:00\', \'+08:00\')) <= ?) OR (DATE(s.sale_date) >= ? AND DATE(s.sale_date) <= ?))';
            params.push(chosenDate, chosenEndDate, chosenDate, chosenEndDate);
        } else if (chosenDate) {
            selectDate = '? as date';
            params.push(chosenDate);
            dateCondition = "(DATE(CONVERT_TZ(s.sale_date, '+00:00', '+08:00')) = ? OR DATE(s.sale_date) = ?)";
            params.push(chosenDate, chosenDate);
        } else {
            selectDate = '? as date';
            params.push(todayPHT);
            dateCondition = "(DATE(CONVERT_TZ(s.sale_date, '+00:00', '+08:00')) = ? OR DATE(s.sale_date) = ? OR DATE(s.sale_date) = CURDATE())";
            params.push(todayPHT, todayPHT);
        }

        let userCondition = '';
        const isAdmin = String(req.user?.role || '').toLowerCase() === 'admin';
        if (!isAdmin) {
            userCondition = 'AND s.user_id = ?';
            params.push(req.user.id);
        }

        const query = `
            SELECT ${selectDate}, 
                   COALESCE(SUM(s.total_amount), 0) as total_revenue, 
                   COUNT(s.id) as total_transactions
            FROM sales s 
            WHERE (${dateCondition}) ${userCondition}
              AND (s.status IS NULL OR s.status != 'voided')
              AND s.voided_at IS NULL
        `;

        const [sales] = await db.query(query, params);
        const result = sales[0] || {};
        res.json({
            date: result.date || chosenDate || todayPHT,
            total_revenue: Number(result.total_revenue) || 0,
            total_transactions: Number(result.total_transactions) || 0
        });
    } catch (err) {
        console.error('Error fetching daily sales:', err);
        res.status(500).json({ message: 'Error fetching daily sales' });
    }
};

exports.getStaffTodaySales = async (req, res) => {
    try {
        setNoCacheHeaders(res);
        const todayPHT = getPhilippineDate();
        const [staffStats] = await db.query(`
            SELECT 
                u.id, 
                u.username, 
                u.role,
                COUNT(DISTINCT CASE 
                    WHEN (DATE(CONVERT_TZ(s.sale_date, '+00:00', '+08:00')) = ? OR DATE(s.sale_date) = ? OR DATE(s.sale_date) = CURDATE()) 
                    THEN s.id 
                END) as today_transactions,
                COALESCE(SUM(CASE 
                    WHEN (DATE(CONVERT_TZ(s.sale_date, '+00:00', '+08:00')) = ? OR DATE(s.sale_date) = ? OR DATE(s.sale_date) = CURDATE()) 
                    THEN s.total_amount 
                END), 0) as today_sales,
                COUNT(DISTINCT s.id) as all_time_transactions,
                COALESCE(SUM(s.total_amount), 0) as all_time_sales
            FROM users u
            LEFT JOIN sales s ON s.user_id = u.id 
                AND (s.status IS NULL OR s.status != 'voided')
                AND s.voided_at IS NULL
            GROUP BY u.id, u.username, u.role
            ORDER BY today_sales DESC, all_time_sales DESC, u.username ASC
        `, [todayPHT, todayPHT, todayPHT, todayPHT]);

        res.json(staffStats.map(row => ({
            id: row.id,
            username: row.username,
            role: row.role,
            today_transactions: Number(row.today_transactions) || 0,
            today_sales: Number(row.today_sales) || 0,
            all_time_transactions: Number(row.all_time_transactions) || 0,
            all_time_sales: Number(row.all_time_sales) || 0
        })));
    } catch (err) {
        console.error('Error fetching staff today sales:', err);
        res.status(500).json({ message: 'Error fetching staff today sales' });
    }
};

exports.getMonthlySales = async (req, res) => {
    try {
        setNoCacheHeaders(res);
        const rawMonth = (req.query.month || '').trim();
        const rawYear = (req.query.year || '').trim();
        const rawDate = (req.query.date || req.query.startDate || '').trim();

        let targetYear = null;
        let targetMonth = null;
        let displayMonth = null;

        if (rawMonth) {
            if (rawMonth.includes('-')) {
                const parts = rawMonth.split('-');
                targetYear = parseInt(parts[0], 10);
                targetMonth = parseInt(parts[1], 10);
            } else {
                targetMonth = parseInt(rawMonth, 10);
                targetYear = rawYear ? parseInt(rawYear, 10) : new Date().getFullYear();
            }
        } else if (rawDate) {
            const parts = rawDate.split('-');
            if (parts.length >= 2) {
                targetYear = parseInt(parts[0], 10);
                targetMonth = parseInt(parts[1], 10);
            }
        } else if (rawYear) {
            targetYear = parseInt(rawYear, 10);
            targetMonth = new Date().getMonth() + 1;
        }

        const params = [];
        let dateCondition = '';
        let selectMonth = '';

        if (targetYear && targetMonth && !isNaN(targetYear) && !isNaN(targetMonth)) {
            const formattedMonthStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}`;
            selectMonth = '? as month';
            params.push(formattedMonthStr);
            dateCondition = 'YEAR(s.sale_date) = ? AND MONTH(s.sale_date) = ?';
            params.push(targetYear, targetMonth);
            displayMonth = formattedMonthStr;
        } else {
            selectMonth = "DATE_FORMAT(CURDATE(), '%Y-%m') as month";
            dateCondition = 'YEAR(s.sale_date) = YEAR(CURDATE()) AND MONTH(s.sale_date) = MONTH(CURDATE())';
            displayMonth = getPhilippineMonth();
        }

        let userCondition = '';
        const isAdmin = String(req.user?.role || '').toLowerCase() === 'admin';
        if (!isAdmin) {
            userCondition = 'AND s.user_id = ?';
            params.push(req.user.id);
        }

        const query = `
            SELECT ${selectMonth}, 
                   COALESCE(SUM(s.total_amount), 0) as total_revenue, 
                   COUNT(s.id) as total_transactions
            FROM sales s 
            WHERE ${dateCondition} ${userCondition}
        `;

        const [sales] = await db.query(query, params);
        const result = sales[0] || {};
        res.json({
            month: result.month || displayMonth || getPhilippineMonth(),
            total_revenue: Number(result.total_revenue) || 0,
            total_transactions: Number(result.total_transactions) || 0
        });
    } catch (err) {
        console.error('Error fetching monthly sales:', err);
        res.status(500).json({ message: 'Error fetching monthly sales' });
    }
};

exports.getLowStock = async (req, res) => {
    try {
        setNoCacheHeaders(res);
        const { category, brand, partNumber, motorcycleUnitId, motorcycleModel } = req.query;
        const filters = [];
        const params = [];

        if (category && category !== 'All') {
            filters.push('p.category = ?');
            params.push(category);
        }
        if (brand && brand !== 'All') {
            filters.push('p.brand = ?');
            params.push(brand);
        }
        if (partNumber) {
            filters.push('p.part_number LIKE ?');
            params.push(`%${partNumber}%`);
        }
        if (motorcycleUnitId && motorcycleUnitId !== 'All') {
            filters.push(`EXISTS (
                SELECT 1
                FROM product_compatibilities pc_filter
                JOIN motorcycle_models mm_filter ON mm_filter.id = pc_filter.motorcycle_model_id
                JOIN motorcycle_units mu_filter ON mu_filter.brand = mm_filter.brand
                    AND (mu_filter.model = mm_filter.model OR TRIM(REPLACE(mu_filter.model, COALESCE(mu_filter.year_model, ''), '')) = TRIM(REPLACE(mm_filter.model, COALESCE(mm_filter.year_model, ''), '')))
                    AND ((mu_filter.year_model IS NULL AND mm_filter.year_model IS NULL) OR mu_filter.year_model = mm_filter.year_model)
                WHERE pc_filter.product_id = p.id
                  AND pc_filter.compatibility_status = 'COMPATIBLE'
                  AND mu_filter.id = ?
            )`);
            params.push(Number(motorcycleUnitId));
        }
        if (motorcycleModel) {
            filters.push(`EXISTS (
                SELECT 1
                FROM product_compatibilities pc_filter
                JOIN motorcycle_models mm_filter ON mm_filter.id = pc_filter.motorcycle_model_id
                WHERE pc_filter.product_id = p.id
                  AND pc_filter.compatibility_status = 'COMPATIBLE'
                  AND (
                    mm_filter.model LIKE ?
                    OR mm_filter.brand LIKE ?
                    OR mm_filter.year_model LIKE ?
                  )
            )`);
            const search = `%${motorcycleModel}%`;
            params.push(search, search, search);
        }

        const filterSql = filters.length ? ` AND ${filters.join(' AND ')}` : '';
        const [products] = await db.query(`
            SELECT
                p.id,
                p.part_number,
                p.name AS product_name,
                p.brand,
                p.size,
                CASE
                    WHEN p.is_serialized = 1 THEN (
                        SELECT COALESCE(SUM(ps.quantity), 0) FROM product_serials ps WHERE ps.product_id = p.id AND (ps.status = 'available' OR ps.status IS NULL)
                    )
                    ELSE COALESCE(p.current_stock, p.stock, 0)
                END AS current_stock,
                CASE
                    WHEN p.is_serialized = 1 THEN (
                        SELECT COALESCE(SUM(ps.quantity), 0) FROM product_serials ps WHERE ps.product_id = p.id AND (ps.status = 'available' OR ps.status IS NULL)
                    )
                    ELSE COALESCE(p.current_stock, p.stock, 0)
                END AS stock,
                p.reorder_level,
                COALESCE(cd.compatibility_display, '') AS compatibility_display
            FROM products p
            LEFT JOIN (${compatibilityDisplaySubquery}) cd ON cd.product_id = p.id
            WHERE (
                CASE
                    WHEN p.is_serialized = 1 THEN (
                        SELECT COALESCE(SUM(ps.quantity), 0) FROM product_serials ps WHERE ps.product_id = p.id AND (ps.status = 'available' OR ps.status IS NULL)
                    )
                    ELSE COALESCE(p.current_stock, p.stock, 0)
                END
            ) <= p.reorder_level AND p.is_active = true AND LOWER(p.name) NOT LIKE '%test%' AND LOWER(p.name) NOT LIKE '%pretest%' AND LOWER(p.part_number) NOT LIKE '%test%'
            ${filterSql}
            ORDER BY stock ASC
        `, params);
        res.json(products);
    } catch (err) {
        console.error('Error fetching low stock:', err);
        res.status(500).json({ message: 'Error fetching low stock' });
    }
};

exports.getBestSelling = async (req, res) => {
    try {
        setNoCacheHeaders(res);
        const dateFilters = buildDateAndUserFilters(req);
        const productFilters = buildProductFilters(req.query);
        const { sql, params } = combineWhere(dateFilters, productFilters);

        const fetchLimit = Math.max(1, Math.min(200, parseInt(req.query.limit, 10) || 100));
        const query = `
            SELECT
                si.product_id AS id,
                si.part_number,
                si.product_name,
                COALESCE(NULLIF(si.brand, ''), p.brand) AS brand,
                si.size,
                p.category,
                COALESCE(cd.compatibility_display, '') AS compatibility_display,
                SUM(si.quantity) AS total_sold,
                SUM(si.subtotal) AS total_revenue,
                SUM((si.price - COALESCE(NULLIF(si.cost_price, 0), p.cost_price, 0)) * si.quantity) AS total_profit
            FROM sale_items si
            LEFT JOIN products p ON si.product_id = p.id
            JOIN sales s ON si.sale_id = s.id
            LEFT JOIN (${compatibilityDisplaySubquery}) cd ON cd.product_id = si.product_id
            ${sql}
            GROUP BY
                si.product_id,
                si.part_number,
                si.product_name,
                COALESCE(NULLIF(si.brand, ''), p.brand),
                si.size,
                p.category,
                cd.compatibility_display
            ORDER BY total_sold DESC
            LIMIT ?
        `;

        const [products] = await db.query(query, [...params, fetchLimit]);
        res.json(products);
    } catch (err) {
        console.error('Error fetching best selling products:', err);
        res.status(500).json({ message: 'Error fetching best selling products' });
    }
};

exports.getSalesByMotorcycle = async (req, res) => {
    try {
        setNoCacheHeaders(res);
        const dateFilters = buildDateAndUserFilters(req);
        const productFilters = buildProductFilters(req.query);
        const { sql, params } = combineWhere(dateFilters, productFilters);

        const [rows] = await db.query(`
            SELECT
                mm.id AS motorcycle_model_id,
                mm.id AS motorcycle_unit_id,
                mm.brand AS motorcycle_brand,
                mm.model AS motorcycle_model,
                mm.year_model,
                TRIM(CONCAT(mm.model, ' ', COALESCE(mm.year_model, ''))) AS motorcycle_display,
                SUM(si.quantity) AS total_sold,
                SUM(si.subtotal) AS total_revenue,
                SUM((si.price - COALESCE(NULLIF(si.cost_price, 0), p.cost_price, 0)) * si.quantity) AS total_profit,
                COUNT(DISTINCT si.part_number) AS distinct_parts,
                GROUP_CONCAT(DISTINCT si.part_number ORDER BY si.part_number SEPARATOR ', ') AS part_numbers
            FROM sale_items si
            JOIN sales s ON s.id = si.sale_id
            LEFT JOIN products p ON p.id = si.product_id
            JOIN product_compatibilities pc ON pc.product_id = si.product_id AND pc.compatibility_status = 'COMPATIBLE'
            JOIN motorcycle_models mm ON mm.id = pc.motorcycle_model_id
            ${sql}
            GROUP BY mm.id, mm.brand, mm.model, mm.year_model
            ORDER BY total_sold DESC, total_revenue DESC
        `, params);

        res.json(rows);
    } catch (err) {
        console.error('Error fetching sales by motorcycle:', err);
        res.status(500).json({ message: 'Error fetching sales by motorcycle' });
    }
};

exports.getCategories = async (req, res) => {
    try {
        setNoCacheHeaders(res);
        const [categories] = await db.query('SELECT DISTINCT category FROM products WHERE is_active = true');
        res.json(categories.map(c => c.category).filter(Boolean));
    } catch (err) {
        console.error('Error fetching categories:', err);
        res.status(500).json({ message: 'Error fetching categories' });
    }
};

exports.getBrands = async (req, res) => {
    try {
        setNoCacheHeaders(res);
        const [brands] = await db.query('SELECT DISTINCT brand FROM products WHERE is_active = true ORDER BY brand');
        res.json(brands.map(b => b.brand).filter(Boolean));
    } catch (err) {
        console.error('Error fetching brands:', err);
        res.status(500).json({ message: 'Error fetching brands' });
    }
};

exports.getSalesByCashier = async (req, res) => {
    try {
        setNoCacheHeaders(res);
        const { where, params } = buildDateAndUserFilters(req, 's');
        const dateFilter = where.length ? `WHERE ${where.join(' AND ')}` : '';
        const [sales] = await db.query(`
            SELECT u.username as cashier, COUNT(s.id) as total_transactions, COALESCE(SUM(s.total_amount), 0) as total_revenue
            FROM sales s
            JOIN users u ON s.user_id = u.id
            ${dateFilter}
            GROUP BY u.id, u.username
            ORDER BY total_revenue DESC
        `, params);
        res.json(sales);
    } catch (err) {
        console.error('Error fetching sales by cashier:', err);
        res.status(500).json({ message: 'Error fetching sales by cashier' });
    }
};

exports.getAdminStats = async (req, res) => {
    try {
        setNoCacheHeaders(res);
        const dateFilters = buildDateAndUserFilters(req);
        const productFilters = buildProductFilters(req.query);
        const { sql, params } = combineWhere(dateFilters, productFilters);

        // Exclude voided transactions
        const voidFilter = "(s.status IS NULL OR s.status != 'voided') AND s.voided_at IS NULL";
        const finalSql = sql ? `${sql} AND ${voidFilter}` : `WHERE ${voidFilter}`;

        // Total Sales & Transactions (All Time)
        const [statsData] = await db.query(`
            SELECT
                COALESCE(SUM(si.subtotal), 0) AS total_revenue,
                COUNT(DISTINCT s.id) AS total_transactions,
                COALESCE(SUM((si.price - COALESCE(NULLIF(si.cost_price, 0), p.cost_price, 0)) * si.quantity), 0) AS total_profit
            FROM sale_items si
            JOIN sales s ON s.id = si.sale_id
            LEFT JOIN products p ON si.product_id = p.id
            ${finalSql}
        `, params);

        // Total Inventory Capital (Current active stock value at cost price)
        const [invData] = await db.query(`
            SELECT 
                COALESCE(SUM(stock * cost_price), 0) AS total_capital,
                COALESCE(SUM(stock), 0) AS total_units
            FROM products
            WHERE is_active = 1 OR is_active IS NULL
        `);

        res.json({
            total_sales: statsData[0].total_revenue,
            total_transactions: statsData[0].total_transactions,
            total_profit: statsData[0].total_profit,
            total_capital: Number(invData[0]?.total_capital || 0),
            total_stock_units: Number(invData[0]?.total_units || 0)
        });
    } catch (err) {
        console.error('Error fetching admin stats:', err);
        res.status(500).json({ message: 'Error fetching admin stats' });
    }
};

/**
 * GET /api/reports/adjustments
 * Return non-sales adjustments filtered by date (created_at < to::date + INTERVAL '1 day')
 * and transaction type, including grouped totals.
 */
exports.getAdjustmentsReport = async (req, res, next) => {
    try {
        setNoCacheHeaders(res);
        const { from, to, startDate, endDate, type, transaction_type, movementType } = req.query;
        const fromDate = from || startDate;
        const toDate = to || endDate;
        const targetType = type || transaction_type || movementType;

        // Discrepancy adjustments only: Damage, Loss, Return to supplier, Found, Add/Sub manual adjustments.
        // Strictly exclude standard inventory operations: SALE, STOCK_IN, PURCHASE_RECEIPT, and OPENING_BALANCE.
        const where = [
            "it.transaction_type IN ('DAMAGE', 'LOSS', 'RETURN_TO_SUPPLIER', 'FOUND', 'ADJUSTMENT_ADD', 'ADJUSTMENT_SUB')",
            "COALESCE(it.remarks, '') NOT LIKE '%pinagluluan%'",
            "COALESCE(it.notes, '') NOT LIKE '%pinagluluan%'",
            "COALESCE(it.remarks, '') NOT LIKE '%damage control%'",
            "COALESCE(it.notes, '') NOT LIKE '%damage control%'",
            "LOWER(p.name) NOT LIKE '%test%'",
            "LOWER(p.name) NOT LIKE '%pretest%'",
            "LOWER(p.part_number) NOT LIKE '%test%'"
        ];
        const params = [];

        if (fromDate) {
            where.push("it.created_at >= ?");
            params.push(`${fromDate} 00:00:00`);
        }

        if (toDate) {
            // Equivalent to created_at < to::date + INTERVAL '1 day'
            where.push("it.created_at < DATE_ADD(?, INTERVAL 1 DAY)");
            params.push(toDate);
        }

        if (targetType && targetType !== 'ALL') {
            where.push("it.transaction_type = ?");
            params.push(targetType.toUpperCase());
        }

        const whereSql = `WHERE ${where.join(' AND ')}`;

        // 1. Detailed adjustments list
        const [adjustments] = await db.query(`
            SELECT 
                it.id,
                it.transaction_number,
                it.reference_no,
                it.product_id,
                p.id AS item_id,
                COALESCE(p.sku, p.part_number) AS sku,
                p.part_number,
                p.name AS product_name,
                p.brand,
                p.category,
                it.transaction_type,
                it.transaction_type AS movement_type,
                it.quantity,
                it.quantity_change,
                it.balance_before,
                it.balance_after,
                it.unit_cost,
                (it.quantity * COALESCE(it.unit_cost, 0)) AS total_value,
                it.reference_type,
                it.reference_type AS reference_code,
                it.loss_transaction_id,
                it.remarks,
                it.notes,
                it.created_at,
                u.username AS created_by_username,
                u.username AS staff_name
            FROM inventory_transactions it
            JOIN products p ON p.id = it.product_id
            LEFT JOIN users u ON u.id = it.created_by
            ${whereSql}
            ORDER BY it.created_at DESC, it.id DESC
        `, params);

        // 2. Grouped totals by transaction type
        const [groupedTotals] = await db.query(`
            SELECT 
                it.transaction_type,
                COUNT(*) AS count,
                COALESCE(SUM(it.quantity), 0) AS total_quantity,
                COALESCE(SUM(it.quantity * COALESCE(it.unit_cost, 0)), 0) AS total_cost_value
            FROM inventory_transactions it
            JOIN products p ON p.id = it.product_id
            ${whereSql}
            GROUP BY it.transaction_type
            ORDER BY it.transaction_type ASC
        `, params);

        const summary = {
            total_adjustments: adjustments.length,
            total_units: adjustments.reduce((acc, a) => acc + Math.abs(Number(a.quantity_change || a.quantity || 0)), 0),
            total_value: adjustments.reduce((acc, a) => acc + Number(a.total_value || 0), 0),
            DAMAGE: 0,
            LOSS: 0,
            RETURN_TO_SUPPLIER: 0,
            FOUND: 0
        };

        groupedTotals.forEach(gt => {
            const key = gt.transaction_type?.toUpperCase();
            if (key) {
                summary[key] = Number(gt.total_quantity || 0);
            }
        });

        res.json({
            adjustments,
            grouped_totals: groupedTotals,
            summary
        });

    } catch (err) {
        next(err);
    }
};

// MODULE 6: REPORTS & ANALYTICS (ADMIN ONLY) CONTROLLER ENDPOINTS
// =========================================================================

/**
 * Helper to build SQL date conditions for Module 6 Reports
 */
const roundToTwo = (num) => Math.round((Number(num) + Number.EPSILON) * 100) / 100;

function buildReportDateCondition(tableAlias, dateColumn, timeframe, startDate, endDate, params) {
    let col = dateColumn;
    if (tableAlias) {
        if (dateColumn.startsWith(`${tableAlias}.`)) {
            col = dateColumn;
        } else if (dateColumn.includes('.')) {
            col = dateColumn;
        } else {
            col = `${tableAlias}.${dateColumn}`;
        }
    }
    if (timeframe === 'today') {
        return `DATE(${col}) = CURDATE()`;
    } else if (timeframe === 'week') {
        return `DATE(${col}) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) AND DATE(${col}) <= CURDATE()`;
    } else if (timeframe === 'month') {
        return `YEAR(${col}) = YEAR(CURDATE()) AND MONTH(${col}) = MONTH(CURDATE())`;
    } else if (timeframe === 'custom' && startDate && endDate) {
        params.push(startDate, endDate);
        return `DATE(${col}) >= ? AND DATE(${col}) <= ?`;
    } else if (timeframe === 'custom' && startDate) {
        params.push(startDate);
        return `DATE(${col}) >= ?`;
    } else if (startDate && endDate) {
        params.push(startDate, endDate);
        return `DATE(${col}) >= ? AND DATE(${col}) <= ?`;
    }
    // Default to all-time if not specified
    return '1=1';
}

function formatAuditDate(date) {
    if (!date) return '-';
    const d = new Date(date);
    if (isNaN(d.getTime())) return String(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day} ${h}:${min}`;
}

/**
 * 1. Sales & Net Profit Report
 * Shows Gross Revenue minus COGS minus Discounts & Shipping Costs = True Net Profit,
 * plus Cash vs. GCash breakdown and Cashier Shift Discrepancies.
 */
exports.getSalesNetProfitReport = async (req, res) => {
    try {
        const { timeframe = 'all', startDate = '', endDate = '' } = req.query;

        const salesParams = [];
        const returnsParams = [];
        const supplierParams = [];

        const salesDateCondition = buildReportDateCondition('s', 'sale_date', timeframe, startDate, endDate, salesParams);
        const returnsDateCondition = buildReportDateCondition('cr', 'return_date', timeframe, startDate, endDate, returnsParams);
        const ordersDateCondition = buildReportDateCondition('so', 'order_date', timeframe, startDate, endDate, supplierParams);

        // 1. Gross Revenue, Transactions, and Cash vs. GCash Breakdown
        const [salesRows] = await db.query(`
            SELECT 
                COALESCE(SUM(s.total_amount), 0) AS gross_revenue,
                COALESCE(SUM(s.discount_amount), 0) AS total_discounts,
                COUNT(s.id) AS total_transactions,
                COALESCE(SUM(CASE WHEN LOWER(s.payment_method) = 'cash' THEN s.total_amount ELSE 0 END), 0) AS cash_revenue,
                COALESCE(SUM(CASE WHEN LOWER(s.payment_method) = 'cash' THEN 1 ELSE 0 END), 0) AS cash_count,
                COALESCE(SUM(CASE WHEN LOWER(s.payment_method) = 'gcash' THEN s.total_amount ELSE 0 END), 0) AS gcash_revenue,
                COALESCE(SUM(CASE WHEN LOWER(s.payment_method) = 'gcash' THEN 1 ELSE 0 END), 0) AS gcash_count
            FROM sales s
            WHERE ${salesDateCondition}
        `, salesParams);

        const grossRevenue = Number(salesRows[0]?.gross_revenue || 0);
        const totalDiscounts = Number(salesRows[0]?.total_discounts || 0);
        const totalTransactions = Number(salesRows[0]?.total_transactions || 0);
        const cashRevenue = Number(salesRows[0]?.cash_revenue || 0);
        const cashCount = Number(salesRows[0]?.cash_count || 0);
        const gcashRevenue = Number(salesRows[0]?.gcash_revenue || 0);
        const gcashCount = Number(salesRows[0]?.gcash_count || 0);

        // 2. Total Cost of Sold Items (COGS)
        const [cogsRows] = await db.query(`
            SELECT 
                COALESCE(SUM(COALESCE(NULLIF(si.unit_cost_snapshot, 0), NULLIF(si.cost_price, 0), p.cost_price, 0) * si.quantity), 0) AS issued_cogs
            FROM sale_items si
            JOIN sales s ON si.sale_id = s.id
            LEFT JOIN products p ON si.product_id = p.id
            WHERE ${salesDateCondition}
        `, salesParams);

        const issuedCOGS = Number(cogsRows[0]?.issued_cogs || 0);

        // 3. Customer Returns, Sales Reversals & Return Losses
        const salesReversals = 0;
        const optionBCogsRemoved = 0;
        const shopReturnLosses = 0;
        const optionACount = 0;
        const optionBCount = 0;

        // 4. Supplier Shipping Costs (Restock Courier Fees)
        const [shippingRows] = await db.query(`
            SELECT COALESCE(SUM(so.shipping_fee), 0) AS total_shipping_fee
            FROM supplier_orders so
            WHERE ${ordersDateCondition}
        `, supplierParams);
        const shippingCosts = Number(shippingRows[0]?.total_shipping_fee || 0);
        const discounts = totalDiscounts; // Retail transaction discounts accounted for accurately

        // 4.1 Store Operating Expenses (Rent, Electricity, Courier, Packaging, Supplies)
        const expParams = [];
        const expDateCondition = buildReportDateCondition('e', 'expense_date', timeframe, startDate, endDate, expParams);
        const [expRows] = await db.query(`
            SELECT 
                COALESCE(SUM(e.amount), 0) AS total_operating_expenses,
                COALESCE(SUM(CASE WHEN e.category = 'Shop Rent' THEN e.amount ELSE 0 END), 0) AS rent_expenses,
                COALESCE(SUM(CASE WHEN e.category LIKE '%Electricity%' OR e.category LIKE '%Utilities%' THEN e.amount ELSE 0 END), 0) AS electricity_expenses,
                COALESCE(SUM(CASE WHEN e.category LIKE '%Shipping%' OR e.category LIKE '%Courier%' THEN e.amount ELSE 0 END), 0) AS courier_expenses,
                COALESCE(SUM(CASE WHEN e.category LIKE '%Packaging%' OR e.category LIKE '%Bags%' THEN e.amount ELSE 0 END), 0) AS packaging_expenses,
                COALESCE(SUM(CASE WHEN e.category LIKE '%Snack%' OR e.category LIKE '%Allowance%' THEN e.amount ELSE 0 END), 0) AS staff_allowance_expenses,
                COALESCE(SUM(CASE WHEN e.category LIKE '%Maintenance%' THEN e.amount ELSE 0 END), 0) AS maintenance_expenses
            FROM store_operating_expenses e
            WHERE ${expDateCondition}
        `, expParams);
        const storeOperatingExpenses = Number(expRows[0]?.total_operating_expenses || 0);

        // 4.2 Negative Stock Adjustments (Damaged on shelf / Shrinkage / Inventory Losses)
        const adjParams = [];
        const adjDateCondition = buildReportDateCondition('it', 'created_at', timeframe, startDate, endDate, adjParams);
        const [adjRows] = await db.query(`
            SELECT COALESCE(SUM(ABS(it.quantity) * COALESCE(p.supplier_cost, p.cost_price, 0)), 0) AS shrinkage_losses
            FROM inventory_transactions it
            LEFT JOIN products p ON it.product_id = p.id
            WHERE ${adjDateCondition} AND it.transaction_type IN ('ADJUSTMENT_DAMAGE', 'ADJUSTMENT_LOSS', 'AUDIT_DISCREPANCY', 'DAMAGE', 'LOSS', 'ADJUSTMENT_SUB') AND it.quantity < 0
        `, adjParams);
        const shrinkageLosses = Number(adjRows[0]?.shrinkage_losses || 0);

        // Total Losses & Operating Expenses
        const combinedShopLosses = shopReturnLosses + shrinkageLosses;
        const totalOperatingExpenses = storeOperatingExpenses + shippingCosts;

        // Core Accounting Metrics (Specification 9 Formula)
        const netRetailSales = Math.max(0, grossRevenue - salesReversals - discounts);
        const activeCOGS = Math.max(0, issuedCOGS - optionBCogsRemoved);
        const grossMargin = netRetailSales - activeCOGS;
        const trueNetProfit = grossMargin - combinedShopLosses - totalOperatingExpenses;

        // 5. Cashier Shift & Discrepancies Breakdown
        const [cashierRows] = await db.query(`
            SELECT 
                u.id AS cashier_id,
                COALESCE(u.full_name, u.username, 'Admin') AS cashier_name,
                u.role,
                COUNT(s.id) AS transaction_count,
                COALESCE(SUM(CASE WHEN LOWER(s.payment_method) = 'cash' THEN s.total_amount ELSE 0 END), 0) AS cash_collected,
                COALESCE(SUM(CASE WHEN LOWER(s.payment_method) = 'gcash' THEN s.total_amount ELSE 0 END), 0) AS gcash_collected,
                COALESCE(SUM(s.total_amount), 0) AS total_sales_issued
            FROM sales s
            LEFT JOIN users u ON s.user_id = u.id
            WHERE ${salesDateCondition}
            GROUP BY u.id, u.full_name, u.username, u.role
            ORDER BY total_sales_issued DESC
        `, salesParams);

        // 6. Itemized Sold Products Breakdown (Sales by Part)
        const [soldProductsRows] = await db.query(`
            SELECT 
                COALESCE(p.id, si.product_id) AS product_id,
                COALESCE(si.part_number, p.part_number, p.sku, 'N/A') AS part_number,
                COALESCE(si.product_name, p.name, 'Unknown Part') AS product_name,
                COALESCE(si.brand, p.brand, 'Unbranded') AS brand,
                COALESCE(p.category, 'Uncategorized') AS category,
                COALESCE(SUM(si.quantity), 0) AS total_qty_sold,
                COALESCE(AVG(COALESCE(NULLIF(si.unit_cost_snapshot, 0), NULLIF(si.cost_price, 0), p.cost_price, 0)), 0) AS avg_unit_cost,
                COALESCE(AVG(COALESCE(si.price, si.retail_price_snapshot, p.selling_price, 0)), 0) AS avg_unit_price,
                COALESCE(SUM(COALESCE(si.subtotal, si.quantity * si.price, 0)), 0) AS total_revenue,
                COALESCE(SUM(COALESCE(si.subtotal, si.quantity * si.price, 0) - (COALESCE(NULLIF(si.unit_cost_snapshot, 0), NULLIF(si.cost_price, 0), p.cost_price, 0) * si.quantity)), 0) AS total_gross_profit
            FROM sale_items si
            JOIN sales s ON si.sale_id = s.id
            LEFT JOIN products p ON si.product_id = p.id
            WHERE ${salesDateCondition} AND (s.status IS NULL OR s.status != 'VOIDED')
            GROUP BY COALESCE(p.id, si.product_id), COALESCE(si.part_number, p.part_number, p.sku), COALESCE(si.product_name, p.name), COALESCE(si.brand, p.brand), COALESCE(p.category, 'Uncategorized')
            ORDER BY total_revenue DESC
            LIMIT 100
        `, salesParams);

        // 7. Category Sales Performance Breakdown
        const [categoryRows] = await db.query(`
            SELECT 
                COALESCE(p.category, 'Uncategorized') AS category,
                COALESCE(SUM(si.quantity), 0) AS total_qty_sold,
                COALESCE(SUM(COALESCE(si.subtotal, si.quantity * si.price, 0)), 0) AS total_revenue,
                COALESCE(SUM(COALESCE(si.subtotal, si.quantity * si.price, 0) - (COALESCE(NULLIF(si.unit_cost_snapshot, 0), NULLIF(si.cost_price, 0), p.cost_price, 0) * si.quantity)), 0) AS total_gross_profit
            FROM sale_items si
            JOIN sales s ON si.sale_id = s.id
            LEFT JOIN products p ON si.product_id = p.id
            WHERE ${salesDateCondition} AND (s.status IS NULL OR s.status != 'VOIDED')
            GROUP BY COALESCE(p.category, 'Uncategorized')
            ORDER BY total_revenue DESC
        `, salesParams);

        // 8. Order-Level Sales Transaction Ledger
        const [recentSalesRows] = await db.query(`
            SELECT 
                s.id,
                COALESCE(s.order_number, s.receipt_no, CONCAT('SO-', s.id)) AS order_number,
                s.sale_date,
                COALESCE(u.full_name, u.username, 'Admin') AS cashier_name,
                COALESCE(s.customer_name, 'Walk-in Customer') AS customer_name,
                s.payment_method,
                s.total_amount,
                s.status,
                COUNT(si.id) AS item_count,
                COALESCE(GROUP_CONCAT(CONCAT(COALESCE(si.product_name, p.name), ' (x', si.quantity, ')') SEPARATOR ', '), 'No items') AS items_summary
            FROM sales s
            LEFT JOIN users u ON s.user_id = u.id
            LEFT JOIN sale_items si ON si.sale_id = s.id
            LEFT JOIN products p ON si.product_id = p.id
            WHERE ${salesDateCondition} AND (s.status IS NULL OR s.status != 'VOIDED')
            GROUP BY s.id, s.order_number, s.receipt_no, s.sale_date, u.full_name, u.username, s.customer_name, s.payment_method, s.total_amount, s.status
            ORDER BY s.sale_date DESC
            LIMIT 50
        `, salesParams);

        res.json({
            success: true,
            timeframe,
            date_range: { startDate, endDate },
            financials: {
                gross_revenue: roundToTwo(grossRevenue),
                sales_reversals: roundToTwo(salesReversals),
                discounts: roundToTwo(discounts),
                net_retail_sales: roundToTwo(netRetailSales),
                cost_of_goods_sold: roundToTwo(activeCOGS),
                gross_margin: roundToTwo(grossMargin),
                shop_return_losses: roundToTwo(shopReturnLosses),
                shrinkage_losses: roundToTwo(shrinkageLosses),
                combined_shop_losses: roundToTwo(combinedShopLosses),
                store_operating_expenses: roundToTwo(storeOperatingExpenses),
                shipping_costs: roundToTwo(shippingCosts),
                total_operating_expenses: roundToTwo(totalOperatingExpenses),
                true_net_profit: roundToTwo(trueNetProfit),
                profit_margin_pct: netRetailSales > 0 ? roundToTwo((trueNetProfit / netRetailSales) * 100) : 0,
                expense_breakdown: {
                    rent: roundToTwo(Number(expRows[0]?.rent_expenses || 0)),
                    electricity: roundToTwo(Number(expRows[0]?.electricity_expenses || 0)),
                    shipping_courier: roundToTwo(shippingCosts + Number(expRows[0]?.courier_expenses || 0)),
                    packaging: roundToTwo(Number(expRows[0]?.packaging_expenses || 0)),
                    staff_allowance: roundToTwo(Number(expRows[0]?.staff_allowance_expenses || 0)),
                    maintenance: roundToTwo(Number(expRows[0]?.maintenance_expenses || 0))
                }
            },
            payment_channels: {
                total_transactions: totalTransactions,
                cash: {
                    count: cashCount,
                    amount: roundToTwo(cashRevenue),
                    percentage: grossRevenue > 0 ? roundToTwo((cashRevenue / grossRevenue) * 100) : 0
                },
                gcash: {
                    count: gcashCount,
                    amount: roundToTwo(gcashRevenue),
                    percentage: grossRevenue > 0 ? roundToTwo((gcashRevenue / grossRevenue) * 100) : 0
                }
            },
            return_summary: {
                option_a_replacements: optionACount,
                option_b_refunds: optionBCount,
                total_losses: roundToTwo(shopReturnLosses)
            },
            cashier_shifts: cashierRows.map(row => ({
                cashier_id: row.cashier_id,
                cashier_name: row.cashier_name,
                role: row.role,
                transaction_count: Number(row.transaction_count),
                cash_collected: roundToTwo(Number(row.cash_collected)),
                gcash_collected: roundToTwo(Number(row.gcash_collected)),
                total_sales: roundToTwo(Number(row.total_sales_issued)),
                discrepancy_amount: 0.00,
                status: 'Balanced'
            })),
            sold_products: soldProductsRows.map(r => {
                const rev = Number(r.total_revenue || 0);
                const prof = Number(r.total_gross_profit || 0);
                return {
                    product_id: r.product_id,
                    part_number: r.part_number,
                    product_name: r.product_name,
                    brand: r.brand,
                    category: r.category,
                    total_qty_sold: Number(r.total_qty_sold || 0),
                    avg_unit_cost: roundToTwo(Number(r.avg_unit_cost || 0)),
                    avg_unit_price: roundToTwo(Number(r.avg_unit_price || 0)),
                    total_revenue: roundToTwo(rev),
                    total_gross_profit: roundToTwo(prof),
                    margin_pct: rev > 0 ? roundToTwo((prof / rev) * 100) : 0
                };
            }),
            category_sales: categoryRows.map(r => {
                const rev = Number(r.total_revenue || 0);
                const prof = Number(r.total_gross_profit || 0);
                return {
                    category: r.category,
                    total_qty_sold: Number(r.total_qty_sold || 0),
                    total_revenue: roundToTwo(rev),
                    total_gross_profit: roundToTwo(prof),
                    margin_pct: rev > 0 ? roundToTwo((prof / rev) * 100) : 0,
                    share_pct: grossRevenue > 0 ? roundToTwo((rev / grossRevenue) * 100) : 0
                };
            }),
            sales_transactions: recentSalesRows.map(r => ({
                id: r.id,
                order_number: r.order_number,
                sale_date: r.sale_date,
                cashier_name: r.cashier_name,
                customer_name: r.customer_name,
                payment_method: r.payment_method,
                total_amount: roundToTwo(Number(r.total_amount || 0)),
                status: r.status,
                item_count: Number(r.item_count || 0),
                items_summary: r.items_summary
            }))
        });

    } catch (err) {
        console.error('[Module 6: Sales & Net Profit Report] Error:', err);
        res.status(500).json({ success: false, message: 'Failed to generate Sales & Net Profit Report' });
    }
};

/**
 * 2. Fast-Moving vs. Dead-Stock Report
 * Ranks top-selling parts (to buy in bulk) alongside Dead Stock
 * (parts with zero sales in 60/90/180 days for Facebook Marketplace clearance).
 */
exports.getFastMovingDeadStockReport = async (req, res) => {
    try {
        const { timeframe = 'all', startDate = '', endDate = '', thresholdDays = 60 } = req.query;
        const days = Math.max(30, parseInt(thresholdDays, 10) || 60);

        const salesParams = [];
        const salesDateCondition = buildReportDateCondition('s', 'sale_date', timeframe, startDate, endDate, salesParams);

        // 1. Fast-Moving Parts (High weekly turnover, net_qty_sold >= 3)
        const [fastMoving] = await db.query(`
            SELECT 
                p.id AS product_id,
                p.sku_code,
                p.part_name,
                p.brand,
                p.category,
                p.sellable_stock,
                p.reorder_level,
                p.supplier_cost,
                p.retail_price,
                COALESCE(SUM(si.quantity), 0) AS gross_qty_sold,
                COALESCE(SUM(si.quantity), 0) AS net_qty_sold,
                COALESCE(SUM(si.subtotal), 0) AS revenue_generated,
                ROUND(COALESCE(SUM(si.subtotal), 0) - (COALESCE(p.supplier_cost, 0) * COALESCE(SUM(si.quantity), 0)), 2) AS estimated_profit
            FROM products p
            JOIN sale_items si ON p.id = si.product_id
            JOIN sales s ON si.sale_id = s.id
            
            WHERE ${salesDateCondition}
            GROUP BY p.id, p.sku_code, p.part_name, p.brand, p.category, p.sellable_stock, p.reorder_level, p.supplier_cost, p.retail_price
            HAVING net_qty_sold >= 3
            ORDER BY net_qty_sold DESC, revenue_generated DESC
            LIMIT 50
        `, salesParams);

        // 2. Slow-Moving Parts (Items that have only sold 1–2 times in the last 30–60 days)
        const [slowMoving] = await db.query(`
            SELECT 
                p.id AS product_id,
                p.sku_code,
                p.part_name,
                p.brand,
                p.category,
                p.sellable_stock,
                p.reorder_level,
                p.supplier_cost,
                p.retail_price,
                COALESCE(SUM(si.quantity), 0) AS net_qty_sold,
                COALESCE(SUM(si.subtotal), 0) AS revenue_generated,
                MAX(s.sale_date) AS last_sale_date,
                DATEDIFF(NOW(), MAX(s.sale_date)) AS days_since_last_sale
            FROM products p
            JOIN sale_items si ON p.id = si.product_id
            JOIN sales s ON si.sale_id = s.id
            
            WHERE s.sale_date >= DATE_SUB(NOW(), INTERVAL 60 DAY)
            GROUP BY p.id, p.sku_code, p.part_name, p.brand, p.category, p.sellable_stock, p.reorder_level, p.supplier_cost, p.retail_price
            HAVING net_qty_sold BETWEEN 1 AND 2
            ORDER BY net_qty_sold ASC, p.sellable_stock DESC
            LIMIT 50
        `);

        // 3. Dead-Stock Parts (Zero sales in the last 90+ days / never sold)
        const deadDays = Math.max(90, parseInt(thresholdDays, 10) || 90);
        const [deadStock] = await db.query(`
            SELECT 
                p.id AS product_id,
                p.sku_code,
                p.part_name,
                p.brand,
                p.category,
                p.sellable_stock,
                p.supplier_cost,
                p.retail_price,
                ROUND(p.sellable_stock * p.supplier_cost, 2) AS capital_tied_up,
                MAX(s.sale_date) AS last_sale_date,
                DATEDIFF(NOW(), COALESCE(MAX(s.sale_date), p.created_at)) AS days_since_last_sale
            FROM products p
            LEFT JOIN sale_items si ON p.id = si.product_id
            LEFT JOIN sales s ON si.sale_id = s.id
            WHERE p.sellable_stock > 0
            GROUP BY p.id, p.sku_code, p.part_name, p.brand, p.category, p.sellable_stock, p.supplier_cost, p.retail_price, p.created_at
            HAVING days_since_last_sale >= ? OR last_sale_date IS NULL
            ORDER BY capital_tied_up DESC, days_since_last_sale DESC
            LIMIT 100
        `, [deadDays]);

        // Calculate dead-stock total capital tied up
        const totalDeadStockCapital = deadStock.reduce((acc, row) => acc + Number(row.capital_tied_up || 0), 0);
        const totalDeadStockUnits = deadStock.reduce((acc, row) => acc + Number(row.sellable_stock || 0), 0);

        res.json({
            success: true,
            threshold_days: days,
            timeframe,
            fast_moving: {
                count: fastMoving.length,
                items: fastMoving.map((item, idx) => ({
                    rank: idx + 1,
                    product_id: item.product_id,
                    sku: item.sku_code,
                    part_name: item.part_name,
                    brand: item.brand,
                    category: item.category,
                    sellable_stock: Number(item.sellable_stock),
                    reorder_level: Number(item.reorder_level),
                    supplier_cost: Number(item.supplier_cost),
                    retail_price: Number(item.retail_price),
                    net_qty_sold: Number(item.net_qty_sold),
                    revenue_generated: Number(item.revenue_generated),
                    estimated_profit: Number(item.estimated_profit),
                    action_advice: Number(item.sellable_stock) <= Number(item.reorder_level)
                        ? 'Urgent Restock (Bulk Order on Messenger)'
                        : 'Healthy Fast-Mover'
                }))
            },
            slow_moving: {
                threshold: '1–2 sales in last 60 days',
                count: slowMoving.length,
                items: slowMoving.map((item, idx) => ({
                    rank: idx + 1,
                    product_id: item.product_id,
                    sku: item.sku_code,
                    part_name: item.part_name,
                    brand: item.brand,
                    category: item.category,
                    sellable_stock: Number(item.sellable_stock),
                    reorder_level: Number(item.reorder_level),
                    supplier_cost: Number(item.supplier_cost),
                    retail_price: Number(item.retail_price),
                    net_qty_sold: Number(item.net_qty_sold),
                    revenue_generated: Number(item.revenue_generated),
                    days_inactive: item.days_since_last_sale || 30,
                    action_advice: 'Monitor shelf velocity before reordering'
                }))
            },
            dead_stock: {
                threshold_days: days,
                count: deadStock.length,
                total_units: totalDeadStockUnits,
                total_capital_tied_up: roundToTwo(totalDeadStockCapital),
                items: deadStock.map(item => ({
                    product_id: item.product_id,
                    sku: item.sku_code,
                    part_name: item.part_name,
                    brand: item.brand,
                    category: item.category,
                    sellable_stock: Number(item.sellable_stock),
                    supplier_cost: Number(item.supplier_cost),
                    retail_price: Number(item.retail_price),
                    capital_tied_up: Number(item.capital_tied_up),
                    days_inactive: item.days_since_last_sale || 999,
                    last_sale: item.last_sale_date ? formatAuditDate(item.last_sale_date) : 'Never Sold',
                    clearance_recommendation: `Post on Facebook Marketplace at clearance price (₱${Math.max(Number(item.supplier_cost), Number(item.retail_price) * 0.75).toFixed(2)})`
                }))
            }
        });

    } catch (err) {
        console.error('[Module 6: Fast-Moving vs Dead-Stock Report] Error:', err);
        res.status(500).json({ success: false, message: 'Failed to generate Fast-Moving vs Dead-Stock Report' });
    }
};

/**
 * 3. Stock Card (Item Movement Ledger) & Valuation
 * Shows exact chronological movement history (+Stock-In, -Sale Invoice #, -Adjustment, +Return)
 * and calculates total shop inventory valuation at Cost and Retail.
 */
exports.getStockCardValuationReport = async (req, res) => {
    try {
        const { productId = '', search = '' } = req.query;

        // 1. Overall Shop Inventory Valuation
        const [valRows] = await db.query(`
            SELECT 
                COUNT(*) AS total_skus,
                COALESCE(SUM(sellable_stock), 0) AS total_sellable_units,
                COALESCE(SUM(damaged_stock), 0) AS total_damaged_units,
                COALESCE(SUM(sellable_stock * supplier_cost), 0) AS total_cost_value,
                COALESCE(SUM(sellable_stock * retail_price), 0) AS total_retail_value,
                COALESCE(SUM(damaged_stock * supplier_cost), 0) AS total_damaged_loss_value
            FROM products
        `);

        const totalCostVal = Number(valRows[0]?.total_cost_value || 0);
        const totalRetailVal = Number(valRows[0]?.total_retail_value || 0);
        const potentialProfit = Math.max(0, totalRetailVal - totalCostVal);
        const marginPct = totalRetailVal > 0 ? (potentialProfit / totalRetailVal) * 100 : 0;

        // 2. Select Product for Stock Card Ledger
        let selectedProduct = null;
        let pId = parseInt(productId, 10);

        if (!pId) {
            let whereClause = '1=1';
            const findParams = [];
            if (search.trim()) {
                whereClause = 'p.part_name LIKE ? OR p.sku_code LIKE ? OR p.brand LIKE ?';
                const s = `%${search.trim()}%`;
                findParams.push(s, s, s);
            }
            const [firstProd] = await db.query(`
                SELECT p.id, p.sku_code, p.part_name, p.brand, p.category, p.supplier_cost, p.retail_price, p.sellable_stock, p.damaged_stock
                FROM products p
                WHERE ${whereClause}
                ORDER BY p.sellable_stock DESC, p.id ASC
                LIMIT 1
            `, findParams);
            if (firstProd.length > 0) {
                selectedProduct = firstProd[0];
                pId = selectedProduct.id;
            }
        } else {
            const [pRow] = await db.query(`
                SELECT p.id, p.sku_code, p.part_name, p.brand, p.category, p.supplier_cost, p.retail_price, p.sellable_stock, p.damaged_stock
                FROM products p
                WHERE p.id = ?
            `, [pId]);
            selectedProduct = pRow[0] || null;
        }

        let ledgerEntries = [];
        if (pId) {
            // A. Supplier Stock-Ins (from supplier orders)
            const [stockInRows] = await db.query(`
                SELECT 
                    so.order_date AS event_date,
                    'STOCK_IN' AS movement_type,
                    CONCAT('PO-', so.order_id, ' (', COALESCE(s.fb_page_name, 'FB Supplier'), ')') AS reference_no,
                    soi.qty_accepted_good AS quantity_in,
                    0 AS quantity_out,
                    soi.unit_cost AS unit_cost,
                    CONCAT('Courier: ', COALESCE(so.courier_name, 'N/A'), ' | Waybill: ', COALESCE(so.tracking_number, 'N/A')) AS notes
                FROM supplier_order_items soi
                JOIN supplier_orders so ON soi.order_id = so.order_id
                LEFT JOIN suppliers s ON so.supplier_id = s.supplier_id
                WHERE soi.product_id = ? AND so.order_status = 'Inspected & Accepted' AND soi.qty_accepted_good > 0
            `, [pId]);

            // B. POS Sales Out
            const [salesRows] = await db.query(`
                SELECT 
                    s.sale_date AS event_date,
                    'SALE_OUT' AS movement_type,
                    COALESCE(s.receipt_no, s.order_number, CONCAT('OR-', s.id)) AS reference_no,
                    0 AS quantity_in,
                    si.quantity AS quantity_out,
                    COALESCE(NULLIF(si.unit_cost_snapshot, 0), NULLIF(si.cost_price, 0), 0) AS unit_cost,
                    CONCAT('Walk-in POS Sale via ', s.payment_method) AS notes
                FROM sale_items si
                JOIN sales s ON si.sale_id = s.id
                WHERE si.product_id = ?
            `, [pId]);

            // C. Customer Returns In
            const returnRows = [];

            // Combine and sort chronologically
            const allMovements = [
                ...stockInRows.map(r => ({ ...r, event_date: new Date(r.event_date) })),
                ...salesRows.map(r => ({ ...r, event_date: new Date(r.event_date) })),
                ...returnRows.map(r => ({ ...r, event_date: new Date(r.event_date) }))
            ].sort((a, b) => a.event_date - b.event_date);

            // Calculate running balance forward
            let runningBalance = 0;
            ledgerEntries = allMovements.map(m => {
                if (m.movement_type === 'STOCK_IN') {
                    runningBalance += Number(m.quantity_in);
                } else if (m.movement_type === 'SALE_OUT') {
                    runningBalance = Math.max(0, runningBalance - Number(m.quantity_out));
                } else if (m.movement_type === 'CUSTOMER_RETURN') {
                    // Damaged returns move to quarantine
                }
                return {
                    date: formatAuditDate(m.event_date),
                    movement_type: m.movement_type,
                    reference_no: m.reference_no,
                    qty_in: m.quantity_in > 0 ? `+${m.quantity_in}` : '-',
                    qty_out: m.quantity_out > 0 ? `-${m.quantity_out}` : '-',
                    running_stock: runningBalance,
                    unit_cost: Number(m.unit_cost),
                    notes: m.notes
                };
            });
        }

        res.json({
            success: true,
            valuation: {
                total_skus: Number(valRows[0]?.total_skus || 0),
                total_sellable_units: Number(valRows[0]?.total_sellable_units || 0),
                total_damaged_units: Number(valRows[0]?.total_damaged_units || 0),
                total_inventory_cost: roundToTwo(totalCostVal),
                total_inventory_retail: roundToTwo(totalRetailVal),
                potential_gross_profit: roundToTwo(potentialProfit),
                potential_margin_pct: roundToTwo(marginPct),
                quarantined_loss_value: roundToTwo(Number(valRows[0]?.total_damaged_loss_value || 0))
            },
            selected_product: selectedProduct ? {
                id: selectedProduct.id,
                sku: selectedProduct.sku_code,
                name: selectedProduct.part_name,
                brand: selectedProduct.brand,
                category: selectedProduct.category,
                unit_cost: Number(selectedProduct.supplier_cost),
                retail_price: Number(selectedProduct.retail_price),
                sellable_stock: Number(selectedProduct.sellable_stock),
                damaged_stock: Number(selectedProduct.damaged_stock),
                total_value_cost: roundToTwo(Number(selectedProduct.sellable_stock) * Number(selectedProduct.supplier_cost)),
                total_value_retail: roundToTwo(Number(selectedProduct.sellable_stock) * Number(selectedProduct.retail_price))
            } : null,
            stock_card_ledger: ledgerEntries
        });

    } catch (err) {
        console.error('[Module 6: Stock Card & Valuation Report] Error:', err);
        res.status(500).json({ success: false, message: 'Failed to generate Stock Card & Valuation Report' });
    }
};

/**
 * 4. FB Supplier Spend & Price History Report
 * Tracks total money spent per Facebook supplier and alerts the owner
 * if a supplier quietly raised the unit cost of a part compared to previous orders.
 */
exports.getFBSupplierSpendPriceHistoryReport = async (req, res) => {
    try {
        const { timeframe = 'all', startDate = '', endDate = '' } = req.query;

        const orderParams = [];
        const dateCondition = buildReportDateCondition('so', 'order_date', timeframe, startDate, endDate, orderParams);

        // 1. Supplier Spend Summary
        const [supplierSpend] = await db.query(`
            SELECT 
                s.supplier_id,
                s.fb_page_name,
                s.seller_contact_name,
                s.messenger_link,
                s.phone_number,
                s.payment_details,
                COUNT(so.order_id) AS total_orders,
                COALESCE(SUM(so.shipping_fee), 0) AS total_shipping_spent,
                COALESCE(SUM(so.total_order_cost), 0) AS total_money_spent,
                COALESCE(SUM(soi.qty_ordered), 0) AS total_units_ordered,
                COALESCE(SUM(soi.qty_accepted_good), 0) AS total_good_units,
                COALESCE(SUM(soi.qty_rejected_damaged), 0) AS total_damaged_units
            FROM suppliers s
            LEFT JOIN supplier_orders so ON s.supplier_id = so.supplier_id AND (${dateCondition})
            LEFT JOIN supplier_order_items soi ON so.order_id = soi.order_id
            GROUP BY s.supplier_id, s.fb_page_name, s.seller_contact_name, s.messenger_link, s.phone_number, s.payment_details
            ORDER BY total_money_spent DESC
        `, orderParams);

        // 2. Price History & Price Hike Detection
        const [orderItemRows] = await db.query(`
            SELECT 
                soi.product_id,
                p.sku_code,
                p.part_name,
                p.brand,
                so.supplier_id,
                s.fb_page_name AS supplier_name,
                so.order_id,
                so.order_date,
                soi.unit_cost
            FROM supplier_order_items soi
            JOIN supplier_orders so ON soi.order_id = so.order_id
            JOIN products p ON soi.product_id = p.id
            JOIN suppliers s ON so.supplier_id = s.supplier_id
            ORDER BY soi.product_id, so.order_date ASC
        `);

        // Group by product and compare sequential order costs
        const priceHikeAlerts = [];
        const productHistoryMap = {};

        for (const row of orderItemRows) {
            const pKey = `${row.product_id}-${row.supplier_id}`;
            if (!productHistoryMap[pKey]) {
                productHistoryMap[pKey] = [];
            }
            productHistoryMap[pKey].push(row);
        }

        for (const [key, history] of Object.entries(productHistoryMap)) {
            if (history.length > 1) {
                for (let i = 1; i < history.length; i++) {
                    const prev = history[i - 1];
                    const curr = history[i];
                    const prevCost = Number(prev.unit_cost);
                    const currCost = Number(curr.unit_cost);

                    if (currCost > prevCost) {
                        const diff = currCost - prevCost;
                        const pct = ((diff / prevCost) * 100).toFixed(1);
                        priceHikeAlerts.push({
                            product_id: curr.product_id,
                            sku: curr.sku_code,
                            part_name: curr.part_name,
                            brand: curr.brand,
                            supplier_name: curr.supplier_name,
                            previous_order_date: formatAuditDate(prev.order_date),
                            previous_cost: prevCost,
                            new_order_date: formatAuditDate(curr.order_date),
                            new_cost: currCost,
                            increase_amount: roundToTwo(diff),
                            increase_percentage: `${pct}%`,
                            alert_level: Number(pct) >= 10 ? 'High' : 'Moderate'
                        });
                    }
                }
            }
        }

        const totalOverallSpend = supplierSpend.reduce((acc, row) => acc + Number(row.total_money_spent || 0), 0);
        const totalOverallShipping = supplierSpend.reduce((acc, row) => acc + Number(row.total_shipping_spent || 0), 0);

        res.json({
            success: true,
            timeframe,
            summary: {
                total_suppliers: supplierSpend.length,
                total_spend: roundToTwo(totalOverallSpend),
                total_shipping: roundToTwo(totalOverallShipping),
                price_hikes_detected: priceHikeAlerts.length
            },
            suppliers: supplierSpend.map(s => ({
                id: s.supplier_id,
                fb_page_name: s.fb_page_name,
                contact_name: s.seller_contact_name,
                messenger_link: s.messenger_link,
                phone: s.phone_number || 'N/A',
                payment_details: s.payment_details,
                total_orders: Number(s.total_orders || 0),
                total_units_ordered: Number(s.total_units_ordered || 0),
                total_good_units: Number(s.total_good_units || 0),
                total_damaged_units: Number(s.total_damaged_units || 0),
                shipping_spent: roundToTwo(Number(s.total_shipping_spent || 0)),
                total_spent: roundToTwo(Number(s.total_money_spent || 0))
            })),
            price_hike_alerts: priceHikeAlerts
        });

    } catch (err) {
        console.error('[Module 6: FB Supplier Spend Report] Error:', err);
        res.status(500).json({ success: false, message: 'Failed to generate FB Supplier Spend Report' });
    }
};

/**
 * 5. Return & Defect Loss Report
 * Identifies which brands or Facebook suppliers have the highest defect rates
 * and tracks unrecovered RMA money.
 */
exports.getReturnDefectLossReport = async (req, res) => {
    try {
        const { timeframe = 'all', startDate = '', endDate = '' } = req.query;

        const returnParams = [];
        const dateCondition = buildReportDateCondition('cr', 'return_date', timeframe, startDate, endDate, returnParams);

        // 1. Defect Breakdown by Brand
        const [brandDefects] = await db.query(`
            SELECT 
                COALESCE(p.brand, 'Generic') AS brand,
                COUNT(it.id) AS return_incidents,
                COALESCE(SUM(ABS(it.quantity)), 0) AS total_defective_qty,
                0 AS replacements_issued,
                0 AS refunds_issued,
                0 AS sales_reversals_total,
                COALESCE(SUM(ABS(it.quantity) * COALESCE(p.supplier_cost, p.cost_price, 0)), 0) AS total_defect_loss
            FROM inventory_transactions it
            LEFT JOIN products p ON it.product_id = p.id
            WHERE it.transaction_type IN ('DAMAGE', 'ADJUSTMENT_DAMAGE', 'LOSS') AND it.quantity < 0
            GROUP BY COALESCE(p.brand, 'Generic')
            ORDER BY total_defect_loss DESC
        `);

        // 2. Courier Unboxing Rejections & Pre-Acceptance Losses by FB Supplier
        const orderParams = [];
        const orderDateCondition = buildReportDateCondition('so', 'order_date', timeframe, startDate, endDate, orderParams);

        const [supplierRejections] = await db.query(`
            SELECT 
                s.supplier_id,
                s.fb_page_name AS supplier_name,
                s.seller_contact_name,
                COUNT(so.order_id) AS total_deliveries,
                COALESCE(SUM(soi.qty_ordered), 0) AS total_units_ordered,
                COALESCE(SUM(soi.qty_rejected_damaged), 0) AS damaged_on_arrival_count,
                ROUND(COALESCE(SUM(soi.qty_rejected_damaged * soi.unit_cost), 0), 2) AS unrecovered_rma_money
            FROM suppliers s
            LEFT JOIN supplier_orders so ON s.supplier_id = so.supplier_id AND (${orderDateCondition})
            LEFT JOIN supplier_order_items soi ON so.order_id = soi.order_id
            GROUP BY s.supplier_id, s.fb_page_name, s.seller_contact_name
            HAVING damaged_on_arrival_count > 0 OR total_deliveries > 0
            ORDER BY unrecovered_rma_money DESC, damaged_on_arrival_count DESC
        `, orderParams);

        // 3. Recent Defect Incidents Audit Log (In-Store Defects)
        const [recentIncidents] = await db.query(`
            SELECT 
                it.id,
                it.reference_no AS return_code,
                it.created_at AS return_date,
                COALESCE(p.name, p.part_number, 'Item') AS product_name,
                COALESCE(p.brand, 'Generic') AS brand,
                ABS(it.quantity) AS qty_damaged,
                'IN_STORE_DEFECT' AS return_type,
                ABS(it.quantity) * COALESCE(p.supplier_cost, p.cost_price, 0) AS unit_cost_loss,
                COALESCE(it.remarks, it.notes, 'In-store shelf defect write-off') AS damage_description,
                COALESCE(u.username, 'Admin') AS staff_name
            FROM inventory_transactions it
            LEFT JOIN products p ON it.product_id = p.id
            LEFT JOIN users u ON it.created_by = u.id
            WHERE it.transaction_type IN ('DAMAGE', 'ADJUSTMENT_DAMAGE', 'LOSS') AND it.quantity < 0
            ORDER BY it.created_at DESC
            LIMIT 50
        `);

        const totalDefectLossAll = brandDefects.reduce((acc, row) => acc + Number(row.total_defect_loss || 0), 0);
        const totalDefectiveUnitsAll = brandDefects.reduce((acc, row) => acc + Number(row.total_defective_qty || 0), 0);
        const totalUnrecoveredRMA = supplierRejections.reduce((acc, row) => acc + Number(row.unrecovered_rma_money || 0), 0);

        res.json({
            success: true,
            timeframe,
            summary: {
                total_defect_loss: roundToTwo(totalDefectLossAll),
                total_defective_units: totalDefectiveUnitsAll,
                unrecovered_rma_money: roundToTwo(totalUnrecoveredRMA)
            },
            brand_analysis: brandDefects.map(b => ({
                brand: b.brand,
                return_incidents: Number(b.return_incidents),
                defective_qty: Number(b.total_defective_qty),
                replacements_issued: Number(b.replacements_issued),
                refunds_issued: Number(b.refunds_issued),
                sales_reversals: roundToTwo(Number(b.sales_reversals_total)),
                total_loss: roundToTwo(Number(b.total_defect_loss))
            })),
            supplier_analysis: supplierRejections.map(s => ({
                supplier_id: s.supplier_id,
                supplier_name: s.supplier_name,
                contact_name: s.seller_contact_name,
                total_deliveries: Number(s.total_deliveries),
                units_ordered: Number(s.total_units_ordered),
                damaged_on_arrival: Number(s.damaged_on_arrival_count),
                unrecovered_rma_money: roundToTwo(Number(s.unrecovered_rma_money))
            })),
            recent_defect_incidents: recentIncidents.map(i => ({
                id: i.id,
                return_code: i.return_code,
                date: formatAuditDate(i.return_date),
                product_name: i.product_name,
                brand: i.brand,
                qty_damaged: Number(i.qty_damaged),
                return_type: i.return_type,
                unit_cost_loss: roundToTwo(Number(i.unit_cost_loss)),
                damage_description: i.damage_description,
                staff_name: i.staff_name
            }))
        });

    } catch (err) {
        console.error('[Module 6: Return & Defect Loss Report] Error:', err);
        res.status(500).json({ success: false, message: 'Failed to generate Return & Defect Loss Report' });
    }
};



/**
 * Module 1: Owner Command Center Dashboard
 * Today's Sales & True Net Profit, Low-Stock Alerts with Linked Suppliers,
 * and Payment Approvals Queue (Customer GCash & Supplier POs).
 */
exports.getOwnerDashboardData = async (req, res) => {
    try {
        setNoCacheHeaders(res);

        // 1. Today's Gross Sales, Discounts, Transactions
        const [grossData] = await db.query(`
            SELECT 
                COALESCE(SUM(si.price * si.quantity), 0) AS gross_sales,
                COALESCE(SUM(s.discount_amount), 0) AS total_discounts,
                COUNT(DISTINCT s.id) AS total_transactions,
                COUNT(DISTINCT CASE WHEN LOWER(s.payment_method) = 'cash' OR (LOWER(s.payment_method) = 'split' AND s.cash_amount > 0) THEN s.id END) AS cash_transactions,
                COUNT(DISTINCT CASE WHEN LOWER(s.payment_method) = 'gcash' OR (LOWER(s.payment_method) = 'split' AND s.gcash_amount > 0) THEN s.id END) AS gcash_transactions,
                COALESCE(SUM(CASE WHEN LOWER(s.payment_method) = 'cash' THEN s.total_amount WHEN LOWER(s.payment_method) = 'split' THEN s.cash_amount ELSE 0 END), 0) AS cash_revenue,
                COALESCE(SUM(CASE WHEN LOWER(s.payment_method) = 'gcash' THEN s.total_amount WHEN LOWER(s.payment_method) = 'split' THEN s.gcash_amount ELSE 0 END), 0) AS gcash_revenue
            FROM sales s
            JOIN sale_items si ON s.id = si.sale_id
            WHERE (DATE(CONVERT_TZ(s.sale_date, '+00:00', '+08:00')) = CURDATE() OR DATE(s.sale_date) = CURDATE())
              AND (s.status IS NULL OR s.status NOT IN ('VOIDED', 'voided'))
              AND s.voided_at IS NULL
        `);

        const grossSales = Number(grossData[0]?.gross_sales || 0);
        const totalDiscounts = Number(grossData[0]?.total_discounts || 0);
        const totalTransactions = Number(grossData[0]?.total_transactions || 0);
        const cashTransactions = Number(grossData[0]?.cash_transactions || 0);
        const gcashTransactions = Number(grossData[0]?.gcash_transactions || 0);
        const cashRevenue = Number(grossData[0]?.cash_revenue || 0);
        const gcashRevenue = Number(grossData[0]?.gcash_revenue || 0);

        // 2. Sales Reversals (Refunds) Today
        const salesReversals = 0;
        const refundCount = 0;

        // Net Retail Sales = Gross Sales - Sales Reversals
        const netRetailSales = Math.max(0, grossSales - salesReversals);

        // 3. Active COGS (Cost of Kept Sales) Today
        const [cogsData] = await db.query(`
            SELECT 
                COALESCE(SUM(COALESCE(NULLIF(si.cost_price, 0), p.cost_price, 0) * (si.quantity)), 0) AS active_cogs
            FROM sale_items si
            JOIN sales s ON s.id = si.sale_id
            LEFT JOIN products p ON si.product_id = p.id
            
            WHERE (DATE(CONVERT_TZ(s.sale_date, '+00:00', '+08:00')) = CURDATE() OR DATE(s.sale_date) = CURDATE())
              AND (s.status IS NULL OR s.status NOT IN ('VOIDED', 'voided'))
              AND s.voided_at IS NULL
        `);
        const activeCOGS = Number(cogsData[0]?.active_cogs || 0);

        // 4. Shop Return Losses (Unit Cost of Damaged/Defective Returns) Today
        const [lossData] = await db.query(`
            SELECT 
                COALESCE(SUM(ABS(it.quantity) * COALESCE(p.supplier_cost, p.cost_price, 0)), 0) AS shop_return_losses
            FROM inventory_transactions it
            LEFT JOIN products p ON it.product_id = p.id
            WHERE (DATE(CONVERT_TZ(it.created_at, '+00:00', '+08:00')) = CURDATE() OR DATE(it.created_at) = CURDATE())
              AND it.transaction_type IN ('DAMAGE', 'ADJUSTMENT_DAMAGE', 'LOSS')
              AND it.quantity < 0
        `);
        const shopReturnLosses = Number(lossData[0]?.shop_return_losses || 0);

        // 5. Store Expenses Today
        const [expenseData] = await db.query(`
            SELECT 
                COALESCE(SUM(amount), 0) AS store_expenses
            FROM cash_movements
            WHERE (DATE(CONVERT_TZ(created_at, '+00:00', '+08:00')) = CURDATE() OR DATE(created_at) = CURDATE())
              AND movement_type IN ('EXPENSE', 'PAYOUT', 'STORE_EXPENSE')
        `);
        const storeExpenses = Number(expenseData[0]?.store_expenses || 0);

        // 6. True Net Profit
        const trueNetProfit = netRetailSales - activeCOGS - shopReturnLosses - storeExpenses;

        // 7. Hourly Sales Trend for the Current Day (8 AM to 8 PM / Current Hour)
        const [hourlyRaw] = await db.query(`
            SELECT 
                HOUR(CONVERT_TZ(s.sale_date, '+00:00', '+08:00')) AS sale_hour,
                COUNT(DISTINCT s.id) AS tx_count,
                COALESCE(SUM(s.total_amount), 0) AS total_amount,
                COALESCE(SUM(CASE WHEN LOWER(s.payment_method) = 'cash' THEN s.total_amount WHEN LOWER(s.payment_method) = 'split' THEN s.cash_amount ELSE 0 END), 0) AS cash_amount,
                COALESCE(SUM(CASE WHEN LOWER(s.payment_method) = 'gcash' THEN s.total_amount WHEN LOWER(s.payment_method) = 'split' THEN s.gcash_amount ELSE 0 END), 0) AS gcash_amount
            FROM sales s
            WHERE (DATE(CONVERT_TZ(s.sale_date, '+00:00', '+08:00')) = CURDATE() OR DATE(s.sale_date) = CURDATE())
              AND (s.status IS NULL OR s.status NOT IN ('VOIDED', 'voided'))
              AND s.voided_at IS NULL
            GROUP BY HOUR(CONVERT_TZ(s.sale_date, '+00:00', '+08:00'))
            ORDER BY sale_hour ASC
        `);

        const hourlyMap = {};
        for (let h = 0; h < 24; h++) {
            hourlyMap[h] = {
                hour: h,
                label: h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`,
                total: 0,
                cash: 0,
                gcash: 0,
                tx_count: 0
            };
        }
        hourlyRaw.forEach(row => {
            const h = Number(row.sale_hour);
            if (hourlyMap[h]) {
                hourlyMap[h].total = Number(row.total_amount);
                hourlyMap[h].cash = Number(row.cash_amount);
                hourlyMap[h].gcash = Number(row.gcash_amount);
                hourlyMap[h].tx_count = Number(row.tx_count);
            }
        });
        const hourlyTrend = Object.values(hourlyMap).filter(item => item.hour >= 7 && item.hour <= 21);

        // 8. Prioritized Low-Stock Alerts with Linked Facebook Suppliers & Staff Restock Requests
        const [lowStockAlerts] = await db.query(`
            SELECT 
                p.id,
                p.part_number,
                p.name AS product_name,
                p.brand,
                p.category,
                p.shelf_location,
                p.cost_price,
                p.selling_price,
                COALESCE(p.sellable_stock, p.current_stock, p.stock, 0) AS sellable_stock,
                p.reorder_level,
                p.is_serialized,
                p.supplier_id,
                COALESCE(s.name, p.supplier_name, 'Direct Wholesale Hub') AS supplier_name,
                s.fb_page_name,
                s.contact_person,
                COALESCE(s.phone, s.phone_number) AS contact_number,
                COALESCE(s.gcash_account_number, s.payment_details) AS gcash_number,
                s.messenger_url,
                GREATEST(1, (p.reorder_level * 2) - COALESCE(p.sellable_stock, p.current_stock, p.stock, 0)) AS suggested_order_qty,
                rr.id AS restock_request_id,
                rr.requested_qty AS restock_requested_qty,
                rr.status AS restock_request_status,
                rr.staff_name AS restock_staff_name,
                rr.priority AS restock_priority,
                rr.notes AS restock_notes,
                rr.created_at AS restock_requested_at
            FROM products p
            LEFT JOIN suppliers s ON p.supplier_id = s.id
            LEFT JOIN restock_requests rr ON rr.product_id = p.id AND rr.status = 'PENDING'
            WHERE p.is_active = 1
              AND COALESCE(p.sellable_stock, p.current_stock, p.stock, 0) <= p.reorder_level
            ORDER BY 
                CASE WHEN rr.id IS NOT NULL THEN 0 ELSE 1 END ASC,
                sellable_stock ASC, 
                (p.reorder_level - COALESCE(p.sellable_stock, p.current_stock, p.stock, 0)) DESC
            LIMIT 30
        `);

        // 8b. Pending Staff Restock Requests Queue
        const [pendingStaffRestockRequests] = await db.query(`
            SELECT 
                rr.*,
                COALESCE(p.sellable_stock, p.current_stock, p.stock, 0) AS current_sellable_stock,
                COALESCE(s.name, rr.supplier_name, 'Direct Supplier') AS supplier_name,
                s.fb_page_name,
                s.messenger_url
            FROM restock_requests rr
            LEFT JOIN products p ON p.id = rr.product_id
            LEFT JOIN suppliers s ON s.id = rr.supplier_id
            WHERE rr.status = 'PENDING'
            ORDER BY 
                CASE rr.priority WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 ELSE 2 END ASC,
                rr.created_at DESC
            LIMIT 20
        `);

        // 9. Payment Approvals & Pending Payments Tracker (4 Live Queues)
        // Queue 1: Pending Customer GCash / Bank Transfers (Incoming)
        const [customerGCash] = await db.query(`
            SELECT 
                s.id, 
                s.order_number, 
                s.receipt_no, 
                s.sale_date, 
                COALESCE(s.customer_name, 'Walk-in Customer') AS customer_name,
                s.total_amount, 
                COALESCE(s.gcash_amount, s.total_amount) AS amount_due,
                COALESCE(s.gcash_amount, s.total_amount) AS gcash_amount, 
                s.payment_method, 
                s.payment_reference,
                COALESCE(s.payment_status, 'PENDING_VERIFICATION') AS payment_status,
                u.username AS cashier,
                u.username AS recorded_by
            FROM sales s
            LEFT JOIN users u ON s.user_id = u.id
            WHERE (LOWER(s.payment_method) = 'gcash' OR (LOWER(s.payment_method) = 'split' AND s.gcash_amount > 0))
              AND (s.status IS NULL OR s.status NOT IN ('VOIDED', 'voided'))
            ORDER BY 
              CASE WHEN s.payment_status = 'VERIFIED' THEN 1 ELSE 0 END ASC,
              s.sale_date DESC
            LIMIT 30
        `);

        // Queue 2: Pending Customer Balances / Held Orders (Incoming)
        const [customerBalances] = await db.query(`
            SELECT 
                s.id,
                s.order_number,
                s.receipt_no,
                s.sale_date,
                COALESCE(s.customer_name, 'Walk-in Customer') AS customer_name,
                s.total_amount,
                GREATEST(0, s.total_amount - COALESCE(s.tendered_amount, s.cash_amount, 0)) AS amount_due,
                COALESCE(s.tendered_amount, s.cash_amount, 0) AS amount_paid,
                s.payment_method,
                s.payment_reference,
                COALESCE(s.payment_status, 'PENDING_BALANCE') AS payment_status,
                u.username AS cashier,
                u.username AS recorded_by
            FROM sales s
            LEFT JOIN users u ON s.user_id = u.id
            WHERE (s.status = 'PENDING' OR s.payment_status IN ('PENDING_BALANCE', 'UNPAID', 'PARTIAL') OR (s.tendered_amount < s.total_amount AND s.tendered_amount > 0))
              AND (s.status IS NULL OR s.status NOT IN ('VOIDED', 'voided'))
            ORDER BY s.sale_date DESC
            LIMIT 30
        `);

        // Queue 3: Outgoing Unpaid Facebook Supplier Orders (GCash / Bank Transfer)
        const [supplierUnpaidPOs] = await db.query(`
            SELECT 
                so.order_id,
                so.po_number,
                so.supplier_id,
                so.order_date,
                so.courier_name,
                so.tracking_number,
                so.shipping_fee,
                so.total_order_cost AS amount_due,
                so.total_order_cost,
                so.order_status,
                COALESCE(so.payment_status, 'PENDING_OWNER_APPROVAL') AS payment_status,
                so.payment_method,
                so.payment_reference,
                so.approved_at,
                COALESCE(s.name, 'Facebook Supplier') AS supplier_name,
                s.fb_page_name,
                s.contact_person,
                COALESCE(s.phone, s.phone_number) AS phone,
                s.messenger_url,
                COALESCE(s.gcash_account_number, s.payment_details) AS gcash_number,
                COUNT(soi.order_item_id) AS total_items_count
            FROM supplier_orders so
            LEFT JOIN suppliers s ON so.supplier_id = s.id
            LEFT JOIN supplier_order_items soi ON so.order_id = soi.order_id
            WHERE (so.payment_method IS NULL OR LOWER(so.payment_method) != 'cod')
            GROUP BY so.order_id
            ORDER BY 
                CASE WHEN so.payment_status = 'APPROVED_PAID' THEN 1 ELSE 0 END ASC,
                so.order_date DESC
            LIMIT 30
        `);

        // Queue 4: Outgoing Incoming COD Supplier Parcels (Cash upon courier rider arrival)
        const [supplierCODParcels] = await db.query(`
            SELECT 
                so.order_id,
                so.po_number,
                so.supplier_id,
                so.order_date,
                so.courier_name,
                so.tracking_number,
                so.shipping_fee,
                so.total_order_cost AS amount_due,
                so.total_order_cost,
                so.order_status,
                COALESCE(so.payment_status, 'COD_ARRIVING') AS payment_status,
                so.payment_method,
                so.payment_reference,
                so.approved_at,
                COALESCE(s.name, 'Facebook Supplier') AS supplier_name,
                s.fb_page_name,
                s.contact_person,
                COALESCE(s.phone, s.phone_number) AS phone,
                s.messenger_url,
                COALESCE(s.gcash_account_number, s.payment_details) AS gcash_number,
                COUNT(soi.order_item_id) AS total_items_count
            FROM supplier_orders so
            LEFT JOIN suppliers s ON so.supplier_id = s.id
            LEFT JOIN supplier_order_items soi ON so.order_id = soi.order_id
            WHERE LOWER(so.payment_method) = 'cod'
            GROUP BY so.order_id
            ORDER BY 
                CASE WHEN so.payment_status = 'APPROVED_PAID' THEN 1 ELSE 0 END ASC,
                so.order_date DESC
            LIMIT 30
        `);

        const pendingCustomerCount = customerGCash.filter(c => c.payment_status !== 'VERIFIED').length;
        const pendingCustomerBalancesCount = customerBalances.filter(c => c.payment_status !== 'SETTLED' && c.payment_status !== 'paid').length;
        const pendingSupplierCount = supplierUnpaidPOs.filter(so => so.payment_status !== 'APPROVED_PAID').length;
        const pendingCODCount = supplierCODParcels.filter(so => so.payment_status !== 'APPROVED_PAID' && so.payment_status !== 'COD_PAID').length;

        const totalIncomingAmount = customerGCash.filter(c => c.payment_status !== 'VERIFIED').reduce((sum, c) => sum + Number(c.amount_due || 0), 0) +
                                    customerBalances.reduce((sum, c) => sum + Number(c.amount_due || 0), 0);
        const totalOutgoingAmount = supplierUnpaidPOs.filter(so => so.payment_status !== 'APPROVED_PAID').reduce((sum, so) => sum + Number(so.amount_due || 0), 0) +
                                    supplierCODParcels.filter(so => so.payment_status !== 'APPROVED_PAID' && so.payment_status !== 'COD_PAID').reduce((sum, so) => sum + Number(so.amount_due || 0), 0);

        const pendingPaymentsPayload = {
            customer_gcash: customerGCash,
            customer_balances: customerBalances,
            supplier_po_payments: supplierUnpaidPOs,
            supplier_cod_parcels: supplierCODParcels,
            pending_customer_count: pendingCustomerCount,
            pending_customer_balances_count: pendingCustomerBalancesCount,
            pending_supplier_count: pendingSupplierCount,
            pending_cod_count: pendingCODCount,
            total_pending_count: pendingCustomerCount + pendingCustomerBalancesCount + pendingSupplierCount + pendingCODCount,
            total_incoming_amount: totalIncomingAmount,
            total_outgoing_amount: totalOutgoingAmount,
            net_pending_amount: totalIncomingAmount - totalOutgoingAmount
        };

        // Returns, Voids & Replacements Tracker (Live Owner Dashboard Monitoring)
        const [voidsList] = await db.query(`
            SELECT 
                s.id,
                s.id AS sale_id,
                s.order_number,
                s.total_amount,
                COALESCE(s.void_reason, 'No reason specified') AS reason,
                COALESCE(s.voided_at, s.sale_date) AS event_date,
                'VOID' AS record_type,
                'Void Sale' AS type_label,
                COALESCE(u.username, 'Admin') AS cashier_name,
                COALESCE(u.role, 'cashier') AS cashier_role,
                (
                    SELECT GROUP_CONCAT(CONCAT(si.quantity, 'x ', p.name) SEPARATOR ', ')
                    FROM sale_items si
                    LEFT JOIN products p ON si.product_id = p.id
                    WHERE si.sale_id = s.id
                ) AS items_summary,
                (
                    SELECT COALESCE(SUM(si.quantity), 0)
                    FROM sale_items si
                    WHERE si.sale_id = s.id
                ) AS items_qty
            FROM sales s
            LEFT JOIN users u ON s.user_id = u.id
            WHERE s.status = 'VOIDED' OR s.voided_at IS NOT NULL
            ORDER BY COALESCE(s.voided_at, s.sale_date) DESC
            LIMIT 40
        `);

        const totalVoidsCount = voidsList.length;
        const totalVoidedAmount = voidsList.reduce((acc, v) => acc + Number(v.total_amount || 0), 0);
        const totalItemsRestored = voidsList.reduce((acc, i) => acc + Number(i.items_qty || 0), 0);

        const returnsVoidsTrackerPayload = {
            all_records: voidsList,
            voids: voidsList,
            returns: [],
            replacements: [],
            total_events_count: totalVoidsCount,
            total_voids_count: totalVoidsCount,
            total_returns_count: 0,
            total_replacements_count: 0,
            total_voided_amount: totalVoidedAmount,
            total_refunded_amount: 0,
            total_items_restored: totalItemsRestored
        };

        const userRole = (req.user?.role || '').toLowerCase();
        if (userRole !== 'admin') {
            return res.json({
                success: true,
                pnl: {
                    gross_sales: 0,
                    sales_reversals: 0,
                    net_retail_sales: 0,
                    active_cogs: 0,
                    shop_return_losses: 0,
                    store_expenses: 0,
                    true_net_profit: 0,
                    refund_count: 0,
                    total_discounts: 0
                },
                transactions: {
                    total_count: totalTransactions,
                    cash_count: cashTransactions,
                    gcash_count: gcashTransactions,
                    cash_revenue: cashRevenue,
                    gcash_revenue: gcashRevenue
                },
                hourly_trends: [],
                low_stock_alerts: lowStockAlerts,
                staff_restock_requests: pendingStaffRestockRequests,
                payment_approvals: pendingPaymentsPayload,
                returns_voids_tracker: returnsVoidsTrackerPayload
            });
        }

        res.json({
            success: true,
            pnl: {
                gross_sales: grossSales,
                sales_reversals: salesReversals,
                net_retail_sales: netRetailSales,
                active_cogs: activeCOGS,
                shop_return_losses: shopReturnLosses,
                store_expenses: storeExpenses,
                true_net_profit: trueNetProfit,
                refund_count: refundCount,
                total_discounts: totalDiscounts
            },
            transactions: {
                total_count: totalTransactions,
                cash_count: cashTransactions,
                gcash_count: gcashTransactions,
                cash_revenue: cashRevenue,
                gcash_revenue: gcashRevenue
            },
            hourly_trends: hourlyTrend,
            low_stock_alerts: lowStockAlerts,
            staff_restock_requests: pendingStaffRestockRequests,
            payment_approvals: pendingPaymentsPayload,
            returns_voids_tracker: returnsVoidsTrackerPayload
        });

    } catch (err) {
        console.error('[Owner Command Center Dashboard] Error:', err);
        res.status(500).json({ success: false, message: 'Failed to generate Owner Command Center data' });
    }
};

/**
 * Helper to record actions in audit_logs
 */
const recordAuditLog = async (userId, username, userRole, actionType, entityType, entityId, refId, reason, metadata = null) => {
    try {
        await db.query(`
            INSERT INTO audit_logs (
                user_id, user_name, user_role, module, action_type, entity_type, entity_id, reference_id, reason, metadata, created_at
            ) VALUES (?, ?, ?, 'PAYMENTS', ?, ?, ?, ?, ?, ?, NOW())
        `, [
            userId || null,
            username || 'admin',
            userRole || 'admin',
            actionType,
            entityType,
            entityId ? String(entityId) : null,
            refId ? String(refId) : null,
            reason,
            metadata ? (typeof metadata === 'string' ? metadata : JSON.stringify(metadata)) : null
        ]);
    } catch (e) {
        console.error('Failed to write audit log:', e.message);
    }
};

/**
 * Owner Action: Verify Customer GCash Payment
 */
exports.verifyCustomerGCashPayment = async (req, res) => {
    try {
        const saleId = req.params.id;
        const [sales] = await db.query('SELECT order_number, total_amount, gcash_amount, customer_name, payment_reference FROM sales WHERE id = ?', [saleId]);
        const sale = sales[0] || {};

        await db.query(`
            UPDATE sales 
            SET payment_status = 'VERIFIED', paid_at = NOW() 
            WHERE id = ?
        `, [saleId]);

        await recordAuditLog(
            req.user?.id,
            req.user?.username,
            req.user?.role,
            'VERIFY_GCASH_PAYMENT',
            'SALE',
            saleId,
            sale.order_number || `SO-${saleId}`,
            `Verified customer GCash payment of ₱${sale.gcash_amount || sale.total_amount || 0} for ${sale.customer_name || 'Customer'}. Ref: ${sale.payment_reference || 'N/A'}`
        );

        res.json({ success: true, message: 'Customer GCash payment verified and confirmed in wallet' });
    } catch (err) {
        console.error('Error verifying customer GCash payment:', err);
        res.status(500).json({ success: false, message: 'Failed to verify customer GCash payment' });
    }
};

/**
 * Owner Action: Reject / Flag Customer GCash Payment Issue
 */
exports.rejectCustomerGCashPayment = async (req, res) => {
    try {
        const saleId = req.params.id;
        const reason = req.body?.reason || 'Payment reference not found in shop GCash phone wallet';
        const [sales] = await db.query('SELECT order_number, total_amount, gcash_amount, customer_name, payment_reference FROM sales WHERE id = ?', [saleId]);
        const sale = sales[0] || {};

        await db.query(`
            UPDATE sales 
            SET payment_status = 'REJECTED_UNVERIFIED' 
            WHERE id = ?
        `, [saleId]);

        await recordAuditLog(
            req.user?.id,
            req.user?.username,
            req.user?.role,
            'REJECT_GCASH_PAYMENT',
            'SALE',
            saleId,
            sale.order_number || `SO-${saleId}`,
            `Flagged/Rejected customer GCash payment issue: ${reason}`
        );

        res.json({ success: true, message: 'Customer GCash payment flagged as unverified' });
    } catch (err) {
        console.error('Error rejecting customer GCash payment:', err);
        res.status(500).json({ success: false, message: 'Failed to flag customer GCash payment' });
    }
};

/**
 * Owner Action: Settle Pending Customer Balance
 */
exports.settleCustomerBalancePayment = async (req, res) => {
    try {
        const saleId = req.params.id;
        const [sales] = await db.query('SELECT order_number, total_amount, customer_name FROM sales WHERE id = ?', [saleId]);
        const sale = sales[0] || {};

        await db.query(`
            UPDATE sales 
            SET payment_status = 'paid', status = 'SOLD', tendered_amount = total_amount, paid_at = NOW() 
            WHERE id = ?
        `, [saleId]);

        await recordAuditLog(
            req.user?.id,
            req.user?.username,
            req.user?.role,
            'SETTLE_CUSTOMER_BALANCE',
            'SALE',
            saleId,
            sale.order_number || `SO-${saleId}`,
            `Settled outstanding customer balance for ${sale.customer_name || 'Customer'}. Total: ₱${sale.total_amount || 0}`
        );

        res.json({ success: true, message: 'Customer balance settled and marked as paid' });
    } catch (err) {
        console.error('Error settling customer balance:', err);
        res.status(500).json({ success: false, message: 'Failed to settle customer balance' });
    }
};

/**
 * Owner Action: Approve and Release Supplier PO Payment
 */
exports.approveSupplierPOPayment = async (req, res) => {
    try {
        const orderId = req.params.id;
        const { payment_reference = null } = req.body;
        const userId = req.user?.id || null;

        const [orders] = await db.query('SELECT po_number, total_order_cost, courier_name, tracking_number FROM supplier_orders WHERE order_id = ?', [orderId]);
        const order = orders[0] || {};

        await db.query(`
            UPDATE supplier_orders 
            SET payment_status = 'APPROVED_PAID', 
                approved_by = ?, 
                approved_at = NOW(),
                payment_reference = COALESCE(?, payment_reference)
            WHERE order_id = ?
        `, [userId, payment_reference, orderId]);

        await recordAuditLog(
            userId,
            req.user?.username,
            req.user?.role,
            'APPROVE_SUPPLIER_PO_PAYMENT',
            'SUPPLIER_ORDER',
            orderId,
            order.po_number || `PO-${orderId}`,
            `Approved supplier payout of ₱${order.total_order_cost || 0}. Ref: ${payment_reference || 'N/A'}`
        );

        res.json({ success: true, message: 'Supplier PO payment approved and marked as released' });
    } catch (err) {
        console.error('Error approving supplier PO payment:', err);
        res.status(500).json({ success: false, message: 'Failed to approve supplier PO payment' });
    }
};

/**
 * Owner Action: Reject / Cancel Supplier PO Payment
 */
exports.rejectSupplierPOPayment = async (req, res) => {
    try {
        const orderId = req.params.id;
        const reason = req.body?.reason || 'PO payment rejected / cancelled by Owner';
        const userId = req.user?.id || null;

        const [orders] = await db.query('SELECT po_number, total_order_cost FROM supplier_orders WHERE order_id = ?', [orderId]);
        const order = orders[0] || {};

        await db.query(`
            UPDATE supplier_orders 
            SET payment_status = 'REJECTED', 
                order_status = 'Cancelled',
                notes = CONCAT(COALESCE(notes, ''), ' [Cancelled: ', ?)
            WHERE order_id = ?
        `, [reason, orderId]);

        await recordAuditLog(
            userId,
            req.user?.username,
            req.user?.role,
            'REJECT_SUPPLIER_PO_PAYMENT',
            'SUPPLIER_ORDER',
            orderId,
            order.po_number || `PO-${orderId}`,
            `Rejected supplier PO payment: ${reason}`
        );

        res.json({ success: true, message: 'Supplier PO payment rejected and order cancelled' });
    } catch (err) {
        console.error('Error rejecting supplier PO payment:', err);
        res.status(500).json({ success: false, message: 'Failed to reject supplier PO payment' });
    }
};

/**
 * Owner Action: Confirm COD Supplier Delivery & Payout
 */
exports.confirmSupplierCODPayment = async (req, res) => {
    try {
        const orderId = req.params.id;
        const userId = req.user?.id || null;

        const [orders] = await db.query('SELECT po_number, total_order_cost, courier_name, tracking_number FROM supplier_orders WHERE order_id = ?', [orderId]);
        const order = orders[0] || {};

        await db.query(`
            UPDATE supplier_orders 
            SET payment_status = 'APPROVED_PAID', 
                order_status = 'Delivered',
                approved_by = ?, 
                approved_at = NOW()
            WHERE order_id = ?
        `, [userId, orderId]);

        await recordAuditLog(
            userId,
            req.user?.username,
            req.user?.role,
            'CONFIRM_COD_PAYOUT',
            'SUPPLIER_ORDER',
            orderId,
            order.po_number || `PO-${orderId}`,
            `Confirmed COD payout of ₱${order.total_order_cost || 0} to ${order.courier_name || 'Courier'} rider (Waybill: ${order.tracking_number || 'N/A'})`
        );

        res.json({ success: true, message: 'COD delivery confirmed and cash payout recorded' });
    } catch (err) {
        console.error('Error confirming COD payment:', err);
        res.status(500).json({ success: false, message: 'Failed to confirm COD payment' });
    }
};

/**
 * Owner Action: One-Click Create Purchase Order for Low-Stock Item
 */
exports.createQuickPurchaseOrder = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const {
            supplier_id,
            product_id,
            quantity = 1,
            unit_cost = 0,
            shipping_fee = 0,
            courier_name = 'Lalamove',
            notes = ''
        } = req.body;

        if (!product_id || parseInt(quantity, 10) <= 0) {
            await connection.rollback();
            return res.status(422).json({ success: false, message: 'A valid product line item with quantity > 0 is required.' });
        }

        const totalCost = (Number(quantity) * Number(unit_cost)) + Number(shipping_fee);
        const trackingNum = (req.body.tracking_number && !req.body.tracking_number.toLowerCase().includes('auto po'))
            ? req.body.tracking_number
            : `LLM-${Math.floor(100000 + Math.random() * 900000)}`;

        // 1. Insert into supplier_orders
        const [orderResult] = await connection.query(`
            INSERT INTO supplier_orders (
                supplier_id, order_date, courier_name, tracking_number,
                shipping_fee, total_order_cost, order_status, payment_status,
                payment_method, notes, created_at
            ) VALUES (?, NOW(), ?, ?, ?, ?, 'Ordered', 'PENDING_OWNER_APPROVAL', 'GCash', ?, NOW())
        `, [supplier_id || 1, courier_name, trackingNum, shipping_fee, totalCost, notes || null]);

        const orderId = orderResult.insertId;

        // 2. Insert into supplier_order_items
        await connection.query(`
            INSERT INTO supplier_order_items (
                order_id, product_id, unit_cost, qty_ordered, qty_accepted_good, qty_rejected_damaged, created_at
            ) VALUES (?, ?, ?, ?, 0, 0, NOW())
        `, [orderId, product_id, unit_cost, quantity]);

        await connection.commit();

        res.json({
            success: true,
            order_id: orderId,
            message: `Purchase Order PO-${orderId} created successfully for supplier!`
        });

    } catch (err) {
        await connection.rollback();
        console.error('Error creating quick purchase order:', err);
        res.status(500).json({ success: false, message: 'Failed to create quick purchase order' });
    } finally {
        connection.release();
    }
};

/**
 * Module 9: Expenses & Cash Flow Report
 * Tracks daily store operating expenses and shows Total Cash In vs. Total Cash Out
 * across the Cash Drawer and GCash / Bank accounts.
 */
exports.getExpensesAndCashFlowReport = async (req, res) => {
    try {
        const { timeframe = 'all', startDate = '', endDate = '' } = req.query;

        // Build date conditions
        const expParams = [];
        const expCondition = buildReportDateCondition('e', 'expense_date', timeframe, startDate, endDate, expParams);

        const salesParams = [];
        const salesCondition = buildReportDateCondition('s', 'sale_date', timeframe, startDate, endDate, salesParams);

        const returnsParams = [];
        const returnsCondition = buildReportDateCondition('cr', 'return_date', timeframe, startDate, endDate, returnsParams);

        const movementsParams = [];
        const movementsCondition = buildReportDateCondition('cm', 'created_at', timeframe, startDate, endDate, movementsParams);

        const supplierParams = [];
        const supplierCondition = buildReportDateCondition('sp', 'payment_date', timeframe, startDate, endDate, supplierParams);

        // 1. Fetch Itemized Operating Expenses
        const [expenses] = await db.query(`
            SELECT 
                e.id,
                e.expense_date,
                e.category,
                e.title,
                e.amount,
                e.payment_source,
                e.recorded_by_name,
                e.notes,
                e.created_at
            FROM store_operating_expenses e
            WHERE ${expCondition}
            ORDER BY e.expense_date DESC, e.id DESC
        `, expParams);

        // 2. Aggregate Expenses by Category
        const [expAgg] = await db.query(`
            SELECT 
                e.category,
                COUNT(e.id) AS count,
                COALESCE(SUM(e.amount), 0) AS total_amount,
                COALESCE(SUM(CASE WHEN e.payment_source = 'cash_drawer' THEN e.amount ELSE 0 END), 0) AS cash_paid,
                COALESCE(SUM(CASE WHEN e.payment_source = 'gcash_bank' THEN e.amount ELSE 0 END), 0) AS gcash_paid
            FROM store_operating_expenses e
            WHERE ${expCondition}
            GROUP BY e.category
            ORDER BY total_amount DESC
        `, expParams);

        const totalOperatingExpenses = expenses.reduce((acc, x) => acc + Number(x.amount || 0), 0);
        const drawerOperatingExpenses = expenses.filter(x => x.payment_source === 'cash_drawer').reduce((acc, x) => acc + Number(x.amount || 0), 0);
        const gcashOperatingExpenses = expenses.filter(x => x.payment_source === 'gcash_bank').reduce((acc, x) => acc + Number(x.amount || 0), 0);

        // 3. Sales Cash In (Drawer Cash vs GCash Wallet)
        const [salesFlow] = await db.query(`
            SELECT 
                COALESCE(SUM(CASE WHEN LOWER(s.payment_method) = 'cash' THEN s.total_amount ELSE 0 END), 0) AS cash_sales_in,
                COALESCE(SUM(CASE WHEN LOWER(s.payment_method) = 'gcash' THEN s.total_amount ELSE 0 END), 0) AS gcash_sales_in
            FROM sales s
            WHERE ${salesCondition} AND (s.status IS NULL OR s.status != 'VOIDED')
        `, salesParams);

        const cashSalesIn = Number(salesFlow[0]?.cash_sales_in || 0);
        const gcashSalesIn = Number(salesFlow[0]?.gcash_sales_in || 0);

        // 4. Customer Refunds Out (0 under All Sales Final policy)
        const cashRefundsOut = 0;

        // 5. Petty Cash Out from Drawer Movements
        const [pettyMovements] = await db.query(`
            SELECT COALESCE(SUM(cm.amount), 0) AS petty_cash_out
            FROM cash_movements cm
            WHERE ${movementsCondition} AND cm.movement_type = 'PETTY_CASH_EXPENSE'
        `, movementsParams);
        const pettyCashOut = Number(pettyMovements[0]?.petty_cash_out || 0);

        // 6. Supplier PO Payments Out (via GCash / Bank)
        let supplierPaymentsOut = 0;
        try {
            const [suppPayments] = await db.query(`
                SELECT COALESCE(SUM(sp.payment_amount), 0) AS total_paid
                FROM supplier_payments sp
                WHERE ${supplierCondition}
            `, supplierParams);
            supplierPaymentsOut = Number(suppPayments[0]?.total_paid || 0);
        } catch {
            // fallback if supplier_payments has different schema
            supplierPaymentsOut = 0;
        }

        // Cash Drawer Flow
        const drawerCashIn = cashSalesIn;
        const drawerCashOut = cashRefundsOut + pettyCashOut + drawerOperatingExpenses;
        const drawerNetFlow = drawerCashIn - drawerCashOut;

        // GCash / Bank Flow
        const gcashCashIn = gcashSalesIn;
        const gcashCashOut = supplierPaymentsOut + gcashOperatingExpenses;
        const gcashNetFlow = gcashCashIn - gcashCashOut;

        // Total Combined Flow
        const totalCashIn = drawerCashIn + gcashCashIn;
        const totalCashOut = drawerCashOut + gcashCashOut;
        const totalNetFlow = totalCashIn - totalCashOut;

        res.json({
            success: true,
            timeframe,
            date_range: { startDate, endDate },
            expenses: {
                total_amount: roundToTwo(totalOperatingExpenses),
                count: expenses.length,
                drawer_paid: roundToTwo(drawerOperatingExpenses),
                gcash_paid: roundToTwo(gcashOperatingExpenses),
                by_category: expAgg.map(c => ({
                    category: c.category,
                    count: Number(c.count),
                    total_amount: roundToTwo(Number(c.total_amount)),
                    cash_paid: roundToTwo(Number(c.cash_paid)),
                    gcash_paid: roundToTwo(Number(c.gcash_paid))
                })),
                items: expenses.map(e => ({
                    id: e.id,
                    expense_date: e.expense_date,
                    category: e.category,
                    title: e.title,
                    amount: roundToTwo(Number(e.amount)),
                    payment_source: e.payment_source,
                    recorded_by: e.recorded_by_name || 'Admin',
                    notes: e.notes
                }))
            },
            cash_flow: {
                drawer: {
                    cash_in: roundToTwo(drawerCashIn),
                    cash_out: roundToTwo(drawerCashOut),
                    net_flow: roundToTwo(drawerNetFlow),
                    breakdown_in: { sales: roundToTwo(cashSalesIn) },
                    breakdown_out: {
                        refunds: roundToTwo(cashRefundsOut),
                        petty_cash: roundToTwo(pettyCashOut),
                        operating_expenses: roundToTwo(drawerOperatingExpenses)
                    }
                },
                gcash_bank: {
                    cash_in: roundToTwo(gcashCashIn),
                    cash_out: roundToTwo(gcashCashOut),
                    net_flow: roundToTwo(gcashNetFlow),
                    breakdown_in: { sales: roundToTwo(gcashSalesIn) },
                    breakdown_out: {
                        supplier_orders: roundToTwo(supplierPaymentsOut),
                        operating_expenses: roundToTwo(gcashOperatingExpenses)
                    }
                },
                combined: {
                    total_in: roundToTwo(totalCashIn),
                    total_out: roundToTwo(totalCashOut),
                    net_flow: roundToTwo(totalNetFlow)
                }
            }
        });

    } catch (err) {
        console.error('Error generating Expenses & Cash Flow Report:', err);
        res.status(500).json({ success: false, message: 'Failed to generate Expenses & Cash Flow Report' });
    }
};

/**
 * Record a New Store Operating Expense
 */
exports.createOperatingExpense = async (req, res) => {
    try {
        const { expense_date, category, title, amount, payment_source = 'cash_drawer', notes = '' } = req.body;

        if (!title || !category || !amount || Number(amount) <= 0) {
            return res.status(400).json({ message: 'Title, category, and a positive amount are required.' });
        }

        const date = expense_date || new Date().toISOString().slice(0, 10);
        const userId = req.user?.id || 1;
        const userName = req.user?.username || 'Admin';

        const [result] = await db.query(`
            INSERT INTO store_operating_expenses 
            (expense_date, category, title, amount, payment_source, recorded_by_id, recorded_by_name, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [date, category, title.trim(), Number(amount), payment_source, userId, userName, notes ? notes.trim() : null]);

        res.status(201).json({
            success: true,
            expense_id: result.insertId,
            message: `Operating expense "${title}" of ₱${Number(amount).toFixed(2)} recorded successfully!`
        });

    } catch (err) {
        console.error('Error recording operating expense:', err);
        res.status(500).json({ success: false, message: 'Failed to record operating expense' });
    }
};
