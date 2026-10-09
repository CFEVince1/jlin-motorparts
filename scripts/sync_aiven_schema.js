const mysql = require(require.resolve('mysql2', { paths: [require('path').join(__dirname, '../backend')] }));
const fs = require('fs');
const path = require('path');

const rawEnv = fs.readFileSync(path.join(__dirname, '../backend/.env'), 'utf8');
const hostMatch = rawEnv.match(/#\s*DB_HOST=(.+)/);
const portMatch = rawEnv.match(/#\s*DB_PORT=(.+)/);
const userMatch = rawEnv.match(/#\s*DB_USER=(.+)/);
const passMatch = rawEnv.match(/#\s*DB_PASSWORD=(.+)/);
const dbMatch = rawEnv.match(/#\s*DB_NAME=(.+)/);

const aivenConfig = {
  host: process.env.DB_HOST || (hostMatch ? hostMatch[1].trim() : ''),
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : (portMatch ? parseInt(portMatch[1].trim(), 10) : 3306),
  user: process.env.DB_USER || (userMatch ? userMatch[1].trim() : ''),
  password: process.env.DB_PASSWORD || (passMatch ? passMatch[1].trim() : ''),
  database: process.env.DB_NAME || (dbMatch ? dbMatch[1].trim() : 'defaultdb'),
  multipleStatements: true,
  ssl: { rejectUnauthorized: false }
};

async function syncAiven() {
  console.log('Connecting to Aiven Cloud MySQL...');
  const pool = mysql.createPool(aivenConfig).promise();
  console.log('Connected! Applying schema sync...');

  // 1. Ensure `sku` column exists on products
  try {
    const [cols] = await pool.query("SHOW COLUMNS FROM products LIKE 'sku'");
    if (cols.length === 0) {
      console.log('Adding `sku` column to products...');
      await pool.query("ALTER TABLE products ADD COLUMN sku VARCHAR(100) NULL AFTER part_number");
      await pool.query("UPDATE products SET sku = part_number WHERE sku IS NULL");
      console.log('`sku` column added and populated!');
    } else {
      console.log('`sku` column already exists on products.');
    }
  } catch (err) {
    console.error('Error on sku column:', err.message);
  }

  // 2. Create `items` view
  try {
    console.log('Creating `items` view...');
    await pool.query(`
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
    console.log('`items` view created!');
  } catch (err) {
    console.error('Error creating items view:', err.message);
  }

  // 3. Create and populate `motorcycle_models`
  try {
    console.log('Creating `motorcycle_models` table...');
    await pool.query(`
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

    await pool.query(`
      INSERT IGNORE INTO motorcycle_models (id, brand, model, year_model)
      SELECT id, brand, model, year_model FROM motorcycle_units
    `);
    console.log('`motorcycle_models` table created and populated!');
  } catch (err) {
    console.error('Error creating motorcycle_models:', err.message);
  }

  // 4. Create and populate `product_compatibilities`
  try {
    console.log('Creating `product_compatibilities` table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS product_compatibilities (
        id INT AUTO_INCREMENT PRIMARY KEY,
        product_id INT NOT NULL,
        motorcycle_model_id INT NOT NULL,
        compatibility_status ENUM('COMPATIBLE', 'NOT_COMPATIBLE') NOT NULL DEFAULT 'COMPATIBLE',
        notes VARCHAR(255) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_prod_compat (product_id, motorcycle_model_id),
        INDEX idx_compat_product (product_id),
        INDEX idx_compat_model (motorcycle_model_id),
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        FOREIGN KEY (motorcycle_model_id) REFERENCES motorcycle_models(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await pool.query(`
      INSERT IGNORE INTO product_compatibilities (product_id, motorcycle_model_id, compatibility_status)
      SELECT pc.product_id, pc.motorcycle_unit_id, 'COMPATIBLE'
      FROM product_compatibility pc
      JOIN motorcycle_models mm ON mm.id = pc.motorcycle_unit_id
    `);
    console.log('`product_compatibilities` table created and populated!');
  } catch (err) {
    console.error('Error creating product_compatibilities:', err.message);
  }

  // 4b. Create `sales_order_seq` sequence table
  try {
    console.log('Creating `sales_order_seq` table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sales_order_seq (
        id BIGINT AUTO_INCREMENT PRIMARY KEY
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('`sales_order_seq` table ready!');
  } catch (err) {
    console.error('Error creating sales_order_seq:', err.message);
  }

  // 5. Create `sales_orders` and `sales_order_items`
  try {
    console.log('Creating `sales_orders` and `sales_order_items`...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sales_orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_number VARCHAR(100) UNIQUE NOT NULL,
        user_id INT NOT NULL,
        customer_name VARCHAR(150) DEFAULT 'Walk-in Customer',
        customer_phone VARCHAR(50) DEFAULT NULL,
        total_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        subtotal_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        tax_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        payment_method VARCHAR(50) NOT NULL DEFAULT 'Cash',
        payment_status ENUM('paid', 'partial', 'pending', 'refunded', 'voided') NOT NULL DEFAULT 'paid',
        tendered_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        change_due DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        payment_reference VARCHAR(100) DEFAULT NULL,
        payment_provider VARCHAR(50) DEFAULT NULL,
        card_type VARCHAR(50) DEFAULT NULL,
        card_last4 VARCHAR(4) DEFAULT NULL,
        paid_at TIMESTAMP NULL DEFAULT NULL,
        status ENUM('completed', 'pending', 'cancelled', 'refunded', 'voided') NOT NULL DEFAULT 'completed',
        notes TEXT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS sales_order_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sales_order_id INT NOT NULL,
        product_id INT NOT NULL,
        part_number VARCHAR(100) NOT NULL,
        product_name VARCHAR(255) NOT NULL,
        brand VARCHAR(100) NOT NULL,
        size VARCHAR(50) NOT NULL,
        quantity INT NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        subtotal DECIMAL(10,2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await pool.query(`
      INSERT IGNORE INTO sales_orders (id, order_number, user_id, total_amount, tendered_amount, change_due, payment_method, payment_reference, created_at)
      SELECT id, COALESCE(order_number, CONCAT('ORD-', LPAD(id, 6, '0'))), user_id, total_amount, tendered_amount, change_due, payment_method, payment_reference, sale_date
      FROM sales
    `);

    await pool.query(`
      INSERT IGNORE INTO sales_order_items (id, sales_order_id, product_id, part_number, product_name, brand, size, quantity, price, subtotal, created_at)
      SELECT 
        si.id, 
        si.sale_id, 
        si.product_id, 
        COALESCE(si.part_number, p.part_number, 'N/A'), 
        COALESCE(si.product_name, p.name, 'Product'), 
        COALESCE(si.brand, p.brand, ''), 
        COALESCE(si.size, p.size, ''), 
        si.quantity, 
        si.price, 
        si.subtotal, 
        s.sale_date
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      LEFT JOIN products p ON p.id = si.product_id
    `);
    // Check item_id on sales_order_items
    const [soiCols] = await pool.query("SHOW COLUMNS FROM sales_order_items LIKE 'item_id'");
    if (soiCols.length === 0) {
      console.log('Adding item_id to sales_order_items...');
      await pool.query("ALTER TABLE sales_order_items ADD COLUMN item_id INT NULL AFTER sales_order_id");
      await pool.query("UPDATE sales_order_items SET item_id = product_id WHERE item_id IS NULL");
      console.log('`item_id` added to sales_order_items!');
    }
    console.log('`sales_orders` and `sales_order_items` ready and populated!');
  } catch (err) {
    console.error('Error on sales_orders:', err.message);
  }

  // 6. Create receiving_records and receiving_record_items
  try {
    console.log('Creating `receiving_records` and `receiving_record_items`...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS receiving_records (
        id INT AUTO_INCREMENT PRIMARY KEY,
        supplier_id INT NOT NULL,
        reference_number VARCHAR(100) NOT NULL UNIQUE,
        reference_no VARCHAR(100) NULL,
        received_by INT DEFAULT NULL,
        received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        total_cost DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        status ENUM('draft', 'received', 'cancelled') NOT NULL DEFAULT 'received',
        notes TEXT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
        FOREIGN KEY (received_by) REFERENCES users(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Ensure reference_no exists and is backfilled
    const [rrCols] = await pool.query("SHOW COLUMNS FROM receiving_records LIKE 'reference_no'");
    if (rrCols.length === 0) {
      await pool.query("ALTER TABLE receiving_records ADD COLUMN reference_no VARCHAR(100) NULL AFTER reference_number");
      await pool.query("UPDATE receiving_records SET reference_no = reference_number WHERE reference_no IS NULL");
    }

    await pool.query(`
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
    const [rriCols] = await pool.query("SHOW COLUMNS FROM receiving_record_items LIKE 'item_id'");
    if (rriCols.length === 0) {
      await pool.query("ALTER TABLE receiving_record_items ADD COLUMN item_id INT NULL AFTER product_id");
      await pool.query("UPDATE receiving_record_items SET item_id = product_id WHERE item_id IS NULL");
    }
    console.log('`receiving_records` ready!');
  } catch (err) {
    console.error('Error on receiving_records:', err.message);
  }

  console.log('All migrations completed successfully on Aiven Cloud!');
  process.exit(0);
}

syncAiven().catch(err => {
  console.error(err);
  process.exit(1);
});
