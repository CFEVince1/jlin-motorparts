const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { AppValidationError } = require('../utils/errors');

/**
 * Update Staff Profile & Password
 * PATCH /api/staff/profile
 * 
 * - Verifies current password (returns 422 on failure)
 * - Checks duplicate usernames (returns 422 on conflict)
 * - Hashes new password if provided
 * - Increments token_version to invalidate prior sessions across all devices
 * - Returns updated profile and a fresh JWT token
 */
exports.updateProfile = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { current_password, currentPassword, username, new_username, new_password, newPassword } = req.body;

        const effectiveCurrentPassword = current_password || currentPassword;
        const requestedUsername = (new_username || username || '').trim();
        const requestedNewPassword = new_password || newPassword;

        // 1. Verify current password is provided
        if (!effectiveCurrentPassword) {
            return res.status(422).json({ 
                message: 'Current password is required to update profile',
                errors: [{ field: 'current_password', message: 'Current password required' }]
            });
        }

        // Fetch user from DB with current hashed password
        const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
        if (rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }
        const user = rows[0];

        // 2. Verify current password
        const isCurrentMatch = await bcrypt.compare(effectiveCurrentPassword, user.password);
        if (!isCurrentMatch) {
            return res.status(422).json({ 
                error: 'Incorrect current password.',
                message: 'Incorrect current password.',
                errors: [{ field: 'current_password', message: 'Current password does not match' }]
            });
        }

        let updatedUsername = user.username;
        // 3. Check duplicate usernames if username change is requested
        if (requestedUsername && requestedUsername !== user.username) {
            const [existing] = await db.query('SELECT id FROM users WHERE username = ? AND id != ?', [requestedUsername, userId]);
            if (existing.length > 0) {
                return res.status(422).json({ 
                    error: 'Username is already taken by another account',
                    message: 'Username is already taken by another account',
                    errors: [{ field: 'username', message: 'Username unavailable' }]
                });
            }
            updatedUsername = requestedUsername;
        }

        // 4. Hash new password if provided (minimum 8 characters)
        let updatedPasswordHash = user.password;
        if (requestedNewPassword) {
            if (typeof requestedNewPassword !== 'string' || requestedNewPassword.length < 8) {
                return res.status(422).json({ 
                    error: 'New password must be at least 8 characters long',
                    message: 'New password must be at least 8 characters long',
                    errors: [{ field: 'new_password', message: 'Minimum 8 characters' }]
                });
            }
            updatedPasswordHash = await bcrypt.hash(requestedNewPassword, 10);
        }

        // 5. Increment token_version to invalidate prior sessions
        const currentVersion = user.token_version !== undefined && user.token_version !== null ? user.token_version : 1;
        const nextTokenVersion = currentVersion + 1;

        await db.query(
            'UPDATE users SET username = ?, password = ?, token_version = ? WHERE id = ?',
            [updatedUsername, updatedPasswordHash, nextTokenVersion, userId]
        );

        // 6. Generate fresh JWT token with the incremented tokenVersion
        const tokenPayload = {
            id: user.id,
            username: updatedUsername,
            role: user.role,
            tokenVersion: nextTokenVersion
        };
        const freshToken = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '1d' });

        res.json({
            message: 'Profile updated successfully. Prior sessions have been invalidated.',
            token: freshToken,
            user: {
                id: user.id,
                username: updatedUsername,
                role: user.role,
                token_version: nextTokenVersion
            }
        });

    } catch (err) {
        next(err);
    }
};
