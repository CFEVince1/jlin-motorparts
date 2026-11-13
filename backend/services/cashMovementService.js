const db = require('../config/db');

/**
 * Log a cash movement into cash_movements ledger.
 * Non-blocking / safe: will log error if insert fails, but won't crash main transaction.
 */
async function logCashMovement(dbOrConn, {
    cashFloatId,
    staffId,
    staffUsername,
    movementType,
    amount = 0.00,
    balanceBefore = 0.00,
    balanceAfter = 0.00,
    referenceId = null,
    notes = null
}) {
    try {
        const conn = dbOrConn || db;
        await conn.query(`
            INSERT INTO cash_movements (
                cash_float_id, staff_id, staff_username, movement_type,
                amount, balance_before, balance_after, reference_id, notes, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `, [
            cashFloatId,
            staffId,
            staffUsername || 'Staff',
            movementType,
            Number(amount) || 0.00,
            Number(balanceBefore) || 0.00,
            Number(balanceAfter) || 0.00,
            referenceId,
            notes
        ]);
    } catch (err) {
        console.error('[CashMovementService] Error logging cash movement:', err);
    }
}

/**
 * Safely archive stale abandoned shifts older than 14 days.
 * NOTE: Active or Pending Remit shifts are NEVER automatically closed across midnight
 * or business day changes because staff may work overtime, perform cash count,
 * or await Admin remittance sign-off. Admin is the sole authority to verify cash and complete shifts.
 */
async function closePastDayActiveFloats(dbOrConn) {
    try {
        const conn = dbOrConn || db;
        const [result] = await conn.query(`
            UPDATE cash_floats SET 
                status = 'COMPLETED',
                completed_at = COALESCE(completed_at, NOW()),
                returned_at = COALESCE(returned_at, NOW()),
                reconciliation_notes = COALESCE(reconciliation_notes, 'Auto-archived stale unclosed shift (>14 days inactive)')
            WHERE status IN ('ACTIVE', 'PENDING_REMIT') 
              AND assigned_at < DATE_SUB(NOW(), INTERVAL 14 DAY)
        `);
        if (result && result.affectedRows > 0) {
            console.log(`[CashMovementService] Archived ${result.affectedRows} stale shift(s) older than 14 days.`);
        }
    } catch (err) {
        console.error('[CashMovementService] Error checking stale shifts:', err);
    }
}

module.exports = {
    logCashMovement,
    closePastDayActiveFloats
};
