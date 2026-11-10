const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('../config/db');

async function syncProductionSchema() {
    console.log('[Sync Production DB] Starting full schema verification & migration on database...');

    try {
        // ----------------------------------------------------
        // 1. Users Table Columns
        // ----------------------------------------------------
        console.log('[1/12] Verifying users table columns...');
        const [userCols] = await db.query("SHOW COLUMNS FROM users");
        const userColNames = userCols.map(c => c.Field);

        if (!userColNames.includes('full_name')) {
            await db.query("ALTER TABLE users ADD COLUMN full_name VARCHAR(150) NULL AFTER id");
            console.log(' -> Added full_name to users');
        }
        if (!userColNames.includes('password_hash')) {
            await db.query("ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NULL AFTER password");
            console.log(' -> Added password_hash to users');
        }
        if (!userColNames.includes('is_active')) {
            await db.query("ALTER TABLE users ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER role");
            console.log(' -> Added is_active to users');
        }
        if (!userColNames.includes('pin')) {
            await db.query("ALTER TABLE users ADD COLUMN pin VARCHAR(20) DEFAULT '1234' AFTER email_verified_at");
            console.log(' -> Added pin to users');
        }
        if (!userColNames.includes('token_version')) {
            await db.query("ALTER TABLE users ADD COLUMN token_version INT NOT NULL DEFAULT 1");
            console.log(' -> Added token_version to users');
        }
        await db.query("ALTER TABLE users MODIFY COLUMN role VARCHAR(50) NOT NULL DEFAULT 'cashier'");

        // Ensure admin user exists and is active with valid hash
        const [adminRows] = await db.query("SELECT id, password FROM users WHERE username = 'admin'");
        const adminHash = await bcrypt.hash('admin123', 10);
        if (adminRows.length === 0) {
            await db.query(
                "INSERT INTO users (full_name, username, password, password_hash, role, pin, is_active, token_version) VALUES (?, ?, ?, ?, ?, ?, 1, 1)",
                ['Owner / Admin', 'admin', adminHash, adminHash, 'admin', '1234']
            );
            console.log(' -> Created default admin user (admin / admin123)');
        } else {
            await db.query(
                "UPDATE users SET full_name = COALESCE(NULLIF(full_name, ''), 'Owner / Admin'), is_active = 1, pin = COALESCE(NULLIF(pin, ''), '1234'), role = 'admin' WHERE username = 'admin'"
            );
            console.log(' -> Updated admin user status to active');
        }

        // Ensure staff user exists and is active with valid hash
        const [staffRows] = await db.query("SELECT id FROM users WHERE username = 'staff'");
        const staffHash = await bcrypt.hash('staff123', 10);
        if (staffRows.length === 0) {
            await db.query(
                "INSERT INTO users (full_name, username, password, password_hash, role, pin, is_active, token_version) VALUES (?, ?, ?, ?, ?, ?, 1, 1)",
                ['Cashier Staff', 'staff', staffHash, staffHash, 'cashier', '1234']
            );
            console.log(' -> Created default staff user (staff / staff123)');
        } else {
            await db.query(
                "UPDATE users SET full_name = COALESCE(NULLIF(full_name, ''), 'Cashier Staff'), is_active = 1, pin = COALESCE(NULLIF(pin, ''), '1234'), role = 'cashier' WHERE username = 'staff'"
            );
            console.log(' -> Updated staff user status to active');
        }

        // ----------------------------------------------------
        // 2. Role Permissions Table
        // ----------------------------------------------------
        console.log('[2/12] Verifying role_permissions table...');
        await db.query(`
            CREATE TABLE IF NOT EXISTS role_permissions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                role VARCHAR(50) NOT NULL,
                module VARCHAR(60) NOT NULL,
                module_name VARCHAR(100) NOT NULL,
                can_view TINYINT(1) DEFAULT 1,
                can_create TINYINT(1) DEFAULT 0,
                can_edit TINYINT(1) DEFAULT 0,
                can_delete TINYINT(1) DEFAULT 0,
                can_approve TINYINT(1) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_role_module (role, module)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // Seed default role permissions if empty
        const [permCount] = await db.query("SELECT COUNT(*) as cnt FROM role_permissions");
        if (permCount[0].cnt === 0) {
            const defaultModules = [
                { id: 'dashboard', name: '1. Dashboard' },
                { id: 'pos', name: '2. POS' },
                { id: 'sales_history', name: '3. Sales History' },
                { id: 'approvals', name: '4. Approvals' },
                { id: 'inventory', name: '5. Inventory' },
                { id: 'purchasing', name: '6. Purchasing' },
                { id: 'suppliers', name: '7. Suppliers' },
                { id: 'shifts', name: '8. Shifts & Drawer' },
                { id: 'reports', name: '9. Reports' },
                { id: 'users', name: '10. Staff & Users' },
                { id: 'audit_log', name: '11. Audit Log' }
            ];

            for (const m of defaultModules) {
                // Admin has full permissions
                await db.query(
                    "INSERT IGNORE INTO role_permissions (role, module, module_name, can_view, can_create, can_edit, can_delete, can_approve) VALUES ('admin', ?, ?, 1, 1, 1, 1, 1)",
                    [m.id, m.name]
                );
                // Cashier has view/create on POS, Inventory, Dashboard
                const isPosOrInv = ['dashboard', 'pos', 'sales_history', 'inventory', 'shifts'].includes(m.id);
                await db.query(
                    "INSERT IGNORE INTO role_permissions (role, module, module_name, can_view, can_create, can_edit, can_delete, can_approve) VALUES ('cashier', ?, ?, ?, ?, 0, 0, 0)",
                    [m.id, m.name, isPosOrInv ? 1 : 0, isPosOrInv ? 1 : 0]
                );
            }
            console.log(' -> Seeded standard role_permissions');
        }

        // ----------------------------------------------------
        // 3. Restock Requests Table
        // ----------------------------------------------------
        console.log('[3/12] Verifying restock_requests table...');
        await db.query(`
            CREATE TABLE IF NOT EXISTS restock_requests (
                id INT AUTO_INCREMENT PRIMARY KEY,
                product_id INT NOT NULL,
                part_number VARCHAR(100) NOT NULL,
                product_name VARCHAR(255) NOT NULL,
                brand VARCHAR(100) NULL,
                category VARCHAR(100) NULL,
                current_stock INT NOT NULL DEFAULT 0,
                reorder_level INT NOT NULL DEFAULT 5,
                requested_qty INT NOT NULL DEFAULT 1,
                unit_cost DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                supplier_id INT NULL,
                supplier_name VARCHAR(255) NULL,
                priority ENUM('NORMAL', 'HIGH', 'URGENT') DEFAULT 'NORMAL',
                notes TEXT NULL,
                staff_id INT NOT NULL,
                staff_name VARCHAR(100) NOT NULL,
                status ENUM('PENDING', 'APPROVED', 'REJECTED') DEFAULT 'PENDING',
                admin_id INT NULL,
                admin_name VARCHAR(100) NULL,
                admin_notes TEXT NULL,
                po_id INT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                resolved_at DATETIME NULL,
                INDEX idx_status (status),
                INDEX idx_product_id (product_id),
                INDEX idx_staff_id (staff_id),
                INDEX idx_created_at (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // ----------------------------------------------------
        // 4. Approval Requests Table
        // ----------------------------------------------------
        console.log('[4/12] Verifying approval_requests table...');
        await db.query(`
            CREATE TABLE IF NOT EXISTS approval_requests (
                id INT AUTO_INCREMENT PRIMARY KEY,
                request_type ENUM('VOID_REFUND', 'DISCOUNT', 'PRICE_OVERRIDE') NOT NULL,
                status ENUM('PENDING', 'APPROVED', 'REJECTED') DEFAULT 'PENDING',
                receipt_number VARCHAR(50) NULL,
                product_id INT NULL,
                item_name VARCHAR(255) NULL,
                quantity INT DEFAULT 1,
                original_price DECIMAL(10,2) DEFAULT 0.00,
                cost_price DECIMAL(10,2) DEFAULT 0.00,
                requested_value DECIMAL(10,2) DEFAULT 0.00,
                remaining_profit DECIMAL(10,2) DEFAULT 0.00,
                financial_impact DECIMAL(10,2) DEFAULT 0.00,
                reason TEXT NULL,
                cashier_id INT NOT NULL,
                cashier_name VARCHAR(100) NOT NULL,
                admin_id INT NULL,
                admin_name VARCHAR(100) NULL,
                admin_notes TEXT NULL,
                metadata JSON NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                resolved_at DATETIME NULL,
                INDEX idx_status (status),
                INDEX idx_request_type (request_type),
                INDEX idx_created_at (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // ----------------------------------------------------
        // 5. Brands & Categories Tables
        // ----------------------------------------------------
        console.log('[5/12] Verifying brands & categories tables...');
        await db.query(`
            CREATE TABLE IF NOT EXISTS brands (
                brand_id INT AUTO_INCREMENT PRIMARY KEY,
                brand_name VARCHAR(100) NOT NULL UNIQUE,
                country_origin VARCHAR(50) DEFAULT NULL,
                specialty VARCHAR(120) DEFAULT NULL,
                is_racing_brand TINYINT(1) DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS categories (
                category_id INT AUTO_INCREMENT PRIMARY KEY,
                category_name VARCHAR(100) NOT NULL UNIQUE,
                category_code VARCHAR(10) DEFAULT NULL,
                scope VARCHAR(255) DEFAULT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // Populate brands and categories from existing products table
        await db.query("INSERT IGNORE INTO brands (brand_name) SELECT DISTINCT brand FROM products WHERE brand IS NOT NULL AND brand != ''");
        await db.query("INSERT IGNORE INTO categories (category_name) SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND category != ''");

        // ----------------------------------------------------
        // 6. Audit Logs Table
        // ----------------------------------------------------
        console.log('[6/12] Verifying audit_logs table...');
        await db.query(`
            CREATE TABLE IF NOT EXISTS audit_logs (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                user_id INT NULL,
                user_name VARCHAR(100) NOT NULL DEFAULT 'System',
                user_role VARCHAR(50) NOT NULL DEFAULT 'System',
                ip_address VARCHAR(45) NULL,
                module VARCHAR(60) NOT NULL,
                action_type VARCHAR(100) NOT NULL,
                entity_type VARCHAR(60) NULL,
                entity_id VARCHAR(100) NULL,
                reference_id VARCHAR(100) NULL,
                old_value TEXT NULL,
                new_value TEXT NULL,
                reason TEXT NULL,
                metadata JSON NULL,
                INDEX idx_created_at (created_at),
                INDEX idx_module (module),
                INDEX idx_action_type (action_type),
                INDEX idx_user_id (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // ----------------------------------------------------
        // 7. Store Operating Expenses Table
        // ----------------------------------------------------
        console.log('[7/12] Verifying store_operating_expenses table...');
        await db.query(`
            CREATE TABLE IF NOT EXISTS store_operating_expenses (
                id INT AUTO_INCREMENT PRIMARY KEY,
                expense_date DATE NOT NULL,
                category VARCHAR(100) NOT NULL,
                title VARCHAR(255) NOT NULL,
                amount DECIMAL(12,2) NOT NULL,
                payment_source ENUM('cash_drawer','gcash_bank') DEFAULT 'cash_drawer',
                recorded_by_id INT NULL,
                recorded_by_name VARCHAR(100) NULL,
                notes TEXT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_expense_date (expense_date),
                INDEX idx_category (category)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // ----------------------------------------------------
        // 8. Suppliers Columns
        // ----------------------------------------------------
        console.log('[8/12] Verifying suppliers table columns...');
        const [suppCols] = await db.query("SHOW COLUMNS FROM suppliers");
        const suppColNames = suppCols.map(c => c.Field);

        const supplierColumnsToAdd = [
            { col: 'fb_page_name', type: 'VARCHAR(150) NULL' },
            { col: 'seller_contact_name', type: 'VARCHAR(150) NULL' },
            { col: 'phone_number', type: 'VARCHAR(50) NULL' },
            { col: 'messenger_url', type: 'VARCHAR(255) NULL' },
            { col: 'messenger_link', type: 'VARCHAR(255) NULL' },
            { col: 'facebook_page_url', type: 'VARCHAR(255) NULL' },
            { col: 'gcash_account_name', type: 'VARCHAR(150) NULL' },
            { col: 'gcash_account_number', type: 'VARCHAR(50) NULL' },
            { col: 'bank_details', type: 'TEXT NULL' },
            { col: 'payment_details', type: 'TEXT NULL' },
            { col: 'category_tags', type: 'VARCHAR(255) NULL' },
            { col: 'supplier_id', type: 'VARCHAR(50) NULL' }
        ];

        for (const c of supplierColumnsToAdd) {
            if (!suppColNames.includes(c.col)) {
                try {
                    await db.query(`ALTER TABLE suppliers ADD COLUMN ${c.col} ${c.type}`);
                    console.log(` -> Added ${c.col} to suppliers`);
                } catch (e) {
                    console.warn(`Could not add ${c.col}:`, e.message);
                }
            }
        }

        // ----------------------------------------------------
        // 9. Purchasing & Supplier Orders Tables
        // ----------------------------------------------------
        console.log('[9/12] Verifying purchasing & supplier orders tables...');
        await db.query(`
            CREATE TABLE IF NOT EXISTS supplier_orders (
                order_id INT AUTO_INCREMENT PRIMARY KEY,
                po_number VARCHAR(100) NULL,
                supplier_id INT NOT NULL,
                order_date DATETIME NOT NULL,
                courier_name VARCHAR(50) DEFAULT NULL,
                tracking_number VARCHAR(100) DEFAULT NULL,
                shipping_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                total_order_cost DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                payment_proof_img VARCHAR(255) DEFAULT NULL,
                messenger_quote_img TEXT DEFAULT NULL,
                order_status ENUM('Ordered','Shipped','Inspected & Accepted') NOT NULL DEFAULT 'Ordered',
                inspected_by INT DEFAULT NULL,
                inspected_date DATETIME DEFAULT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                payment_status VARCHAR(50) DEFAULT 'PENDING_OWNER_APPROVAL',
                payment_method VARCHAR(50) DEFAULT 'GCash',
                payment_reference VARCHAR(100) DEFAULT NULL,
                approved_by INT DEFAULT NULL,
                approved_at DATETIME DEFAULT NULL,
                notes TEXT NULL,
                INDEX idx_supplier_id (supplier_id),
                INDEX idx_order_status (order_status),
                FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS supplier_order_items (
                order_item_id INT AUTO_INCREMENT PRIMARY KEY,
                order_id INT NOT NULL,
                product_id INT NOT NULL,
                unit_cost DECIMAL(10,2) NOT NULL,
                qty_ordered INT NOT NULL,
                qty_accepted_good INT NOT NULL DEFAULT 0,
                qty_rejected_damaged INT NOT NULL DEFAULT 0,
                rejection_remarks VARCHAR(255) DEFAULT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_order_id (order_id),
                INDEX idx_product_id (product_id),
                FOREIGN KEY (order_id) REFERENCES supplier_orders(order_id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES products(id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS supplier_payments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                supplier_id INT NOT NULL,
                po_id INT NULL,
                payment_date DATE NOT NULL,
                amount DECIMAL(10,2) NOT NULL,
                payment_method ENUM('GCash','Bank Transfer','Cash on Delivery (COD)') NOT NULL,
                reference_number VARCHAR(100) DEFAULT NULL,
                proof_img_url TEXT DEFAULT NULL,
                notes TEXT NULL,
                created_by VARCHAR(100) DEFAULT 'Admin',
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_supp_pay (supplier_id),
                INDEX idx_pay_date (payment_date)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS supplier_proofs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                supplier_id INT NOT NULL,
                po_id INT NULL,
                proof_type ENUM('payment_proof','messenger_quote','courier_waybill') NOT NULL,
                title VARCHAR(255) NOT NULL,
                image_url TEXT NOT NULL,
                reference_no VARCHAR(100) DEFAULT NULL,
                amount DECIMAL(10,2) DEFAULT 0.00,
                notes TEXT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_supp_proof (supplier_id),
                INDEX idx_proof_type (proof_type)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS fb_deliveries (
                id INT AUTO_INCREMENT PRIMARY KEY,
                parcel_tracking_no VARCHAR(100) NOT NULL UNIQUE,
                supplier_id INT NULL,
                supplier_name VARCHAR(150) NOT NULL,
                courier VARCHAR(100) NOT NULL DEFAULT 'J&T Express',
                total_cost DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                shipping_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                payment_status ENUM('paid','unpaid','cod') NOT NULL DEFAULT 'paid',
                payment_method VARCHAR(50) NOT NULL DEFAULT 'GCash',
                delivery_status ENUM('in_transit','awaiting_inspection','inspected','received','cancelled') NOT NULL DEFAULT 'in_transit',
                item_summary VARCHAR(255) NOT NULL,
                item_count INT NOT NULL DEFAULT 1,
                order_date DATE NOT NULL,
                expected_delivery DATE DEFAULT NULL,
                messenger_quote_image VARCHAR(500) DEFAULT NULL,
                gcash_receipt_image VARCHAR(500) DEFAULT NULL,
                notes TEXT NULL,
                rejection_remarks TEXT NULL,
                inspected_by INT DEFAULT NULL,
                inspected_at DATETIME DEFAULT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_fb_status (delivery_status),
                INDEX idx_fb_payment (payment_status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS fb_delivery_items (
                id INT AUTO_INCREMENT PRIMARY KEY,
                delivery_id INT NOT NULL,
                product_id INT NOT NULL,
                part_number VARCHAR(100) NOT NULL,
                product_name VARCHAR(255) NOT NULL,
                brand VARCHAR(100) DEFAULT 'Generic',
                size VARCHAR(100) DEFAULT 'Standard',
                unit_cost DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                qty_ordered INT NOT NULL DEFAULT 1,
                qty_good INT NOT NULL DEFAULT 0,
                qty_damaged INT NOT NULL DEFAULT 0,
                item_subtotal DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_delivery_id (delivery_id),
                INDEX idx_product_id (product_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // ----------------------------------------------------
        // 10. Products Table Columns
        // ----------------------------------------------------
        console.log('[10/12] Verifying products table columns...');
        const [prodCols] = await db.query("SHOW COLUMNS FROM products");
        const prodColNames = prodCols.map(c => c.Field);

        const prodColumnsToAdd = [
            { col: 'sellable_stock', type: 'INT NOT NULL DEFAULT 0' },
            { col: 'current_stock', type: 'INT NOT NULL DEFAULT 0' },
            { col: 'retail_price', type: 'DECIMAL(10,2) NOT NULL DEFAULT 0.00' },
            { col: 'sku', type: 'VARCHAR(100) NULL' },
            { col: 'sku_code', type: 'VARCHAR(100) NULL' },
            { col: 'part_name', type: 'VARCHAR(255) NULL' },
            { col: 'shelf_location', type: 'VARCHAR(100) NULL' },
            { col: 'category_id', type: 'INT NULL' },
            { col: 'supplier_cost', type: 'DECIMAL(10,2) NOT NULL DEFAULT 0.00' },
            { col: 'supplier_id', type: 'INT NULL' },
            { col: 'supplier_name', type: 'VARCHAR(255) NULL' },
            { col: 'needs_price_review', type: 'TINYINT(1) NOT NULL DEFAULT 0' }
        ];

        for (const c of prodColumnsToAdd) {
            if (!prodColNames.includes(c.col)) {
                try {
                    await db.query(`ALTER TABLE products ADD COLUMN ${c.col} ${c.type}`);
                    console.log(` -> Added ${c.col} to products`);
                } catch (e) {
                    console.warn(`Could not add ${c.col}:`, e.message);
                }
            }
        }

        // Synchronize product fields
        await db.query(`
            UPDATE products 
            SET 
                current_stock = COALESCE(current_stock, stock, 0),
                sellable_stock = COALESCE(sellable_stock, stock, 0),
                retail_price = COALESCE(retail_price, selling_price, 0.00),
                sku = COALESCE(sku, part_number)
            WHERE current_stock IS NULL OR sellable_stock IS NULL OR retail_price = 0.00
        `);

        // ----------------------------------------------------
        // 11. Items View
        // ----------------------------------------------------
        console.log('[11/12] Creating or replacing items view...');
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

        // ----------------------------------------------------
        // 12. Cash Floats & Cash Movements
        // ----------------------------------------------------
        console.log('[12/12] Verifying cash_floats and cash_movements...');
        await db.query(`
            CREATE TABLE IF NOT EXISTS cash_floats (
              id INT AUTO_INCREMENT PRIMARY KEY,
              staff_id INT NOT NULL,
              staff_username VARCHAR(50) NOT NULL,
              assigned_by_id INT NOT NULL,
              assigned_by_username VARCHAR(50) NOT NULL,
              total_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
              starting_cash DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
              current_cash_balance DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
              cash_sales DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
              change_given DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
              cash_refunds DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
              expected_cash DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
              actual_cash DECIMAL(12, 2) DEFAULT NULL,
              shortage_overage DECIMAL(12, 2) DEFAULT NULL,
              sales_count INT NOT NULL DEFAULT 0,
              status ENUM('ACTIVE', 'COMPLETED', 'RETURNED') NOT NULL DEFAULT 'ACTIVE',
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

        console.log('[Sync Production DB] COMPLETE! All 12 schema sections verified and synchronized successfully.');
        return true;
    } catch (err) {
        console.error('[Sync Production DB Error]:', err);
        throw err;
    }
}

if (require.main === module) {
    syncProductionSchema()
        .then(() => {
            console.log('Database sync complete. Exiting cleanly.');
            process.exit(0);
        })
        .catch((err) => {
            console.error('Fatal sync failure:', err.message);
            process.exit(1);
        });
}

module.exports = syncProductionSchema;
