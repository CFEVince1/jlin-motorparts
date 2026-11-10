const pool = require('../config/db');

async function run() {
  await pool.query("UPDATE products SET supplier_id = 14, supplier_name = 'Brembo & RCB Online Hub (FB Supplier)' WHERE supplier_id IS NULL AND (brand LIKE '%Brembo%' OR brand LIKE '%RCB%' OR brand LIKE '%Racing Boy%' OR brand LIKE '%Bendix%')");
  await pool.query("UPDATE products SET supplier_id = 13, supplier_name = 'JVT Racing Parts Direct (Facebook Wholesale)' WHERE supplier_id IS NULL AND (brand LIKE '%JVT%' OR brand LIKE '%Uma%' OR brand LIKE '%Faito%')");
  await pool.query("UPDATE products SET supplier_id = 16, supplier_name = 'MTRT Performance Facebook Direct' WHERE supplier_id IS NULL AND (brand LIKE '%MTRT%' OR brand LIKE '%Koso%' OR brand LIKE '%aRacer%' OR brand LIKE '%Domino%')");
  await pool.query("UPDATE products SET supplier_id = 15, supplier_name = 'Speedmate Motorparts FB Wholesale' WHERE supplier_id IS NULL AND (brand LIKE '%Yamaha%' OR brand LIKE '%Honda%' OR brand LIKE '%Suzuki%' OR brand LIKE '%Castrol%' OR brand LIKE '%Motul%' OR brand LIKE '%Shell%')");
  await pool.query("UPDATE products SET supplier_id = 12, supplier_name = 'FB MotorWorks Direct Wholesale' WHERE supplier_id IS NULL");
  console.log('Suppliers linked successfully');
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
