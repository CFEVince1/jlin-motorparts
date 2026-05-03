require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { validatePassword } = require('./utils/passwordValidation');

async function fixManagementUser() {
    try {
        console.log("Connecting to Aiven Cloud Database...");
        const pool = mysql.createPool({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: process.env.DB_PORT,
            ...(process.env.DB_HOST && process.env.DB_HOST.includes('aivencloud') 
                ? { ssl: { 
                    ca: require('fs').readFileSync(require('path').join(__dirname, 'ca.pem')),
                    rejectUnauthorized: true 
                } } 
                : {})
        });

        // CRITICAL FIX: Pull from environment, fail safely if missing.
        const adminPassword = process.env.ADMIN_PASSWORD;

        if (!adminPassword) {
            console.error("❌ FATAL ERROR: ADMIN_PASSWORD environment variable is missing.");
            console.error("Please add ADMIN_PASSWORD=your_secure_password to your .env file.");
            process.exit(1); 
        }

        const pwdCheck = await validatePassword(adminPassword);
        if (!pwdCheck.valid) {
            console.error("❌ FATAL ERROR: ADMIN_PASSWORD is too weak or has been pwned.");
            console.error(pwdCheck.message);
            process.exit(1);
        }

        const hashedPassword = await bcrypt.hash(adminPassword, 10);

        // Force insert or update the admin user
        await pool.query(`
            INSERT INTO users (username, password, role) 
            VALUES ('admin', ?, 'admin') 
            ON DUPLICATE KEY UPDATE password = ?, role = 'admin'
        `, [hashedPassword, hashedPassword]);

        console.log("✅ Management user fixed successfully!");
        console.log("👉 Username: admin");
        console.log("👉 Password: <see ADMIN_PASSWORD in .env>");
        process.exit(0);
    } catch (error) {
        console.error("❌ Error fixing user:", error.message);
        process.exit(1);
    }
}

fixManagementUser();
