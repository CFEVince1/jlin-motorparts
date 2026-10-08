require('dotenv').config();
const db = require('../config/db');
const bcrypt = require('bcryptjs');

async function setupDatabase() {
    console.log('[Setup] Initializing database tables...');

    try {
        // 1. Users table
        await db.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                role ENUM('admin', 'staff') NOT NULL DEFAULT 'staff',
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

        // 3. Motorcycle Units
        await db.query(`
            CREATE TABLE IF NOT EXISTS motorcycle_units (
                id INT AUTO_INCREMENT PRIMARY KEY,
                brand VARCHAR(100) NOT NULL,
                model VARCHAR(100) NOT NULL,
                year_model VARCHAR(20),
                UNIQUE KEY unique_motorcycle_unit (brand, model, year_model)
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

        // 5. Product Compatibility
        await db.query(`
            CREATE TABLE IF NOT EXISTS product_compatibility (
                id INT AUTO_INCREMENT PRIMARY KEY,
                product_id INT NOT NULL,
                motorcycle_unit_id INT NOT NULL,
                compatibility_status VARCHAR(50) DEFAULT 'Direct Fit',
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_product_motorcycle (product_id, motorcycle_unit_id),
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
                FOREIGN KEY (motorcycle_unit_id) REFERENCES motorcycle_units(id) ON DELETE CASCADE
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

        // 7. Sales Orders
        await db.query(`
            CREATE TABLE IF NOT EXISTS sales_orders (
                id INT AUTO_INCREMENT PRIMARY KEY,
                order_number VARCHAR(50) NOT NULL UNIQUE,
                cashier_id INT,
                cashier VARCHAR(100) NOT NULL,
                total_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                payment_method VARCHAR(50) NOT NULL DEFAULT 'Cash',
                tendered_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                change_due DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                gcash_reference_no VARCHAR(100),
                customer_name VARCHAR(150),
                customer_address TEXT,
                sale_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB;
        `);

        // 8. Sales Order Items
        await db.query(`
            CREATE TABLE IF NOT EXISTS sales_order_items (
                id INT AUTO_INCREMENT PRIMARY KEY,
                sales_order_id INT NOT NULL,
                product_id INT NOT NULL,
                quantity INT NOT NULL DEFAULT 1,
                unit_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                subtotal DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES products(id)
            ) ENGINE=InnoDB;
        `);

        // 9. Stock Adjustments (Audit Log)
        await db.query(`
            CREATE TABLE IF NOT EXISTS stock_adjustments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                product_id INT NOT NULL,
                user_id INT,
                adjusted_by VARCHAR(100) NOT NULL,
                previous_stock INT NOT NULL,
                adjusted_quantity INT NOT NULL,
                new_stock INT NOT NULL,
                reason VARCHAR(100) NOT NULL,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
            ) ENGINE=InnoDB;
        `);

        console.log('[Setup] Tables verified.');

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

        // Seed Suppliers if empty
        const [existingSuppliers] = await db.query('SELECT COUNT(*) as count FROM suppliers');
        if (existingSuppliers[0].count === 0) {
            console.log('[Setup] Seeding initial suppliers...');
            await db.query(`
                INSERT INTO suppliers (name, contact_person, email, phone, address, is_active) VALUES
                ('Yamaha Motor Philippines', 'Carlos Mendoza', 'sales@yamaha-motor.com.ph', '0917-555-1234', 'Batangas', 1),
                ('Suzuki Philippines Inc.', 'Maria Santos', 'parts@suzuki.com.ph', '0918-444-5678', 'Laguna', 1)
            `);
        }

        // Seed Motorcycle Units if empty
        const [existingUnits] = await db.query('SELECT COUNT(*) as count FROM motorcycle_units');
        if (existingUnits[0].count === 0) {
            console.log('[Setup] Seeding motorcycle units...');
            await db.query(`
                INSERT INTO motorcycle_units (brand, model, year_model) VALUES
                ('Yamaha', 'Aerox 155', 'V1'),
                ('Yamaha', 'Mio i125', '2023'),
                ('Suzuki', 'Raider 150', '2022 FI'),
                ('Honda', 'Click 125', '2023')
            `);
        }

        // Seed Products if empty
        const [existingProds] = await db.query('SELECT COUNT(*) as count FROM products');
        if (existingProds[0].count === 0) {
            console.log('[Setup] Seeding sample motorcycle parts...');
            await db.query(`
                INSERT INTO products (part_number, sku, name, brand, category, size, cost_price, selling_price, retail_price, stock, current_stock, reorder_level, is_serialized) VALUES
                ('BLT-M8-001', 'BLT-M8-001', 'Bolt M8', 'JRP', 'Bolts', 'M8 x 20mm', 8.00, 15.00, 15.00, 153, 153, 10, FALSE),
                ('SP-001', 'SP-001', 'Spark Plug', 'NGK', 'Ignition', 'Standard', 75.00, 120.00, 120.00, 27, 27, 8, FALSE),
                ('ECU-RAIDER-01', 'ECU-RAIDER-01', 'ECU', 'Suzuki', 'Electrical', 'Raider FI ECU', 1500.00, 2500.00, 2500.00, 1, 1, 1, TRUE),
                ('0A123D21', '0A123D21', 'block', 'jvt', 'engine', '66mm', 6500.00, 7500.00, 7500.00, 14, 14, 1, FALSE),
                ('JLR-BP-AEROX', 'JLR-BP-AEROX', 'Aerox Front Brake Pad Set', 'Yamaha', 'Brakes', 'Standard', 250.00, 450.00, 450.00, 0, 0, 5, FALSE),
                ('JLR-OF-AEROX', 'JLR-OF-AEROX', 'Aerox Engine Oil Filter Element', 'Yamaha', 'Maintenance', 'Standard', 120.00, 220.00, 220.00, 0, 0, 5, FALSE)
            `);
        }

        console.log('[Setup] Database setup complete! Ready for production / defense deployment.');
        process.exit(0);
    } catch (err) {
        console.error('[Setup Error]', err);
        process.exit(1);
    }
}

setupDatabase();
