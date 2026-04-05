require('dotenv').config();
const mysql = require('mysql2/promise');

async function fixDatabaseTables() {
    try {
        console.log("Connecting to Aiven Cloud Database...");
        const pool = mysql.createPool({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: process.env.DB_PORT,
            ssl: { rejectUnauthorized: false }
        });

        console.log("Creating suppliers table...");
        await pool.query(`
            CREATE TABLE IF NOT EXISTS suppliers (
                id INT AUTO_INCREMENT PRIMARY KEY,
                supplier_name VARCHAR(100),
                contact VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log("Creating products table...");
        await pool.query(`
            CREATE TABLE IF NOT EXISTS products (
                id INT AUTO_INCREMENT PRIMARY KEY,
                product_name VARCHAR(100) UNIQUE,
                category VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log("Creating product_variants table...");
        await pool.query(`
            CREATE TABLE IF NOT EXISTS product_variants (
                id INT AUTO_INCREMENT PRIMARY KEY,
                product_id INT,
                brand VARCHAR(100),
                price DECIMAL(10,2),
                stock INT DEFAULT 0,
                supplier_id INT,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (product_id) REFERENCES products(id),
                FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
            )
        `);

        console.log("Creating sales table...");
        await pool.query(`
            CREATE TABLE IF NOT EXISTS sales (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT,
                total_amount DECIMAL(10,2),
                sale_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);

        console.log("Creating sales_items table...");
        await pool.query(`
            CREATE TABLE IF NOT EXISTS sales_items (
                id INT AUTO_INCREMENT PRIMARY KEY,
                sale_id INT,
                variant_id INT,
                quantity INT,
                price DECIMAL(10,2),
                subtotal DECIMAL(10,2),
                FOREIGN KEY (sale_id) REFERENCES sales(id),
                FOREIGN KEY (variant_id) REFERENCES product_variants(id)
            )
        `);

        console.log("✅ All missing tables successfully injected into the live database!");
        process.exit(0);
    } catch (error) {
        console.error("❌ Error creating tables:", error.message);
        process.exit(1);
    }
}

fixDatabaseTables();
