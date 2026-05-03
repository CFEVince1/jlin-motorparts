const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function deploy() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: process.env.DB_PORT,
            ssl: { 
                ca: fs.readFileSync(path.join(__dirname, 'ca.pem')),
                rejectUnauthorized: true 
            }
        });
        
        console.log("Connected to Aiven! Creating tables...");
        
        const sqlPath = path.join(__dirname, 'db', 'database.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        
        const cleanSql = sql.replace(/DROP DATABASE IF EXISTS jlin_inventory_db;/g, '')
                            .replace(/CREATE DATABASE jlin_inventory_db;/g, '')
                            .replace(/USE jlin_inventory_db;/g, '');
                            
        const statements = cleanSql.split(';').map(s => s.trim()).filter(s => s.length > 0);
        
        for (let stmt of statements) {
            await connection.execute(stmt);
        }
        
        console.log("Database schema deployed to Aiven successfully.");
        process.exit(0);
    } catch (err) {
        console.error("Deploy error:", err.message);
        process.exit(1);
    }
}
require('dotenv').config();
deploy();
