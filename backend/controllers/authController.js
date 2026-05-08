const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

exports.login = async (req, res) => {
    const { username, password } = req.body;

    try {
        // 1. Check if user exists
        const [users] = await db.query('SELECT * FROM users WHERE username = ?', [username]);

        if (users.length === 0) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const user = users[0];

        // 2. Check password
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // 3. Generate JWT
        const payload = {
            id: user.id,
            username: user.username,
            role: user.role
        };

        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1d' });

        res.json({
            token,
            user: payload
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error during login' });
    }
};

exports.logout = (req, res) => {
    // Client handles token deletion, simply return success
    res.json({ message: 'Logged out successfully' });
};

exports.verify = (req, res) => {
    // If this route is reached, the authMiddleware has already verified the token
    res.json({ user: req.user, message: 'Token is valid' });
};
