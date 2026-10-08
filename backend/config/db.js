const mysql = require('mysql2');

const dbUri = process.env.DATABASE_URL || process.env.MYSQL_URL;
const isAivenOrCloud = Boolean(
    (process.env.DB_HOST && (process.env.DB_HOST.includes('aivencloud') || process.env.DB_HOST.includes('render') || process.env.DB_HOST.includes('railway'))) ||
    (dbUri && (dbUri.includes('aivencloud') || dbUri.includes('render') || dbUri.includes('railway'))) ||
    process.env.DB_SSL === 'true'
);

let poolConfig = {};

if (dbUri) {
    poolConfig = {
        uri: dbUri,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        flags: '-LOCAL_INFILE=0',
        ...(isAivenOrCloud ? { ssl: { rejectUnauthorized: false } } : {})
    };
} else {
    poolConfig = {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT, 10) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'jlin_inventory_db',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        flags: '-LOCAL_INFILE=0',
        ...(isAivenOrCloud ? { ssl: { rejectUnauthorized: false } } : {})
    };
}

const pool = mysql.createPool(poolConfig);

// Promise wrapper for easier async/await usage
const promisePool = pool.promise();

// Non-blocking connectivity test
promisePool.query('SELECT 1')
    .then(() => {
        console.log(`[Database] Connected successfully (${isAivenOrCloud ? 'Aiven Cloud / Remote SSL' : 'Local / Standard MySQL'})`);
    })
    .catch((err) => {
        console.warn(`[Database Warning] Could not connect to database: ${err.message}. Backend will run, check DB credentials.`);
    });

module.exports = promisePool;
