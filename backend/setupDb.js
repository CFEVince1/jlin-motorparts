require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs'); // Assumes you use bcryptjs for passwords

// NOTE:
// Full schema is managed in /db/database.sql.
// setupDb.js is only for initial minimal bootstrap (users table).
// Do NOT rely on this for full schema setup.

const { getSslConfig } = require('./config/db');

async function setupDatabase() {
    try {
        console.log("Connecting to Aiven Cloud Database...");
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            port: process.env.DB_PORT,
            database: process.env.DB_NAME,
            ...getSslConfig(process.env.DB_HOST)
        });

        console.log("Connected! Creating users table...");

        // Create the users table if it doesn't exist
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(255) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                role VARCHAR(50) DEFAULT 'admin',
                token_version INT NOT NULL DEFAULT 1
            )
        `);

        console.log("Table created. Generating admin account...");

        const crypto = require('crypto');
        const adminPass = process.env.INITIAL_ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64').replace(/[+/=]/g, 'a').slice(0, 12);
        const hashedPassword = await bcrypt.hash(adminPass, 10);

        // Insert the default admin user (IGNORE prevents errors if it already exists)
        await connection.execute(
            `INSERT IGNORE INTO users (username, password, role) VALUES (?, ?, ?)`,
            ['admin', hashedPassword, 'admin']
        );

        console.log("✅ SUCCESS! Admin user created.");
        if (process.env.INITIAL_ADMIN_PASSWORD) {
            console.log("Password set from INITIAL_ADMIN_PASSWORD.");
        } else {
            console.log("Generated Admin Password: " + adminPass);
        }
        process.exit(0);
    } catch (error) {
        console.error("❌ ERROR:", error);
        process.exit(1);
    }
}

setupDatabase();
