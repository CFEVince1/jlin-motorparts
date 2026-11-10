const db = require('../config/db');

/**
 * Audit Logging Service (Tamper-Proof Black Box)
 * Records uneditable historical records for sensitive business actions:
 * - Price Changed
 * - Stock Adjusted / Audited
 * - Refund / Void Approved
 * - Discount Approved
 * - Price Override Approved
 * - Shift Closed with Shortage/Overage
 * - Login Failed / Security Alert
 * - User Role / Status Altered
 */
exports.log = async ({
    req = null,
    userId = null,
    userName = null,
    userRole = null,
    ipAddress = null,
    module,
    actionType,
    entityType = null,
    entityId = null,
    referenceId = null,
    oldValue = null,
    newValue = null,
    reason = null,
    metadata = null
}) => {
    try {
        const finalUserId = userId !== undefined && userId !== null ? userId : (req?.user?.id || null);
        const finalUserName = userName || req?.user?.full_name || req?.user?.username || 'System';
        const finalUserRole = userRole || req?.user?.role || 'system';
        const finalIp = ipAddress || req?.ip || req?.headers?.['x-forwarded-for'] || req?.connection?.remoteAddress || '127.0.0.1';

        await db.query(`
            INSERT INTO audit_logs 
            (created_at, user_id, user_name, user_role, ip_address, module, action_type, entity_type, entity_id, reference_id, old_value, new_value, reason, metadata)
            VALUES (NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            finalUserId,
            finalUserName,
            finalUserRole,
            finalIp,
            module || 'General System',
            actionType || 'General Action',
            entityType || null,
            entityId ? String(entityId) : null,
            referenceId ? String(referenceId) : null,
            oldValue ? String(oldValue) : null,
            newValue ? String(newValue) : null,
            reason ? String(reason) : null,
            metadata ? (typeof metadata === 'object' ? JSON.stringify(metadata) : String(metadata)) : null
        ]);
    } catch (err) {
        console.error('[AuditService] Failed to write tamper-proof audit log:', err);
    }
};
