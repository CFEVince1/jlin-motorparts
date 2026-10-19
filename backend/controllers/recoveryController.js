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

// Creates a new code and cleans up expired ones
async function createOtp(userId, purpose) {
  // Invalidate any expired unused codes for cleanup
  await db.query(
    'UPDATE password_otps SET used_at = NOW() WHERE user_id = ? AND purpose = ? AND used_at IS NULL AND expires_at <= NOW()',
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

// Returns true only once, for any correct, unexpired, unused code generated for this user
async function consumeOtp(userId, purpose, input) {
  const cleanInput = String(input || '').trim();
  if (!cleanInput) return false;

  const [rows] = await db.query(
    `SELECT id, code_hash, attempts FROM password_otps
     WHERE user_id = ? AND purpose = ? AND used_at IS NULL AND expires_at > NOW()
     ORDER BY id DESC LIMIT 5`,
    [userId, purpose]
  );

  if (!rows || rows.length === 0) {
    await bcrypt.compare(cleanInput, DUMMY_HASH);
    return false;
  }

  for (const row of rows) {
    if (row.attempts >= MAX_ATTEMPTS) continue;

    const ok = await bcrypt.compare(cleanInput, row.code_hash);
    if (ok) {
      // Consume all active codes for this user and purpose so none can be reused
      await db.query(
        'UPDATE password_otps SET used_at = NOW() WHERE user_id = ? AND purpose = ? AND used_at IS NULL',
        [userId, purpose]
      );
      return true;
    }
  }

  // Increment attempts on the latest code
  if (rows[0]) {
    await db.query('UPDATE password_otps SET attempts = attempts + 1 WHERE id = ?', [rows[0].id]);
  }
  return false;
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
    sendOtpEmail(cleanEmail, code, 'verify your email for JLIN password recovery').catch((err) =>
      console.error('[SMTP Error] Failed to send verification code:', err.message)
    );

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

exports.testSmtp = async (req, res) => {
  try {
    const nodemailer = require('nodemailer');
    const to = req.query.to || req.body?.to || 'icovincent@gmail.com';
    const testPort = Number(req.query.port || process.env.SMTP_PORT || 587);
    const testSecure = req.query.secure === 'true' || testPort === 465;

    const testTransporter = nodemailer.createTransport({
      host: req.query.host || process.env.SMTP_HOST || 'smtp.gmail.com',
      port: testPort,
      secure: testSecure,
      family: 4,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      connectionTimeout: 8000,
      tls: { rejectUnauthorized: false }
    });

    const info = await testTransporter.sendMail({
      from: `"JLIN Motorparts" <${process.env.SMTP_USER}>`,
      to,
      subject: `Test from Render Port ${testPort}`,
      text: `Testing port ${testPort} with secure=${testSecure}`
    });

    return res.json({
      success: true,
      port: testPort,
      secure: testSecure,
      messageId: info.messageId,
      accepted: info.accepted
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
      code: err.code,
      command: err.command
    });
  }
};
