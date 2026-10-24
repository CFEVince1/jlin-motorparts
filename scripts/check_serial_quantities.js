const path = require('path');
const fs = require('fs');

// Ensure module resolution for backend dependencies
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

// Ensure .env is loaded regardless of invocation working directory
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

const db = require('../backend/config/db');

async function checkSerialQuantities() {
  console.log('=== Serial Quantities vs Product Stock Invariant Check ===\n');

  // Check if quantity column exists in product_serials
  const [cols] = await db.query("SHOW COLUMNS FROM product_serials LIKE 'quantity'");
  const hasQtyCol = cols.length > 0;
  console.log(`Column product_serials.quantity exists: ${hasQtyCol ? 'YES' : 'NO (Pre-migration)'}`);

  const [serializedProducts] = await db.query(`
    SELECT id, part_number, name, stock, current_stock, is_serialized
    FROM products
    WHERE is_serialized = 1 AND is_active = 1
    ORDER BY id ASC
  `);

  let hasDiscrepancy = false;
  const report = [];

  for (const prod of serializedProducts) {
    let serials = [];
    if (hasQtyCol) {
      const [rows] = await db.query(`
        SELECT id, serial_number, status, quantity
        FROM product_serials
        WHERE product_id = ?
        ORDER BY id ASC
      `, [prod.id]);
      serials = rows;
    } else {
      const [rows] = await db.query(`
        SELECT id, serial_number, status
        FROM product_serials
        WHERE product_id = ?
        ORDER BY id ASC
      `, [prod.id]);
      serials = rows;
    }

    const availableSerials = serials.filter(s => s.status === 'available' || s.status === null);
    const sumQuantities = hasQtyCol
      ? availableSerials.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0)
      : availableSerials.length;
    const productStock = Number(prod.stock ?? prod.current_stock ?? 0);

    const match = (sumQuantities === productStock);
    if (!match) {
      hasDiscrepancy = true;
    }

    report.push({
      product_id: prod.id,
      part_number: prod.part_number,
      product_name: prod.name,
      product_stock: productStock,
      total_serials: serials.length,
      available_serials: availableSerials.length,
      sum_serial_quantities: hasQtyCol ? sumQuantities : `${sumQuantities} (avail count)`,
      status: match ? 'MATCH' : 'MISMATCH',
      serials_detail: serials.map(s => `${s.serial_number} (${s.status || 'unknown'}${hasQtyCol ? `, qty=${s.quantity}` : ''})`).join(', ')
    });
  }

  console.table(report.map(r => ({
    ID: r.product_id,
    PartNumber: r.part_number,
    Name: r.product_name,
    ProductStock: r.product_stock,
    AvailSerials: r.available_serials,
    SerialQtySum: r.sum_serial_quantities,
    Status: r.status
  })));

  console.log('\nDetailed Breakdown:');
  for (const r of report) {
    console.log(`- Product ${r.product_id} (${r.part_number} - ${r.product_name}):`);
    console.log(`    Stock: ${r.product_stock} | Serial Qty Sum: ${r.sum_serial_quantities} | Status: ${r.status}`);
    console.log(`    Serials: ${r.serials_detail || 'None'}`);
  }

  if (hasDiscrepancy) {
    console.log('\n[FAIL] Discrepancy detected: one or more serialized products have stock != sum of serial quantities.');
    await db.end();
    process.exit(1);
  } else {
    console.log('\n[PASS] All serialized products have stock strictly matching the sum of their serial quantities.');
    await db.end();
    process.exit(0);
  }
}

checkSerialQuantities().catch(async (err) => {
  console.error('Check script error:', err);
  try { await db.end(); } catch (e) {}
  process.exit(1);
});
