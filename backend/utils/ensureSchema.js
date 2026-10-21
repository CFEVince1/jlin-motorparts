const db = require('../config/db');

async function ensureSchema() {
  try {
    // 1. Check users.email and users.email_verified_at
    const [cols] = await db.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
         AND COLUMN_NAME IN ('email', 'email_verified_at')`
    );
    const have = cols.map((c) => c.COLUMN_NAME);

    if (!have.includes('email')) {
      await db.query('ALTER TABLE users ADD COLUMN email VARCHAR(150) NULL UNIQUE');
      console.log('[Schema] Added email column to users table.');
    }
    if (!have.includes('email_verified_at')) {
      await db.query('ALTER TABLE users ADD COLUMN email_verified_at DATETIME NULL');
      console.log('[Schema] Added email_verified_at column to users table.');
    }

    // 1b. Check sales table for split payment, void, and refund columns
    const [salesCols] = await db.query(
      `SELECT COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales'
         AND COLUMN_NAME IN ('cash_amount', 'gcash_amount', 'payment_method', 'status', 'voided_at', 'void_reason', 'refund_amount', 'refunded_at')`
    );
    const salesColNames = salesCols.map((c) => c.COLUMN_NAME);
    const paymentMethodCol = salesCols.find((c) => c.COLUMN_NAME === 'payment_method');

    if (paymentMethodCol && paymentMethodCol.DATA_TYPE === 'enum') {
      try {
        await db.query("ALTER TABLE sales MODIFY COLUMN payment_method VARCHAR(50) NOT NULL DEFAULT 'Cash'");
        console.log('[Schema] Updated sales.payment_method to VARCHAR(50).');
      } catch (err) {
        console.warn('[Schema] Failed to update sales.payment_method:', err.message);
      }
    }

    if (!salesColNames.includes('cash_amount')) {
      try {
        await db.query('ALTER TABLE sales ADD COLUMN cash_amount DECIMAL(10,2) DEFAULT NULL');
        console.log('[Schema] Added cash_amount column to sales table.');
      } catch (err) {
        console.warn('[Schema] Failed to add cash_amount to sales:', err.message);
      }
    }

    if (!salesColNames.includes('gcash_amount')) {
      try {
        await db.query('ALTER TABLE sales ADD COLUMN gcash_amount DECIMAL(10,2) DEFAULT NULL');
        console.log('[Schema] Added gcash_amount column to sales table.');
      } catch (err) {
        console.warn('[Schema] Failed to add gcash_amount to sales:', err.message);
      }
    }

    if (!salesColNames.includes('status')) {
      try {
        await db.query("ALTER TABLE sales ADD COLUMN status VARCHAR(50) NOT NULL DEFAULT 'COMPLETED'");
        console.log('[Schema] Added status column to sales table.');
      } catch (err) {
        console.warn('[Schema] Failed to add status to sales:', err.message);
      }
    }

    if (!salesColNames.includes('voided_at')) {
      try {
        await db.query('ALTER TABLE sales ADD COLUMN voided_at DATETIME NULL');
        console.log('[Schema] Added voided_at column to sales table.');
      } catch (err) {
        console.warn('[Schema] Failed to add voided_at to sales:', err.message);
      }
    }

    if (!salesColNames.includes('void_reason')) {
      try {
        await db.query('ALTER TABLE sales ADD COLUMN void_reason TEXT NULL');
        console.log('[Schema] Added void_reason column to sales table.');
      } catch (err) {
        console.warn('[Schema] Failed to add void_reason to sales:', err.message);
      }
    }

    if (!salesColNames.includes('refund_amount')) {
      try {
        await db.query('ALTER TABLE sales ADD COLUMN refund_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00');
        console.log('[Schema] Added refund_amount column to sales table.');
      } catch (err) {
        console.warn('[Schema] Failed to add refund_amount to sales:', err.message);
      }
    }

    if (!salesColNames.includes('refunded_at')) {
      try {
        await db.query('ALTER TABLE sales ADD COLUMN refunded_at DATETIME NULL');
        console.log('[Schema] Added refunded_at column to sales table.');
      } catch (err) {
        console.warn('[Schema] Failed to add refunded_at to sales:', err.message);
      }
    }

    // 1c. Check sale_items for returned_quantity
    const [saleItemCols] = await db.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sale_items'
         AND COLUMN_NAME = 'returned_quantity'`
    );
    if (saleItemCols.length === 0) {
      try {
        await db.query('ALTER TABLE sale_items ADD COLUMN returned_quantity INT NOT NULL DEFAULT 0');
        console.log('[Schema] Added returned_quantity column to sale_items table.');
      } catch (err) {
        console.warn('[Schema] Failed to add returned_quantity to sale_items:', err.message);
      }
    }

    // 1d. Ensure sale_returns and sale_return_items tables
    await db.query(`
      CREATE TABLE IF NOT EXISTS sale_returns (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sale_id INT NOT NULL,
        return_number VARCHAR(100) UNIQUE NOT NULL,
        user_id INT NOT NULL,
        total_refund_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        refund_payment_method VARCHAR(50) NOT NULL DEFAULT 'Cash',
        reason TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_sr_sale (sale_id),
        INDEX idx_sr_user (user_id),
        FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS sale_return_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sale_return_id INT NOT NULL,
        sale_item_id INT NOT NULL,
        product_id INT NOT NULL,
        quantity INT NOT NULL,
        refund_price DECIMAL(10,2) NOT NULL,
        refund_subtotal DECIMAL(10,2) NOT NULL,
        disposition VARCHAR(50) NOT NULL,
        notes TEXT NULL,
        INDEX idx_sri_return (sale_return_id),
        INDEX idx_sri_product (product_id),
        FOREIGN KEY (sale_return_id) REFERENCES sale_returns(id) ON DELETE CASCADE,
        FOREIGN KEY (sale_item_id) REFERENCES sale_items(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id)
      )
    `);

    // 2. Ensure password_otps table
    await db.query(`
      CREATE TABLE IF NOT EXISTS password_otps (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        purpose VARCHAR(30) NOT NULL,
        code_hash VARCHAR(255) NOT NULL,
        attempts INT NOT NULL DEFAULT 0,
        expires_at DATETIME NOT NULL,
        used_at DATETIME NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_otp_lookup (user_id, purpose, used_at),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // 3. Ensure compatibility_groups table
    await db.query(`
      CREATE TABLE IF NOT EXISTS compatibility_groups (
        id INT AUTO_INCREMENT PRIMARY KEY,
        group_name VARCHAR(150) NOT NULL UNIQUE,
        description TEXT,
        INDEX idx_group_name (group_name)
      )
    `);

    // 4. Ensure compatibility_group_units table
    await db.query(`
      CREATE TABLE IF NOT EXISTS compatibility_group_units (
        id INT AUTO_INCREMENT PRIMARY KEY,
        compatibility_group_id INT NOT NULL,
        motorcycle_unit_id INT NOT NULL,
        UNIQUE KEY unique_group_unit (compatibility_group_id, motorcycle_unit_id),
        INDEX idx_group_unit_group (compatibility_group_id),
        INDEX idx_group_unit_motorcycle (motorcycle_unit_id),
        FOREIGN KEY (compatibility_group_id) REFERENCES compatibility_groups(id) ON DELETE CASCADE,
        FOREIGN KEY (motorcycle_unit_id) REFERENCES motorcycle_units(id) ON DELETE CASCADE
      )
    `);

    // 5. Ensure product_compatibility_groups table
    await db.query(`
      CREATE TABLE IF NOT EXISTS product_compatibility_groups (
        id INT AUTO_INCREMENT PRIMARY KEY,
        product_id INT NOT NULL,
        compatibility_group_id INT NOT NULL,
        UNIQUE KEY unique_product_group (product_id, compatibility_group_id),
        INDEX idx_product_group_product (product_id),
        INDEX idx_product_group_group (compatibility_group_id),
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        FOREIGN KEY (compatibility_group_id) REFERENCES compatibility_groups(id) ON DELETE CASCADE
      )
    `);

    // 6. Seed default platform groups if empty
    const [existingGroups] = await db.query('SELECT COUNT(*) as cnt FROM compatibility_groups');
    if (existingGroups[0].cnt === 0) {
      const defaultGroups = [
        { name: 'Yamaha Aerox Platform', desc: 'Aerox 155 V1, V2, V3 series' },
        { name: 'Honda Click Platform', desc: 'Click 125, Click 150, Click 160 series' },
        { name: 'Suzuki Raider Platform', desc: 'Raider 150 Carb, Raider FI series' },
        { name: 'Yamaha Mio Platform', desc: 'Mio Sporty, Mio i125, Mio Soul i125 series' }
      ];

      for (const g of defaultGroups) {
        const [res] = await db.query(
          'INSERT INTO compatibility_groups (group_name, description) VALUES (?, ?)',
          [g.name, g.desc]
        );
        const groupId = res.insertId;

        if (g.name.includes('Aerox')) {
          await db.query(`
            INSERT IGNORE INTO compatibility_group_units (compatibility_group_id, motorcycle_unit_id)
            SELECT ?, id FROM motorcycle_units WHERE model LIKE '%Aerox%'
          `, [groupId]);
        } else if (g.name.includes('Click')) {
          await db.query(`
            INSERT IGNORE INTO compatibility_group_units (compatibility_group_id, motorcycle_unit_id)
            SELECT ?, id FROM motorcycle_units WHERE model LIKE '%Click%'
          `, [groupId]);
        } else if (g.name.includes('Raider')) {
          await db.query(`
            INSERT IGNORE INTO compatibility_group_units (compatibility_group_id, motorcycle_unit_id)
            SELECT ?, id FROM motorcycle_units WHERE model LIKE '%Raider%'
          `, [groupId]);
        } else if (g.name.includes('Mio')) {
          await db.query(`
            INSERT IGNORE INTO compatibility_group_units (compatibility_group_id, motorcycle_unit_id)
            SELECT ?, id FROM motorcycle_units WHERE model LIKE '%Mio%'
          `, [groupId]);
        }
      }
            console.log('[Schema] Seeded default platform groups.');
    }

    // 7. Ensure damaged_stock column on products
    try {
      const [dmgCols] = await db.query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products'
           AND COLUMN_NAME = 'damaged_stock'`
      );
      if (dmgCols.length === 0) {
        await db.query('ALTER TABLE products ADD COLUMN damaged_stock INT NOT NULL DEFAULT 0 AFTER stock');
        console.log('[Schema] Added damaged_stock column to products table.');
      }
    } catch (err) {
      console.warn('[Schema] Failed to check/add damaged_stock to products:', err.message);
    }

    // 8. Ensure return_refund_history table
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS return_refund_history (
            id INT AUTO_INCREMENT PRIMARY KEY,
            reference_no VARCHAR(50) NOT NULL,
            order_id INT NULL,
            sale_return_id INT NULL,
            product_id INT NOT NULL,
            product_name VARCHAR(255) NOT NULL,
            part_number VARCHAR(100) NULL,
            movement_type ENUM(
                'CUSTOMER_RETURN_GOOD',
                'CUSTOMER_RETURN_DAMAGE',
                'SHELF_TO_DAMAGE',
                'DAMAGE_TO_SUPPLIER',
                'LOSS_INVENTORY',
                'FOUND_INVENTORY',
                'INVENTORY_TO_SUPPLIER'
            ) NOT NULL,
            flow_path VARCHAR(100) NOT NULL,
            qty INT NOT NULL,
            target_bucket ENUM('INVENTORY', 'DAMAGE', 'BOTH') NOT NULL,
            effect_badge VARCHAR(30) NOT NULL,
            inv_before INT NOT NULL,
            inv_after INT NOT NULL,
            damage_before INT NOT NULL,
            damage_after INT NOT NULL,
            refund_amount DECIMAL(10,2) DEFAULT 0.00,
            supplier_name VARCHAR(100) NULL,
            status ENUM('COMPLETED', 'PENDING_SUPPLIER_RETURN', 'RETURNED_TO_SUPPLIER') DEFAULT 'COMPLETED',
            remarks TEXT,
            processed_by VARCHAR(50) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_product (product_id),
            INDEX idx_ref (reference_no),
            INDEX idx_movement (movement_type)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      console.log('[Schema] Verified return_refund_history table.');
    } catch (err) {
      console.warn('[Schema] Failed to verify return_refund_history table:', err.message);
    }

    // 9. Ensure receiving_record_items has serials column
    try {
      const [rriCols] = await db.query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'receiving_record_items'
           AND COLUMN_NAME = 'serials'`
      );
      if (rriCols.length === 0) {
        await db.query('ALTER TABLE receiving_record_items ADD COLUMN serials TEXT NULL AFTER subtotal');
        console.log('[Schema] Added serials column to receiving_record_items table.');
      }
    } catch (err) {
      console.warn('[Schema] Failed to check/add serials to receiving_record_items:', err.message);
    }

    // 10. Ensure products current_stock is kept in sync with stock
    try {
      await db.query('UPDATE products SET current_stock = stock WHERE current_stock != stock OR current_stock IS NULL');
    } catch (err) {
      console.warn('[Schema] Failed to sync products.current_stock:', err.message);
    }
  } catch (err) {
    console.warn('[Schema] Auto-migration check completed with note:', err.message);
  }
}

module.exports = ensureSchema;
