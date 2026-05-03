require('dotenv').config();
const mysql = require('mysql2/promise');

async function fix() {
    try {
        const pool = mysql.createPool({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: process.env.DB_PORT,
            ...(process.env.DB_HOST && process.env.DB_HOST.includes('aivencloud') 
                ? { ssl: { ca: require('fs').readFileSync(require('path').join(__dirname, 'ca.pem')), rejectUnauthorized: true } } 
                : {})
        });

        const [result] = await pool.query("UPDATE sales SET payment_method = 'Cash'");
        console.log(`Updated ${result.affectedRows} rows to Cash.`);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
fix();
