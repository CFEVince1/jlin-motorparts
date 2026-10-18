const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { normalize } = require('../utils/recoveryCodes');

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
        if (!process.env.JWT_SECRET || !process.env.JWT_SECRET.trim()) {
            console.error('Login error: JWT_SECRET environment variable is not configured');
            return res.status(500).json({ message: 'Server configuration error: JWT_SECRET is missing' });
        }

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

exports.resetWithCode = async (req, res, next) => {
  const failed = { message: 'Invalid username or recovery code.' };
  try {
    const { username, code, newPassword } = req.body || {};
    if (
      !username || !code || typeof newPassword !== 'string' || newPassword.length < 8
    ) {
      return res.status(422).json({
        message: 'Username, recovery code, and a new password of at least 8 characters are required.',
      });
    }

    const [users] = await db.query(
      "SELECT id FROM users WHERE username = ? AND role = 'admin'",
      [username.trim()]
    );
    const user = users[0];

    // Always run a bcrypt comparison so timing doesn't reveal which accounts exist
    if (!user) {
      await bcrypt.compare(normalize(code), DUMMY_HASH);
      return res.status(400).json(failed);
    }

    const [codes] = await db.query(
      'SELECT id, code_hash FROM admin_recovery_codes WHERE user_id = ? AND used_at IS NULL',
      [user.id]
    );
    if (codes.length === 0) {
      await bcrypt.compare(normalize(code), DUMMY_HASH);
      return res.status(400).json(failed);
    }

    let matchId = null;
    for (const row of codes) {
      if (await bcrypt.compare(normalize(code), row.code_hash)) {
        matchId = row.id;
        break;
      }
    }
    if (matchId === null) {
      return res.status(400).json(failed);
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // The WHERE clause stops two requests from using the same code
      const [mark] = await conn.query(
        'UPDATE admin_recovery_codes SET used_at = NOW() WHERE id = ? AND used_at IS NULL',
        [matchId]
      );
      if (mark.affectedRows !== 1) {
        await conn.rollback();
        return res.status(400).json(failed);
      }

      const hash = await bcrypt.hash(newPassword, 10);
      // Incrementing token_version logs out every existing session
      await conn.query(
        'UPDATE users SET password = ?, token_version = token_version + 1 WHERE id = ?',
        [hash, user.id]
      );
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    return res.json({ message: 'Password reset. Please log in with your new password.' });
  } catch (err) {
    next(err);
  }
};
