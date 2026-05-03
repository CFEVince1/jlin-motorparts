require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

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

        // Hash a fresh password
        const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'fallback_dev_password', 10);

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
