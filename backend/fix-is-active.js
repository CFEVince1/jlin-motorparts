require('dotenv').config();
const mysql = require('mysql2/promise');

async function fixDatabase() {
    try {
        console.log("Connecting to Aiven to add missing is_active column...");
        const pool = mysql.createPool({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: process.env.DB_PORT,
            ssl: { rejectUnauthorized: false }
        });

        // Add the missing is_active column to the products table
        await pool.query(`
            ALTER TABLE products 
            ADD COLUMN is_active BOOLEAN DEFAULT TRUE
        `);

        console.log("✅ Column 'is_active' added to products successfully!");
        process.exit(0);
    } catch (error) {
        // If it throws an error, it might mean it already exists or we caught a typo
        console.error("Result:", error.message);
        process.exit(1);
    }
}

fixDatabase();
