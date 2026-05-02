require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs'); // Assumes you use bcryptjs for passwords

async function setupDatabase() {
    try {
        console.log("Connecting to Aiven Cloud Database...");
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            port: process.env.DB_PORT,
            database: process.env.DB_NAME
        });

        console.log("Connected! Creating users table...");

        // Create the users table if it doesn't exist
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(255) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                role VARCHAR(50) DEFAULT 'admin'
            )
        `);

        console.log("Table created. Generating admin account...");

        // Hash the password 'cfevince@test'
        const hashedPassword = await bcrypt.hash('cfevince@test', 10);

        // Insert the default admin user (IGNORE prevents errors if it already exists)
        await connection.execute(
            `INSERT IGNORE INTO users (username, password, role) VALUES (?, ?, ?)`,
            ['admin', hashedPassword, 'admin']
        );

        console.log("✅ SUCCESS! Admin user created. You can now log in!");
        process.exit(0);
    } catch (error) {
        console.error("❌ ERROR:", error);
        process.exit(1);
    }
}

setupDatabase();