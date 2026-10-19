require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const host = process.env.DB_HOST || 'localhost';
if (!['localhost', '127.0.0.1'].includes(host) && !process.argv.includes('--force-remote')) {
  console.error(`Refusing to run against remote host "${host}". Back up first, then use --force-remote.`);
  process.exit(1);
}

const db = require('../config/db');

(async () => {
  const dbName = process.env.DB_NAME || 'jlin_inventory_db';

  // MySQL 8 has no "ADD COLUMN IF NOT EXISTS", so check first
  const [cols] = await db.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users'
       AND COLUMN_NAME IN ('email', 'email_verified_at')`,
    [dbName]
  );
  const have = cols.map((c) => c.COLUMN_NAME);

  if (!have.includes('email')) {
    await db.query('ALTER TABLE users ADD COLUMN email VARCHAR(150) NULL UNIQUE');
  }
  if (!have.includes('email_verified_at')) {
    await db.query('ALTER TABLE users ADD COLUMN email_verified_at DATETIME NULL');
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS password_otps (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      purpose VARCHAR(30) NOT NULL,
      code_hash VARCHAR(255) NOT NULL,
      attempts INT NOT NULL DEFAULT 0,
      expires_at DATETIME NOT NULL,
      used_at DATETIME NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_otp_lookup (user_id, purpose, used_at),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  console.log('Email and OTP schema is ready.');
  process.exit(0);
})().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
