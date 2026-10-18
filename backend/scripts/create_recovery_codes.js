require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const host = process.env.DB_HOST || 'localhost';
if (!['localhost', '127.0.0.1'].includes(host) && !process.argv.includes('--force-remote')) {
  console.error(`Refusing to run against remote host "${host}". Use --force-remote only after a backup.`);
  process.exit(1);
}

const db = require('../config/db');

(async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS admin_recovery_codes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      code_hash VARCHAR(255) NOT NULL,
      used_at DATETIME NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  console.log('admin_recovery_codes is ready.');
  process.exit(0);
})().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
