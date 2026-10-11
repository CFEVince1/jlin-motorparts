const fs = require('fs');
const path = require('path');
const mysql = require('mysql2');

const dbUri = process.env.DATABASE_URL || process.env.MYSQL_URL;
const isAivenOrCloud = Boolean(
    (process.env.DB_HOST && (process.env.DB_HOST.includes('aivencloud') || process.env.DB_HOST.includes('render') || process.env.DB_HOST.includes('railway'))) ||
    (dbUri && (dbUri.includes('aivencloud') || dbUri.includes('render') || dbUri.includes('railway'))) ||
    process.env.DB_SSL === 'true'
);

// Resolve CA Certificate for SSL verification
let caCert = null;
if (process.env.DB_CA_CERT || process.env.DB_SSL_CA || process.env.AIVEN_CA_CERT) {
    caCert = process.env.DB_CA_CERT || process.env.DB_SSL_CA || process.env.AIVEN_CA_CERT;
} else if (process.env.DB_CA_PATH && fs.existsSync(process.env.DB_CA_PATH)) {
    try {
        caCert = fs.readFileSync(process.env.DB_CA_PATH, 'utf-8');
    } catch (e) {
        console.warn(`[Database SSL] Failed to read CA from DB_CA_PATH (${process.env.DB_CA_PATH}):`, e.message);
    }
} else {
    const defaultCaPath = path.join(__dirname, 'aiven-ca.pem');
    if (fs.existsSync(defaultCaPath)) {
        try {
            caCert = fs.readFileSync(defaultCaPath, 'utf-8');
        } catch (e) {
            console.warn('[Database SSL] Failed to read default aiven-ca.pem:', e.message);
        }
    }
}

// Build SSL configuration for cloud connections
const getSslConfig = () => {
    if (!isAivenOrCloud) return {};

    if (caCert) {
        return {
            ssl: {
                ca: caCert,
                rejectUnauthorized: true
            }
        };
    }

    console.warn('[Database SSL] Cloud database detected but no CA certificate found. Falling back to default system CA bundle.');
    return {
        ssl: {
            rejectUnauthorized: process.env.DB_REJECT_UNAUTHORIZED === 'false' ? false : true
        }
    };
};

const sslConfig = getSslConfig();

let poolConfig = {};

if (dbUri) {
    poolConfig = {
        uri: dbUri,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        flags: '-LOCAL_INFILE=0',
        ...sslConfig
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
        ...sslConfig
    };
}

const pool = mysql.createPool(poolConfig);

// Promise wrapper for easier async/await usage
const promisePool = pool.promise();

// Non-blocking connectivity test
promisePool.query('SELECT 1')
    .then(() => {
        console.log(`[Database] Connected successfully (${isAivenOrCloud ? (caCert ? 'Cloud MySQL with Verified Aiven CA (rejectUnauthorized: true)' : 'Cloud MySQL / Remote SSL') : 'Local / Standard MySQL'})`);
    })
    .catch((err) => {
        console.warn(`[Database Warning] Could not connect to database: ${err.message}. Backend will run, check DB credentials.`);
    });

module.exports = promisePool;
