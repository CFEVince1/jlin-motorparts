const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { makeOtp } = require('../utils/otp');
const { sendOtpEmail } = require('../utils/mailer');

const OTP_MINUTES = 10;
const MAX_ATTEMPTS = 5;           // wrong guesses allowed per code
const MAX_SENDS_PER_15_MIN = 10;  // codes emailed per user per purpose
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FAILED = { message: 'Invalid or expired code.' };
const SENT_GENERIC = { message: 'If this admin account has a verified email, a code has been sent.' };
const DUMMY_HASH = bcrypt.hashSync('dummy-password', 10);

async function canSend(userId, purpose) {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS n FROM password_otps
     WHERE user_id = ? AND purpose = ? AND created_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE)`,
    [userId, purpose]
  );
  return rows[0].n < MAX_SENDS_PER_15_MIN;
}

// Creates a new code and invalidates any older unused codes for the same purpose
async function createOtp(userId, purpose) {
  await db.query(
    'UPDATE password_otps SET used_at = NOW() WHERE user_id = ? AND purpose = ? AND used_at IS NULL',
    [userId, purpose]
  );
  const code = makeOtp();
  const hash = await bcrypt.hash(code, 10);
  await db.query(
    `INSERT INTO password_otps (user_id, purpose, code_hash, expires_at)
     VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
    [userId, purpose, hash, OTP_MINUTES]
  );
  return code;
}

// Returns true only once, for a correct, unexpired, unused code
async function consumeOtp(userId, purpose, input) {
  const [rows] = await db.query(
    `SELECT id, code_hash, attempts FROM password_otps
     WHERE user_id = ? AND purpose = ? AND used_at IS NULL AND expires_at > NOW()
     ORDER BY id DESC LIMIT 1`,
    [userId, purpose]
  );
  const row = rows[0];
  if (!row || row.attempts >= MAX_ATTEMPTS) {
    await bcrypt.compare(String(input), DUMMY_HASH);
    return false;
  }

  const ok = await bcrypt.compare(String(input).trim(), row.code_hash);
  if (!ok) {
    await db.query('UPDATE password_otps SET attempts = attempts + 1 WHERE id = ?', [row.id]);
    return false;
  }

  // The WHERE clause stops two simultaneous requests from using the same code
  const [mark] = await db.query(
    'UPDATE password_otps SET used_at = NOW() WHERE id = ? AND used_at IS NULL',
    [row.id]
  );
  return mark.affectedRows === 1;
}

// ---- Admin: link and verify email (logged in) ----

exports.getEmailStatus = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      'SELECT email, email_verified_at FROM users WHERE id = ?',
      [req.user.id]
    );
    const u = rows[0] || {};
    return res.json({ email: u.email || null, verified: Boolean(u.email_verified_at) });
  } catch (err) {
    next(err);
  }
};

exports.requestEmailVerification = async (req, res, next) => {
  try {
    const { currentPassword, email } = req.body || {};
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!currentPassword || !EMAIL_RE.test(cleanEmail)) {
      return res.status(422).json({ message: 'Current password and a valid email are required.' });
    }

    const [rows] = await db.query('SELECT id, password FROM users WHERE id = ?', [req.user.id]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
      return res.status(422).json({ message: 'Incorrect current password.' });
    }

    const [taken] = await db.query(
      'SELECT id FROM users WHERE email = ? AND id <> ?',
      [cleanEmail, user.id]
    );
    if (taken.length > 0) {
      return res.status(422).json({ message: 'That email is already used by another account.' });
    }

    // Changing the email makes it unverified until the new code is confirmed
    await db.query(
      'UPDATE users SET email = ?, email_verified_at = NULL WHERE id = ?',
      [cleanEmail, user.id]
    );
    await db.query(
      'UPDATE password_otps SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL',
      [user.id]
    );

    if (!(await canSend(user.id, 'verify_email'))) {
      return res.status(429).json({ message: 'Too many requests. Please wait a few minutes before requesting another code.' });
    }

    const code = await createOtp(user.id, 'verify_email');
    await sendOtpEmail(cleanEmail, code, 'verify your email for JLIN password recovery');

    return res.json({ message: 'We sent a 6-digit code to that email.' });
  } catch (err) {
    next(err);
  }
};

exports.confirmEmailVerification = async (req, res, next) => {
  try {
    const { otp } = req.body || {};
    if (!otp) {
      return res.status(422).json({ message: 'Code is required.' });
    }

    const ok = await consumeOtp(req.user.id, 'verify_email', otp);
    if (!ok) {
      return res.status(422).json(FAILED);
    }

    await db.query('UPDATE users SET email_verified_at = NOW() WHERE id = ?', [req.user.id]);
    return res.json({ message: 'Email verified. Password recovery is now enabled.' });
  } catch (err) {
    next(err);
  }
};

// ---- Public: forgot password (only for admins with a verified email) ----

exports.forgotPassword = async (req, res, next) => {
  try {
    const username = String((req.body || {}).username || '').trim();
    if (!username) {
      return res.status(422).json({ message: 'Username is required.' });
    }

    const [rows] = await db.query(
      `SELECT id, email FROM users
       WHERE username = ? AND role = 'admin' AND email_verified_at IS NOT NULL`,
      [username]
    );
    const user = rows[0];

    if (user && (await canSend(user.id, 'reset_password'))) {
      const code = await createOtp(user.id, 'reset_password');
      // Not awaited, so response time doesn't reveal whether the account exists
      sendOtpEmail(user.email, code, 'reset your admin password').catch((err) =>
        console.error('[Recovery] Email send failed:', err.message)
      );
    } else if (!user) {
      await bcrypt.compare('x', DUMMY_HASH);
    }

    // Same answer for every username, so this can't be used to find admin accounts
    return res.json(SENT_GENERIC);
  } catch (err) {
    next(err);
  }
};

exports.resetPassword = async (req, res, next) => {
  try {
    const { username, otp, newPassword } = req.body || {};
    if (!username || !otp || typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(422).json({
        message: 'Username, code, and a new password of at least 8 characters are required.',
      });
    }

    const [rows] = await db.query(
      `SELECT id FROM users
       WHERE username = ? AND role = 'admin' AND email_verified_at IS NOT NULL`,
      [String(username).trim()]
    );
    const user = rows[0];
    if (!user) {
      await bcrypt.compare('x', DUMMY_HASH);
      return res.status(400).json(FAILED);
    }

    const ok = await consumeOtp(user.id, 'reset_password', otp);
    if (!ok) {
      return res.status(400).json(FAILED);
    }

    const hash = await bcrypt.hash(newPassword, 10);
    // Incrementing token_version logs out every existing session
    await db.query(
      'UPDATE users SET password = ?, token_version = token_version + 1 WHERE id = ?',
      [hash, user.id]
    );

    return res.json({ message: 'Password reset. Please log in with your new password.' });
  } catch (err) {
    next(err);
  }
};
