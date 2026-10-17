const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../backend/.env') });
const db = require('../backend/config/db');

async function syncAiven() {
  console.log('[Sync] Starting verified schema sync...');

  // 1. Ensure `sku` column exists on products
  console.log('[Sync] Checking `sku` column on products...');
  const [cols] = await db.query("SHOW COLUMNS FROM products LIKE 'sku'");
  if (cols.length === 0) {
    console.log('[Sync] Adding `sku` column to products...');
    await db.query("ALTER TABLE products ADD COLUMN sku VARCHAR(100) NULL AFTER part_number");
    await db.query("UPDATE products SET sku = part_number WHERE sku IS NULL");
    console.log('[Sync] `sku` column added and populated!');
  } else {
    console.log('[Sync] `sku` column already exists on products.');
  }

  // 2. Create `items` view
  console.log('[Sync] Creating `items` view...');
  await db.query(`
    CREATE OR REPLACE VIEW items AS
    SELECT 
      id, 
      id AS item_id, 
      COALESCE(sku, part_number) AS sku, 
      part_number, 
      name, 
      brand, 
      category, 
      size, 
      measurement, 
      thread_type, 
      cost_price, 
      COALESCE(retail_price, selling_price) AS retail_price, 
      selling_price, 
      COALESCE(current_stock, stock) AS current_stock, 
      stock, 
      reorder_level, 
      is_serialized, 
      is_active, 
      created_at, 
      updated_at
    FROM products
  `);
  console.log('[Sync] `items` view ready!');

  // 3. Create and populate `motorcycle_models`
  console.log('[Sync] Ensuring `motorcycle_models` table...');
  await db.query(`
    CREATE TABLE IF NOT EXISTS motorcycle_models (
      id INT AUTO_INCREMENT PRIMARY KEY,
      brand VARCHAR(100) NOT NULL,
      model VARCHAR(100) NOT NULL,
      year_start INT DEFAULT NULL,
      year_end INT DEFAULT NULL,
      year_model VARCHAR(50) DEFAULT NULL,
      engine_displacement VARCHAR(50) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_motorcycle_model (brand, model, year_model),
      INDEX idx_model_brand (brand),
      INDEX idx_model_name (model)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await db.query(`
    INSERT IGNORE INTO motorcycle_models (brand, model, year_model)
    SELECT DISTINCT brand, model, year_model FROM motorcycle_units
  `);
  console.log('[Sync] `motorcycle_models` table ready and populated!');

  // 4. Create and populate `product_compatibilities`
  console.log('[Sync] Ensuring `product_compatibilities` table...');
  await db.query(`
    CREATE TABLE IF NOT EXISTS product_compatibilities (
      id INT AUTO_INCREMENT PRIMARY KEY,
      product_id INT NOT NULL,
      motorcycle_model_id INT NOT NULL,
      compatibility_status ENUM('COMPATIBLE', 'NOT_COMPATIBLE', 'CONDITIONAL') NOT NULL DEFAULT 'COMPATIBLE',
      notes VARCHAR(255) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_prod_compat (product_id, motorcycle_model_id),
      INDEX idx_compat_product (product_id),
      INDEX idx_compat_model (motorcycle_model_id),
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (motorcycle_model_id) REFERENCES motorcycle_models(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // Ensure compatibility_status enum includes CONDITIONAL if table existed previously
  try {
    await db.query(`
      ALTER TABLE product_compatibilities 
      MODIFY COLUMN compatibility_status ENUM('COMPATIBLE', 'NOT_COMPATIBLE', 'CONDITIONAL') NOT NULL DEFAULT 'COMPATIBLE'
    `);
  } catch (e) {
    // ignore
  }

  // Map legacy product_compatibility (motorcycle_unit_id) to motorcycle_models (id)
  // via matched brand, model, and year_model - NEVER using unit ID directly as model ID
  await db.query(`
    INSERT IGNORE INTO product_compatibilities (product_id, motorcycle_model_id, compatibility_status)
    SELECT pc.product_id, mm.id, 'COMPATIBLE'
    FROM product_compatibility pc
    JOIN motorcycle_units mu ON pc.motorcycle_unit_id = mu.id
    JOIN motorcycle_models mm ON 
      mm.brand = mu.brand 
      AND mm.model = mu.model 
      AND (
        (mm.year_model IS NULL AND mu.year_model IS NULL)
        OR mm.year_model = mu.year_model
      )
  `);
  console.log('[Sync] `product_compatibilities` table ready and mapped correctly!');

  // 5. Create receiving_records and receiving_record_items
  console.log('[Sync] Ensuring `receiving_records` and `receiving_record_items`...');
  await db.query(`
    CREATE TABLE IF NOT EXISTS receiving_records (
      id INT AUTO_INCREMENT PRIMARY KEY,
      supplier_id INT NOT NULL,
      reference_number VARCHAR(100) NOT NULL,
      reference_no VARCHAR(100) NULL,
      received_by INT DEFAULT NULL,
      received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      total_cost DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      status ENUM('draft', 'received', 'cancelled') NOT NULL DEFAULT 'received',
      notes TEXT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_supplier_ref (supplier_id, reference_no),
      INDEX idx_rec_ref (reference_number),
      INDEX idx_rec_supplier (supplier_id),
      INDEX idx_rec_date (received_at),
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
      FOREIGN KEY (received_by) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // Ensure reference_no exists and is backfilled
  const [rrCols] = await db.query("SHOW COLUMNS FROM receiving_records LIKE 'reference_no'");
  if (rrCols.length === 0) {
    await db.query("ALTER TABLE receiving_records ADD COLUMN reference_no VARCHAR(100) NULL AFTER reference_number");
    await db.query("UPDATE receiving_records SET reference_no = reference_number WHERE reference_no IS NULL");
  }

  // Ensure reference_number is NOT globally unique across all suppliers; drop any legacy standalone UNIQUE index
  try {
    const [indexes] = await db.query("SHOW INDEX FROM receiving_records WHERE Column_name = 'reference_number' AND Non_unique = 0");
    for (const idx of indexes) {
      if (idx.Key_name !== 'PRIMARY' && idx.Key_name !== 'uq_supplier_ref') {
        await db.query(`ALTER TABLE receiving_records DROP INDEX \`${idx.Key_name}\``);
        console.log(`[Sync] Dropped legacy global unique index '${idx.Key_name}' on receiving_records.reference_number`);
      }
    }
  } catch (e) {
    // ignore
  }

  // Ensure per-supplier composite unique constraint exists
  try {
    const [uq] = await db.query("SHOW INDEX FROM receiving_records WHERE Key_name = 'uq_supplier_ref'");
    if (uq.length === 0) {
      await db.query("ALTER TABLE receiving_records ADD UNIQUE KEY uq_supplier_ref (supplier_id, reference_no)");
    }
  } catch (e) {
    // ignore
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS receiving_record_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      receiving_record_id INT NOT NULL,
      product_id INT NOT NULL,
      item_id INT NULL,
      quantity INT NOT NULL,
      cost_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      subtotal DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (receiving_record_id) REFERENCES receiving_records(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // Ensure item_id exists and is backfilled
  const [rriCols] = await db.query("SHOW COLUMNS FROM receiving_record_items LIKE 'item_id'");
  if (rriCols.length === 0) {
    await db.query("ALTER TABLE receiving_record_items ADD COLUMN item_id INT NULL AFTER product_id");
    await db.query("UPDATE receiving_record_items SET item_id = product_id WHERE item_id IS NULL");
  }
  console.log('[Sync] `receiving_records` ready!');

  console.log('All migrations completed successfully!');
  process.exit(0);
}

syncAiven().catch(err => {
  console.error('[Sync Migration Failed]:', err);
  process.exit(1);
});
