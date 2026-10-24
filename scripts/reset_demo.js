const path = require('path');
const fs = require('fs');
const readline = require('readline');
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

const bcrypt = require('bcryptjs');

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
const { getSslConfig } = require('../backend/config/db');
const ensureSchema = require('../backend/utils/ensureSchema');

function askConfirmation(promptText) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        rl.question(promptText, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

function parseDumpStatements(sqlContent) {
    const statements = [];
    let currentDelimiter = ';';
    let currentBuffer = [];

    const lines = sqlContent.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Check for DELIMITER change directive (e.g. DELIMITER ;; or DELIMITER ;)
        const delimMatch = trimmed.match(/^DELIMITER\s+(\S+)$/i);
        if (delimMatch) {
            currentDelimiter = delimMatch[1];
            continue;
        }

        // Skip pure comment lines when not accumulating inside a statement buffer
        if (currentBuffer.length === 0 && (trimmed.startsWith('--') || (trimmed.startsWith('/*') && trimmed.endsWith('*/;')) || trimmed === '')) {
            if (!trimmed.startsWith('/*!50003')) {
                continue;
            }
        }

        currentBuffer.push(line);

        // Check if line ends with current active delimiter
        if (trimmed.endsWith(currentDelimiter)) {
            let stmt = currentBuffer.join('\n').trim();
            // Strip trailing delimiter
            stmt = stmt.slice(0, stmt.length - currentDelimiter.length).trim();
            if (stmt.length > 0) {
                statements.push(stmt);
            }
            currentBuffer = [];
        }
    }

    if (currentBuffer.length > 0) {
        const stmt = currentBuffer.join('\n').trim();
        if (stmt.length > 0) {
            statements.push(stmt);
        }
    }

    return statements;
}

async function fallbackNodeRestore(host, port, user, password, dumpFile, dbName) {
    console.log('[Fallback] Starting robust Node.js SQL dump restore with trigger parsing...');
    const connection = await mysql.createConnection({
        host,
        port: parseInt(port, 10),
        user,
        password,
        multipleStatements: true,
        ...getSslConfig(host)
    });

    try {
        // Ensure database exists and is selected
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;`);
        await connection.query(`USE \`${dbName}\`;`);

        // Disable foreign keys and unique checks during bulk restoration
        await connection.query('SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0;');
        await connection.query('SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0;');
        await connection.query('SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE="NO_AUTO_VALUE_ON_ZERO";');

        let sqlContent = fs.readFileSync(dumpFile, 'utf8');
        // Strip DEFINER clauses for universal compatibility (local root@localhost vs cloud avnadmin)
        sqlContent = sqlContent
            .replace(/\/\*!50017\s+DEFINER=`[^`]+`@`[^`]+`\*\/\s*/g, '')
            .replace(/\/\*!50013\s+DEFINER=`[^`]+`@`[^`]+`\s+SQL\s+SECURITY\s+DEFINER\s*\*\/\r?\n/g, '')
            .replace(/DEFINER=`[^`]+`@`[^`]+`/g, '');

        const statements = parseDumpStatements(sqlContent);
        console.log(`[Fallback] Parsed ${statements.length} SQL statements (including trigger blocks).`);

        let executedCount = 0;
        let triggerCount = 0;

        for (const rawStmt of statements) {
            let stmt = rawStmt.trim();
            if (!stmt) continue;

            // Adapt hardcoded CREATE DATABASE / USE to target dbName
            if (/^CREATE DATABASE/i.test(stmt)) {
                stmt = `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;`;
            } else if (/^USE\s+/i.test(stmt)) {
                stmt = `USE \`${dbName}\`;`;
            }

            try {
                await connection.query(stmt);
                executedCount++;
                if (stmt.includes('TRIGGER')) {
                    triggerCount++;
                }
            } catch (err) {
                if (err.code === 'ER_TABLE_EXISTS_ERROR' || err.code === 'ER_TRG_ALREADY_EXISTS') {
                    // Safe to continue
                } else {
                    console.error(`[Fallback] Error executing statement #${executedCount}:`, stmt.slice(0, 150));
                    throw err;
                }
            }
        }

        // Restore session checks
        await connection.query('SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS;');
        await connection.query('SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS;');
        await connection.query('SET SQL_MODE=@OLD_SQL_MODE;');

        console.log(`✓ Snapshot restored via Node.js connection (${executedCount} statements, ${triggerCount} triggers executed).`);
    } finally {
        await connection.end();
    }
}

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

    const host = (process.env.DB_HOST || 'localhost').trim();
    const port = process.env.DB_PORT || '3306';
    const user = process.env.DB_USER || 'root';
    const password = process.env.DB_PASSWORD || '';
    const dbName = (process.env.DB_NAME || 'jlin_inventory_db').trim();

    const normalizedHost = host.toLowerCase();
    const isLocal = ['localhost', '127.0.0.1'].includes(normalizedHost);

    // Strict safety guard: Refuse to execute unless DB host is explicitly localhost or 127.0.0.1
    if (!isLocal) {
        console.error('⛔ =====================================================');
        console.error(`⛔ SAFETY REFUSAL: Target database host is remote ('${host}').`);
        console.error('reset_demo.js is strictly restricted to localhost or 127.0.0.1.');
        console.error('Remote execution is unconditionally disabled to protect production data.');
        console.error('⛔ =====================================================\n');
        process.exit(1);
    }

    console.log(`Target Database: ${dbName} on ${host}:${port} (User: ${user})`);
    console.log(`Snapshot Source: ${dumpFile}`);

    // Pre-check: Backup existing user accounts before wiping/restoring tables
    let cachedUsers = [];
    try {
        const preCheckConn = await mysql.createConnection({
            host,
            port: parseInt(port, 10),
            user,
            password,
            database: dbName,
            ...getSslConfig(host)
        });
        const [existingUsers] = await preCheckConn.query('SELECT * FROM users ORDER BY id ASC');
        if (Array.isArray(existingUsers) && existingUsers.length > 0) {
            cachedUsers = existingUsers;
            console.log(`[Backup] Preserving ${cachedUsers.length} existing user account(s) across reset.`);
        }
        await preCheckConn.end();
    } catch (e) {
        // Database or table may not exist yet on fresh setup; continue
    }

    console.log('\nRestoring baseline snapshot...');

    // Method 1: Try XAMPP / system mysql client CLI for fast restore
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

    let restoreSucceeded = false;

    if (mysqlBin) {
        try {
            console.log(`Using MySQL CLI binary: ${mysqlBin}`);
            // Security: Pass password strictly via environment variable MYSQL_PWD.
            // Never interpolate password into command-line arguments to prevent exposure in process tables or CLI warnings.
            const env = { ...process.env };
            if (password) {
                env.MYSQL_PWD = password;
            }
            const dumpSql = fs.readFileSync(dumpFile, 'utf8');
            execSync(`"${mysqlBin}" -h ${host} -P ${port} -u ${user} --default-character-set=utf8mb4`, {
                input: dumpSql,
                env,
                stdio: ['pipe', 'inherit', 'inherit']
            });
            console.log('✓ Snapshot restored cleanly via MySQL client.');
            restoreSucceeded = true;
        } catch (cliErr) {
            console.warn(`CLI restore had a notice/error, falling back to Node.js stream restore: ${cliErr.message}`);
        }
    }

    if (!restoreSucceeded) {
        await fallbackNodeRestore(host, port, user, password, dumpFile, dbName);
    }

    // Comprehensive Verification & Ledger Totals Invariant Check
    console.log('\nVerifying restored database state & ledger totals...');
    const connection = await mysql.createConnection({
        host,
        port: parseInt(port, 10),
        user,
        password,
        database: dbName,
        ...getSslConfig(host)
    });

    try {
        // Ensure legacy product_compatibility is permanently retired
        await connection.query('DROP TABLE IF EXISTS product_compatibility;');

        // Restore or dynamically provision user accounts
        if (cachedUsers.length > 0) {
            console.log(`[Users] Restoring ${cachedUsers.length} preserved user accounts...`);
            for (const u of cachedUsers) {
                await connection.query(`
                    INSERT INTO users (id, username, password, role, token_version, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        password = VALUES(password),
                        role = VALUES(role),
                        token_version = VALUES(token_version),
                        updated_at = VALUES(updated_at)
                `, [u.id, u.username, u.password, u.role, u.token_version || 1, u.created_at || new Date(), u.updated_at || new Date()]);
            }
            // Ensure foreign key targets user_id 1 and 2 exist
            const restoredIds = cachedUsers.map(u => u.id);
            if (!restoredIds.includes(1)) {
                const adminPass = process.env.INITIAL_ADMIN_PASSWORD || 'admin123';
                const adminHash = await bcrypt.hash(adminPass, 10);
                await connection.query(`INSERT INTO users (id, username, password, role) VALUES (1, 'admin', ?, 'admin') ON DUPLICATE KEY UPDATE id=id`, [adminHash]);
            }
            if (!restoredIds.includes(2)) {
                const staffPass = process.env.INITIAL_STAFF_PASSWORD || 'staff123';
                const staffHash = await bcrypt.hash(staffPass, 10);
                await connection.query(`INSERT INTO users (id, username, password, role) VALUES (2, 'staff', ?, 'staff') ON DUPLICATE KEY UPDATE id=id`, [staffHash]);
            }
            console.log('✓ Preserved user accounts restored.');
        } else {
            console.log('[Users] No existing users found. Seeding initial accounts dynamically...');
            const adminPass = process.env.INITIAL_ADMIN_PASSWORD || 'admin123';
            const staffPass = process.env.INITIAL_STAFF_PASSWORD || 'staff123';
            const adminHash = await bcrypt.hash(adminPass, 10);
            const staffHash = await bcrypt.hash(staffPass, 10);
            await connection.query(`
                INSERT INTO users (id, username, password, role, token_version)
                VALUES 
                (1, 'admin', ?, 'admin', 1),
                (2, 'staff', ?, 'staff', 1)
                ON DUPLICATE KEY UPDATE password = VALUES(password)
            `, [adminHash, staffHash]);
            console.log('✓ Initial user accounts dynamically provisioned (admin id=1, staff id=2).');
        }

        const [prodCount] = await connection.query('SELECT COUNT(*) as count FROM products WHERE is_active = TRUE');
        const [txCount] = await connection.query('SELECT COUNT(*) as count FROM inventory_transactions');
        const [compatCount] = await connection.query('SELECT COUNT(*) as count FROM product_compatibilities');
        const [userCount] = await connection.query('SELECT COUNT(*) as count FROM users');

        console.log(`  * Active Products:        ${prodCount[0].count} items`);
        console.log(`  * Inventory Transactions: ${txCount[0].count} ledger rows`);
        console.log(`  * Compatibilities:        ${compatCount[0].count} matrix entries`);
        console.log(`  * System Users:           ${userCount[0].count} accounts`);

        // Ensure all application schema migrations and serial lot invariant columns exist
        await ensureSchema();

        // Ensure serial lot columns and invariant baseline exist
        const [psCols] = await connection.query("SHOW COLUMNS FROM product_serials LIKE 'quantity'");
        if (psCols.length === 0) {
            await connection.query("ALTER TABLE product_serials ADD COLUMN quantity INT NOT NULL DEFAULT 1 AFTER serial_number");
            await connection.query("UPDATE product_serials SET quantity = 0, status = 'sold' WHERE product_id = 3 AND serial_number IN ('ECU001', 'ECU002', 'ECU003')");
            const [ecu4] = await connection.query("SELECT id FROM product_serials WHERE product_id = 3 AND serial_number = 'ECU004'");
            if (ecu4.length === 0) {
                await connection.query("INSERT INTO product_serials (product_id, serial_number, quantity, status, created_at) VALUES (3, 'ECU004', 1, 'available', NOW())");
            }
            await connection.query("UPDATE product_serials SET quantity = 1, status = 'available' WHERE product_id = 113 AND serial_number IN ('RS8-66839-1', 'RS8-66839-2')");
            await connection.query("UPDATE product_serials SET quantity = 1, status = 'available' WHERE product_id = 114 AND serial_number IN ('JVT-26491', 'JVT-33240')");
            await connection.query("DELETE FROM product_serials WHERE product_id = 114 AND serial_number = 'LEG-0100-003' AND id NOT IN (SELECT serial_id FROM sale_item_serials)");
        }

        const [sisCols] = await connection.query("SHOW COLUMNS FROM sale_item_serials LIKE 'quantity'");
        if (sisCols.length === 0) {
            await connection.query("ALTER TABLE sale_item_serials ADD COLUMN quantity INT NOT NULL DEFAULT 1 AFTER serial_id");
        }

        const [itCols] = await connection.query("SHOW COLUMNS FROM inventory_transactions LIKE 'serial_id'");
        if (itCols.length === 0) {
            await connection.query("ALTER TABLE inventory_transactions ADD COLUMN serial_id INT NULL DEFAULT NULL AFTER product_id, ADD INDEX idx_it_serial_id (serial_id)");
        }

        // 1. Verify Triggers Exist and are Active
        const [triggers] = await connection.query(`
            SELECT TRIGGER_NAME FROM INFORMATION_SCHEMA.TRIGGERS 
            WHERE TRIGGER_SCHEMA = ? AND TRIGGER_NAME IN (
                'trg_block_inventory_transactions_update',
                'trg_block_inventory_transactions_delete',
                'trg_sync_products_insert',
                'trg_sync_products_update'
            )
        `, [dbName]);
        const triggerNames = triggers.map(t => t.TRIGGER_NAME);
        console.log(`  * Active Triggers:        ${triggerNames.length} / 4 verified (${triggerNames.join(', ')})`);
        if (triggerNames.length < 4) {
            throw new Error(`Restore failed trigger verification: expected 4 triggers, found ${triggerNames.length} (${triggerNames.join(', ')})`);
        }

        // 2. Verify Ledger Totals: SUM(quantity_change) == products.stock for every active product
        const [mismatches] = await connection.query(`
            SELECT p.id, p.part_number, p.stock, COALESCE(SUM(t.quantity_change), 0) AS ledger_sum
            FROM products p
            LEFT JOIN inventory_transactions t ON p.id = t.product_id
            WHERE p.is_active = TRUE
            GROUP BY p.id, p.part_number, p.stock
            HAVING p.stock != ledger_sum
        `);

        if (mismatches.length > 0) {
            console.error('❌ LEDGER MISMATCH DETECTED:', mismatches);
            throw new Error(`Restore failed ledger verification: ${mismatches.length} products have stock != sum(quantity_change)`);
        }

        // 3. Verify Latest balance_after == stock for every active product
        const [balanceMismatches] = await connection.query(`
            SELECT p.id, p.part_number, p.stock, t.balance_after
            FROM products p
            LEFT JOIN (
                SELECT t1.product_id, t1.balance_after
                FROM inventory_transactions t1
                INNER JOIN (
                    SELECT product_id, MAX(id) as max_id
                    FROM inventory_transactions
                    GROUP BY product_id
                ) t2 ON t1.id = t2.max_id
            ) t ON p.id = t.product_id
            WHERE p.is_active = TRUE AND (t.balance_after IS NULL OR p.stock != t.balance_after)
        `);

        if (balanceMismatches.length > 0) {
            console.error('❌ LEDGER BALANCE_AFTER MISMATCH DETECTED:', balanceMismatches);
            throw new Error(`Restore failed ledger verification: ${balanceMismatches.length} products have stock != latest balance_after`);
        }

        // 4. Overall Totals: Total Product Stock == Total Ledger Quantity Change
        const [totals] = await connection.query(`
            SELECT 
                COALESCE(SUM(p.stock), 0) AS total_product_stock,
                (SELECT COALESCE(SUM(quantity_change), 0) FROM inventory_transactions) AS total_ledger_units
            FROM products p WHERE p.is_active = TRUE
        `);
        const totalStock = Number(totals[0].total_product_stock);
        const totalLedger = Number(totals[0].total_ledger_units);
        console.log(`  * Stock vs Ledger Units:  ${totalStock} in products == ${totalLedger} in ledger (Exact Match ✓)`);

        if (totalStock !== totalLedger) {
            throw new Error(`Restore failed overall ledger verification: total stock (${totalStock}) != total ledger units (${totalLedger})`);
        }

        // 5. Verify Serial Lots Invariant: Every serialized product's stock must strictly equal sum of available serial quantities
        const [serializedMismatches] = await connection.query(`
            SELECT p.id, p.part_number, p.name, p.stock,
                   COALESCE(SUM(CASE WHEN ps.status = 'available' OR ps.status IS NULL THEN ps.quantity ELSE 0 END), 0) AS serial_sum
            FROM products p
            LEFT JOIN product_serials ps ON p.id = ps.product_id
            WHERE p.is_serialized = 1 AND p.is_active = 1
            GROUP BY p.id, p.part_number, p.name, p.stock
            HAVING p.stock != serial_sum
        `);

        if (serializedMismatches.length > 0) {
            console.error('❌ SERIAL QUANTITY VS STOCK MISMATCH DETECTED IN RESET:', serializedMismatches);
            throw new Error(`Reset failed serial invariant check: ${serializedMismatches.length} serialized products have stock != sum of available serial quantities!`);
        }
        console.log(`  * Serial Quantities vs Stock: All ${prodCount[0].count} products verified (Serial Invariant Match ✓)`);

    } finally {
        await connection.end();
    }

    console.log('\n=====================================================');
    console.log(' ✅ DATABASE RESET COMPLETE: Ready for Defense Demo!  ');
    console.log('=====================================================\n');
}

if (require.main === module) {
    resetDemoDatabase()
        .then(() => process.exit(0))
        .catch(err => {
            console.error('❌ Reset failed:', err);
            process.exit(1);
        });
}

module.exports = { resetDemoDatabase, fallbackNodeRestore, parseDumpStatements };
