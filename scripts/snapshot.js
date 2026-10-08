const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

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

async function takeSnapshot() {
    console.log('=====================================================');
    console.log('   JLIN Motorparts — Capturing Database Snapshot     ');
    console.log('=====================================================\n');

    const dumpFile = path.join(__dirname, '..', 'jlin_demo_clean.sql');
    const host = process.env.DB_HOST || 'localhost';
    const port = process.env.DB_PORT || '3306';
    const user = process.env.DB_USER || 'root';
    const password = process.env.DB_PASSWORD || '';
    const dbName = process.env.DB_NAME || 'jlin_inventory_db';

    console.log(`Source Database: ${dbName} on ${host}:${port} (User: ${user})`);
    console.log(`Target Snapshot: ${dumpFile}`);

    const mysqldumpPaths = [
        'C:\\xampp\\mysql\\bin\\mysqldump.exe',
        'mysqldump'
    ];
    let dumpBin = null;
    for (const bin of mysqldumpPaths) {
        if (bin === 'mysqldump' || fs.existsSync(bin)) {
            try {
                execSync(`"${bin}" --version`, { stdio: 'ignore' });
                dumpBin = bin;
                break;
            } catch (e) {
                // Ignore
            }
        }
    }

    if (!dumpBin) {
        console.error('❌ mysqldump executable not found in PATH or C:\\xampp\\mysql\\bin.');
        process.exit(1);
    }

    const passArg = password ? `-p"${password}"` : '';
    const cmd = `"${dumpBin}" -h ${host} -P ${port} -u ${user} ${passArg} --default-character-set=utf8mb4 --routines --triggers --databases ${dbName} > "${dumpFile}"`;

    try {
        execSync(cmd, { shell: 'cmd.exe', stdio: 'inherit' });
        console.log('\n✓ Snapshot captured successfully at: ' + dumpFile);
        console.log('=====================================================\n');
    } catch (err) {
        console.error('❌ Failed to capture snapshot:', err.message);
        process.exit(1);
    }
}

if (require.main === module) {
    takeSnapshot();
}

module.exports = takeSnapshot;
