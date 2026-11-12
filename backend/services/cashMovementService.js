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
 * Automatically close any unclosed shifts / cash floats from past business days
 * so they do not carry over into the new day/session.
 */
async function closePastDayActiveFloats(dbOrConn) {
    try {
        const conn = dbOrConn || db;
        const [result] = await conn.query(`
            UPDATE cash_floats SET 
                status = 'COMPLETED',
                completed_at = COALESCE(completed_at, NOW()),
                returned_at = COALESCE(returned_at, NOW()),
                reconciliation_notes = COALESCE(reconciliation_notes, 'Auto-closed on business day reset - New shift required')
            WHERE status = 'ACTIVE' 
              AND (
                DATE(DATE_ADD(assigned_at, INTERVAL 8 HOUR)) < DATE(DATE_ADD(NOW(), INTERVAL 8 HOUR))
                OR DATE(assigned_at) < CURDATE()
              )
        `);
        if (result && result.affectedRows > 0) {
            console.log(`[CashMovementService] Auto-closed ${result.affectedRows} past-day active float(s) on new day reset.`);
        }
    } catch (err) {
        console.error('[CashMovementService] Error auto-closing past day active floats:', err);
    }
}

module.exports = {
    logCashMovement,
    closePastDayActiveFloats
};
