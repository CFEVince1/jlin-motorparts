const jwt = require('jsonwebtoken');
const db = require('../config/db');

/**
 * Authentication Middleware with Session Revocation Verification
 * - Verifies token validity and signature
 * - Enforces tokenVersion in payload
 * - Rejects tokens where tokenVersion does not match current database users.token_version
 * - Attaches sanitized user object to req.user (stripping password / password_hash)
 */
const authenticateToken = async (req, res, next) => {
    const authHeader = req.header('Authorization');
    const token = authHeader?.startsWith('Bearer ') 
        ? authHeader.slice(7) 
        : authHeader;

    if (!token) {
        return res.status(401).json({ message: 'No authentication token provided, authorization denied' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Reject tokens lacking tokenVersion
        if (decoded.tokenVersion === undefined || decoded.tokenVersion === null) {
            return res.status(401).json({ 
                message: 'Invalid session token: missing tokenVersion. Please re-authenticate.' 
            });
        }

        // Fetch user from DB to verify active status and token_version match
        const [users] = await db.query(
            'SELECT id, username, role, token_version FROM users WHERE id = ?', 
            [decoded.id]
        );

        if (users.length === 0) {
            return res.status(401).json({ message: 'User account no longer exists' });
        }

        const user = users[0];
        const currentTokenVersion = user.token_version !== undefined && user.token_version !== null 
            ? user.token_version 
            : 1;

        if (decoded.tokenVersion !== currentTokenVersion) {
            return res.status(401).json({ 
                message: 'Session revoked or invalidated due to profile/password update. Please log in again.' 
            });
        }

        // Attach sanitized user object (password is completely stripped)
        req.user = {
            id: user.id,
            username: user.username,
            role: user.role,
            token_version: currentTokenVersion
        };

        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Session expired. Please log in again.' });
        }
        return res.status(401).json({ message: 'Invalid or malformed authentication token' });
    }
};

module.exports = {
    authenticateToken
};

// Also support default export
module.exports.default = authenticateToken;
