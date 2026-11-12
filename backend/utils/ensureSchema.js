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
        await db.query("ALTER TABLE sales ADD COLUMN status VARCHAR(50) NOT NULL DEFAULT 'SOLD'");
        console.log('[Schema] Added status column to sales table with default SOLD.');
      } catch (err) {
        console.warn('[Schema] Failed to add status to sales:', err.message);
      }
    } else {
      try {
        await db.query("ALTER TABLE sales ALTER COLUMN status SET DEFAULT 'SOLD'");
        await db.query("UPDATE sales SET status = 'SOLD' WHERE status = 'COMPLETED'");
      } catch (err) {
        // Fallback for MySQL environments
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

    // Ensure all critical sales columns exist
    const ensureSalesColumns = [
      { col: 'subtotal_amount', def: 'DECIMAL(10,2) NOT NULL DEFAULT 0.00' },
      { col: 'discount_amount', def: 'DECIMAL(10,2) NOT NULL DEFAULT 0.00' },
      { col: 'tax_amount', def: 'DECIMAL(10,2) NOT NULL DEFAULT 0.00' },
      { col: 'receipt_no', def: 'VARCHAR(100) NULL' },
      { col: 'cashier_id', def: 'INT NULL' },
      { col: 'amount_tendered', def: 'DECIMAL(10,2) NULL' },
      { col: 'change_amount', def: 'DECIMAL(10,2) NULL' },
      { col: 'gcash_ref_no', def: 'VARCHAR(100) NULL' },
      { col: 'payment_provider', def: 'VARCHAR(50) NULL' },
      { col: 'payment_status', def: "VARCHAR(50) DEFAULT 'PAID'" },
      { col: 'card_type', def: 'VARCHAR(50) NULL' },
      { col: 'card_last4', def: 'VARCHAR(10) NULL' },
      { col: 'paid_at', def: 'DATETIME NULL' },
      { col: 'customer_name', def: 'VARCHAR(150) NULL' },
      { col: 'customer_id', def: 'INT NULL' },
      { col: 'customer_phone', def: 'VARCHAR(50) NULL' },
      { col: 'customer_address', def: 'VARCHAR(255) NULL' }
    ];

    for (const item of ensureSalesColumns) {
      try {
        const [cCheck] = await db.query('SHOW COLUMNS FROM sales LIKE ?', [item.col]);
        if (cCheck.length === 0) {
          await db.query(`ALTER TABLE sales ADD COLUMN ${item.col} ${item.def}`);
          console.log(`[Schema] Added missing sales.${item.col}`);
        }
      } catch (err) {
        console.warn(`[Schema] Check/Add sales.${item.col} failed:`, err.message);
      }
    }

    // Ensure sale_items columns
    const ensureSaleItemsCols = [
      { col: 'qty_sold', def: 'INT NOT NULL DEFAULT 1' },
      { col: 'qty_swapped', def: 'INT NOT NULL DEFAULT 0' },
      { col: 'retail_price_snapshot', def: 'DECIMAL(10,2) NULL' },
      { col: 'unit_cost_snapshot', def: 'DECIMAL(10,2) NULL' }
    ];
    for (const item of ensureSaleItemsCols) {
      try {
        const [cCheck] = await db.query('SHOW COLUMNS FROM sale_items LIKE ?', [item.col]);
        if (cCheck.length === 0) {
          await db.query(`ALTER TABLE sale_items ADD COLUMN ${item.col} ${item.def}`);
          console.log(`[Schema] Added missing sale_items.${item.col}`);
        }
      } catch (err) {
        console.warn(`[Schema] Check/Add sale_items.${item.col} failed:`, err.message);
      }
    }

    // Ensure cash_floats columns
    const ensureCashFloatCols = [
      { col: 'shift_code', def: 'VARCHAR(50) NULL' },
      { col: 'gcash_sales', def: 'DECIMAL(12,2) NOT NULL DEFAULT 0.00' },
      { col: 'petty_cash_expenses', def: 'DECIMAL(12,2) NOT NULL DEFAULT 0.00' },
      { col: 'reconciliation_notes', def: 'TEXT NULL' },
      { col: 'blind_count_entered', def: 'DECIMAL(12,2) NULL' },
      { col: 'admin_signed_off', def: 'TINYINT(1) DEFAULT 0' },
      { col: 'signed_off_by_id', def: 'INT NULL' },
      { col: 'signed_off_by_name', def: 'VARCHAR(100) NULL' },
      { col: 'signed_off_at', def: 'DATETIME NULL' },
      { col: 'bills_1000', def: 'INT DEFAULT 0' },
      { col: 'bills_500', def: 'INT DEFAULT 0' },
      { col: 'bills_200', def: 'INT DEFAULT 0' },
      { col: 'bills_100', def: 'INT DEFAULT 0' },
      { col: 'bills_50', def: 'INT DEFAULT 0' },
      { col: 'bills_20', def: 'INT DEFAULT 0' },
      { col: 'coins_10', def: 'INT DEFAULT 0' },
      { col: 'coins_5', def: 'INT DEFAULT 0' },
      { col: 'coins_1', def: 'INT DEFAULT 0' }
    ];
    for (const item of ensureCashFloatCols) {
      try {
        const [cCheck] = await db.query('SHOW COLUMNS FROM cash_floats LIKE ?', [item.col]);
        if (cCheck.length === 0) {
          await db.query(`ALTER TABLE cash_floats ADD COLUMN ${item.col} ${item.def}`);
          console.log(`[Schema] Added missing cash_floats.${item.col}`);
        }
      } catch (err) {
        console.warn(`[Schema] Check/Add cash_floats.${item.col} failed:`, err.message);
      }
    }


    // 1c. [Path B] sale_items returned_quantity removed for All-Sales-Final architecture

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

    // 11. Ensure products markup_percentage column exists and is populated
    try {
      const [markupCols] = await db.query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products'
           AND COLUMN_NAME = 'markup_percentage'`
      );
      if (markupCols.length === 0) {
        await db.query('ALTER TABLE products ADD COLUMN markup_percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00 AFTER cost_price');
        console.log('[Schema] Added markup_percentage column to products table.');
      }
      await db.query('UPDATE products SET markup_percentage = ROUND(((selling_price - cost_price) / cost_price) * 100, 2) WHERE cost_price > 0 AND (markup_percentage = 0.00 OR markup_percentage IS NULL)');
    } catch (err) {
      console.warn('[Schema] Failed to check/add markup_percentage to products:', err.message);
    }

    // 12. Ensure serial lot tracking schema (non-destructive DDL only, zero data mutations or process.exit on boot)
    try {
      // 12a. Ensure product_serials.status allows 'inactive'
      const [statusCols] = await db.query("SHOW FULL COLUMNS FROM product_serials LIKE 'status'");
      if (statusCols.length > 0 && statusCols[0].Type.includes("enum('available','sold')") && !statusCols[0].Type.includes("'inactive'")) {
        await db.query("ALTER TABLE product_serials MODIFY COLUMN status ENUM('available', 'sold', 'inactive') NOT NULL DEFAULT 'available'");
        console.log("[Schema] Altered product_serials.status to ENUM('available', 'sold', 'inactive').");
      }

      // 12b. Ensure quantity column exists on product_serials
      const [psCols] = await db.query("SHOW COLUMNS FROM product_serials LIKE 'quantity'");
      if (psCols.length === 0) {
        await db.query("ALTER TABLE product_serials ADD COLUMN quantity INT NOT NULL DEFAULT 1 AFTER serial_number");
        console.log('[Schema] Added quantity column to product_serials.');
      }

      // 12c. Ensure quantity column exists on sale_item_serials
      const [sisCols] = await db.query("SHOW COLUMNS FROM sale_item_serials LIKE 'quantity'");
      if (sisCols.length === 0) {
        await db.query("ALTER TABLE sale_item_serials ADD COLUMN quantity INT NOT NULL DEFAULT 1 AFTER serial_id");
        console.log('[Schema] Added quantity column to sale_item_serials.');
      }

      // 12d. Ensure serial_id column exists on inventory_transactions
      const [itCols] = await db.query("SHOW COLUMNS FROM inventory_transactions LIKE 'serial_id'");
      if (itCols.length === 0) {
        await db.query("ALTER TABLE inventory_transactions ADD COLUMN serial_id INT NULL DEFAULT NULL AFTER product_id, ADD INDEX idx_it_serial_id (serial_id)");
        console.log('[Schema] Added serial_id column to inventory_transactions.');
      }
    } catch (lotErr) {
      console.warn('[Schema] Failed to verify serial lot columns:', lotErr.message);
    }
  
    // 13. Ensure products.needs_price_review column exists
    try {
      const [nprCols] = await db.query("SHOW COLUMNS FROM products LIKE 'needs_price_review'");
      if (nprCols.length === 0) {
        await db.query("ALTER TABLE products ADD COLUMN needs_price_review TINYINT(1) NOT NULL DEFAULT 0 AFTER is_active");
        console.log('[Schema] Added needs_price_review column to products table.');
      }
    } catch (nprErr) {
      console.warn('[Schema] Failed to check/add needs_price_review to products:', nprErr.message);
    }

    // 14. Ensure receiving_records inspection and driver return columns exist
    try {
      const [recCols] = await db.query("SHOW COLUMNS FROM receiving_records");
      const recColNames = recCols.map(c => c.Field);
      if (!recColNames.includes('inspected_by')) {
        await db.query("ALTER TABLE receiving_records ADD COLUMN inspected_by VARCHAR(100) NULL AFTER received_by");
      }
      if (!recColNames.includes('delivery_personnel')) {
        await db.query("ALTER TABLE receiving_records ADD COLUMN delivery_personnel VARCHAR(150) NULL AFTER inspected_by");
      }
      if (!recColNames.includes('courier_service')) {
        await db.query("ALTER TABLE receiving_records ADD COLUMN courier_service VARCHAR(100) NULL AFTER delivery_personnel");
      }
      if (!recColNames.includes('mechanic_name')) {
        await db.query("ALTER TABLE receiving_records ADD COLUMN mechanic_name VARCHAR(150) NULL AFTER courier_service");
      }
      if (!recColNames.includes('receiver_name')) {
        await db.query("ALTER TABLE receiving_records ADD COLUMN receiver_name VARCHAR(150) NULL AFTER mechanic_name");
      }
      if (!recColNames.includes('total_delivered_qty')) {
        await db.query("ALTER TABLE receiving_records ADD COLUMN total_delivered_qty INT NOT NULL DEFAULT 0 AFTER receiver_name");
      }
      if (!recColNames.includes('total_accepted_qty')) {
        await db.query("ALTER TABLE receiving_records ADD COLUMN total_accepted_qty INT NOT NULL DEFAULT 0 AFTER total_delivered_qty");
      }
      if (!recColNames.includes('total_rejected_qty')) {
        await db.query("ALTER TABLE receiving_records ADD COLUMN total_rejected_qty INT NOT NULL DEFAULT 0 AFTER total_accepted_qty");
      }
      if (!recColNames.includes('total_rejected_amount')) {
        await db.query("ALTER TABLE receiving_records ADD COLUMN total_rejected_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER total_rejected_qty");
      }

      const [rriCols] = await db.query("SHOW COLUMNS FROM receiving_record_items");
      const rriColNames = rriCols.map(c => c.Field);
      if (!rriColNames.includes('delivered_quantity')) {
        await db.query("ALTER TABLE receiving_record_items ADD COLUMN delivered_quantity INT NOT NULL DEFAULT 0 AFTER quantity");
      }
      if (!rriColNames.includes('rejected_quantity')) {
        await db.query("ALTER TABLE receiving_record_items ADD COLUMN rejected_quantity INT NOT NULL DEFAULT 0 AFTER delivered_quantity");
      }
      if (!rriColNames.includes('rejection_reason')) {
        await db.query("ALTER TABLE receiving_record_items ADD COLUMN rejection_reason VARCHAR(255) NULL AFTER rejected_quantity");
      }
      console.log('[Schema] Verified receiving_records and items inspection & return columns.');
    } catch (inspErr) {
      console.warn('[Schema] Failed to check/add inspection columns:', inspErr.message);
    }

    // 15. Ensure cash_floats table exists with per-shift tracking columns
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS cash_floats (
          id INT AUTO_INCREMENT PRIMARY KEY,
          shift_code VARCHAR(50) NULL,
          staff_id INT NOT NULL,
          staff_username VARCHAR(50) NOT NULL,
          assigned_by_id INT NOT NULL,
          assigned_by_username VARCHAR(50) NOT NULL,
          total_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
          starting_cash DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
          current_cash_balance DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
          cash_sales DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
          gcash_sales DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
          change_given DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
          cash_refunds DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
          petty_cash_expenses DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
          expected_cash DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
          actual_cash DECIMAL(12, 2) DEFAULT NULL,
          blind_count_entered DECIMAL(12, 2) DEFAULT NULL,
          shortage_overage DECIMAL(12, 2) DEFAULT NULL,
          sales_count INT NOT NULL DEFAULT 0,
          bills_1000 INT DEFAULT 0,
          bills_500 INT DEFAULT 0,
          bills_200 INT DEFAULT 0,
          bills_100 INT DEFAULT 0,
          bills_50 INT DEFAULT 0,
          bills_20 INT DEFAULT 0,
          coins_10 INT DEFAULT 0,
          coins_5 INT DEFAULT 0,
          coins_1 INT DEFAULT 0,
          status ENUM('ACTIVE', 'COMPLETED', 'RETURNED') NOT NULL DEFAULT 'ACTIVE',
          admin_signed_off TINYINT(1) DEFAULT 0,
          signed_off_by_id INT NULL,
          signed_off_by_name VARCHAR(100) NULL,
          signed_off_at DATETIME NULL,
          notes TEXT NULL,
          assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          completed_at DATETIME NULL,
          returned_at DATETIME NULL,
          returned_by_id INT NULL,
          returned_by_username VARCHAR(50) NULL,
          returned_notes TEXT NULL,
          reconciliation_notes TEXT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_cf_staff_id (staff_id),
          INDEX idx_cf_status (status),
          INDEX idx_cf_assigned_at (assigned_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      console.log('[Schema] Verified cash_floats table.');
    } catch (cfErr) {
      console.warn('[Schema] Failed to verify cash_floats table:', cfErr.message);
    }

    // 16. Ensure cash_movements ledger table exists
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS cash_movements (
          id INT AUTO_INCREMENT PRIMARY KEY,
          cash_float_id INT NOT NULL,
          staff_id INT NOT NULL,
          staff_username VARCHAR(50) NOT NULL,
          movement_type VARCHAR(50) NOT NULL,
          amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
          balance_before DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
          balance_after DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
          reference_id VARCHAR(100) NULL,
          notes TEXT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_cm_staff (staff_id),
          INDEX idx_cm_float (cash_float_id),
          INDEX idx_cm_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      console.log('[Schema] Verified cash_movements table.');
    } catch (cmErr) {
      console.warn('[Schema] Failed to verify cash_movements table:', cmErr.message);
    }

    // 17. Ensure standard 15 motorcycle categories exist
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS categories (
          category_id INT AUTO_INCREMENT PRIMARY KEY,
          category_name VARCHAR(100) NOT NULL UNIQUE,
          category_code VARCHAR(10) NULL,
          scope TEXT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      const standardCategories = [
        { name: 'Engine', code: 'ENG', scope: 'Cylinder Blocks, Heads, Pistons, Camshafts, Valves, Carburetors, Air Filters, Gaskets' },
        { name: 'Tires', code: 'TIRE', scope: 'Motorcycle Tubeless & Tube Tires, Racing Tires, Inner Tubes, Valves' },
        { name: 'Wheels & Hubs', code: 'WHL', scope: 'Forged Alloy Mags, Rims, Hubs, Spokes, Wheel Bearings, Spacers' },
        { name: 'CVT & Pulleys', code: 'CVT', scope: 'Pulley Sets, Flyballs, Roller Weights, Drive Belts, Clutch Springs, Torque Drives' },
        { name: 'Suspension', code: 'SUSP', scope: 'Rear Shocks, Mono Shocks, Front Fork Springs, Fork Oil, Swing Arms' },
        { name: 'Exhaust', code: 'EXH', scope: 'Racing Pipes, Power Pipes, Open Pipes, Silencers, Exhaust Manifolds' },
        { name: 'Brakes', code: 'BRK', scope: 'Radial Calipers, Master Cylinders, Brake Pads, Brake Rotors, Braided Steel Lines' },
        { name: 'Chains & Sprockets', code: 'CHN', scope: 'Heavy Duty Chains, Front Sprockets, Rear Sprockets, Sprocket Sets' },
        { name: 'Handlebars & Controls', code: 'HNDL', scope: 'Handlebars, Racing Grips, Throttle Cables, Clutch Levers, Bar Ends' },
        { name: 'Lights & Mirrors', code: 'LGHT', scope: 'LED Headlights, Bulbs, Signal Lights, Tail Lights, Side Mirrors' },
        { name: 'Electrical', code: 'ELEC', scope: 'Programmable ECUs, Racing CDIs, Iridium Spark Plugs, Batteries, Horns, Volt Meters' },
        { name: 'Oils & Lubricants', code: 'OIL', scope: '4T Engine Oils, Fully Synthetic Oils, Scooter Gear Oils, Brake Fluids, Coolants' },
        { name: 'Bolts & Accessories', code: 'BLT', scope: 'Titanium Bolts, Gold Crankcase Bolts, Disc Bolts, Washers, Dress-up Accessories' },
        { name: 'Body & Seats', code: 'BODY', scope: 'Custom Seats, Fairings, Fenders, Body Panels, Footrests, Badges' },
        { name: 'Riding Gear & Luggage', code: 'GEAR', scope: 'Helmets, Riding Gloves, Jackets, Top Boxes, Utility Brackets, Luggage Bags' }
      ];

      for (const cat of standardCategories) {
        const [existing] = await db.query('SELECT category_id FROM categories WHERE LOWER(category_name) = LOWER(?)', [cat.name]);
        if (existing.length === 0) {
          await db.query(
            'INSERT INTO categories (category_name, category_code, scope, created_at) VALUES (?, ?, ?, NOW())',
            [cat.name, cat.code, cat.scope]
          );
        } else {
          await db.query(
            'UPDATE categories SET category_code = ?, scope = ? WHERE category_id = ?',
            [cat.code, cat.scope, existing[0].category_id]
          );
        }
      }
      console.log('[Schema] Verified standard 15 product categories.');
    } catch (catErr) {
      console.warn('[Schema] Failed to verify standard categories:', catErr.message);
    }

    // 18. Align brands and categories table collations with products table
    try {
      const [pCol] = await db.query("SHOW FULL COLUMNS FROM products LIKE 'brand'");
      const prodCollation = pCol[0]?.Collation || 'utf8mb4_0900_ai_ci';
      await db.query(`ALTER TABLE brands CONVERT TO CHARACTER SET utf8mb4 COLLATE ${prodCollation}`);
      await db.query(`ALTER TABLE brands MODIFY COLUMN brand_name VARCHAR(100) CHARACTER SET utf8mb4 COLLATE ${prodCollation} NOT NULL`);
      await db.query(`ALTER TABLE categories CONVERT TO CHARACTER SET utf8mb4 COLLATE ${prodCollation}`);
      await db.query(`ALTER TABLE categories MODIFY COLUMN category_name VARCHAR(100) CHARACTER SET utf8mb4 COLLATE ${prodCollation} NOT NULL`);
      console.log('[Schema] Aligned brands and categories table collations.');
    } catch (collateErr) {
      console.warn('[Schema] Collation alignment notice:', collateErr.message);
    }

    // 19. Ensure item_swaps table and columns exist
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS item_swaps (
            id INT AUTO_INCREMENT PRIMARY KEY,
            swap_code VARCHAR(100) UNIQUE NOT NULL,
            sale_id INT NULL,
            sale_item_id INT NULL,
            order_number VARCHAR(100) NULL,
            customer_name VARCHAR(150) NULL,
            returned_product_id INT NOT NULL,
            returned_product_name VARCHAR(255) NOT NULL,
            returned_part_number VARCHAR(100) NULL,
            returned_brand VARCHAR(100) NULL,
            returned_qty INT NOT NULL DEFAULT 1,
            returned_unit_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            returned_credit_total DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            old_cost_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            returned_disposition VARCHAR(50) NOT NULL DEFAULT 'RESTOCK',
            new_product_id INT NOT NULL,
            new_product_name VARCHAR(255) NOT NULL,
            new_part_number VARCHAR(100) NULL,
            new_brand VARCHAR(100) NULL,
            new_qty INT NOT NULL DEFAULT 1,
            new_unit_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            new_total_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            new_cost_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            cogs_adjustment DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            replacement_items_json TEXT NULL,
            price_difference DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            customer_top_up_paid DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            cash_refund_given DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            payment_method VARCHAR(50) NOT NULL DEFAULT 'None',
            shift_id INT NULL,
            cashier_id INT NULL,
            amount_tendered DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            change_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            reason VARCHAR(255) NULL,
            notes TEXT NULL,
            processed_by VARCHAR(100) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_swap_code (swap_code),
            INDEX idx_swap_sale (sale_id),
            INDEX idx_swap_ret_prod (returned_product_id),
            INDEX idx_swap_new_prod (new_product_id),
            INDEX idx_swap_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      const [swapCols] = await db.query("SHOW COLUMNS FROM item_swaps");
      const swapColNames = swapCols.map(c => c.Field);
      const colsToAdd = [
        { name: 'sale_item_id', sql: 'ALTER TABLE item_swaps ADD COLUMN sale_item_id INT NULL AFTER sale_id' },
        { name: 'shift_id', sql: 'ALTER TABLE item_swaps ADD COLUMN shift_id INT NULL AFTER payment_method' },
        { name: 'cashier_id', sql: 'ALTER TABLE item_swaps ADD COLUMN cashier_id INT NULL AFTER shift_id' },
        { name: 'old_cost_price', sql: 'ALTER TABLE item_swaps ADD COLUMN old_cost_price DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER returned_credit_total' },
        { name: 'new_cost_price', sql: 'ALTER TABLE item_swaps ADD COLUMN new_cost_price DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER new_total_price' },
        { name: 'cogs_adjustment', sql: 'ALTER TABLE item_swaps ADD COLUMN cogs_adjustment DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER new_cost_price' },
        { name: 'replacement_items_json', sql: 'ALTER TABLE item_swaps ADD COLUMN replacement_items_json TEXT NULL AFTER cogs_adjustment' }
      ];

      for (const col of colsToAdd) {
        if (!swapColNames.includes(col.name)) {
          try {
            await db.query(col.sql);
            console.log(`[Schema] Added missing ${col.name} to item_swaps`);
          } catch (e) {
            console.warn(`[Schema] Add ${col.name} notice:`, e.message);
          }
        }
      }
      console.log('[Schema] Verified item_swaps table & columns.');
    } catch (swapErr) {
      console.warn('[Schema] Failed to verify item_swaps table:', swapErr.message);
    }

    // 20. Ensure pos_discount_otps table exists
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS pos_discount_otps (
            id INT AUTO_INCREMENT PRIMARY KEY,
            otp_code VARCHAR(10) NOT NULL,
            code_hash VARCHAR(255) NOT NULL,
            cashier_id INT NULL,
            cashier_name VARCHAR(150) NULL,
            admin_email VARCHAR(200) NULL,
            discount_type VARCHAR(20) NOT NULL DEFAULT 'fixed',
            discount_value DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            reason TEXT NULL,
            cart_retail DECIMAL(12,2) NOT NULL DEFAULT 0.00,
            cart_cost DECIMAL(12,2) NOT NULL DEFAULT 0.00,
            attempts INT NOT NULL DEFAULT 0,
            expires_at DATETIME NOT NULL,
            used_at DATETIME NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_otp_cashier (cashier_id),
            INDEX idx_otp_expires (expires_at),
            INDEX idx_otp_used (used_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
      console.log('[Schema] Verified pos_discount_otps table.');
    } catch (otpErr) {
      console.warn('[Schema] Failed to verify pos_discount_otps table:', otpErr.message);
    }

    try {
      const syncProductionSchema = require('../scripts/sync_production_db');
      await syncProductionSchema();
    } catch (syncErr) {
      console.warn('[Schema] Sync production schema warning:', syncErr.message);
    }
} catch (err) {
    console.warn('[Schema] Auto-migration check completed with note:', err.message);
  }
}

module.exports = ensureSchema;
