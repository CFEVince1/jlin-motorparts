require('dotenv').config();
const db = require('../config/db');
const bcrypt = require('bcryptjs');

async function setupDatabase() {
    console.log('[Setup] Initializing canonical database tables...');

    try {
        // 1. Users table
        await db.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                role ENUM('admin', 'staff') NOT NULL DEFAULT 'staff',
                token_version INT NOT NULL DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB;
        `);

        // 2. Suppliers table
        await db.query(`
            CREATE TABLE IF NOT EXISTS suppliers (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(150) NOT NULL UNIQUE,
                contact_person VARCHAR(100),
                email VARCHAR(100),
                phone VARCHAR(50),
                address TEXT,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB;
        `);

        // 3. Motorcycle Units (Legacy)
        await db.query(`
            CREATE TABLE IF NOT EXISTS motorcycle_units (
                id INT AUTO_INCREMENT PRIMARY KEY,
                brand VARCHAR(100) NOT NULL,
                model VARCHAR(100) NOT NULL,
                year_model VARCHAR(20),
                UNIQUE KEY unique_motorcycle_unit (brand, model, year_model)
            ) ENGINE=InnoDB;
        `);

        // 3b. Motorcycle Models (Canonical)
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
            ) ENGINE=InnoDB;
        `);

        // 4. Products table
        await db.query(`
            CREATE TABLE IF NOT EXISTS products (
                id INT AUTO_INCREMENT PRIMARY KEY,
                part_number VARCHAR(100) NOT NULL,
                sku VARCHAR(100),
                name VARCHAR(150) NOT NULL,
                brand VARCHAR(100) NOT NULL,
                category VARCHAR(100) NOT NULL,
                size VARCHAR(50) NOT NULL,
                measurement VARCHAR(100),
                thread_type VARCHAR(50),
                cost_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                selling_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                retail_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                stock INT NOT NULL DEFAULT 0,
                current_stock INT NOT NULL DEFAULT 0,
                reorder_level INT NOT NULL DEFAULT 5,
                is_serialized BOOLEAN NOT NULL DEFAULT FALSE,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_part_number (part_number),
                INDEX idx_brand (brand),
                INDEX idx_category (category)
            ) ENGINE=InnoDB;
        `);

        // 5. Product Compatibility (Legacy V1 - Retired)
        await db.query(`DROP TABLE IF EXISTS product_compatibility;`);

        // 5b. Product Compatibilities (Canonical V3)
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
            ) ENGINE=InnoDB;
        `);

        // 6. Product Serials
        await db.query(`
            CREATE TABLE IF NOT EXISTS product_serials (
                id INT AUTO_INCREMENT PRIMARY KEY,
                product_id INT NOT NULL,
                serial_number VARCHAR(100) NOT NULL UNIQUE,
                status ENUM('available', 'sold', 'defective') NOT NULL DEFAULT 'available',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
            ) ENGINE=InnoDB;
        `);

        // 7. Receiving Records (Stock-In Purchases)
        await db.query(`
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
                UNIQUE KEY uq_supplier_ref (supplier_id, reference_no),
                INDEX idx_rec_ref (reference_number),
                INDEX idx_rec_supplier (supplier_id),
                INDEX idx_rec_date (received_at),
                FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
                FOREIGN KEY (received_by) REFERENCES users(id)
            ) ENGINE=InnoDB;
        `);

        // 7b. Receiving Record Items
        await db.query(`
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
            ) ENGINE=InnoDB;
        `);

        // 8. Sales (Canonical POS Transactions)
        await db.query(`
            CREATE TABLE IF NOT EXISTS sales (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                total_amount DECIMAL(10,2) NOT NULL,
                tendered_amount DECIMAL(10,2) NOT NULL,
                change_due DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                payment_method ENUM('Cash', 'GCash', 'Card') NOT NULL DEFAULT 'Cash',
                order_number VARCHAR(100) DEFAULT NULL,
                payment_reference VARCHAR(100) DEFAULT NULL,
                payment_provider VARCHAR(50) DEFAULT NULL,
                payment_status VARCHAR(50) DEFAULT 'paid',
                subtotal_amount DECIMAL(10,2) DEFAULT NULL,
                discount_amount DECIMAL(10,2) DEFAULT 0.00,
                tax_amount DECIMAL(10,2) DEFAULT 0.00,
                card_type VARCHAR(50) DEFAULT NULL,
                card_last4 VARCHAR(4) DEFAULT NULL,
                paid_at TIMESTAMP NULL DEFAULT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id),
                UNIQUE KEY uq_sales_payment_reference (payment_reference)
            ) ENGINE=InnoDB;
        `);

        // Ensure unique constraint exists even if table was already created
        try {
            await db.query(`ALTER TABLE sales ADD CONSTRAINT uq_sales_payment_reference UNIQUE (payment_reference)`);
        } catch (e) {
            // Ignore if already exists
        }

        // 8b. Sale Items
        await db.query(`
            CREATE TABLE IF NOT EXISTS sale_items (
                id INT AUTO_INCREMENT PRIMARY KEY,
                sale_id INT NOT NULL,
                product_id INT NOT NULL,
                part_number VARCHAR(100) NOT NULL,
                product_name VARCHAR(255) NOT NULL,
                brand VARCHAR(100) NOT NULL,
                size VARCHAR(50) NOT NULL,
                quantity INT NOT NULL,
                price DECIMAL(10,2) NOT NULL,
                cost_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                subtotal DECIMAL(10,2) NOT NULL,
                FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES products(id)
            ) ENGINE=InnoDB;
        `);

        // 8c. Sale Item Serials
        await db.query(`
            CREATE TABLE IF NOT EXISTS sale_item_serials (
                id INT AUTO_INCREMENT PRIMARY KEY,
                sale_item_id INT NOT NULL,
                serial_id INT NOT NULL,
                UNIQUE (serial_id),
                FOREIGN KEY (sale_item_id) REFERENCES sale_items(id) ON DELETE CASCADE,
                FOREIGN KEY (serial_id) REFERENCES product_serials(id)
            ) ENGINE=InnoDB;
        `);

        // 9. Inventory Transactions (Append-Only Ledger)
        await db.query(`
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
            ) ENGINE=InnoDB;
        `);

        // Ensure CHECK constraint exists even if table was already created
        try {
            await db.query(`
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

        console.log('[Setup] Canonical tables verified.');

        // Seed Admin & Staff Users
        const [existingUsers] = await db.query('SELECT COUNT(*) as count FROM users');
        if (existingUsers[0].count === 0) {
            console.log('[Setup] Seeding default Admin and Staff accounts...');
            const adminHash = await bcrypt.hash('admin123', 10);
            const staffHash = await bcrypt.hash('staff123', 10);

            await db.query(`
                INSERT INTO users (username, password, role) VALUES 
                ('admin', ?, 'admin'),
                ('staff', ?, 'staff')
            `, [adminHash, staffHash]);
            console.log('[Setup] Default users created: admin/admin123 and staff/staff123');
        }

        // Seed Suppliers if empty (Names only, no fabricated contact details)
        const [existingSuppliers] = await db.query('SELECT COUNT(*) as count FROM suppliers');
        if (existingSuppliers[0].count === 0) {
            console.log('[Setup] Seeding initial suppliers (names only, no fabricated contact details)...');
            await db.query(`
                INSERT INTO suppliers (name, contact_person, email, phone, address, is_active) VALUES
                ('Yamaha Motor Philippines', NULL, NULL, NULL, NULL, 1),
                ('Suzuki Philippines Inc.', NULL, NULL, NULL, NULL, 1)
            `);
        }

        // Seed Motorcycle Units if empty
        const [existingUnits] = await db.query('SELECT COUNT(*) as count FROM motorcycle_units');
        if (existingUnits[0].count === 0) {
            console.log('[Setup] Seeding motorcycle units...');
            await db.query(`
                INSERT INTO motorcycle_units (brand, model, year_model) VALUES
                ('Yamaha', 'Aerox 155 V1', 'V1'),
                ('Yamaha', 'Aerox 155 V3', 'V3'),
                ('Yamaha', 'Mio i125', '2023'),
                ('Suzuki', 'Raider 150', '2022 FI'),
                ('Honda', 'Click 125', '2023')
            `);
        }

        // Seed Motorcycle Models matching units
        await db.query(`
            INSERT IGNORE INTO motorcycle_models (brand, model, year_model)
            SELECT DISTINCT brand, model, year_model FROM motorcycle_units
        `);

        // Seed Products if empty (Strictly 0 starting stock to ensure ledger integrity)
        const [existingProds] = await db.query('SELECT COUNT(*) as count FROM products');
        if (existingProds[0].count === 0) {
            console.log('[Setup] Seeding sample motorcycle parts with zero starting stock...');
            await db.query(`
                INSERT INTO products (part_number, sku, name, brand, category, size, cost_price, selling_price, retail_price, stock, current_stock, reorder_level, is_serialized) VALUES
                ('BLT-M8-001', 'BLT-M8-001', 'Bolt M8', 'JRP', 'Bolts', 'M8 x 20mm', 8.00, 15.00, 15.00, 0, 0, 10, FALSE),
                ('SP-001', 'SP-001', 'Spark Plug', 'NGK', 'Ignition', 'Standard', 75.00, 120.00, 120.00, 0, 0, 8, FALSE),
                ('ECU-RAIDER-01', 'ECU-RAIDER-01', 'ECU', 'Suzuki', 'Electrical', 'Raider FI ECU', 1500.00, 2500.00, 2500.00, 0, 0, 1, TRUE),
                ('0A123D21', '0A123D21', 'block', 'jvt', 'engine', '66mm', 6500.00, 7500.00, 7500.00, 0, 0, 1, FALSE),
                ('JLR-BP-AEROX', 'JLR-BP-AEROX', 'Aerox Front Brake Pad Set', 'Yamaha', 'Brakes', 'Standard', 250.00, 450.00, 450.00, 0, 0, 5, FALSE),
                ('JLR-OF-AEROX', 'JLR-OF-AEROX', 'Aerox Engine Oil Filter Element', 'Yamaha', 'Maintenance', 'Standard', 120.00, 220.00, 220.00, 0, 0, 5, FALSE)
            `);

            // Seed OPENING_BALANCE ledger entries for the initial products
            const [prods] = await db.query('SELECT id FROM products');
            for (const prod of prods) {
                const txNumber = `TX-INIT-P${prod.id}-${Date.now()}`;
                await db.query(`
                    INSERT IGNORE INTO inventory_transactions (
                        transaction_number, reference_no, product_id, transaction_type,
                        quantity, quantity_change, balance_before, balance_after,
                        reference_type, notes
                    ) VALUES (?, 'INIT-SETUP', ?, 'OPENING_BALANCE', 0, 0, 0, 0, 'INITIALIZATION', 'Initial product catalog creation')
                `, [txNumber, prod.id]);
            }
        }

        console.log('[Setup] Database setup complete! Ready for production / defense deployment.');
        process.exit(0);
    } catch (err) {
        console.error('[Setup Error]', err);
        process.exit(1);
    }
}

setupDatabase();
