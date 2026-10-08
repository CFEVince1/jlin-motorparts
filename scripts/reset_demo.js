const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// Ensure module resolution
const possibleModulePaths = [
    path.join(__dirname, '..', 'backend', 'node_modules'),
    path.join(__dirname, 'node_modules'),
    path.join(process.cwd(), 'backend', 'node_modules'),
    path.join(process.cwd(), 'node_modules')
];
for (const p of possibleModulePaths) {
    if (fs.existsSync(p) && !module.paths.includes(p)) {
        module.paths.push(p);
    }
}

// Load .env
const envPaths = [
    path.join(__dirname, '..', 'backend', '.env'),
    path.join(__dirname, '.env'),
    path.join(process.cwd(), 'backend', '.env'),
    path.join(process.cwd(), '.env')
];
for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
        require('dotenv').config({ path: envPath });
        break;
    }
}

const mysql = require('mysql2/promise');

async function resetDemoDatabase() {
    console.log('=====================================================');
    console.log('   JLIN Motorparts — Instant Demo Database Reset     ');
    console.log('=====================================================\n');

    const dumpFile = path.join(__dirname, '..', 'jlin_demo_clean.sql');
    if (!fs.existsSync(dumpFile)) {
        console.error(`❌ Snapshot file not found: ${dumpFile}`);
        console.error('Run npm run snapshot or snapshot.bat first to generate a baseline snapshot.');
        process.exit(1);
    }

    const host = process.env.DB_HOST || 'localhost';
    const port = process.env.DB_PORT || '3306';
    const user = process.env.DB_USER || 'root';
    const password = process.env.DB_PASSWORD || '';
    const dbName = process.env.DB_NAME || 'jlin_inventory_db';

    console.log(`Target Database: ${dbName} on ${host}:${port} (User: ${user})`);
    console.log(`Snapshot Source: ${dumpFile}`);
    console.log('\nRestoring baseline snapshot...');

    // Method 1: Try XAMPP / system mysql client CLI for lightning-fast restore
    const mysqlPaths = [
        'C:\\xampp\\mysql\\bin\\mysql.exe',
        'mysql'
    ];
    let mysqlBin = null;
    for (const bin of mysqlPaths) {
        if (bin === 'mysql' || fs.existsSync(bin)) {
            try {
                execSync(`"${bin}" --version`, { stdio: 'ignore' });
                mysqlBin = bin;
                break;
            } catch (e) {
                // Ignore and try next
            }
        }
    }

    if (mysqlBin) {
        try {
            console.log(`Using MySQL CLI binary: ${mysqlBin}`);
            const passArg = password ? `-p"${password}"` : '';
            const cmd = `"${mysqlBin}" -h ${host} -P ${port} -u ${user} ${passArg} --default-character-set=utf8mb4 < "${dumpFile}"`;
            execSync(cmd, { shell: 'cmd.exe', stdio: 'inherit' });
            console.log('✓ Snapshot restored cleanly via MySQL client.');
        } catch (cliErr) {
            console.warn(`CLI restore had a notice, falling back to node stream restore: ${cliErr.message}`);
            await fallbackNodeRestore(host, port, user, password, dumpFile);
        }
    } else {
        await fallbackNodeRestore(host, port, user, password, dumpFile);
    }

    // Verification
    console.log('\nVerifying restored database state...');
    const connection = await mysql.createConnection({
        host,
        port: parseInt(port, 10),
        user,
        password,
        database: dbName
    });

    const [prodCount] = await connection.query('SELECT COUNT(*) as count FROM products');
    const [txCount] = await connection.query('SELECT COUNT(*) as count FROM inventory_transactions');
    const [compatCount] = await connection.query('SELECT COUNT(*) as count FROM product_compatibilities');
    const [userCount] = await connection.query('SELECT COUNT(*) as count FROM users');

    console.log(`  * Products:               ${prodCount[0].count} items`);
    console.log(`  * Inventory Transactions: ${txCount[0].count} ledger rows`);
    console.log(`  * Compatibilities:        ${compatCount[0].count} matrix entries`);
    console.log(`  * System Users:           ${userCount[0].count} accounts`);

    await connection.end();

    console.log('\n=====================================================');
    console.log(' ✅ DATABASE RESET COMPLETE: Ready for Defense Demo!  ');
    console.log('=====================================================\n');
}

async function fallbackNodeRestore(host, port, user, password, dumpFile) {
    const connection = await mysql.createConnection({
        host,
        port: parseInt(port, 10),
        user,
        password,
        multipleStatements: true
    });
    const sqlContent = fs.readFileSync(dumpFile, 'utf8');
    await connection.query(sqlContent);
    await connection.end();
    console.log('✓ Snapshot restored via Node.js connection.');
}

if (require.main === module) {
    resetDemoDatabase()
        .then(() => process.exit(0))
        .catch(err => {
            console.error('❌ Reset failed:', err);
            process.exit(1);
        });
}

module.exports = resetDemoDatabase;
