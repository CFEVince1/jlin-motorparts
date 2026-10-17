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

        // Helper: Ensure index/constraint exists
        async function ensureIndex(tableName, indexName, definition) {
            const [rows] = await connection.query(
                `SELECT INDEX_NAME FROM information_schema.STATISTICS 
                 WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
                [config.database, tableName, indexName]
            );
            if (rows.length === 0) {
                await connection.query(`ALTER TABLE \`${tableName}\` ADD ${definition}`);
                console.log(`  + Added index/constraint ${indexName} to table ${tableName}`);
            }
        }

        // ----------------------------------------------------
        // 0. USERS (token_version)
        // ----------------------------------------------------
        console.log('0. Verifying `users` table...');
        await ensureColumn('users', 'token_version', 'INT NOT NULL DEFAULT 1');
        console.log('   `users` table ready.');

        // ----------------------------------------------------
        // 1. SUPPLIERS
        // ----------------------------------------------------
        console.log('1. Creating / Verifying `suppliers` table...');
        await connection.query(`
            CREATE TABLE IF NOT EXISTS suppliers (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(150) NOT NULL UNIQUE,
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
                reference_number VARCHAR(100) NOT NULL,
                reference_no VARCHAR(100) DEFAULT NULL,
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
        await ensureColumn('receiving_records', 'reference_no', 'VARCHAR(100) DEFAULT NULL AFTER reference_number');
        await connection.query('UPDATE receiving_records SET reference_no = reference_number WHERE reference_no IS NULL');
        try {
            await connection.query('ALTER TABLE receiving_records ADD UNIQUE KEY uq_supplier_ref (supplier_id, reference_no)');
        } catch (e) { /* ignore if already exists */ }
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
                item_id INT DEFAULT NULL,
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
        await ensureColumn('receiving_record_items', 'item_id', 'INT DEFAULT NULL AFTER product_id');
        await connection.query('UPDATE receiving_record_items SET item_id = product_id WHERE item_id IS NULL');
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
                compatibility_status ENUM('COMPATIBLE', 'NOT_COMPATIBLE', 'CONDITIONAL') NOT NULL DEFAULT 'COMPATIBLE',
                notes VARCHAR(255) DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_prod_compat (product_id, motorcycle_model_id),
                INDEX idx_compat_product (product_id),
                INDEX idx_compat_model (motorcycle_model_id),
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
                FOREIGN KEY (motorcycle_model_id) REFERENCES motorcycle_models(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        await ensureColumn('product_compatibilities', 'compatibility_status', "ENUM('COMPATIBLE', 'NOT_COMPATIBLE', 'CONDITIONAL') NOT NULL DEFAULT 'COMPATIBLE' AFTER motorcycle_model_id");

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
        // 6. PRODUCTS (sku, current_stock, retail_price) & SYNC TRIGGERS
        // ----------------------------------------------------
        console.log('6. Synchronizing `products` columns and triggers...');
        await ensureColumn('products', 'sku', 'VARCHAR(100) DEFAULT NULL AFTER part_number');
        await connection.query('UPDATE products SET sku = part_number WHERE sku IS NULL');
        await ensureColumn('products', 'current_stock', 'INT NOT NULL DEFAULT 0 AFTER stock');
        await connection.query('UPDATE products SET current_stock = stock WHERE current_stock = 0 AND stock > 0');
        await ensureColumn('products', 'retail_price', 'DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER selling_price');
        await connection.query('UPDATE products SET retail_price = selling_price WHERE retail_price = 0.00 AND selling_price > 0');

        // Install synchronization triggers on products
        await connection.query('DROP TRIGGER IF EXISTS trg_sync_products_insert;');
        await connection.query(`
            CREATE TRIGGER trg_sync_products_insert
            BEFORE INSERT ON products
            FOR EACH ROW
            BEGIN
                IF NEW.sku IS NULL OR NEW.sku = '' THEN
                    SET NEW.sku = NEW.part_number;
                END IF;
                IF NEW.part_number IS NULL OR NEW.part_number = '' THEN
                    SET NEW.part_number = NEW.sku;
                END IF;
                IF NEW.current_stock IS NULL OR (NEW.current_stock = 0 AND NEW.stock IS NOT NULL AND NEW.stock != 0) THEN
                    SET NEW.current_stock = COALESCE(NEW.stock, 0);
                ELSEIF NEW.stock IS NULL OR (NEW.stock = 0 AND NEW.current_stock IS NOT NULL AND NEW.current_stock != 0) THEN
                    SET NEW.stock = COALESCE(NEW.current_stock, 0);
                END IF;
                IF NEW.retail_price IS NULL OR NEW.retail_price = 0 THEN
                    SET NEW.retail_price = COALESCE(NEW.selling_price, 0.00);
                END IF;
                IF NEW.selling_price IS NULL OR NEW.selling_price = 0 THEN
                    SET NEW.selling_price = COALESCE(NEW.retail_price, 0.00);
                END IF;
            END;
        `);

        await connection.query('DROP TRIGGER IF EXISTS trg_sync_products_update;');
        await connection.query(`
            CREATE TRIGGER trg_sync_products_update
            BEFORE UPDATE ON products
            FOR EACH ROW
            BEGIN
                IF NEW.current_stock != OLD.current_stock AND NEW.stock = OLD.stock THEN
                    SET NEW.stock = NEW.current_stock;
                ELSEIF NEW.stock != OLD.stock AND NEW.current_stock = OLD.current_stock THEN
                    SET NEW.current_stock = NEW.stock;
                END IF;

                IF NEW.sku != OLD.sku AND (NEW.part_number = OLD.part_number OR NEW.part_number IS NULL) THEN
                    SET NEW.part_number = NEW.sku;
                ELSEIF NEW.part_number != OLD.part_number AND (NEW.sku = OLD.sku OR NEW.sku IS NULL) THEN
                    SET NEW.sku = NEW.part_number;
                END IF;

                IF NEW.retail_price != OLD.retail_price AND NEW.selling_price = OLD.selling_price THEN
                    SET NEW.selling_price = NEW.retail_price;
                ELSEIF NEW.selling_price != OLD.selling_price AND NEW.retail_price = OLD.retail_price THEN
                    SET NEW.retail_price = NEW.selling_price;
                END IF;
            END;
        `);
        console.log('   `products` synchronization triggers installed.');

        // ----------------------------------------------------
        // 7. SALES (Order Number and Reference)
        // ----------------------------------------------------
        console.log('7. Verifying `sales` table columns...');
        await ensureColumn('sales', 'order_number', "VARCHAR(100) DEFAULT NULL");
        await ensureColumn('sales', 'payment_reference', "VARCHAR(100) DEFAULT NULL");
        await ensureIndex('sales', 'uq_sales_payment_reference', "CONSTRAINT uq_sales_payment_reference UNIQUE (payment_reference)");
        await ensureColumn('sales', 'payment_provider', "VARCHAR(50) DEFAULT NULL");
        await ensureColumn('sales', 'payment_status', "VARCHAR(50) DEFAULT 'paid'");
        await ensureColumn('sales', 'subtotal_amount', "DECIMAL(10,2) DEFAULT NULL");
        await ensureColumn('sales', 'discount_amount', "DECIMAL(10,2) DEFAULT 0.00");
        await ensureColumn('sales', 'tax_amount', "DECIMAL(10,2) DEFAULT 0.00");
        await ensureColumn('sales', 'card_type', "VARCHAR(50) DEFAULT NULL");
        await ensureColumn('sales', 'card_last4', "VARCHAR(4) DEFAULT NULL");
        await ensureColumn('sales', 'paid_at', "TIMESTAMP NULL DEFAULT NULL");
        console.log('   `sales` table columns synchronized.');

        // ----------------------------------------------------
        // 8. INVENTORY TRANSACTIONS (APPEND-ONLY LEDGER)
        // ----------------------------------------------------
        console.log('8. Creating / Verifying `inventory_transactions` append-only ledger...');
        await connection.query(`
            CREATE TABLE IF NOT EXISTS inventory_transactions (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                transaction_number VARCHAR(100) UNIQUE NOT NULL,
                reference_no VARCHAR(100) DEFAULT NULL,
                product_id INT NOT NULL,
                transaction_type VARCHAR(50) NOT NULL,
                quantity INT NOT NULL,
                quantity_change INT NOT NULL DEFAULT 0,
                balance_before INT NOT NULL DEFAULT 0,
                balance_after INT NOT NULL DEFAULT 0,
                unit_cost DECIMAL(10,2) DEFAULT NULL,
                reference_type VARCHAR(50) DEFAULT NULL,
                reference_id INT DEFAULT NULL,
                loss_transaction_id BIGINT DEFAULT NULL,
                notes TEXT DEFAULT NULL,
                remarks TEXT DEFAULT NULL,
                created_by INT DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_it_product (product_id),
                INDEX idx_it_type (transaction_type),
                INDEX idx_it_created (created_at),
                INDEX idx_it_ref (reference_type, reference_id),
                FOREIGN KEY (product_id) REFERENCES products(id),
                FOREIGN KEY (created_by) REFERENCES users(id),
                CONSTRAINT chk_it_quantity_change_sign CHECK (
                    (transaction_type IN ('STOCK_OUT', 'SALE', 'DAMAGE', 'LOSS', 'RETURN_TO_SUPPLIER', 'ADJUSTMENT_SUB') AND quantity_change < 0)
                    OR
                    (transaction_type IN ('STOCK_IN', 'PURCHASE_RECEIPT', 'FOUND', 'RETURN', 'ADJUSTMENT_ADD') AND quantity_change > 0)
                    OR
                    (transaction_type = 'OPENING_BALANCE' AND quantity_change >= 0)
                )
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        await connection.query('ALTER TABLE inventory_transactions MODIFY COLUMN transaction_type VARCHAR(50) NOT NULL;');
        await ensureColumn('inventory_transactions', 'reference_no', 'VARCHAR(100) DEFAULT NULL AFTER transaction_number');
        await ensureColumn('inventory_transactions', 'quantity_change', 'INT NOT NULL DEFAULT 0 AFTER quantity');
        await ensureColumn('inventory_transactions', 'loss_transaction_id', 'BIGINT DEFAULT NULL AFTER reference_id');
        await ensureColumn('inventory_transactions', 'remarks', 'TEXT DEFAULT NULL AFTER notes');

        // Ensure CHECK constraint is enforced on existing tables
        try {
            await connection.query(`
                ALTER TABLE inventory_transactions ADD CONSTRAINT chk_it_quantity_change_sign CHECK (
                    (transaction_type IN ('STOCK_OUT', 'SALE', 'DAMAGE', 'LOSS', 'RETURN_TO_SUPPLIER', 'ADJUSTMENT_SUB') AND quantity_change < 0)
                    OR
                    (transaction_type IN ('STOCK_IN', 'PURCHASE_RECEIPT', 'FOUND', 'RETURN', 'ADJUSTMENT_ADD') AND quantity_change > 0)
                    OR
                    (transaction_type = 'OPENING_BALANCE' AND quantity_change >= 0)
                )
            `);
        } catch (e) {
            // Ignore if already exists
        }
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
        console.log('   `inventory_transactions_lock` sentinel table ready.');

        // Row- and statement-level blocking triggers on inventory_transactions
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
        console.log('   `inventory_transactions` immutable triggers active.');

        // ----------------------------------------------------
        // 9. COMPATIBILITY VIEW: items
        // ----------------------------------------------------
        console.log('9. Creating / Updating `items` compatibility view...');
        await connection.query(`
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
            FROM products;
        `);
        console.log('   `items` view ready.');

        // ----------------------------------------------------
        // 10. BASELINE OPENING_BALANCE ENTRIES
        // ----------------------------------------------------
        console.log('\n10. Checking baseline OPENING_BALANCE entries for pre-existing items...');
        const [pendingProducts] = await connection.query(`
            SELECT p.id, p.part_number, p.name, p.stock, p.cost_price
            FROM products p
            WHERE NOT EXISTS (
                SELECT 1 FROM inventory_transactions it
                WHERE it.product_id = p.id AND it.transaction_type = 'OPENING_BALANCE'
            ) AND p.stock > 0;
        `);

        if (pendingProducts.length > 0) {
            const [adminUsers] = await connection.query(`SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1;`);
            const adminId = adminUsers.length > 0 ? adminUsers[0].id : 1;

            let insertedCount = 0;
            for (const prod of pendingProducts) {
                const txNumber = `TX-OPB-${String(prod.id).padStart(4, '0')}-${Date.now().toString().slice(-6)}`;
                await connection.query(`
                    INSERT INTO inventory_transactions (
                        transaction_number,
                        reference_no,
                        product_id,
                        transaction_type,
                        quantity,
                        quantity_change,
                        balance_before,
                        balance_after,
                        unit_cost,
                        reference_type,
                        reference_id,
                        notes,
                        remarks,
                        created_by,
                        created_at
                    ) VALUES (?, 'OPENING_BALANCE', ?, 'OPENING_BALANCE', ?, ?, 0, ?, ?, 'OPENING_BALANCE', ?, ?, ?, ?, NOW())
                `, [
                    txNumber,
                    prod.id,
                    prod.stock,
                    prod.stock,
                    prod.stock,
                    prod.cost_price || 0.00,
                    prod.id,
                    `Baseline OPENING_BALANCE for pre-existing product: ${prod.name} (${prod.part_number})`,
                    `Baseline OPENING_BALANCE for pre-existing product: ${prod.name} (${prod.part_number})`,
                    adminId
                ]);
                insertedCount++;
            }
            console.log(`   ✓ Created ${insertedCount} OPENING_BALANCE entries.`);
        }

        console.log('\n=====================================================');
        console.log(' Migration Completed Successfully! ');
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
