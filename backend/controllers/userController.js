const db = require('../config/db');
const bcrypt = require('bcryptjs');

exports.getAllUsers = async (req, res) => {
    try {
        const [users] = await db.query('SELECT id, username, role, created_at FROM users ORDER BY id ASC');
        res.json(users);
    } catch (err) {
        console.error('Error fetching users:', err);
        res.status(500).json({ message: 'Error fetching users' });
    }
};

exports.createUser = async (req, res) => {
    const { username, password, role } = req.body;

    if (!username || username.trim().length < 3) {
        return res.status(400).json({ message: 'Username must be at least 3 characters' });
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
        return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }
    if (!role || !['admin', 'staff'].includes(role)) {
        return res.status(400).json({ message: 'Invalid role. Must be admin or staff.' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await db.query(
            'INSERT INTO users (username, password, role, token_version) VALUES (?, ?, ?, 1)',
            [username.trim(), hashedPassword, role]
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
    const { username, password, role } = req.body;
    const targetId = parseInt(id, 10);
    const callerId = req.user?.id;

    if (!username || username.trim().length < 3) {
        return res.status(400).json({ message: 'Username must be at least 3 characters' });
    }
    if (password && (typeof password !== 'string' || password.length < 8)) {
        return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }
    if (!role || !['admin', 'staff'].includes(role)) {
        return res.status(400).json({ message: 'Invalid role. Must be admin or staff.' });
    }

    try {
        // 1. Fetch existing user
        const [existingUserRows] = await db.query('SELECT id, username, role, token_version FROM users WHERE id = ?', [targetId]);
        if (existingUserRows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }
        const existingUser = existingUserRows[0];

        // 2. Prevent self-demotion
        if (callerId === targetId && existingUser.role === 'admin' && role !== 'admin') {
            return res.status(400).json({ message: 'You cannot demote your own admin account.' });
        }

        // 3. Prevent demoting the last remaining admin
        if (existingUser.role === 'admin' && role !== 'admin') {
            const [adminCountRows] = await db.query("SELECT COUNT(*) as count FROM users WHERE role = 'admin'");
            if (adminCountRows[0].count <= 1) {
                return res.status(400).json({ message: 'Cannot demote the last remaining admin account.' });
            }
        }

        // 4. Update user and bump token_version so prior sessions are invalidated
        let query;
        let values;

        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            query = 'UPDATE users SET username = ?, password = ?, role = ?, token_version = token_version + 1 WHERE id = ?';
            values = [username.trim(), hashedPassword, role, targetId];
        } else {
            query = 'UPDATE users SET username = ?, role = ?, token_version = token_version + 1 WHERE id = ?';
            values = [username.trim(), role, targetId];
        }

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

exports.deleteUser = async (req, res) => {
    const { id } = req.params;
    const targetId = parseInt(id, 10);
    const callerId = req.user?.id;

    // 1. Prevent self-deletion
    if (callerId === targetId) {
        return res.status(400).json({ message: 'You cannot delete your own account.' });
    }

    try {
        // 2. Fetch existing user to verify role
        const [existingUserRows] = await db.query('SELECT id, username, role FROM users WHERE id = ?', [targetId]);
        if (existingUserRows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }
        const existingUser = existingUserRows[0];

        // 3. Prevent deleting the last remaining admin
        if (existingUser.role === 'admin') {
            const [adminCountRows] = await db.query("SELECT COUNT(*) as count FROM users WHERE role = 'admin'");
            if (adminCountRows[0].count <= 1) {
                return res.status(400).json({ message: 'Cannot delete the last remaining admin account.' });
            }
        }

        // 4. Execute deletion
        const [result] = await db.query('DELETE FROM users WHERE id = ?', [targetId]);
        if (result.affectedRows === 0) return res.status(404).json({ message: 'User not found' });

        res.json({ message: 'User deleted successfully' });
    } catch (err) {
        if (err.code === 'ER_ROW_IS_REFERENCED_2') {
            return res.status(400).json({ message: 'Cannot delete: User has existing sales transactions.' });
        }
        console.error('Error deleting user:', err);
        res.status(500).json({ message: 'Error deleting user' });
    }
};
