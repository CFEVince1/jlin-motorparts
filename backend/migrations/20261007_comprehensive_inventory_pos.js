const path = require('path');
const fs = require('fs');

// Ensure modules can be resolved from backend/node_modules
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

// Attempt to load .env from backend/.env or current working directory
const envPaths = [
    path.join(__dirname, '..', 'backend', '.env'),
    path.join(__dirname, '.env'),
    path.join(process.cwd(), 'backend', '.env'),
    path.join(process.cwd(), '.env')
];

let envLoaded = false;
for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
        require('dotenv').config({ path: envPath });
        envLoaded = true;
        break;
    }
}
if (!envLoaded) {
    require('dotenv').config();
}

const mysql = require('mysql2/promise');

async function runMigration() {
    console.log('=====================================================');
    console.log(' Running Migration: 20261007_comprehensive_inventory_pos');
    console.log('=====================================================\n');

    const config = {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT, 10) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'jlin_inventory_db',
        multipleStatements: true,
        ...(process.env.DB_HOST && process.env.DB_HOST.includes('aivencloud') 
            ? { ssl: { rejectUnauthorized: false } } 
            : {})
    };

    console.log(`Connecting to database ${config.database} on ${config.host}:${config.port}...`);
    const connection = await mysql.createConnection(config);
    console.log('Connected successfully.\n');

    try {
        // Helper: Check if column exists
        async function columnExists(tableName, columnName) {
            const [rows] = await connection.query(
                `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
                 WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
                [config.database, tableName, columnName]
            );
            return rows.length > 0;
        }

        // Helper: Ensure column exists
        async function ensureColumn(tableName, columnName, definition) {
            const exists = await columnExists(tableName, columnName);
            if (!exists) {
                await connection.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`);
                console.log(`  + Added column ${columnName} to table ${tableName}`);
            }
        }

        // ----------------------------------------------------
        // 1. SUPPLIERS
        // ----------------------------------------------------
        console.log('1. Creating / Verifying `suppliers` table...');
        await connection.query(`
            CREATE TABLE IF NOT EXISTS suppliers (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(150) NOT NULL,
                contact_person VARCHAR(100) DEFAULT NULL,
                email VARCHAR(100) DEFAULT NULL,
                phone VARCHAR(50) DEFAULT NULL,
                address TEXT DEFAULT NULL,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_supplier_name (name),
                INDEX idx_supplier_active (is_active)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('   `suppliers` table ready.');

        // ----------------------------------------------------
        // 2. RECEIVING RECORDS
        // ----------------------------------------------------
        console.log('2. Creating / Verifying `receiving_records` table...');
        await connection.query(`
            CREATE TABLE IF NOT EXISTS receiving_records (
                id INT AUTO_INCREMENT PRIMARY KEY,
                supplier_id INT NOT NULL,
                reference_number VARCHAR(100) NOT NULL UNIQUE,
                received_by INT DEFAULT NULL,
                received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                total_cost DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                status ENUM('draft', 'received', 'cancelled') NOT NULL DEFAULT 'received',
                notes TEXT DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_rec_ref (reference_number),
                INDEX idx_rec_supplier (supplier_id),
                INDEX idx_rec_date (received_at),
                FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
                FOREIGN KEY (received_by) REFERENCES users(id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('   `receiving_records` table ready.');

        // ----------------------------------------------------
        // 3. RECEIVING RECORD ITEMS
        // ----------------------------------------------------
        console.log('3. Creating / Verifying `receiving_record_items` table...');
        await connection.query(`
            CREATE TABLE IF NOT EXISTS receiving_record_items (
                id INT AUTO_INCREMENT PRIMARY KEY,
                receiving_record_id INT NOT NULL,
                product_id INT NOT NULL,
                quantity INT NOT NULL,
                cost_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                subtotal DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_rec_item_rec (receiving_record_id),
                INDEX idx_rec_item_prod (product_id),
                FOREIGN KEY (receiving_record_id) REFERENCES receiving_records(id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES products(id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('   `receiving_record_items` table ready.');

        // ----------------------------------------------------
        // 4. MOTORCYCLE MODELS
        // ----------------------------------------------------
        console.log('4. Creating / Verifying `motorcycle_models` table...');
        await connection.query(`
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
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // Migrate existing rows from motorcycle_units if available
        const [unitTables] = await connection.query(
            `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'motorcycle_units'`,
            [config.database]
        );
        if (unitTables.length > 0) {
            await connection.query(`
                INSERT IGNORE INTO motorcycle_models (brand, model, year_model)
                SELECT brand, model, year_model FROM motorcycle_units;
            `);
            console.log('   `motorcycle_models` populated from `motorcycle_units`.');
        } else {
            console.log('   `motorcycle_models` table ready.');
        }

        // ----------------------------------------------------
        // 5. PRODUCT COMPATIBILITIES
        // ----------------------------------------------------
        console.log('5. Creating / Verifying `product_compatibilities` table...');
        await connection.query(`
            CREATE TABLE IF NOT EXISTS product_compatibilities (
                id INT AUTO_INCREMENT PRIMARY KEY,
                product_id INT NOT NULL,
                motorcycle_model_id INT NOT NULL,
                notes VARCHAR(255) DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_prod_compat (product_id, motorcycle_model_id),
                INDEX idx_compat_product (product_id),
                INDEX idx_compat_model (motorcycle_model_id),
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
                FOREIGN KEY (motorcycle_model_id) REFERENCES motorcycle_models(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // Ensure motorcycle_models matches database collation
        await connection.query(`ALTER TABLE motorcycle_models CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;`);

        // Migrate existing mappings from product_compatibility if available
        const [compatTables] = await connection.query(
            `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'product_compatibility'`,
            [config.database]
        );
        if (compatTables.length > 0) {
            await connection.query(`
                INSERT IGNORE INTO product_compatibilities (product_id, motorcycle_model_id)
                SELECT pc.product_id, mm.id
                FROM product_compatibility pc
                JOIN motorcycle_units mu ON mu.id = pc.motorcycle_unit_id
                JOIN motorcycle_models mm ON 
                    mm.brand COLLATE utf8mb4_general_ci = mu.brand COLLATE utf8mb4_general_ci 
                    AND mm.model COLLATE utf8mb4_general_ci = mu.model COLLATE utf8mb4_general_ci 
                    AND COALESCE(mm.year_model, '') COLLATE utf8mb4_general_ci = COALESCE(mu.year_model, '') COLLATE utf8mb4_general_ci;
            `);
            console.log('   `product_compatibilities` populated from existing compatibility mapping.');
        } else {
            console.log('   `product_compatibilities` table ready.');
        }

        // ----------------------------------------------------
        // 6. SEQUENCE sales_order_seq & sales_orders
        // ----------------------------------------------------
        console.log('6. Setting up `sales_order_seq` sequence & `sales_orders` table...');
        try {
            await connection.query(`CREATE SEQUENCE IF NOT EXISTS sales_order_seq START WITH 1 INCREMENT BY 1;`);
            console.log('   Native sequence `sales_order_seq` created.');
        } catch (seqErr) {
            console.log(`   (Note: Sequence syntax fallback: ${seqErr.message})`);
            await connection.query(`
                CREATE TABLE IF NOT EXISTS sales_order_seq (
                    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY
                ) ENGINE=InnoDB;
            `);
            console.log('   Fallback sequence table `sales_order_seq` created.');
        }

        await connection.query(`
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
                FOREIGN KEY (user_id) REFERENCES users(id),
                INDEX idx_so_number (order_number),
                INDEX idx_so_user (user_id),
                INDEX idx_so_status (status),
                INDEX idx_so_date (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('   `sales_orders` table ready.');

        // Also ensure extended payment columns exist on sales_orders
        await ensureColumn('sales_orders', 'payment_reference', "VARCHAR(100) DEFAULT NULL");
        await ensureColumn('sales_orders', 'payment_provider', "VARCHAR(50) DEFAULT NULL");
        await ensureColumn('sales_orders', 'payment_status', "ENUM('paid', 'partial', 'pending', 'refunded', 'voided') NOT NULL DEFAULT 'paid'");
        await ensureColumn('sales_orders', 'card_type', "VARCHAR(50) DEFAULT NULL");
        await ensureColumn('sales_orders', 'card_last4', "VARCHAR(4) DEFAULT NULL");
        await ensureColumn('sales_orders', 'paid_at', "TIMESTAMP NULL DEFAULT NULL");
        await ensureColumn('sales_orders', 'subtotal_amount', "DECIMAL(10,2) NOT NULL DEFAULT 0.00");
        await ensureColumn('sales_orders', 'discount_amount', "DECIMAL(10,2) NOT NULL DEFAULT 0.00");
        await ensureColumn('sales_orders', 'tax_amount', "DECIMAL(10,2) NOT NULL DEFAULT 0.00");
        await ensureColumn('sales_orders', 'customer_phone', "VARCHAR(50) DEFAULT NULL");

        // Also add extended columns to existing `sales` table for backwards compatibility
        const [salesTable] = await connection.query(
            `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'sales'`,
            [config.database]
        );
        if (salesTable.length > 0) {
            await ensureColumn('sales', 'order_number', "VARCHAR(100) DEFAULT NULL");
            await ensureColumn('sales', 'payment_reference', "VARCHAR(100) DEFAULT NULL");
            await ensureColumn('sales', 'payment_provider', "VARCHAR(50) DEFAULT NULL");
            await ensureColumn('sales', 'payment_status', "VARCHAR(50) DEFAULT 'paid'");
            await ensureColumn('sales', 'subtotal_amount', "DECIMAL(10,2) DEFAULT NULL");
            await ensureColumn('sales', 'discount_amount', "DECIMAL(10,2) DEFAULT 0.00");
            await ensureColumn('sales', 'tax_amount', "DECIMAL(10,2) DEFAULT 0.00");
            await ensureColumn('sales', 'card_type', "VARCHAR(50) DEFAULT NULL");
            await ensureColumn('sales', 'card_last4', "VARCHAR(4) DEFAULT NULL");
            await ensureColumn('sales', 'paid_at', "TIMESTAMP NULL DEFAULT NULL");
            console.log('   `sales` table backward-compatible extended payment columns synchronized.');
        }

        // Create sales_order_items table
        await connection.query(`
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
                INDEX idx_so_item_order (sales_order_id),
                INDEX idx_so_item_product (product_id),
                FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES products(id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('   `sales_order_items` table ready.');

        // ----------------------------------------------------
        // 7. INVENTORY TRANSACTIONS (APPEND-ONLY LEDGER)
        // ----------------------------------------------------
        console.log('7. Creating / Verifying `inventory_transactions` append-only ledger...');
        await connection.query(`
            CREATE TABLE IF NOT EXISTS inventory_transactions (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                transaction_number VARCHAR(100) UNIQUE NOT NULL,
                product_id INT NOT NULL,
                transaction_type ENUM(
                    'OPENING_BALANCE',
                    'STOCK_IN',
                    'STOCK_OUT',
                    'PURCHASE_RECEIPT',
                    'SALE',
                    'RETURN',
                    'ADJUSTMENT_ADD',
                    'ADJUSTMENT_SUB'
                ) NOT NULL,
                quantity INT NOT NULL,
                balance_before INT NOT NULL DEFAULT 0,
                balance_after INT NOT NULL DEFAULT 0,
                unit_cost DECIMAL(10,2) DEFAULT NULL,
                reference_type VARCHAR(50) DEFAULT NULL,
                reference_id INT DEFAULT NULL,
                notes TEXT DEFAULT NULL,
                created_by INT DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_it_product (product_id),
                INDEX idx_it_type (transaction_type),
                INDEX idx_it_created (created_at),
                INDEX idx_it_ref (reference_type, reference_id),
                FOREIGN KEY (product_id) REFERENCES products(id),
                FOREIGN KEY (created_by) REFERENCES users(id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('   `inventory_transactions` table ready.');

        // Child lock table to strictly prevent TRUNCATE via foreign key reference
        await connection.query(`
            CREATE TABLE IF NOT EXISTS inventory_transactions_lock (
                id INT AUTO_INCREMENT PRIMARY KEY,
                transaction_id BIGINT DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT fk_inv_tx_lock FOREIGN KEY (transaction_id) REFERENCES inventory_transactions(id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('   `inventory_transactions_lock` sentinel table ready (blocks TRUNCATE via FK constraint).');

        // ----------------------------------------------------
        // 8. ROW- AND STATEMENT-LEVEL PROTECTION TRIGGERS
        // ----------------------------------------------------
        console.log('8. Installing row-level and statement blocking triggers on `inventory_transactions`...');
        
        // Trigger: Block UPDATE
        await connection.query(`DROP TRIGGER IF EXISTS trg_block_inventory_transactions_update;`);
        await connection.query(`
            CREATE TRIGGER trg_block_inventory_transactions_update
            BEFORE UPDATE ON inventory_transactions
            FOR EACH ROW
            BEGIN
                SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Forbidden: inventory_transactions is an immutable append-only ledger and cannot be modified.';
            END;
        `);
        console.log('   ✓ Trigger `trg_block_inventory_transactions_update` active.');

        // Trigger: Block DELETE
        await connection.query(`DROP TRIGGER IF EXISTS trg_block_inventory_transactions_delete;`);
        await connection.query(`
            CREATE TRIGGER trg_block_inventory_transactions_delete
            BEFORE DELETE ON inventory_transactions
            FOR EACH ROW
            BEGIN
                SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Forbidden: inventory_transactions is an immutable append-only ledger and cannot be deleted.';
            END;
        `);
        console.log('   ✓ Trigger `trg_block_inventory_transactions_delete` active.');

        // ----------------------------------------------------
        // 9. IDEMPOTENT BASELINE OPENING_BALANCE ENTRIES
        // ----------------------------------------------------
        console.log('9. Checking and inserting idempotent baseline OPENING_BALANCE entries for pre-existing items...');

        // Fetch products that do NOT yet have an OPENING_BALANCE entry
        const [pendingProducts] = await connection.query(`
            SELECT p.id, p.part_number, p.name, p.stock, p.cost_price
            FROM products p
            WHERE NOT EXISTS (
                SELECT 1 FROM inventory_transactions it
                WHERE it.product_id = p.id AND it.transaction_type = 'OPENING_BALANCE'
            )
            ORDER BY p.id ASC;
        `);

        if (pendingProducts.length === 0) {
            console.log('   All pre-existing products already have an OPENING_BALANCE baseline entry (Idempotent skip).');
        } else {
            console.log(`   Found ${pendingProducts.length} product(s) needing OPENING_BALANCE baseline entries.`);

            // Get default admin user id
            const [adminUsers] = await connection.query(`SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1;`);
            const adminId = adminUsers.length > 0 ? adminUsers[0].id : 1;

            let insertedCount = 0;
            for (const prod of pendingProducts) {
                const txNumber = `TX-OPB-${String(prod.id).padStart(4, '0')}-${Date.now().toString().slice(-6)}`;
                await connection.query(`
                    INSERT INTO inventory_transactions (
                        transaction_number,
                        product_id,
                        transaction_type,
                        quantity,
                        balance_before,
                        balance_after,
                        unit_cost,
                        reference_type,
                        reference_id,
                        notes,
                        created_by,
                        created_at
                    ) VALUES (?, ?, 'OPENING_BALANCE', ?, 0, ?, ?, 'OPENING_BALANCE', ?, ?, ?, NOW())
                `, [
                    txNumber,
                    prod.id,
                    prod.stock,
                    prod.stock,
                    prod.cost_price || 0.00,
                    prod.id,
                    `Baseline OPENING_BALANCE for pre-existing product: ${prod.name} (${prod.part_number})`,
                    adminId
                ]);
                insertedCount++;
            }
            console.log(`   ✓ Created ${insertedCount} OPENING_BALANCE entries.`);
        }

        // ----------------------------------------------------
        // 10. VERIFICATION & AUDIT
        // ----------------------------------------------------
        console.log('\n10. Verifying Migration Integrity...');

        // Test Trigger Protection
        const [testSample] = await connection.query(`SELECT id, quantity FROM inventory_transactions LIMIT 1;`);
        if (testSample.length > 0) {
            const sampleId = testSample[0].id;

            // Test UPDATE block
            let updateBlocked = false;
            try {
                await connection.query(`UPDATE inventory_transactions SET quantity = 999 WHERE id = ?`, [sampleId]);
            } catch (err) {
                if (err.sqlState === '45000' || err.message.includes('Forbidden')) {
                    updateBlocked = true;
                }
            }

            // Test DELETE block
            let deleteBlocked = false;
            try {
                await connection.query(`DELETE FROM inventory_transactions WHERE id = ?`, [sampleId]);
            } catch (err) {
                if (err.sqlState === '45000' || err.message.includes('Forbidden')) {
                    deleteBlocked = true;
                }
            }

            // Test TRUNCATE block
            let truncateBlocked = false;
            try {
                await connection.query(`TRUNCATE TABLE inventory_transactions`);
            } catch (err) {
                if (err.errno === 1701 || err.message.includes('foreign key constraint')) {
                    truncateBlocked = true;
                }
            }

            console.log(`   [Trigger Test] UPDATE blocked:    ${updateBlocked ? 'PASS (Protected)' : 'FAIL'}`);
            console.log(`   [Trigger Test] DELETE blocked:    ${deleteBlocked ? 'PASS (Protected)' : 'FAIL'}`);
            console.log(`   [Trigger Test] TRUNCATE blocked:  ${truncateBlocked ? 'PASS (Protected)' : 'FAIL'}`);
        }

        // Count opening balance entries
        const [opbCount] = await connection.query(`SELECT COUNT(*) as cnt FROM inventory_transactions WHERE transaction_type = 'OPENING_BALANCE';`);
        console.log(`   [Ledger Audit] Total OPENING_BALANCE records: ${opbCount[0].cnt}`);

        console.log('\n=====================================================');
        console.log(' Phase 1 Migration Completed Successfully! ');
        console.log('=====================================================\n');

        await connection.end();
        process.exit(0);

    } catch (error) {
        console.error('\n❌ Migration Failed with error:', error);
        await connection.end();
        process.exit(1);
    }
}

runMigration();
