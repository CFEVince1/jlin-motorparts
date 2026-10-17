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

    // Security: Pass password strictly via environment variable MYSQL_PWD.
    const env = { ...process.env };
    if (password) {
        env.MYSQL_PWD = password;
    }
    const cmd = `"${dumpBin}" -h ${host} -P ${port} -u ${user} --default-character-set=utf8mb4 --routines --triggers --databases ${dbName} > "${dumpFile}"`;

    try {
        execSync(cmd, { shell: 'cmd.exe', env, stdio: 'inherit' });
        console.log('\n✓ mysqldump completed.');

        console.log('Sanitizing snapshot for credentials, DEFINERs, and cloud portability...');
        let content = fs.readFileSync(dumpFile, 'utf8');

        // 1. Remove DEFINER comments on triggers & views
        content = content.replace(/\/\*!50017\s+DEFINER=`[^`]+`@`[^`]+`\*\/\s*/g, '');
        content = content.replace(/\/\*!50013\s+DEFINER=`[^`]+`@`[^`]+`\s+SQL\s+SECURITY\s+DEFINER\s*\*\/\r?\n/g, '');
        content = content.replace(/DEFINER=`[^`]+`@`[^`]+`/g, '');

        // 2. Remove users INSERT statement (leaving table empty in snapshot)
        content = content.replace(/INSERT INTO `users` VALUES [^\r\n]+;\r?\n/, '');

        // 3. Sanitize any oversized test tendered amount
        content = content.replace(
            "(3,2,7500.00,99999999.99,99999999.99,'Cash'",
            "(3,2,7500.00,8000.00,500.00,'Cash'"
        );

        // 4. Sanitize product 4 details if present
        content = content.replace(
            "(4,'0A123D21','0A123D21','block','jvt','engine','66mm','172.mm'",
            "(4,'0A123D21','0A123D21','Cylinder Block Kit 66mm','JVT','Engine','66mm','172mm'"
        );
        content = content.replace(
            "Baseline OPENING_BALANCE for pre-existing product: block (0A123D21)",
            "Baseline OPENING_BALANCE for pre-existing product: Cylinder Block Kit 66mm (0A123D21)"
        );
        content = content.replace(
            /(4,'0A123D21',)'block','jvt'/g,
            "$1'Cylinder Block Kit 66mm','JVT'"
        );

        fs.writeFileSync(dumpFile, content, 'utf8');
        console.log('✓ Snapshot sanitized successfully at: ' + dumpFile);
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
