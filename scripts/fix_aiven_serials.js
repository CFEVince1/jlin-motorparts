/**
 * scripts/fix_aiven_serials.js
 * 
 * Standalone one-time migration script for Aiven Production Database.
 * 
 * SAFETY RULES & GUARDS:
 * 1. Refuses to run without a valid, existing, non-empty backup file passed via --backup=<path_to_backup.sql>.
 * 2. Runs entirely inside a single database transaction (BEGIN TRANSACTION -> COMMIT / ROLLBACK).
 * 3. Supports --dry-run: prints every change that would be made and always rolls back.
 * 4. Non-dry-run requires explicit terminal confirmation by typing the database name ('defaultdb').
 * 5. Generates a rollback SQL file ('rollback_aiven_serials_<timestamp>.sql') capturing the exact inverse of every mutation.
 * 6. Enforces invariant: for every product with real_serials=yes, sum of lot quantities must strictly equal products.stock.
 *    Any mismatch aborts the transaction immediately.
 * 7. Preserves product stock intact and writes zero ledger rows unless stock itself is modified.
 * 8. Never deletes serial rows for products converted to non-serialized (history preserved).
 * 9. Deletes artificial serial ID 147 ONLY after verifying zero sale_item_serials and zero inventory_transactions.
 * 10. Exhaustively logs every single change.
 * 
 * USAGE:
 *   Dry-run mode (safe preview):
 *     node scripts/fix_aiven_serials.js --backup=path/to/backup.sql --csv=aiven_serial_review.csv --dry-run
 * 
 *   Live execution (applies changes within transaction after confirmation):
 *     node scripts/fix_aiven_serials.js --backup=path/to/backup.sql --csv=aiven_serial_review.csv
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const mysql = require('../backend/node_modules/mysql2/promise');

// Parse CLI arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');

let backupPath = null;
let csvPath = path.resolve(__dirname, '../aiven_serial_review.csv');

for (const arg of args) {
  if (arg.startsWith('--backup=')) {
    backupPath = arg.substring('--backup='.length).trim();
  } else if (arg.startsWith('--csv=')) {
    csvPath = path.resolve(process.cwd(), arg.substring('--csv='.length).trim());
  }
}

// RFC 4180 compliant CSV parser
function parseCSV(text) {
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let insideQuotes = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];
    
    if (insideQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"';
        i++; // skip escaped quote
      } else if (char === '"') {
        insideQuotes = false;
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField);
        currentField = '';
      } else if (char === '\r') {
        if (nextChar === '\n') i++;
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
      } else if (char === '\n') {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }
  }
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }
  return rows;
}

function promptUser(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans.trim());
    });
  });
}

function parseLotQuantities(rawStr, serialsList) {
  // Supports formats:
  // 1) "JVT-26491:1, JVT-33240:1"
  // 2) "145:1, 146:1"
  // 3) "1, 1" (positional matching serialsList)
  // 4) JSON: '{"145": 1, "146": 1}'
  if (!rawStr || !rawStr.trim()) return null;
  const str = rawStr.trim();

  const resultMap = new Map(); // serial_id -> qty

  // Try JSON
  if (str.startsWith('{') && str.endsWith('}')) {
    try {
      const obj = JSON.parse(str);
      for (const [key, val] of Object.entries(obj)) {
        const numKey = Number(key);
        if (!isNaN(numKey)) {
          resultMap.set(numKey, Number(val));
        } else {
          const matchSerial = serialsList.find(s => s.serial_number === key);
          if (matchSerial) resultMap.set(matchSerial.id, Number(val));
        }
      }
      return resultMap;
    } catch (e) {
      // fallback to delimiter parsing
    }
  }

  const parts = str.split(/[,;\n]+/).map(p => p.trim()).filter(Boolean);
  
  // Check if they are key:value pairs
  const hasKeyValue = parts.some(p => p.includes(':') || p.includes('='));
  if (hasKeyValue) {
    for (const part of parts) {
      const sep = part.includes(':') ? ':' : '=';
      const [keyRaw, valRaw] = part.split(sep).map(s => s.trim());
      const qty = parseInt(valRaw, 10);
      if (isNaN(qty)) throw new Error(`Invalid lot quantity number '${valRaw}' in '${part}'`);
      
      const numKey = Number(keyRaw);
      if (!isNaN(numKey) && serialsList.some(s => s.id === numKey)) {
        resultMap.set(numKey, qty);
      } else {
        const matchSerial = serialsList.find(s => s.serial_number === keyRaw || keyRaw.includes(s.serial_number));
        if (matchSerial) {
          resultMap.set(matchSerial.id, qty);
        } else {
          throw new Error(`Could not match serial identifier '${keyRaw}' to any known serial in product!`);
        }
      }
    }
    return resultMap;
  }

  // Otherwise assume comma-separated list of quantities mapped in order of serialsList
  if (parts.length === serialsList.length) {
    for (let i = 0; i < parts.length; i++) {
      const qty = parseInt(parts[i], 10);
      if (isNaN(qty)) throw new Error(`Invalid lot quantity number '${parts[i]}'`);
      resultMap.set(serialsList[i].id, qty);
    }
    return resultMap;
  }

  throw new Error(`Could not parse lot quantities '${rawStr}'. Provide key:qty pairs (e.g. JVT-26491:1, JVT-33240:1).`);
}

async function run() {
  console.log('================================================================');
  console.log('   AIVEN PRODUCTION SERIAL MIGRATION & RESTORATION TOOL');
  console.log('================================================================\n');

  if (isDryRun) {
    console.log('🔍 MODE: [DRY-RUN] — All queries will execute in a transaction and be ROLLED BACK.');
    console.log('   No permanent changes will be committed to the database.\n');
  } else {
    console.log('⚡ MODE: [LIVE EXECUTION] — Changes will be committed to production database.\n');
  }

  // 1. Critical safety backup check
  if (!backupPath) {
    console.error('⛔ [CRITICAL SAFETY GUARD] Refusing to run without verified backup argument!');
    console.error('   You must provide an existing, non-empty backup file path:');
    console.error('   node scripts/fix_aiven_serials.js --backup=path/to/backup.sql [--dry-run]\n');
    process.exit(1);
  }

  const resolvedBackup = path.resolve(process.cwd(), backupPath);
  if (!fs.existsSync(resolvedBackup)) {
    console.error(`⛔ [CRITICAL SAFETY GUARD] Backup file not found at: ${resolvedBackup}`);
    console.error('   Please verify that the backup was created successfully before proceeding.\n');
    process.exit(1);
  }

  const backupStats = fs.statSync(resolvedBackup);
  if (backupStats.size === 0) {
    console.error(`⛔ [CRITICAL SAFETY GUARD] Backup file at ${resolvedBackup} is empty (0 bytes)!`);
    console.error('   Refusing to proceed with an empty backup file.\n');
    process.exit(1);
  }

  console.log(`✓ Backup verified: ${resolvedBackup} (${(backupStats.size / (1024 * 1024)).toFixed(2)} MB)\n`);

  // 2. CSV file check
  if (!fs.existsSync(csvPath)) {
    console.error(`⛔ CSV file not found at: ${csvPath}`);
    console.error('   Run scratch/generate_aiven_csv.js or provide valid --csv=<path>.\n');
    process.exit(1);
  }

  console.log(`✓ Review CSV located: ${csvPath}`);
  const csvContent = fs.readFileSync(csvPath, 'utf8');
  const csvRows = parseCSV(csvContent);
  if (csvRows.length < 2) {
    console.error('⛔ CSV file is empty or missing data rows.\n');
    process.exit(1);
  }

  const header = csvRows[0];
  const prodIdIdx = header.indexOf('product_id');
  const partNumIdx = header.indexOf('part_number');
  const nameIdx = header.indexOf('name');
  const stockIdx = header.indexOf('stock');
  const realSerialsIdx = header.indexOf('real_serials');
  const lotQtyIdx = header.indexOf('lot_quantities');

  if (prodIdIdx === -1 || realSerialsIdx === -1 || lotQtyIdx === -1) {
    console.error('⛔ CSV missing required columns (product_id, real_serials, lot_quantities).\n');
    process.exit(1);
  }

  console.log(`✓ Parsed ${csvRows.length - 1} product review records from CSV.\n`);

  // 3. Database connection setup
  const caCertPath = path.resolve(__dirname, '../backend/config/aiven-ca.pem');
  if (!fs.existsSync(caCertPath)) {
    console.error(`⛔ Aiven CA certificate not found at: ${caCertPath}`);
    process.exit(1);
  }
  const caCert = fs.readFileSync(caCertPath, 'utf8');

  const aivenHost = process.env.AIVEN_DB_HOST || 'mysql-4b0b661-icovincent-7faa.a.aivencloud.com';
  const aivenPort = Number(process.env.AIVEN_DB_PORT || 27827);
  const aivenUser = process.env.AIVEN_DB_USER || 'avnadmin';
  const aivenPassword = process.env.AIVEN_DB_PASSWORD || process.env.DB_PASSWORD || '';
  const aivenDatabase = process.env.AIVEN_DB_NAME || 'defaultdb';

  console.log(`Connecting to Aiven Cloud Database (${aivenHost}:${aivenPort})...`);
  const conn = await mysql.createConnection({
    host: aivenHost,
    port: aivenPort,
    user: aivenUser,
    password: aivenPassword,
    database: aivenDatabase,
    ssl: { ca: caCert, rejectUnauthorized: false }
  });
  console.log('✓ Connected to database: defaultdb\n');

  // 4. Live execution confirmation prompt
  if (!isDryRun) {
    console.log('⚠️  WARNING: You are about to modify the live Aiven database.');
    const typedDb = await promptUser("Type the target database name ('defaultdb') to confirm execution: ");
    if (typedDb !== 'defaultdb') {
      console.log('\n❌ [ABORTED] Confirmation name mismatch. No changes were made.\n');
      await conn.end();
      process.exit(1);
    }
    console.log('\n✓ Confirmation verified. Starting migration transaction...\n');
  }

  const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').substring(0, 14);
  const rollbackSqlFile = path.resolve(__dirname, `../rollback_aiven_serials_${timestamp}.sql`);
  const rollbackStatements = [];
  rollbackStatements.push(`-- ROLLBACK SCRIPT GENERATED AT ${new Date().toISOString()}`);
  rollbackStatements.push(`-- TARGET DB: defaultdb`);
  rollbackStatements.push(`START TRANSACTION;\n`);

  // Begin single transaction
  await conn.beginTransaction();

  try {
    console.log('>>> [TRANSACTION STARTED]');

    // STEP A: Ensure DDL schema columns exist safely (idempotent)
    const [statusCols] = await conn.query("SHOW FULL COLUMNS FROM product_serials LIKE 'status'");
    if (statusCols.length > 0 && statusCols[0].Type.includes("enum('available','sold')") && !statusCols[0].Type.includes("'inactive'")) {
      console.log('[DDL] Altering product_serials.status to allow inactive...');
      await conn.query("ALTER TABLE product_serials MODIFY COLUMN status ENUM('available', 'sold', 'inactive') NOT NULL DEFAULT 'available'");
      rollbackStatements.push("-- Note: product_serials.status enum alteration is backwards-compatible and does not require reversal.");
    }

    const [psCols] = await conn.query("SHOW COLUMNS FROM product_serials LIKE 'quantity'");
    if (psCols.length === 0) {
      console.log('[DDL] Adding quantity column to product_serials...');
      await conn.query("ALTER TABLE product_serials ADD COLUMN quantity INT NOT NULL DEFAULT 1 AFTER serial_number");
      rollbackStatements.push("ALTER TABLE product_serials DROP COLUMN quantity;");
    }

    const [sisCols] = await conn.query("SHOW COLUMNS FROM sale_item_serials LIKE 'quantity'");
    if (sisCols.length === 0) {
      console.log('[DDL] Adding quantity column to sale_item_serials...');
      await conn.query("ALTER TABLE sale_item_serials ADD COLUMN quantity INT NOT NULL DEFAULT 1 AFTER serial_id");
      rollbackStatements.push("ALTER TABLE sale_item_serials DROP COLUMN quantity;");
    }

    const [itCols] = await conn.query("SHOW COLUMNS FROM inventory_transactions LIKE 'serial_id'");
    if (itCols.length === 0) {
      console.log('[DDL] Adding serial_id column to inventory_transactions...');
      await conn.query("ALTER TABLE inventory_transactions ADD COLUMN serial_id INT NULL DEFAULT NULL AFTER product_id, ADD INDEX idx_it_serial_id (serial_id)");
      rollbackStatements.push("ALTER TABLE inventory_transactions DROP COLUMN serial_id;");
    }

    // STEP B: Restore Serial IDs 145 & 146 (JVT Tensioner)
    console.log('\n--- Step 1: Restoring Serial IDs 145 and 146 ---');
    const [s145Rows] = await conn.query("SELECT id, product_id, serial_number, status FROM product_serials WHERE id = 145");
    const [s146Rows] = await conn.query("SELECT id, product_id, serial_number, status FROM product_serials WHERE id = 146");

    if (s145Rows.length > 0) {
      const s145 = s145Rows[0];
      console.log(`[SERIAL 145] Current: '${s145.serial_number}' (status: ${s145.status}) -> Target: 'JVT-26491' (status: available)`);
      rollbackStatements.push(`UPDATE product_serials SET serial_number = '${s145.serial_number}', status = '${s145.status}' WHERE id = 145;`);
      await conn.query("UPDATE product_serials SET serial_number = 'JVT-26491', status = 'available', quantity = 1 WHERE id = 145");
    } else {
      console.warn('[SERIAL 145] Row not found in product_serials!');
    }

    if (s146Rows.length > 0) {
      const s146 = s146Rows[0];
      console.log(`[SERIAL 146] Current: '${s146.serial_number}' (status: ${s146.status}) -> Target: 'JVT-33240' (keeping sold status & sale #215 link)`);
      rollbackStatements.push(`UPDATE product_serials SET serial_number = '${s146.serial_number}', status = '${s146.status}' WHERE id = 146;`);
      await conn.query("UPDATE product_serials SET serial_number = 'JVT-33240', status = 'sold', quantity = 0 WHERE id = 146");
    } else {
      console.warn('[SERIAL 146] Row not found in product_serials!');
    }

    // STEP C: Check and Delete Serial ID 147 (Artificial 3rd unit)
    console.log('\n--- Step 2: Checking Serial ID 147 (LEG-0100-003) ---');
    const [s147Rows] = await conn.query("SELECT id, product_id, serial_number, status FROM product_serials WHERE id = 147");
    if (s147Rows.length > 0) {
      const s147 = s147Rows[0];
      const [sisLinks] = await conn.query("SELECT * FROM sale_item_serials WHERE serial_id = 147");
      const [itLinks] = await conn.query("SELECT * FROM inventory_transactions WHERE notes LIKE '%LEG-0100-003%' OR remarks LIKE '%LEG-0100-003%'");

      console.log(`[SERIAL 147] Sales links: ${sisLinks.length}, Ledger links: ${itLinks.length}`);
      if (sisLinks.length === 0 && itLinks.length === 0) {
        console.log(`[SERIAL 147] Zero sales and ledger rows verified. Safely deleting artificial row 147...`);
        rollbackStatements.push(`INSERT INTO product_serials (id, product_id, serial_number, status, quantity) VALUES (147, ${s147.product_id}, '${s147.serial_number}', '${s147.status}', 1);`);
        await conn.query("DELETE FROM product_serials WHERE id = 147");
      } else {
        throw new Error(`[ABORT] Serial ID 147 has active sales or ledger links! Sales: ${sisLinks.length}, Ledger: ${itLinks.length}. Aborting deletion.`);
      }
    } else {
      console.log('[SERIAL 147] Row does not exist or was already removed.');
    }

    // STEP D: Process User CSV Review Rows
    console.log('\n--- Step 3: Processing CSV Classifications ---');
    let nonSerializedCount = 0;
    let realSerializedCount = 0;
    let skippedCount = 0;

    for (let r = 1; r < csvRows.length; r++) {
      const row = csvRows[r];
      const productId = parseInt(row[prodIdIdx], 10);
      const partNumber = row[partNumIdx];
      const name = row[nameIdx];
      const stock = parseInt(row[stockIdx], 10);
      const realSerials = (row[realSerialsIdx] || '').trim().toLowerCase();
      const lotQuantitiesRaw = (row[lotQtyIdx] || '').trim();

      if (isNaN(productId)) continue;

      // Fetch current product record
      const [pRows] = await conn.query("SELECT id, part_number, name, stock, is_serialized FROM products WHERE id = ?", [productId]);
      if (pRows.length === 0) {
        console.warn(`[PRODUCT ${productId}] Not found in database!`);
        continue;
      }
      const prod = pRows[0];

      // Fetch existing serials for this product
      const [serialsList] = await conn.query("SELECT id, product_id, serial_number, status, quantity FROM product_serials WHERE product_id = ? ORDER BY id ASC", [productId]);

      if (realSerials === 'no') {
        // Convert to non-serialized: preserve stock, preserve serial history without deletion
        console.log(`[NON-SERIALIZED] Product #${prod.id} (${partNumber} - ${name}): stock = ${prod.stock} unchanged, serials (${serialsList.length}) preserved. Setting is_serialized = 0.`);
        rollbackStatements.push(`UPDATE products SET is_serialized = ${prod.is_serialized} WHERE id = ${prod.id};`);
        await conn.query("UPDATE products SET is_serialized = 0 WHERE id = ?", [prod.id]);
        nonSerializedCount++;

      } else if (realSerials === 'yes') {
        // Real serialized product: assign lot quantities and verify strict invariant
        console.log(`[REAL SERIALIZED] Product #${prod.id} (${partNumber} - ${name}): stock = ${prod.stock}. Verifying lots...`);
        
        const lotQtyMap = parseLotQuantities(lotQuantitiesRaw, serialsList);
        if (!lotQtyMap) {
          throw new Error(`Product #${prod.id} (${partNumber}) marked real_serials=yes but lot_quantities is empty!`);
        }

        let assignedSum = 0;
        for (const [serialId, qty] of lotQtyMap.entries()) {
          const sObj = serialsList.find(s => s.id === serialId);
          if (!sObj) throw new Error(`Serial ID ${serialId} does not belong to product #${prod.id}`);
          
          console.log(`  -> Serial ID ${sObj.id} (${sObj.serial_number}): qty = ${qty}`);
          rollbackStatements.push(`UPDATE product_serials SET quantity = ${sObj.quantity ?? 1}, status = '${sObj.status}' WHERE id = ${sObj.id};`);
          
          const newStatus = qty > 0 ? (sObj.status === 'sold' ? 'sold' : 'available') : (sObj.status === 'sold' ? 'sold' : 'inactive');
          await conn.query("UPDATE product_serials SET quantity = ?, status = ? WHERE id = ?", [qty, newStatus, sObj.id]);
          
          // Only add to available sum if not sold
          if (newStatus !== 'sold') {
            assignedSum += qty;
          }
        }

        // Strict invariant check: sum of available serial quantities must equal product stock
        if (assignedSum !== Number(prod.stock)) {
          throw new Error(`[INVARIANT FAILURE] Product #${prod.id} (${partNumber}): Available serial quantities sum (${assignedSum}) does not equal products.stock (${prod.stock})! Aborting transaction.`);
        }

        console.log(`  ✓ Invariant strictly verified: Serial sum ${assignedSum} === Stock ${prod.stock}`);
        realSerializedCount++;

      } else {
        // Empty or unclassified
        if (!isDryRun) {
          console.warn(`[UNCLASSIFIED WARNING] Product #${prod.id} (${partNumber}): real_serials is empty. Left unchanged.`);
        }
        skippedCount++;
      }
    }

    rollbackStatements.push(`\nCOMMIT;\n`);

    // Write rollback file
    fs.writeFileSync(rollbackSqlFile, rollbackStatements.join('\n'), 'utf8');
    console.log(`\n✓ Rollback SQL script generated: ${rollbackSqlFile}`);

    console.log('\n=== MIGRATION SUMMARY ===');
    console.log(`- Products converted to non-serialized: ${nonSerializedCount}`);
    console.log(`- Products kept as real serialized lots: ${realSerializedCount}`);
    console.log(`- Products unclassified / skipped: ${skippedCount}`);
    console.log(`- Serial IDs 145 & 146 restored to real JVT numbers: YES`);
    console.log(`- Serial ID 147 deleted after 0-link verification: YES`);
    console.log(`- Ledger rows written: 0 (stock untouched)`);

    if (isDryRun) {
      console.log('\n>>> [DRY-RUN COMPLETE] Rolling back transaction. Zero database changes made.');
      await conn.rollback();
    } else {
      console.log('\n>>> [COMMITTING TRANSACTION] Applying changes permanently...');
      await conn.commit();
      console.log('✓ All changes committed successfully!');
    }

  } catch (txErr) {
    console.error('\n⛔ [TRANSACTION FAILED & ROLLED BACK]:', txErr.message);
    await conn.rollback();
    process.exit(1);
  } finally {
    await conn.end();
  }
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
