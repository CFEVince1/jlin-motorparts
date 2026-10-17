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

const APP_TIMEZONE = process.env.APP_TIMEZONE || '+08:00';

let poolConfig = {};

if (dbUri) {
    poolConfig = {
        uri: dbUri,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        timezone: APP_TIMEZONE,
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
        timezone: APP_TIMEZONE,
        flags: '-LOCAL_INFILE=0',
        ...sslConfig
    };
}

const pool = mysql.createPool(poolConfig);

// Enforce Philippine Standard Time (PST / UTC+8) on every connection
pool.on('connection', (connection) => {
    connection.query(`SET time_zone = '${APP_TIMEZONE}'`, (err) => {
        if (err) {
            console.warn(`[Database Warning] Could not set session time_zone to ${APP_TIMEZONE}:`, err.message);
        }
    });
});

// Promise wrapper for easier async/await usage
const promisePool = pool.promise();

// Non-blocking connectivity test
promisePool.query("SELECT 1 as ok, @@session.time_zone as tz, DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s') as pht_now")
    .then(([rows]) => {
        const info = rows[0] || {};
        console.log(`[Database] Connected successfully (${isAivenOrCloud ? (caCert ? 'Cloud MySQL with Verified Aiven CA (rejectUnauthorized: true)' : 'Cloud MySQL / Remote SSL') : 'Local / Standard MySQL'}) | TimeZone: ${info.tz || APP_TIMEZONE} (PHT Now: ${info.pht_now})`);
    })
    .catch((err) => {
        console.warn(`[Database Warning] Could not connect to database: ${err.message}. Backend will run, check DB credentials.`);
    });

module.exports = promisePool;
