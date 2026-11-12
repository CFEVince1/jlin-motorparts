const db = require('../config/db');
const { logCashMovement, closePastDayActiveFloats } = require('../services/cashMovementService');

let _ensuredCashFloats = false;
async function ensureCashFloatsTableExists() {
    if (_ensuredCashFloats) return;
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS cash_floats (
                id INT AUTO_INCREMENT PRIMARY KEY,
                shift_code VARCHAR(50) NULL,
                staff_id INT NOT NULL,
                staff_username VARCHAR(50) NOT NULL,
                assigned_by_id INT NOT NULL,
                assigned_by_username VARCHAR(50) NOT NULL,
                total_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
                starting_cash DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
                current_cash_balance DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
                cash_sales DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
                gcash_sales DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
                change_given DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
                cash_refunds DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
                petty_cash_expenses DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
                expected_cash DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
                actual_cash DECIMAL(12, 2) DEFAULT NULL,
                blind_count_entered DECIMAL(12, 2) DEFAULT NULL,
                shortage_overage DECIMAL(12, 2) DEFAULT NULL,
                sales_count INT NOT NULL DEFAULT 0,
                bills_1000 INT DEFAULT 0,
                bills_500 INT DEFAULT 0,
                bills_200 INT DEFAULT 0,
                bills_100 INT DEFAULT 0,
                bills_50 INT DEFAULT 0,
                bills_20 INT DEFAULT 0,
                coins_10 INT DEFAULT 0,
                coins_5 INT DEFAULT 0,
                coins_1 INT DEFAULT 0,
                status ENUM('ACTIVE', 'COMPLETED', 'RETURNED') NOT NULL DEFAULT 'ACTIVE',
                admin_signed_off TINYINT(1) DEFAULT 0,
                signed_off_by_id INT NULL,
                signed_off_by_name VARCHAR(100) NULL,
                signed_off_at DATETIME NULL,
                notes TEXT NULL,
                reconciliation_notes TEXT NULL,
                assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                completed_at DATETIME NULL,
                returned_at DATETIME NULL,
                INDEX idx_cf_staff (staff_id),
                INDEX idx_cf_status (status),
                INDEX idx_cf_assigned (assigned_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS cash_movements (
                id INT AUTO_INCREMENT PRIMARY KEY,
                cash_float_id INT NULL,
                staff_id INT NOT NULL,
                staff_username VARCHAR(50) NOT NULL,
                movement_type VARCHAR(50) NOT NULL,
                amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
                balance_before DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
                balance_after DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
                reference_id VARCHAR(100) NULL,
                notes TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_cm_staff (staff_id),
                INDEX idx_cm_float (cash_float_id),
                INDEX idx_cm_created_at (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // Check for missing columns in cash_floats
        const [cfCols] = await db.query('SHOW COLUMNS FROM cash_floats');
        const cfColNames = cfCols.map(c => c.Field);
        const missingCols = [
            { col: 'shift_code', def: 'VARCHAR(50) NULL' },
            { col: 'gcash_sales', def: 'DECIMAL(12,2) NOT NULL DEFAULT 0.00' },
            { col: 'petty_cash_expenses', def: 'DECIMAL(12,2) NOT NULL DEFAULT 0.00' },
            { col: 'blind_count_entered', def: 'DECIMAL(12,2) NULL' },
            { col: 'shortage_overage', def: 'DECIMAL(12,2) NULL' },
            { col: 'actual_cash', def: 'DECIMAL(12,2) NULL' },
            { col: 'completed_at', def: 'DATETIME NULL' },
            { col: 'returned_at', def: 'DATETIME NULL' },
            { col: 'reconciliation_notes', def: 'TEXT NULL' },
            { col: 'admin_signed_off', def: 'TINYINT(1) DEFAULT 0' },
            { col: 'signed_off_by_id', def: 'INT NULL' },
            { col: 'signed_off_by_name', def: 'VARCHAR(100) NULL' },
            { col: 'signed_off_at', def: 'DATETIME NULL' },
            { col: 'bills_1000', def: 'INT DEFAULT 0' },
            { col: 'bills_500', def: 'INT DEFAULT 0' },
            { col: 'bills_200', def: 'INT DEFAULT 0' },
            { col: 'bills_100', def: 'INT DEFAULT 0' },
            { col: 'bills_50', def: 'INT DEFAULT 0' },
            { col: 'bills_20', def: 'INT DEFAULT 0' },
            { col: 'coins_10', def: 'INT DEFAULT 0' },
            { col: 'coins_5', def: 'INT DEFAULT 0' },
            { col: 'coins_1', def: 'INT DEFAULT 0' }
        ];
        for (const item of missingCols) {
            if (!cfColNames.includes(item.col)) {
                try {
                    await db.query(`ALTER TABLE cash_floats ADD COLUMN ${item.col} ${item.def}`);
                    cfColNames.push(item.col);
                } catch (colErr) {
                    // Ignore column already exists
                }
            }
        }
        _ensuredCashFloats = true;
    } catch (e) {
        console.warn('[ensureCashFloatsTableExists notice]:', e.message);
    }
}

/**
 * GET /api/cash-float/staff-list
 * Returns all active staff / cashiers with their current active shift float status
 */
exports.getStaffList = async (req, res) => {
    try {
        await ensureCashFloatsTableExists();
        await closePastDayActiveFloats();
        const query = `
            SELECT 
                u.id, 
                u.username, 
                u.full_name, 
                u.role,
                cf.id AS active_float_id,
                COALESCE(cf.starting_cash, cf.total_amount, 0) AS active_starting_cash,
                COALESCE(cf.current_cash_balance, cf.starting_cash, cf.total_amount, 0) AS active_cash_balance,
                COALESCE(cf.cash_sales, 0) AS active_cash_sales,
                COALESCE(cf.change_given, 0) AS active_change_given,
                COALESCE(cf.cash_refunds, 0) AS active_cash_refunds,
                COALESCE(cf.sales_count, 0) AS active_sales_count,
                cf.notes AS active_notes,
                cf.assigned_at AS active_float_assigned_at,
                cf.assigned_by_username AS active_float_assigned_by
            FROM users u
            LEFT JOIN cash_floats cf ON u.id = cf.staff_id 
                AND cf.status = 'ACTIVE' 
                AND (DATE(cf.assigned_at) = CURDATE() OR DATE(DATE_ADD(cf.assigned_at, INTERVAL 8 HOUR)) = DATE(DATE_ADD(NOW(), INTERVAL 8 HOUR)))
            WHERE LOWER(u.role) IN ('staff', 'cashier')
            ORDER BY u.username ASC
        `;
        const [staff] = await db.query(query);
        res.json(staff);
    } catch (err) {
        console.error('Error fetching staff list for cash float:', err);
        res.status(500).json({ message: 'Failed to retrieve staff list.' });
    }
};

/**
 * GET /api/cash-float/summary
 * Returns overall cash float summary across all active staff shifts
 */
exports.getSummary = async (req, res) => {
    try {
        await ensureCashFloatsTableExists();
        await closePastDayActiveFloats();
        const [rows] = await db.query(`
            SELECT 
                COUNT(id) AS active_count,
                COALESCE(SUM(COALESCE(starting_cash, total_amount, 0)), 0) AS total_starting_cash,
                COALESCE(SUM(COALESCE(cash_sales, 0)), 0) AS total_cash_sales,
                COALESCE(SUM(COALESCE(cash_refunds, 0)), 0) AS total_cash_refunds,
                COALESCE(SUM(COALESCE(current_cash_balance, starting_cash, total_amount, 0)), 0) AS total_drawer_balance
            FROM cash_floats
            WHERE status = 'ACTIVE'
              AND (DATE(assigned_at) = CURDATE() OR DATE(DATE_ADD(assigned_at, INTERVAL 8 HOUR)) = DATE(DATE_ADD(NOW(), INTERVAL 8 HOUR)))
        `);
        const row = rows[0] || {};
        res.json({
            activeCount: Number(row.active_count || 0),
            totalStartingCash: Number(row.total_starting_cash || 0),
            totalCashSales: Number(row.total_cash_sales || 0),
            totalCashRefunds: Number(row.total_cash_refunds || 0),
            totalDrawerBalance: Number(row.total_drawer_balance || 0)
        });
    } catch (err) {
        console.error('Error fetching cash float summary:', err);
        res.status(500).json({ message: 'Failed to retrieve cash float summary.' });
    }
};

/**
 * GET /api/cash-float
 * List all cash float shift records with filters (status, staff_id, date, search)
 */
exports.getCashFloats = async (req, res) => {
    try {
        const { status, staff_id, date, search } = req.query;
        let conditions = [];
        let params = [];

        if (status && status !== 'ALL') {
            conditions.push('cf.status = ?');
            params.push(status.toUpperCase());
        }

        if (staff_id) {
            conditions.push('cf.staff_id = ?');
            params.push(staff_id);
        }

        if (date && date.trim()) {
            conditions.push('DATE(cf.assigned_at) = ?');
            params.push(date.trim());
        }

        if (search && search.trim()) {
            conditions.push('(cf.staff_username LIKE ? OR u.full_name LIKE ? OR cf.assigned_by_username LIKE ?)');
            const s = `%${search.trim()}%`;
            params.push(s, s, s);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const query = `
            SELECT 
                cf.*,
                COALESCE(cf.shift_code, CONCAT('SHIFT-', LPAD(cf.id, 3, '0'))) AS shift_code,
                COALESCE(cf.starting_cash, cf.total_amount, 0) AS starting_cash,
                COALESCE(cf.current_cash_balance, cf.starting_cash, cf.total_amount, 0) AS current_cash_balance,
                COALESCE(cf.expected_cash, cf.current_cash_balance, cf.starting_cash, 0) AS expected_cash,
                COALESCE(cf.gcash_sales, 0) AS gcash_sales,
                COALESCE(cf.petty_cash_expenses, 0) AS petty_cash_expenses,
                u.full_name AS staff_full_name,
                u.role AS staff_role
            FROM cash_floats cf
            LEFT JOIN users u ON cf.staff_id = u.id
            ${whereClause}
            ORDER BY cf.assigned_at DESC, cf.id DESC
        `;

        const [records] = await db.query(query, params);
        res.json(records);
    } catch (err) {
        console.error('Error fetching cash floats:', err);
        res.status(500).json({ message: 'Failed to retrieve cash float records.' });
    }
};

/**
 * GET /api/cash-float/my-float
 * Returns the currently active cash float for the logged-in staff member's shift for today.
 * Strictly defaults to ₱0.00 until Admin explicitly assigns cash float.
 */
exports.getMyCashFloat = async (req, res) => {
    try {
        await ensureCashFloatsTableExists();
        await closePastDayActiveFloats();
        const staffId = req.user.id;
        const [floats] = await db.query(
            `SELECT 
                cf.*,
                COALESCE(cf.starting_cash, cf.total_amount, 0) AS starting_cash,
                COALESCE(cf.current_cash_balance, cf.starting_cash, cf.total_amount, 0) AS current_cash_balance,
                COALESCE(cf.expected_cash, cf.current_cash_balance, cf.starting_cash, 0) AS expected_cash
             FROM cash_floats cf 
             WHERE cf.staff_id = ? 
               AND cf.status = 'ACTIVE' 
               AND (DATE(cf.assigned_at) = CURDATE() OR DATE(DATE_ADD(cf.assigned_at, INTERVAL 8 HOUR)) = DATE(DATE_ADD(NOW(), INTERVAL 8 HOUR)))
             ORDER BY cf.assigned_at DESC LIMIT 1`,
            [staffId]
        );

        if (floats.length === 0) {
            return res.json({ 
                activeFloat: null,
                starting_cash: 0.00,
                current_cash_balance: 0.00,
                message: 'No active cash float assigned for today. Starting Panukli strictly defaults to ₱0.00.'
            });
        }

        res.json({ activeFloat: floats[0] });
    } catch (err) {
        console.error('Error fetching my cash float:', err);
        res.status(500).json({ message: 'Failed to retrieve your cash float.' });
    }
};

/**
 * POST /api/cash-float/assign
 * Assign starting change money (panukli) to a staff member for their shift
 * Clean & simplified: Staff ID, Starting Cash Amount, Notes
 */
exports.assignCashFloat = async (req, res) => {
    try {
        await closePastDayActiveFloats();
        const adminId = req.user.id;
        const adminUsername = req.user.username;
        const { staff_id, starting_cash, amount, notes } = req.body;

        if (!staff_id) {
            return res.status(400).json({ message: 'Please select a staff member to assign cash float.' });
        }

        const rawAmount = starting_cash !== undefined ? starting_cash : amount;
        const numStartingCash = Math.round(Number(rawAmount) * 100) / 100;

        if (!Number.isFinite(numStartingCash) || numStartingCash <= 0) {
            return res.status(400).json({ message: 'Starting Cash Amount (Panukli) must be a valid amount greater than ₱0.00.' });
        }

        // Verify staff user exists
        const [users] = await db.query('SELECT id, username, full_name, role FROM users WHERE id = ?', [staff_id]);
        if (users.length === 0) {
            return res.status(404).json({ message: 'Selected staff member does not exist.' });
        }
        const staffUser = users[0];

        // Dynamic Staff Float Assignment / Live Drawer Adjustment for TODAY's active shift:
        // If the staff member already has an ACTIVE float for today, update it in real time without creating duplicates.
        // Formula: Current Cash in Drawer = New Starting Cash + Cash Sales - Cash Refunds
        const [existingActive] = await db.query(
            `SELECT id, starting_cash, total_amount, current_cash_balance, cash_sales, cash_refunds, assigned_at, notes 
             FROM cash_floats 
             WHERE staff_id = ? 
               AND status = 'ACTIVE' 
               AND (DATE(assigned_at) = CURDATE() OR DATE(DATE_ADD(assigned_at, INTERVAL 8 HOUR)) = DATE(DATE_ADD(NOW(), INTERVAL 8 HOUR)))`,
            [staff_id]
        );

        if (existingActive.length > 0) {
            const activeFloat = existingActive[0];
            const netCashSales = Number(activeFloat.cash_sales || 0) - Number(activeFloat.cash_refunds || 0);
            const newCurrentBalance = Math.round((numStartingCash + netCashSales) * 100) / 100;
            const updatedNotes = notes !== undefined ? (notes ? notes.trim() : null) : activeFloat.notes;

            await db.query(`
                UPDATE cash_floats SET
                    starting_cash = ?,
                    total_amount = ?,
                    current_cash_balance = ?,
                    expected_cash = ?,
                    notes = ?,
                    assigned_by_id = ?,
                    assigned_by_username = ?
                WHERE id = ?
            `, [
                numStartingCash,
                numStartingCash,
                newCurrentBalance,
                newCurrentBalance,
                updatedNotes,
                adminId,
                adminUsername,
                activeFloat.id
            ]);

            // Record cash movement for starting cash adjustment
            await logCashMovement(db, {
                cashFloatId: activeFloat.id,
                staffId: staff_id,
                staffUsername: staffUser.username,
                movementType: 'DRAWER_ADJUST',
                amount: numStartingCash,
                balanceBefore: activeFloat.current_cash_balance,
                balanceAfter: newCurrentBalance,
                referenceId: `ADJUST-${activeFloat.id}`,
                notes: `Admin adjusted starting cash float to ₱${numStartingCash.toFixed(2)}`
            });

            const [updatedRecord] = await db.query('SELECT * FROM cash_floats WHERE id = ?', [activeFloat.id]);

            return res.json({
                message: `Active cash float for ${staffUser.username} updated to ₱${numStartingCash.toLocaleString('en-US', { minimumFractionDigits: 2 })}. Drawer balance is now ₱${newCurrentBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}.`,
                cashFloat: updatedRecord[0],
                isUpdated: true
            });
        }

        const insertQuery = `
            INSERT INTO cash_floats (
                staff_id, staff_username, assigned_by_id, assigned_by_username,
                starting_cash, total_amount,
                current_cash_balance, expected_cash,
                cash_sales, change_given, cash_refunds, sales_count,
                status, notes, assigned_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0.00, 0.00, 0.00, 0, 'ACTIVE', ?, NOW())
        `;

        const [result] = await db.query(insertQuery, [
            staff_id,
            staffUser.username,
            adminId,
            adminUsername,
            numStartingCash,
            numStartingCash,
            numStartingCash, // initially equal to Starting Cash
            numStartingCash, // expected starts at starting cash
            notes ? notes.trim() : null
        ]);

        const newFloatId = result.insertId;

        // Record initial cash movement for new shift starting float
        await logCashMovement(db, {
            cashFloatId: newFloatId,
            staffId: staff_id,
            staffUsername: staffUser.username,
            movementType: 'FLOAT_ASSIGN',
            amount: numStartingCash,
            balanceBefore: 0.00,
            balanceAfter: numStartingCash,
            referenceId: `FLOAT-${newFloatId}`,
            notes: `Admin initialized starting panukli for today: ₱${numStartingCash.toFixed(2)}`
        });

        const [newRecord] = await db.query('SELECT * FROM cash_floats WHERE id = ?', [newFloatId]);

        res.status(201).json({
            message: `Successfully assigned ₱${numStartingCash.toLocaleString('en-US', { minimumFractionDigits: 2 })} starting cash float to ${staffUser.username}.`,
            cashFloat: newRecord[0]
        });
    } catch (err) {
        console.error('Error assigning cash float:', err);
        res.status(500).json({ message: 'Failed to assign cash float.' });
    }
};

/**
 * PUT /api/cash-float/:id
 * Update an existing active cash float assignment or adjust live drawer balance.
 */
exports.updateCashFloat = async (req, res) => {
    try {
        const adminId = req.user.id;
        const adminUsername = req.user.username;
        const floatId = req.params.id;
        const { starting_cash, amount, notes } = req.body;

        const [records] = await db.query('SELECT * FROM cash_floats WHERE id = ?', [floatId]);
        if (records.length === 0) {
            return res.status(404).json({ message: 'Cash float record not found.' });
        }

        const currentFloat = records[0];

        if (currentFloat.status !== 'ACTIVE') {
            return res.status(400).json({ message: 'Only active cash float shifts can be edited.' });
        }

        const rawAmount = starting_cash !== undefined ? starting_cash : amount;
        const numStartingCash = rawAmount !== undefined 
            ? Math.round(Number(rawAmount) * 100) / 100 
            : currentFloat.starting_cash;

        if (!Number.isFinite(numStartingCash) || numStartingCash <= 0) {
            return res.status(400).json({ message: 'Starting Cash Amount must be greater than ₱0.00.' });
        }

        // Live Drawer Adjustment:
        // Current Cash in Drawer = New Starting Cash + Net Cash Sales - Cash Refunds
        const netCashSales = Number(currentFloat.cash_sales || 0) - Number(currentFloat.cash_refunds || 0);
        const newCurrentBalance = Math.round((numStartingCash + netCashSales) * 100) / 100;

        const updateQuery = `
            UPDATE cash_floats SET
                starting_cash = ?,
                total_amount = ?,
                current_cash_balance = ?,
                expected_cash = ?,
                notes = ?,
                assigned_by_id = ?,
                assigned_by_username = ?
            WHERE id = ?
        `;

        await db.query(updateQuery, [
            numStartingCash,
            numStartingCash,
            newCurrentBalance,
            newCurrentBalance,
            notes !== undefined ? (notes ? notes.trim() : null) : currentFloat.notes,
            adminId,
            adminUsername,
            floatId
        ]);

        const [updated] = await db.query('SELECT * FROM cash_floats WHERE id = ?', [floatId]);

        res.json({
            message: `Cash float updated successfully. Starting cash is ₱${numStartingCash.toLocaleString('en-US', { minimumFractionDigits: 2 })}, drawer balance adjusted to ₱${newCurrentBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}.`,
            cashFloat: updated[0]
        });
    } catch (err) {
        console.error('Error updating cash float:', err);
        res.status(500).json({ message: 'Failed to update cash float.' });
    }
};

/**
 * PUT /api/cash-float/:id/reconcile
 * End of Shift Reconciliation
 * Display: Starting Cash, Cash Sales, Change Given, Cash Refunds, Expected Cash
 * Input: Actual Cash Count
 * Formula: Expected Cash = Starting Cash + Cash Sales - Change Given - Cash Refunds
 * Shortage / Overage = Actual Cash - Expected Cash
 */
exports.reconcileShift = async (req, res) => {
    try {
        const adminId = req.user.id;
        const adminUsername = req.user.username;
        const floatId = req.params.id;
        const { actual_cash, reconciliation_notes, status = 'COMPLETED' } = req.body;

        const [records] = await db.query('SELECT * FROM cash_floats WHERE id = ?', [floatId]);
        if (records.length === 0) {
            return res.status(404).json({ message: 'Cash float record not found.' });
        }

        const currentFloat = records[0];
        if (currentFloat.status === 'COMPLETED' || currentFloat.status === 'RETURNED') {
            return res.status(400).json({ message: 'This shift has already been reconciled and completed.' });
        }

        const startingCash = Number(currentFloat.starting_cash || currentFloat.total_amount || 0);
        const cashSales = Number(currentFloat.cash_sales || 0);
        const changeGiven = Number(currentFloat.change_given || 0);
        const cashRefunds = Number(currentFloat.cash_refunds || 0);

        // Expected Cash formula
        // Note: in drawer tracking, net cash added from sales is (cash_sales) or current_cash_balance
        const expectedCash = Math.round(Number(currentFloat.current_cash_balance) * 100) / 100;

        const numActualCash = actual_cash !== undefined && actual_cash !== '' && actual_cash !== null
            ? Math.round(Number(actual_cash) * 100) / 100
            : expectedCash;

        const shortageOverage = Math.round((numActualCash - expectedCash) * 100) / 100;

        const finalStatus = status === 'RETURNED' ? 'RETURNED' : 'COMPLETED';

        const updateQuery = `
            UPDATE cash_floats SET
                actual_cash = ?,
                expected_cash = ?,
                shortage_overage = ?,
                status = ?,
                completed_at = NOW(),
                returned_at = NOW(),
                returned_by_id = ?,
                returned_by_username = ?,
                reconciliation_notes = ?,
                returned_notes = ?
            WHERE id = ?
        `;

        await db.query(updateQuery, [
            numActualCash,
            expectedCash,
            shortageOverage,
            finalStatus,
            adminId,
            adminUsername,
            reconciliation_notes ? reconciliation_notes.trim() : 'End of shift reconciliation completed.',
            reconciliation_notes ? reconciliation_notes.trim() : 'Cash float returned to safe.',
            floatId
        ]);

        // Record end-of-shift reconciliation cash movement
        await logCashMovement(db, {
            cashFloatId: floatId,
            staffId: currentFloat.staff_id,
            staffUsername: currentFloat.staff_username,
            movementType: 'SHIFT_RECONCILE',
            amount: numActualCash,
            balanceBefore: currentFloat.current_cash_balance,
            balanceAfter: 0.00,
            referenceId: `RECON-${floatId}`,
            notes: `Shift closed as ${finalStatus}. Expected: ₱${expectedCash.toFixed(2)}, Actual: ₱${numActualCash.toFixed(2)}, Short/Over: ₱${shortageOverage.toFixed(2)}`
        });

        const [updated] = await db.query('SELECT * FROM cash_floats WHERE id = ?', [floatId]);

        res.json({
            message: `Shift for ${currentFloat.staff_username} successfully reconciled and marked as ${finalStatus}.`,
            cashFloat: updated[0],
            reconciliation: {
                startingCash,
                cashSales,
                changeGiven,
                cashRefunds,
                expectedCash,
                actualCash: numActualCash,
                shortageOverage
            }
        });
    } catch (err) {
        console.error('Error reconciling cash float shift:', err);
        res.status(500).json({ message: 'Failed to reconcile shift.' });
    }
};

/**
 * PUT /api/cash-float/:id/return (Legacy / Direct Alias to reconcileShift)
 */
exports.returnCashFloat = async (req, res) => {
    return exports.reconcileShift(req, res);
};

/**
 * GET /api/cash-float/:id
 * Retrieve single float record with shift reconciliation details
 */
exports.getCashFloatById = async (req, res) => {
    try {
        const floatId = req.params.id;
        const [records] = await db.query(`
            SELECT 
                cf.*,
                COALESCE(cf.starting_cash, cf.total_amount, 0) AS starting_cash,
                COALESCE(cf.current_cash_balance, cf.starting_cash, cf.total_amount, 0) AS current_cash_balance,
                COALESCE(cf.expected_cash, cf.current_cash_balance, cf.starting_cash, 0) AS expected_cash,
                u.full_name AS staff_full_name,
                u.role AS staff_role
            FROM cash_floats cf
            LEFT JOIN users u ON cf.staff_id = u.id
            WHERE cf.id = ?
        `, [floatId]);

        if (records.length === 0) {
            return res.status(404).json({ message: 'Cash float record not found.' });
        }

        res.json(records[0]);
    } catch (err) {
        console.error('Error fetching cash float details:', err);
        res.status(500).json({ message: 'Failed to retrieve cash float details.' });
    }
};

/**
 * POST /api/cash-float/open-shift
 * Open Shift: Cashier or Admin opens register and enters starting change fund
 */
exports.openShift = async (req, res) => {
    try {
        await ensureCashFloatsTableExists();
        await closePastDayActiveFloats();
        const currentUserId = req.user.id;
        const currentUsername = req.user.username;
        const currentUserRole = (req.user.role || '').toLowerCase();
        const isAdmin = currentUserRole === 'admin';

        const {
            staff_id,
            starting_cash,
            amount,
            notes,
            bills_1000 = 0,
            bills_500 = 0,
            bills_200 = 0,
            bills_100 = 0,
            bills_50 = 0,
            bills_20 = 0,
            coins_10 = 0,
            coins_5 = 0,
            coins_1 = 0
        } = req.body;

        const targetStaffId = (isAdmin && staff_id) ? Number(staff_id) : currentUserId;

        // Fetch staff user details
        const [users] = await db.query('SELECT id, username, full_name, role FROM users WHERE id = ?', [targetStaffId]);
        if (users.length === 0) {
            return res.status(404).json({ message: 'Staff user account not found.' });
        }
        const staffUser = users[0];

        // Calculate denomination total if provided
        const denomTotal = (Number(bills_1000) * 1000) +
                           (Number(bills_500) * 500) +
                           (Number(bills_200) * 200) +
                           (Number(bills_100) * 100) +
                           (Number(bills_50) * 50) +
                           (Number(bills_20) * 20) +
                           (Number(coins_10) * 10) +
                           (Number(coins_5) * 5) +
                           (Number(coins_1) * 1);

        const rawAmount = starting_cash !== undefined ? starting_cash : (amount !== undefined ? amount : denomTotal);
        const numStartingCash = Math.round(Number(rawAmount) * 100) / 100;

        if (!Number.isFinite(numStartingCash) || numStartingCash <= 0) {
            return res.status(400).json({ message: 'Opening Cash Float (Starting Change Fund) must be a valid amount greater than ₱0.00.' });
        }

        // Check if there is already an active shift for this staff today
        const [existingActive] = await db.query(
            `SELECT * FROM cash_floats 
             WHERE staff_id = ? AND status = 'ACTIVE' 
               AND (DATE(assigned_at) = CURDATE() OR DATE(DATE_ADD(assigned_at, INTERVAL 8 HOUR)) = DATE(DATE_ADD(NOW(), INTERVAL 8 HOUR)))`,
            [targetStaffId]
        );

        if (existingActive.length > 0) {
            const activeShift = existingActive[0];
            return res.status(200).json({
                message: `Active shift already open for ${staffUser.username} (${activeShift.shift_code || 'SHIFT-' + activeShift.id}).`,
                cashFloat: activeShift,
                isExisting: true
            });
        }

        // Generate shift code e.g. SHIFT-005
        const [maxIdRow] = await db.query('SELECT MAX(id) as max_id FROM cash_floats');
        const nextId = (maxIdRow[0]?.max_id || 0) + 1;
        const shiftCode = `SHIFT-${String(nextId).padStart(3, '0')}`;

        const insertQuery = `
            INSERT INTO cash_floats (
                shift_code, staff_id, staff_username, assigned_by_id, assigned_by_username,
                starting_cash, total_amount, current_cash_balance, expected_cash,
                cash_sales, gcash_sales, change_given, cash_refunds, petty_cash_expenses, sales_count,
                bills_1000, bills_500, bills_200, bills_100, bills_50, bills_20,
                coins_10, coins_5, coins_1, status, admin_signed_off, notes, assigned_at
            ) VALUES (
                ?, ?, ?, ?, ?,
                ?, ?, ?, ?,
                0.00, 0.00, 0.00, 0.00, 0.00, 0,
                ?, ?, ?, ?, ?, ?,
                ?, ?, ?, 'ACTIVE', 0, ?, NOW()
            )
        `;

        const [result] = await db.query(insertQuery, [
            shiftCode,
            targetStaffId,
            staffUser.username,
            currentUserId,
            currentUsername,
            numStartingCash,
            numStartingCash,
            numStartingCash,
            numStartingCash,
            Number(bills_1000) || 0,
            Number(bills_500) || 0,
            Number(bills_200) || 0,
            Number(bills_100) || 0,
            Number(bills_50) || 0,
            Number(bills_20) || 0,
            Number(coins_10) || 0,
            Number(coins_5) || 0,
            Number(coins_1) || 0,
            notes ? notes.trim() : `Opening Cash Float entered by ${currentUsername}`
        ]);

        const newShiftId = result.insertId;

        // Log cash movement
        await logCashMovement(db, {
            cashFloatId: newShiftId,
            staffId: targetStaffId,
            staffUsername: staffUser.username,
            movementType: 'OPEN_SHIFT',
            amount: numStartingCash,
            balanceBefore: 0.00,
            balanceAfter: numStartingCash,
            referenceId: shiftCode,
            notes: `Shift opened with starting cash fund: ₱${numStartingCash.toFixed(2)}`
        });

        const [newShiftRows] = await db.query('SELECT * FROM cash_floats WHERE id = ?', [newShiftId]);

        return res.status(201).json({
            success: true,
            message: `Shift ${shiftCode} opened successfully! Starting fund ₱${numStartingCash.toLocaleString('en-US', { minimumFractionDigits: 2 })} loaded in cash drawer.`,
            shift: newShiftRows[0]
        });
    } catch (err) {
        console.error('Error opening shift:', err);
        return res.status(500).json({ message: 'Failed to open shift.' });
    }
};

/**
 * GET /api/cash-float/active-shift
 * Active Shift Tracker: Silently tracks cash sales in, GCash sales in, cash refunds out, and petty cash expenses out
 */
exports.getActiveShift = async (req, res) => {
    try {
        await ensureCashFloatsTableExists();
        await closePastDayActiveFloats();
        const currentUserId = req.user.id;
        const { staff_id } = req.query;
        const targetStaffId = staff_id ? Number(staff_id) : currentUserId;

        const [shifts] = await db.query(`
            SELECT 
                cf.*,
                COALESCE(cf.shift_code, CONCAT('SHIFT-', LPAD(cf.id, 3, '0'))) AS shift_code,
                COALESCE(cf.starting_cash, cf.total_amount, 0) AS starting_cash,
                COALESCE(cf.current_cash_balance, cf.starting_cash, cf.total_amount, 0) AS current_cash_balance,
                COALESCE(cf.expected_cash, cf.current_cash_balance, cf.starting_cash, 0) AS expected_cash,
                COALESCE(cf.gcash_sales, 0) AS gcash_sales,
                COALESCE(cf.petty_cash_expenses, 0) AS petty_cash_expenses,
                u.full_name AS staff_full_name,
                u.role AS staff_role
            FROM cash_floats cf
            LEFT JOIN users u ON cf.staff_id = u.id
            WHERE cf.staff_id = ? AND cf.status = 'ACTIVE'
              AND (DATE(cf.assigned_at) = CURDATE() OR DATE(DATE_ADD(cf.assigned_at, INTERVAL 8 HOUR)) = DATE(DATE_ADD(NOW(), INTERVAL 8 HOUR)))
            ORDER BY cf.assigned_at DESC LIMIT 1
        `, [targetStaffId]);

        if (shifts.length === 0) {
            return res.json({
                activeShift: null,
                message: 'No active shift open. Register is currently closed.'
            });
        }

        const shift = shifts[0];

        // Fetch recent movements during this shift
        const [movements] = await db.query(`
            SELECT * FROM cash_movements
            WHERE cash_float_id = ?
            ORDER BY created_at DESC LIMIT 20
        `, [shift.id]);

        return res.json({
            activeShift: {
                ...shift,
                movements
            }
        });
    } catch (err) {
        console.error('Error fetching active shift tracker:', err);
        return res.status(500).json({ message: 'Failed to retrieve active shift tracker.' });
    }
};

/**
 * POST /api/cash-float/petty-cash
 * Record Petty Cash Expense Out from drawer
 */
exports.recordPettyCashExpense = async (req, res) => {
    try {
        await ensureCashFloatsTableExists();
        const staffId = req.user.id;
        const staffUsername = req.user.username;
        const { amount, category, reason } = req.body;

        const expenseAmount = Math.round(Number(amount) * 100) / 100;
        if (!Number.isFinite(expenseAmount) || expenseAmount <= 0) {
            return res.status(400).json({ message: 'Please enter a valid expense amount greater than ₱0.00.' });
        }
        if (!reason || !reason.trim()) {
            return res.status(400).json({ message: 'Please specify a reason or store item for this petty cash expense.' });
        }

        const [activeFloats] = await db.query(`
            SELECT * FROM cash_floats
            WHERE staff_id = ? AND status = 'ACTIVE'
              AND (DATE(assigned_at) = CURDATE() OR DATE(DATE_ADD(assigned_at, INTERVAL 8 HOUR)) = DATE(DATE_ADD(NOW(), INTERVAL 8 HOUR)))
            ORDER BY assigned_at DESC LIMIT 1 FOR UPDATE
        `, [staffId]);

        if (activeFloats.length === 0) {
            return res.status(400).json({ message: 'No active shift found. Cannot record petty cash expense from a closed register.' });
        }

        const activeFloat = activeFloats[0];
        const prevBal = Number(activeFloat.current_cash_balance || 0);

        if (expenseAmount > prevBal) {
            return res.status(400).json({
                message: `Insufficient cash in drawer! Current balance is ₱${prevBal.toFixed(2)}, cannot take out ₱${expenseAmount.toFixed(2)}.`
            });
        }

        const newBal = Math.round((prevBal - expenseAmount) * 100) / 100;

        await db.query(`
            UPDATE cash_floats SET
                current_cash_balance = ?,
                expected_cash = ?,
                petty_cash_expenses = COALESCE(petty_cash_expenses, 0) + ?
            WHERE id = ?
        `, [newBal, newBal, expenseAmount, activeFloat.id]);

        const fullNotes = `[${category || 'Store Expense'}] ${reason.trim()}`;

        await logCashMovement(db, {
            cashFloatId: activeFloat.id,
            staffId,
            staffUsername,
            movementType: 'PETTY_CASH_EXPENSE',
            amount: expenseAmount,
            balanceBefore: prevBal,
            balanceAfter: newBal,
            referenceId: `EXP-${activeFloat.id}-${Date.now().toString().slice(-4)}`,
            notes: fullNotes
        });

        return res.json({
            success: true,
            message: `Petty cash expense of ₱${expenseAmount.toFixed(2)} recorded. Drawer cash adjusted to ₱${newBal.toFixed(2)}.`,
            newBalance: newBal
        });
    } catch (err) {
        console.error('Error recording petty cash expense:', err);
        return res.status(500).json({ message: 'Failed to record petty cash expense.' });
    }
};

/**
 * POST /api/cash-float/close-shift
 * Close Shift (Blind Cash Count): Cashier counts bills and coins in drawer. System calculates variance against expected cash.
 */
exports.closeShiftBlindCount = async (req, res) => {
    try {
        await ensureCashFloatsTableExists();
        const staffId = req.user.id;
        const staffUsername = req.user.username;
        const isAdmin = (req.user.role || '').toLowerCase() === 'admin';

        const {
            shift_id,
            actual_cash,
            notes,
            bills_1000 = 0,
            bills_500 = 0,
            bills_200 = 0,
            bills_100 = 0,
            bills_50 = 0,
            bills_20 = 0,
            coins_10 = 0,
            coins_5 = 0,
            coins_1 = 0
        } = req.body;

        let query = 'SELECT * FROM cash_floats WHERE status = "ACTIVE"';
        const params = [];

        if (shift_id) {
            query += ' AND id = ?';
            params.push(shift_id);
        } else {
            query += ' AND staff_id = ?';
            params.push(staffId);
        }

        query += ' ORDER BY assigned_at DESC LIMIT 1 FOR UPDATE';

        const [records] = await db.query(query, params);
        if (records.length === 0) {
            return res.status(404).json({ message: 'No active shift found to close.' });
        }

        const currentShift = records[0];

        // Calculate denomination count if provided
        const denomTotal = (Number(bills_1000) * 1000) +
                           (Number(bills_500) * 500) +
                           (Number(bills_200) * 200) +
                           (Number(bills_100) * 100) +
                           (Number(bills_50) * 50) +
                           (Number(bills_20) * 20) +
                           (Number(coins_10) * 10) +
                           (Number(coins_5) * 5) +
                           (Number(coins_1) * 1);

        const rawActual = actual_cash !== undefined && actual_cash !== '' && actual_cash !== null
            ? actual_cash
            : denomTotal;

        const numActualCash = Math.round(Number(rawActual) * 100) / 100;
        if (!Number.isFinite(numActualCash) || numActualCash < 0) {
            return res.status(400).json({ message: 'Please enter a valid actual counted cash amount.' });
        }

        // Formula: Expected Drawer Cash = Opening Float + Cash Sales - Cash Refunds - Cash Expenses
        const openingFloat = Number(currentShift.starting_cash || currentShift.total_amount || 0);
        const cashSales = Number(currentShift.cash_sales || 0);
        const cashRefunds = Number(currentShift.cash_refunds || 0);
        const pettyExpenses = Number(currentShift.petty_cash_expenses || 0);

        const expectedDrawerCash = Math.round((openingFloat + cashSales - cashRefunds - pettyExpenses) * 100) / 100;
        const variance = Math.round((numActualCash - expectedDrawerCash) * 100) / 100;

        let varianceBadge = 'BALANCED';
        if (variance < 0) varianceBadge = 'SHORTAGE';
        else if (variance > 0) varianceBadge = 'OVERAGE';

        const closingNotes = notes ? notes.trim() : `Blind count submitted by ${staffUsername}. Variance: ₱${variance.toFixed(2)}`;

        // Ensure all required Section 8 columns exist on cash_floats table
        const [cfCloseCols] = await db.query('SHOW COLUMNS FROM cash_floats');
        const cfCloseColNames = cfCloseCols.map(c => c.Field);
        const missingCloseCols = [
            { col: 'blind_count_entered', def: 'DECIMAL(12,2) NULL' },
            { col: 'admin_signed_off', def: 'TINYINT(1) DEFAULT 0' },
            { col: 'signed_off_by_id', def: 'INT NULL' },
            { col: 'signed_off_by_name', def: 'VARCHAR(100) NULL' },
            { col: 'signed_off_at', def: 'DATETIME NULL' },
            { col: 'bills_1000', def: 'INT DEFAULT 0' },
            { col: 'bills_500', def: 'INT DEFAULT 0' },
            { col: 'bills_200', def: 'INT DEFAULT 0' },
            { col: 'bills_100', def: 'INT DEFAULT 0' },
            { col: 'bills_50', def: 'INT DEFAULT 0' },
            { col: 'bills_20', def: 'INT DEFAULT 0' },
            { col: 'coins_10', def: 'INT DEFAULT 0' },
            { col: 'coins_5', def: 'INT DEFAULT 0' },
            { col: 'coins_1', def: 'INT DEFAULT 0' }
        ];
        for (const item of missingCloseCols) {
            if (!cfCloseColNames.includes(item.col)) {
                try {
                    await db.query(`ALTER TABLE cash_floats ADD COLUMN ${item.col} ${item.def}`);
                } catch (colErr) {
                    console.warn(`[closeShift] Check/Add cash_floats.${item.col} notice:`, colErr.message);
                }
            }
        }

        await db.query(`
            UPDATE cash_floats SET
                actual_cash = ?,
                blind_count_entered = ?,
                expected_cash = ?,
                shortage_overage = ?,
                bills_1000 = ?,
                bills_500 = ?,
                bills_200 = ?,
                bills_100 = ?,
                bills_50 = ?,
                bills_20 = ?,
                coins_10 = ?,
                coins_5 = ?,
                coins_1 = ?,
                status = 'COMPLETED',
                admin_signed_off = ?,
                signed_off_by_id = ?,
                signed_off_by_name = ?,
                signed_off_at = ?,
                completed_at = NOW(),
                returned_at = NOW(),
                reconciliation_notes = ?,
                returned_notes = ?
            WHERE id = ?
        `, [
            numActualCash,
            numActualCash,
            expectedDrawerCash,
            variance,
            Number(bills_1000) || 0,
            Number(bills_500) || 0,
            Number(bills_200) || 0,
            Number(bills_100) || 0,
            Number(bills_50) || 0,
            Number(bills_20) || 0,
            Number(coins_10) || 0,
            Number(coins_5) || 0,
            Number(coins_1) || 0,
            isAdmin ? 1 : 0,
            isAdmin ? staffId : null,
            isAdmin ? staffUsername : null,
            isAdmin ? new Date() : null,
            closingNotes,
            closingNotes,
            currentShift.id
        ]);

        // Log close shift movement
        await logCashMovement(db, {
            cashFloatId: currentShift.id,
            staffId: currentShift.staff_id,
            staffUsername: currentShift.staff_username,
            movementType: 'CLOSE_SHIFT_BLIND_COUNT',
            amount: numActualCash,
            balanceBefore: currentShift.current_cash_balance,
            balanceAfter: 0.00,
            referenceId: currentShift.shift_code || `SHIFT-${currentShift.id}`,
            notes: `Shift closed. Counted: ₱${numActualCash.toFixed(2)}, Expected: ₱${expectedDrawerCash.toFixed(2)}, Variance: ₱${variance.toFixed(2)} (${varianceBadge})`
        });

        const [updatedRows] = await db.query('SELECT * FROM cash_floats WHERE id = ?', [currentShift.id]);

        return res.json({
            success: true,
            message: `Shift closed successfully. Expected: ₱${expectedDrawerCash.toFixed(2)}, Counted: ₱${numActualCash.toFixed(2)}. Variance: ${variance === 0 ? 'Exact Match (₱0.00)' : (variance < 0 ? `Shortage of ₱${Math.abs(variance).toFixed(2)}` : `Overage of +₱${variance.toFixed(2)}`)}.`,
            reconciliation: {
                shiftCode: currentShift.shift_code || `SHIFT-${currentShift.id}`,
                openingFloat,
                cashSales,
                gcashSales: Number(currentShift.gcash_sales || 0),
                cashRefunds,
                pettyCashExpenses: pettyExpenses,
                expectedDrawerCash,
                actualCountedCash: numActualCash,
                variance,
                varianceBadge,
                adminSignedOff: isAdmin
            },
            shift: updatedRows[0]
        });
    } catch (err) {
        console.error('Error closing shift:', err);
        return res.status(500).json({ message: 'Failed to close shift.' });
    }
};

/**
 * POST /api/cash-float/:id/sign-off
 * Admin Sign-Off on closed shift
 */
exports.adminSignOff = async (req, res) => {
    try {
        const adminId = req.user.id;
        const adminUsername = req.user.username;
        const shiftId = req.params.id;
        const { notes } = req.body;

        const [records] = await db.query('SELECT * FROM cash_floats WHERE id = ?', [shiftId]);
        if (records.length === 0) {
            return res.status(404).json({ message: 'Shift record not found.' });
        }

        const shift = records[0];

        await db.query(`
            UPDATE cash_floats SET
                admin_signed_off = 1,
                signed_off_by_id = ?,
                signed_off_by_name = ?,
                signed_off_at = NOW(),
                returned_notes = CONCAT(COALESCE(returned_notes, ''), ' | Admin Sign-Off: ', ?)
            WHERE id = ?
        `, [adminId, adminUsername, notes || 'Verified and signed off by Admin', shiftId]);

        return res.json({
            success: true,
            message: `Shift ${shift.shift_code || shiftId} officially signed off by Admin (${adminUsername}).`
        });
    } catch (err) {
        console.error('Error signing off shift:', err);
        return res.status(500).json({ message: 'Failed to sign off shift.' });
    }
};

