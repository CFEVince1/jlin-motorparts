const db = require('../config/db');
const bcrypt = require('bcryptjs');

const VALID_ROLES = ['admin', 'cashier', 'staff'];

const ensureUserColumns = async () => {
    try {
        await db.query('ALTER TABLE users ADD COLUMN is_logged_in TINYINT(1) DEFAULT 0');
    } catch (_) {}
    try {
        await db.query('ALTER TABLE users ADD COLUMN last_login_at DATETIME NULL');
    } catch (_) {}
    try {
        await db.query('ALTER TABLE users ADD COLUMN last_active_at DATETIME NULL');
    } catch (_) {}
};

exports.getAllUsers = async (req, res) => {
    try {
        await ensureUserColumns();
        const currentUserId = req.user?.id || 0;
        const [users] = await db.query(`
            SELECT 
                u.id, 
                u.username, 
                u.full_name, 
                u.role, 
                u.pin, 
                u.is_active, 
                u.is_logged_in,
                u.last_login_at,
                u.last_active_at,
                u.created_at, 
                u.updated_at,
                CASE 
                    WHEN u.is_active = 0 THEN 0
                    -- Current caller is guaranteed online
                    WHEN u.id = ? THEN 1
                    -- Other admin is online if marked logged in & active in past 15 min
                    WHEN LOWER(u.role) = 'admin' AND u.is_logged_in = 1 AND u.last_active_at >= NOW() - INTERVAL 15 MINUTE THEN 1
                    -- Staff is online only if marked logged in, active in past 15 min, AND has an ACTIVE shift in cash_floats
                    WHEN LOWER(u.role) != 'admin' AND u.is_logged_in = 1 AND cf.id IS NOT NULL AND u.last_active_at >= NOW() - INTERVAL 15 MINUTE THEN 1
                    ELSE 0
                END AS is_online,
                cf.shift_code AS active_shift_code
            FROM users u
            LEFT JOIN cash_floats cf ON cf.staff_id = u.id AND cf.status = 'ACTIVE'
            ORDER BY u.id ASC
        `, [currentUserId]);
        res.json(users);
    } catch (err) {
        console.error('Error fetching users:', err);
        res.status(500).json({ message: 'Error fetching users' });
    }
};

exports.createUser = async (req, res) => {
    const { username, full_name, password, role = 'cashier', pin = '1234', is_active = 1 } = req.body;

    if (!username || username.trim().length < 3) {
        return res.status(400).json({ message: 'Username must be at least 3 characters' });
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
        return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }
    const cleanRole = (role || 'cashier').toLowerCase();
    if (!VALID_ROLES.includes(cleanRole)) {
        return res.status(400).json({ message: 'Invalid role. Choose Owner/Admin or Cashier/Staff.' });
    }

    let cleanPin = null;
    if (cleanRole === 'admin') {
        cleanPin = pin && pin.toString().trim() ? pin.toString().trim() : '';
        if (!/^\d{4,6}$/.test(cleanPin)) {
            return res.status(400).json({ message: 'Admin Approval PIN must be 4 to 6 numeric digits' });
        }
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await db.query(
            'INSERT INTO users (username, full_name, password, password_hash, role, pin, is_active, token_version) VALUES (?, ?, ?, ?, ?, ?, ?, 1)',
            [username.trim(), (full_name || username).trim(), hashedPassword, hashedPassword, cleanRole, cleanPin, is_active ? 1 : 0]
        );
        res.status(201).json({ message: 'User created successfully', userId: result.insertId });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: 'Username already exists' });
        }
        console.error('Error creating user:', err);
        res.status(500).json({ message: 'Error creating user' });
    }
};

exports.updateUser = async (req, res) => {
    const { id } = req.params;
    const { username, full_name, password, role, pin, is_active } = req.body;
    const targetId = parseInt(id, 10);
    const callerId = req.user?.id;

    if (!username || username.trim().length < 3) {
        return res.status(400).json({ message: 'Username must be at least 3 characters' });
    }
    if (password && (typeof password !== 'string' || password.length < 6)) {
        return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const cleanRole = role ? role.toLowerCase() : undefined;
    if (cleanRole && !VALID_ROLES.includes(cleanRole)) {
        return res.status(400).json({ message: 'Invalid role selected.' });
    }

    if (cleanRole === 'admin' && pin !== undefined) {
        if (!pin || !/^\d{4,6}$/.test(pin.toString().trim())) {
            return res.status(400).json({ message: 'Admin Approval PIN must be 4 to 6 numeric digits' });
        }
    }

    try {
        // 1. Fetch existing user
        const [existingUserRows] = await db.query('SELECT id, username, full_name, role, is_active, token_version FROM users WHERE id = ?', [targetId]);
        if (existingUserRows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }
        const existingUser = existingUserRows[0];

        // 2. Prevent self-demotion or self-deactivation
        if (callerId === targetId) {
            if (existingUser.role.toLowerCase() === 'admin' && cleanRole && cleanRole !== 'admin') {
                return res.status(400).json({ message: 'You cannot demote your own admin account.' });
            }
            if (is_active === 0 || is_active === false) {
                return res.status(400).json({ message: 'You cannot deactivate your own account while logged in.' });
            }
        }

        // 3. Prevent demoting or deactivating the last remaining admin
        if (existingUser.role.toLowerCase() === 'admin' && ((cleanRole && cleanRole !== 'admin') || is_active === 0)) {
            const [adminCountRows] = await db.query("SELECT COUNT(*) as count FROM users WHERE LOWER(role) = 'admin' AND is_active = 1");
            if (adminCountRows[0].count <= 1) {
                return res.status(400).json({ message: 'Cannot demote or deactivate the last remaining active Owner/Admin account.' });
            }
        }

        // 4. Build dynamic update query
        const updates = [];
        const values = [];

        updates.push('username = ?');
        values.push(username.trim());

        if (full_name !== undefined) {
            updates.push('full_name = ?');
            values.push(full_name.trim());
        }

        if (cleanRole) {
            updates.push('role = ?');
            values.push(cleanRole);
        }

        if (pin !== undefined) {
            updates.push('pin = ?');
            values.push(pin.toString().trim());
        }

        if (is_active !== undefined) {
            updates.push('is_active = ?');
            values.push(is_active ? 1 : 0);
        }

        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            updates.push('password = ?', 'password_hash = ?');
            values.push(hashedPassword, hashedPassword);
        }

        updates.push('token_version = token_version + 1');
        values.push(targetId);

        const query = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
        const [result] = await db.query(query, values);

        if (result.affectedRows === 0) return res.status(404).json({ message: 'User not found' });

        res.json({ message: 'User updated successfully' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: 'Username already exists' });
        }
        console.error('Error updating user:', err);
        res.status(500).json({ message: 'Error updating user' });
    }
};

exports.toggleUserStatus = async (req, res) => {
    const { id } = req.params;
    const targetId = parseInt(id, 10);
    const callerId = req.user?.id;

    if (callerId === targetId) {
        return res.status(400).json({ message: 'You cannot deactivate your own logged-in account.' });
    }

    try {
        const [rows] = await db.query('SELECT id, username, role, is_active FROM users WHERE id = ?', [targetId]);
        if (rows.length === 0) return res.status(404).json({ message: 'User not found' });

        const user = rows[0];
        const newStatus = user.is_active === 1 ? 0 : 1;

        if (user.role.toLowerCase() === 'admin' && newStatus === 0) {
            const [adminCountRows] = await db.query("SELECT COUNT(*) as count FROM users WHERE LOWER(role) = 'admin' AND is_active = 1");
            if (adminCountRows[0].count <= 1) {
                return res.status(400).json({ message: 'Cannot deactivate the last remaining active Owner/Admin account.' });
            }
        }

        const resetLoggedInSql = newStatus === 0 ? ', is_logged_in = 0' : '';
        await db.query(`UPDATE users SET is_active = ?, token_version = token_version + 1${resetLoggedInSql} WHERE id = ?`, [newStatus, targetId]);
        res.json({
            message: `User ${user.username} is now ${newStatus === 1 ? 'Enabled' : 'Deactivated'}.`,
            is_active: newStatus
        });
    } catch (err) {
        console.error('Error toggling user status:', err);
        res.status(500).json({ message: 'Error toggling user status' });
    }
};

exports.deleteUser = async (req, res) => {
    const { id } = req.params;
    const targetId = parseInt(id, 10);
    const callerId = req.user?.id;

    if (callerId === targetId) {
        return res.status(400).json({ message: 'You cannot delete your own account.' });
    }

    try {
        const [existingUserRows] = await db.query('SELECT id, username, role FROM users WHERE id = ?', [targetId]);
        if (existingUserRows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }
        const existingUser = existingUserRows[0];

        if (existingUser.role.toLowerCase() === 'admin') {
            const [adminCountRows] = await db.query("SELECT COUNT(*) as count FROM users WHERE LOWER(role) = 'admin'");
            if (adminCountRows[0].count <= 1) {
                return res.status(400).json({ message: 'Cannot delete the last remaining admin account.' });
            }
        }

        // Check references to report accurate blockers
        const [salesRows] = await db.query('SELECT id FROM sales WHERE user_id = ? LIMIT 1', [targetId]);
        const [ledgerRows] = await db.query('SELECT id FROM inventory_transactions WHERE created_by = ? LIMIT 1', [targetId]);
        const [receivingRows] = await db.query('SELECT id FROM receiving_records WHERE received_by = ? LIMIT 1', [targetId]);

        const blockers = [];
        if (salesRows.length > 0) blockers.push('sales transactions');
        if (ledgerRows.length > 0) blockers.push('inventory ledger history');
        if (receivingRows.length > 0) blockers.push('stock receiving records');

        if (blockers.length > 0) {
            // Soft-deactivate if referenced
            await db.query('UPDATE users SET is_active = 0, token_version = token_version + 1 WHERE id = ?', [targetId]);
            return res.status(200).json({
                message: `User has existing ${blockers.join(' and ')}. Account was safely deactivated instead of deleted.`
            });
        }

        const [result] = await db.query('DELETE FROM users WHERE id = ?', [targetId]);
        if (result.affectedRows === 0) return res.status(404).json({ message: 'User not found' });

        res.json({ message: 'User deleted successfully' });
    } catch (err) {
        console.error('Error deleting user:', err);
        res.status(500).json({ message: 'Error deleting user' });
    }
};

// ==========================================
// ROLES & PERMISSIONS MATRIX
// ==========================================
exports.getRolePermissions = async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT id, role, module, module_name, can_view, can_create, can_edit, can_delete, can_approve
            FROM role_permissions
            ORDER BY module ASC, role ASC
        `);

        // Group by module and role
        const matrix = {};
        const roles = ['admin', 'cashier'];

        rows.forEach(row => {
            if (!matrix[row.module]) {
                matrix[row.module] = {
                    module: row.module,
                    module_name: row.module_name,
                    permissions: {}
                };
            }
            matrix[row.module].permissions[row.role] = {
                id: row.id,
                can_view: !!row.can_view,
                can_create: !!row.can_create,
                can_edit: !!row.can_edit,
                can_delete: !!row.can_delete,
                can_approve: !!row.can_approve
            };
        });

        res.json({
            success: true,
            roles,
            modules: Object.values(matrix),
            raw: rows
        });
    } catch (err) {
        console.error('Error fetching role permissions:', err);
        res.status(500).json({ message: 'Error fetching role permissions' });
    }
};

exports.updateRolePermissions = async (req, res) => {
    const { permissions } = req.body; // Array of { role, module, module_name, can_view, can_create, can_edit, can_delete, can_approve }

    if (!Array.isArray(permissions)) {
        return res.status(400).json({ message: 'Permissions array is required' });
    }

    try {
        for (const p of permissions) {
            if (!p.role || !p.module) continue;
            await db.query(`
                INSERT INTO role_permissions 
                (role, module, module_name, can_view, can_create, can_edit, can_delete, can_approve)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    can_view = VALUES(can_view),
                    can_create = VALUES(can_create),
                    can_edit = VALUES(can_edit),
                    can_delete = VALUES(can_delete),
                    can_approve = VALUES(can_approve),
                    module_name = VALUES(module_name)
            `, [
                p.role,
                p.module,
                p.module_name || p.module,
                p.can_view ? 1 : 0,
                p.can_create ? 1 : 0,
                p.can_edit ? 1 : 0,
                p.can_delete ? 1 : 0,
                p.can_approve ? 1 : 0
            ]);
        }

        res.json({ success: true, message: 'Role permissions matrix updated successfully' });
    } catch (err) {
        console.error('Error updating role permissions:', err);
        res.status(500).json({ message: 'Error updating role permissions' });
    }
};
