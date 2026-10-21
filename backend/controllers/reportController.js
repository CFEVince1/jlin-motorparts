const db = require('../config/db');

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

    if (req.user?.role !== 'admin') {
        where.push(`${tableAlias}.user_id = ?`);
        params.push(req.user.id);
    }

    // Exclude test users from reports
    where.push(`NOT EXISTS (SELECT 1 FROM users u_test WHERE u_test.id = ${tableAlias}.user_id AND LOWER(u_test.username) LIKE '%test%')`);

    return { where, params };
};

const buildProductFilters = (query, productAlias = 'p', saleItemAlias = 'si') => {
    const { category, brand, partNumber, motorcycleUnitId, motorcycleModel } = query;
    const where = [];
    const params = [];

    // Exclude test products and legacy dummy parts from reports
    where.push(`LOWER(${saleItemAlias}.product_name) NOT LIKE '%pretest%'`);
    where.push(`LOWER(${saleItemAlias}.product_name) != 'test'`);
    where.push(`LOWER(${saleItemAlias}.part_number) NOT LIKE '%test%'`);
    where.push(`LOWER(${saleItemAlias}.part_number) NOT LIKE '%profit-test%'`);

    if (category && category !== 'All') {
        where.push(`${productAlias}.category = ?`);
        params.push(category);
    }

    if (brand && brand !== 'All') {
        where.push(`${saleItemAlias}.brand = ?`);
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

exports.getDailySales = async (req, res) => {
    try {
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
            dateCondition = "(DATE(CONVERT_TZ(s.sale_date, '+00:00', '+08:00')) = ? OR DATE(s.sale_date) = ?)";
            params.push(todayPHT, todayPHT);
        }

        let userCondition = '';
        if (req.user?.role !== 'admin') {
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
              AND s.user_id NOT IN (SELECT id FROM users WHERE LOWER(username) LIKE '%test%')
              AND NOT EXISTS (SELECT 1 FROM sale_items si_test WHERE si_test.sale_id = s.id AND (LOWER(si_test.product_name) LIKE '%pretest%' OR LOWER(si_test.product_name) = 'test'))
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
        const todayPHT = getPhilippineDate();
        const [staffStats] = await db.query(`
            SELECT 
                u.id, 
                u.username, 
                u.role,
                COUNT(DISTINCT s.id) as today_transactions,
                COALESCE(SUM(s.total_amount), 0) as today_sales
            FROM users u
            LEFT JOIN sales s ON s.user_id = u.id 
                AND (DATE(CONVERT_TZ(s.sale_date, '+00:00', '+08:00')) = ? OR DATE(s.sale_date) = ?)
                AND (s.status IS NULL OR s.status != 'voided')
                AND s.voided_at IS NULL
            WHERE LOWER(u.username) NOT LIKE '%test%'
            GROUP BY u.id, u.username, u.role
            ORDER BY today_sales DESC, today_transactions DESC, u.username ASC
        `, [todayPHT, todayPHT]);

        res.json(staffStats.map(row => ({
            id: row.id,
            username: row.username,
            role: row.role,
            today_transactions: Number(row.today_transactions) || 0,
            today_sales: Number(row.today_sales) || 0
        })));
    } catch (err) {
        console.error('Error fetching staff today sales:', err);
        res.status(500).json({ message: 'Error fetching staff today sales' });
    }
};

exports.getMonthlySales = async (req, res) => {
    try {
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
        if (req.user?.role !== 'admin') {
            userCondition = 'AND s.user_id = ?';
            params.push(req.user.id);
        }

        const query = `
            SELECT ${selectMonth}, 
                   COALESCE(SUM(s.total_amount), 0) as total_revenue, 
                   COUNT(s.id) as total_transactions
            FROM sales s 
            WHERE ${dateCondition} ${userCondition}
              AND s.user_id NOT IN (SELECT id FROM users WHERE LOWER(username) LIKE '%test%')
              AND NOT EXISTS (SELECT 1 FROM sale_items si_test WHERE si_test.sale_id = s.id AND (LOWER(si_test.product_name) LIKE '%pretest%' OR LOWER(si_test.product_name) = 'test'))
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
                COALESCE(p.current_stock, p.stock) AS current_stock,
                COALESCE(p.current_stock, p.stock) AS stock,
                p.reorder_level,
                COALESCE(cd.compatibility_display, '') AS compatibility_display
            FROM products p
            LEFT JOIN (${compatibilityDisplaySubquery}) cd ON cd.product_id = p.id
            WHERE COALESCE(p.current_stock, p.stock) <= p.reorder_level AND p.is_active = true AND LOWER(p.name) NOT LIKE '%test%' AND LOWER(p.name) NOT LIKE '%pretest%' AND LOWER(p.part_number) NOT LIKE '%test%'
            ${filterSql}
            ORDER BY COALESCE(p.current_stock, p.stock) ASC
        `, params);
        res.json(products);
    } catch (err) {
        console.error('Error fetching low stock:', err);
        res.status(500).json({ message: 'Error fetching low stock' });
    }
};

exports.getBestSelling = async (req, res) => {
    try {
        const dateFilters = buildDateAndUserFilters(req);
        const productFilters = buildProductFilters(req.query);
        const { sql, params } = combineWhere(dateFilters, productFilters);

        const query = `
            SELECT
                si.product_id AS id,
                si.part_number,
                si.product_name,
                si.brand,
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
                si.brand,
                si.size,
                p.category,
                cd.compatibility_display
            ORDER BY total_sold DESC
            LIMIT 10
        `;

        const [products] = await db.query(query, params);
        res.json(products);
    } catch (err) {
        console.error('Error fetching best selling products:', err);
        res.status(500).json({ message: 'Error fetching best selling products' });
    }
};

exports.getSalesByMotorcycle = async (req, res) => {
    try {
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
        const [categories] = await db.query('SELECT DISTINCT category FROM products WHERE is_active = true');
        res.json(categories.map(c => c.category).filter(Boolean));
    } catch (err) {
        console.error('Error fetching categories:', err);
        res.status(500).json({ message: 'Error fetching categories' });
    }
};

exports.getBrands = async (req, res) => {
    try {
        const [brands] = await db.query('SELECT DISTINCT brand FROM products WHERE is_active = true ORDER BY brand');
        res.json(brands.map(b => b.brand).filter(Boolean));
    } catch (err) {
        console.error('Error fetching brands:', err);
        res.status(500).json({ message: 'Error fetching brands' });
    }
};

exports.getSalesByCashier = async (req, res) => {
    try {
        const { where, params } = buildDateAndUserFilters(req, 's');
        const dateFilter = where.length ? `WHERE ${where.join(' AND ')}` : '';
        const [sales] = await db.query(`
            SELECT u.username as cashier, COUNT(s.id) as total_transactions, COALESCE(SUM(s.total_amount), 0) as total_revenue
            FROM sales s
            JOIN users u ON s.user_id = u.id
            ${dateFilter ? dateFilter + " AND LOWER(u.username) NOT LIKE '%test%'" : "WHERE LOWER(u.username) NOT LIKE '%test%'"}
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
        const dateFilters = buildDateAndUserFilters(req);
        const productFilters = buildProductFilters(req.query);
        const { sql, params } = combineWhere(dateFilters, productFilters);

        // Total Sales & Transactions (All Time)
        const [statsData] = await db.query(`
            SELECT
                COALESCE(SUM(si.subtotal), 0) AS total_revenue,
                COUNT(DISTINCT s.id) AS total_transactions,
                COALESCE(SUM((si.price - COALESCE(NULLIF(si.cost_price, 0), p.cost_price, 0)) * si.quantity), 0) AS total_profit
            FROM sale_items si
            JOIN sales s ON s.id = si.sale_id
            LEFT JOIN products p ON si.product_id = p.id
            ${sql}
        `, params);

        res.json({
            total_sales: statsData[0].total_revenue,
            total_transactions: statsData[0].total_transactions,
            total_profit: statsData[0].total_profit
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

