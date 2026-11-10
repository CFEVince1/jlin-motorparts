const db = require('../config/db');

/**
 * Controller: Audit Logs (Tamper-Proof Black Box)
 * Read-only access to chronological system actions.
 * No UPDATE or DELETE methods exist on this controller by design.
 */
exports.getAuditLogs = async (req, res) => {
    try {
        const {
            timeframe = 'all',
            startDate = '',
            endDate = '',
            module = 'ALL',
            actionType = 'ALL',
            search = '',
            page = 1,
            limit = 50
        } = req.query;

        const whereClauses = [];
        const params = [];

        // 1. Timeframe filter
        if (timeframe === 'today') {
            whereClauses.push('DATE(created_at) = CURDATE()');
        } else if (timeframe === 'week') {
            whereClauses.push('created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)');
        } else if (timeframe === 'month') {
            whereClauses.push('created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)');
        } else if (timeframe === 'custom' && startDate && endDate) {
            whereClauses.push('DATE(created_at) BETWEEN ? AND ?');
            params.push(startDate, endDate);
        }

        // 2. Module filter
        if (module && module !== 'ALL') {
            whereClauses.push('module = ?');
            params.push(module);
        }

        // 3. Action type filter
        if (actionType && actionType !== 'ALL') {
            whereClauses.push('action_type = ?');
            params.push(actionType);
        }

        // 4. Text search
        if (search && search.trim()) {
            whereClauses.push(`(
                user_name LIKE ? OR 
                reference_id LIKE ? OR 
                action_type LIKE ? OR 
                reason LIKE ? OR 
                old_value LIKE ? OR 
                new_value LIKE ?
            )`);
            const s = `%${search.trim()}%`;
            params.push(s, s, s, s, s, s);
        }

        const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        // Total count
        const [countRows] = await db.query(
            `SELECT COUNT(*) AS total FROM audit_logs ${whereSQL}`,
            params
        );
        const totalCount = countRows[0]?.total || 0;

        // Pagination
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(200, Math.max(10, parseInt(limit, 10) || 50));
        const offset = (pageNum - 1) * limitNum;

        // Fetch logs chronologically descending
        const [logs] = await db.query(`
            SELECT 
                id,
                created_at,
                user_id,
                user_name,
                user_role,
                ip_address,
                module,
                action_type,
                entity_type,
                entity_id,
                reference_id,
                old_value,
                new_value,
                reason,
                metadata
            FROM audit_logs
            ${whereSQL}
            ORDER BY created_at DESC, id DESC
            LIMIT ? OFFSET ?
        `, [...params, limitNum, offset]);

        res.json({
            success: true,
            total: totalCount,
            page: pageNum,
            limit: limitNum,
            total_pages: Math.ceil(totalCount / limitNum),
            logs: logs.map(l => ({
                id: l.id,
                created_at: l.created_at,
                user_id: l.user_id,
                user_name: l.user_name,
                user_role: l.user_role,
                ip_address: l.ip_address,
                module: l.module,
                action_type: l.action_type,
                entity_type: l.entity_type,
                entity_id: l.entity_id,
                reference_id: l.reference_id,
                old_value: l.old_value,
                new_value: l.new_value,
                reason: l.reason,
                metadata: typeof l.metadata === 'string' ? JSON.parse(l.metadata || '{}') : (l.metadata || {})
            }))
        });

    } catch (err) {
        console.error('Error fetching audit logs:', err);
        res.status(500).json({ success: false, message: 'Failed to retrieve audit log records' });
    }
};

/**
 * Audit Summary Metrics & Categories
 */
exports.getAuditSummary = async (req, res) => {
    try {
        const [stats] = await db.query(`
            SELECT 
                COUNT(*) AS total_logs,
                COALESCE(SUM(CASE WHEN action_type LIKE '%Price%' OR action_type LIKE '%Stock%' THEN 1 ELSE 0 END), 0) AS price_stock_changes,
                COALESCE(SUM(CASE WHEN action_type LIKE '%Approved%' OR action_type LIKE '%Void%' THEN 1 ELSE 0 END), 0) AS approval_events,
                COALESCE(SUM(CASE WHEN action_type LIKE '%Shortage%' OR action_type LIKE '%Failed%' OR action_type LIKE '%Security%' THEN 1 ELSE 0 END), 0) AS security_shortage_alerts,
                COALESCE(SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END), 0) AS logs_today
            FROM audit_logs
        `);

        // Distinct Modules and Action Types for dropdown filters
        const [modules] = await db.query('SELECT DISTINCT module FROM audit_logs WHERE module IS NOT NULL ORDER BY module ASC');
        const [actionTypes] = await db.query('SELECT DISTINCT action_type FROM audit_logs WHERE action_type IS NOT NULL ORDER BY action_type ASC');

        res.json({
            success: true,
            summary: {
                total_logs: Number(stats[0]?.total_logs || 0),
                price_stock_changes: Number(stats[0]?.price_stock_changes || 0),
                approval_events: Number(stats[0]?.approval_events || 0),
                security_shortage_alerts: Number(stats[0]?.security_shortage_alerts || 0),
                logs_today: Number(stats[0]?.logs_today || 0)
            },
            modules: modules.map(m => m.module),
            action_types: actionTypes.map(a => a.action_type)
        });
    } catch (err) {
        console.error('Error fetching audit summary:', err);
        res.status(500).json({ success: false, message: 'Failed to retrieve audit summary' });
    }
};
