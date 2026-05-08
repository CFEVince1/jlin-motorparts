const db = require('../config/db');

const buildDateAndUserFilters = (req, tableAlias = 's') => {
    const { startDate, endDate } = req.query;
    const where = [];
    const params = [];

    if (startDate) {
        where.push(`DATE(${tableAlias}.sale_date) >= ?`);
        params.push(startDate);
    }

    if (endDate) {
        where.push(`DATE(${tableAlias}.sale_date) <= ?`);
        params.push(endDate);
    }

    if (req.user.role !== 'admin') {
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
                FROM product_compatibility pc_filter
                WHERE pc_filter.product_id = ${saleItemAlias}.product_id
                  AND pc_filter.motorcycle_unit_id = ?
            )
        `);
        params.push(Number(motorcycleUnitId));
    }

    if (motorcycleModel) {
        where.push(`
            EXISTS (
                SELECT 1
                FROM product_compatibility pc_filter
                JOIN motorcycle_units mu_filter ON mu_filter.id = pc_filter.motorcycle_unit_id
                WHERE pc_filter.product_id = ${saleItemAlias}.product_id
                  AND (
                    mu_filter.model LIKE ?
                    OR mu_filter.brand LIKE ?
                    OR mu_filter.year_model LIKE ?
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
            DISTINCT TRIM(CONCAT(mu.model, ' ', COALESCE(mu.year_model, '')))
            ORDER BY mu.model, mu.year_model
            SEPARATOR ', '
        ) AS compatibility_display
    FROM product_compatibility pc
    JOIN motorcycle_units mu ON mu.id = pc.motorcycle_unit_id
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
        const { where, params } = buildDateAndUserFilters(req);
        const dateFilter = where.length ? `AND ${where.join(' AND ')}` : '';
        let query = `
            SELECT DATE(sale_date) as date, COALESCE(SUM(total_amount), 0) as total_revenue, COUNT(id) as total_transactions
            FROM sales s WHERE DATE(sale_date) = CURDATE()
            ${dateFilter}
        `;

        const [sales] = await db.query(query, params);
        res.json(sales[0] || { date: new Date().toISOString().split('T')[0], total_revenue: 0, total_transactions: 0 });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching daily sales', error: err.message });
    }
};

exports.getMonthlySales = async (req, res) => {
    try {
        const { where, params } = buildDateAndUserFilters(req);
        const dateFilter = where.length ? `AND ${where.join(' AND ')}` : '';
        const [sales] = await db.query(`
            SELECT DATE_FORMAT(sale_date, '%Y-%m') as month, COALESCE(SUM(total_amount), 0) as total_revenue, COUNT(id) as total_transactions
            FROM sales s WHERE YEAR(sale_date) = YEAR(CURDATE()) AND MONTH(sale_date) = MONTH(CURDATE())
            ${dateFilter}
        `, params);
        res.json(sales[0] || { month: new Date().toISOString().slice(0, 7), total_revenue: 0, total_transactions: 0 });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching monthly sales', error: err.message });
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
            filters.push('pc.motorcycle_unit_id = ?');
            params.push(Number(motorcycleUnitId));
        }
        if (motorcycleModel) {
            filters.push('(mu.model LIKE ? OR mu.brand LIKE ? OR mu.year_model LIKE ?)');
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
                p.stock,
                p.reorder_level,
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
            WHERE p.stock <= p.reorder_level AND p.is_active = true
            ${filterSql}
            GROUP BY p.id, p.part_number, p.name, p.brand, p.size, p.stock, p.reorder_level
            ORDER BY p.stock ASC
        `, params);
        res.json(products);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching low stock', error: err.message });
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
                SUM((si.price - COALESCE(p.cost_price, 0)) * si.quantity) AS total_profit
            FROM sale_items si
            JOIN products p ON si.product_id = p.id
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
        res.status(500).json({ message: 'Error fetching best selling products', error: err.message });
    }
};

exports.getSalesByMotorcycle = async (req, res) => {
    try {
        const dateFilters = buildDateAndUserFilters(req);
        const productFilters = buildProductFilters(req.query);
        const { sql, params } = combineWhere(dateFilters, productFilters);

        const [rows] = await db.query(`
            SELECT
                mu.id AS motorcycle_unit_id,
                mu.brand AS motorcycle_brand,
                mu.model AS motorcycle_model,
                mu.year_model,
                TRIM(CONCAT(mu.model, ' ', COALESCE(mu.year_model, ''))) AS motorcycle_display,
                SUM(si.quantity) AS total_sold,
                SUM(si.subtotal) AS total_revenue,
                SUM((si.price - COALESCE(p.cost_price, 0)) * si.quantity) AS total_profit,
                COUNT(DISTINCT si.part_number) AS distinct_parts,
                GROUP_CONCAT(DISTINCT si.part_number ORDER BY si.part_number SEPARATOR ', ') AS part_numbers
            FROM sale_items si
            JOIN sales s ON s.id = si.sale_id
            JOIN products p ON p.id = si.product_id
            JOIN product_compatibility pc ON pc.product_id = si.product_id
            JOIN motorcycle_units mu ON mu.id = pc.motorcycle_unit_id
            ${sql}
            GROUP BY mu.id, mu.brand, mu.model, mu.year_model
            ORDER BY total_sold DESC, total_revenue DESC
        `, params);

        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching sales by motorcycle', error: err.message });
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

exports.getBrands = async (req, res) => {
    try {
        const [brands] = await db.query('SELECT DISTINCT brand FROM products WHERE is_active = true ORDER BY brand');
        res.json(brands.map(b => b.brand).filter(Boolean));
    } catch (err) {
        res.status(500).json({ message: 'Error fetching brands', error: err.message });
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
        const dateFilters = buildDateAndUserFilters(req);
        const productFilters = buildProductFilters(req.query);
        const { sql, params } = combineWhere(dateFilters, productFilters);

        // Total Sales & Transactions (All Time)
        const [statsData] = await db.query(`
            SELECT
                COALESCE(SUM(si.subtotal), 0) AS total_revenue,
                COUNT(DISTINCT s.id) AS total_transactions,
                COALESCE(SUM((si.price - COALESCE(p.cost_price, 0)) * si.quantity), 0) AS total_profit
            FROM sale_items si
            JOIN sales s ON s.id = si.sale_id
            JOIN products p ON si.product_id = p.id
            ${sql}
        `, params);

        res.json({
            total_sales: statsData[0].total_revenue,
            total_transactions: statsData[0].total_transactions,
            total_profit: statsData[0].total_profit
        });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching admin stats', error: err.message });
    }
};
