const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

// Pre-computed valid 10-round bcrypt hash to ensure constant-time response for nonexistent users
// Prevents timing attacks / username enumeration
const DUMMY_HASH = '$2b$10$CL..8zpnYjIbrx/oCtVneevyK47SVcqaIfJA0B9YAr.Q1gzlzCGSC';

exports.login = async (req, res) => {
    const { username, password } = req.body || {};

    // Validate inputs upfront: missing or non-string username/password returns 400 Bad Request
    // Prevents bcrypt from throwing 'Illegal arguments' on undefined password and returning 500
    if (!username || typeof username !== 'string' || !password || typeof password !== 'string') {
        return res.status(400).json({ message: 'Username and password are required' });
    }

    const trimmedUsername = username.trim();
    if (!trimmedUsername) {
        return res.status(400).json({ message: 'Username and password are required' });
    }

    try {
        // 1. Query user by username
        const [users] = await db.query('SELECT * FROM users WHERE username = ?', [trimmedUsername]);

        if (users.length === 0) {
            // Mitigate timing attack: nonexistent username still runs bcrypt.compare with identical 10-round cost
            // Response timing is constant, preventing attacker from enumerating valid usernames
            await bcrypt.compare(password, DUMMY_HASH);
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const user = users[0];

        // 2. Check password against real hash
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // 3. Generate JWT with tokenVersion
        const tokenVersion = user.token_version !== undefined && user.token_version !== null ? user.token_version : 1;
        const payload = {
            id: user.id,
            username: user.username,
            role: user.role,
            tokenVersion
        };

        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1d' });

        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                token_version: tokenVersion
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error during login' });
    }
};

exports.logout = async (req, res) => {
    try {
        let userId = req.user?.id;

        if (!userId) {
            const authHeader = req.header('Authorization');
            const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
            if (token) {
                try {
                    // Cryptographically verify signature using server secret (ignoring expiration so expiring tokens can still revoke)
                    const decoded = jwt.verify(token, process.env.JWT_SECRET, { ignoreExpiration: true });
                    if (decoded && decoded.id) {
                        userId = decoded.id;
                    }
                } catch (e) {
                    console.warn('[Auth Logout] Invalid token signature on logout attempt');
                }
            }
        }

        if (userId) {
            await db.query('UPDATE users SET token_version = token_version + 1 WHERE id = ?', [userId]);
            console.log(`[Auth] User ${userId} logged out. Token version incremented.`);
        }

        res.json({ message: 'Logged out successfully' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ message: 'Server error during logout' });
    }
};

exports.verify = (req, res) => {
    // If this route is reached, the authMiddleware has already verified the token
    res.json({ user: req.user, message: 'Token is valid' });
};
