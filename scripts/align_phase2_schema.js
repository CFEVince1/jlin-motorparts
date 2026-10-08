const path = require('path');
const fs = require('fs');

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

// Load .env
const envPaths = [
    path.join(__dirname, '..', 'backend', '.env'),
    path.join(__dirname, '.env'),
    path.join(process.cwd(), 'backend', '.env'),
    path.join(process.cwd(), '.env')
];
for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
        require('dotenv').config({ path: envPath });
        break;
    }
}

const mysql = require('mysql2/promise');

async function alignSchema() {
    console.log('Aligning database schema for Phase 2...');
    const config = {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT, 10) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'jlin_inventory_db',
        multipleStatements: true
    };

    const connection = await mysql.createConnection(config);

    async function columnExists(tableName, columnName) {
        const [rows] = await connection.query(
            `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
            [config.database, tableName, columnName]
        );
        return rows.length > 0;
    }

    // 1. users: token_version
    if (!(await columnExists('users', 'token_version'))) {
        await connection.query('ALTER TABLE users ADD COLUMN token_version INT NOT NULL DEFAULT 1');
        console.log('+ Added token_version to users');
    }

    // 2. products: sku, current_stock, retail_price
    if (!(await columnExists('products', 'sku'))) {
        await connection.query('ALTER TABLE products ADD COLUMN sku VARCHAR(100) DEFAULT NULL AFTER part_number');
        await connection.query('UPDATE products SET sku = part_number WHERE sku IS NULL');
        console.log('+ Added sku to products');
    }
    if (!(await columnExists('products', 'current_stock'))) {
        await connection.query('ALTER TABLE products ADD COLUMN current_stock INT NOT NULL DEFAULT 0 AFTER stock');
        await connection.query('UPDATE products SET current_stock = stock');
        console.log('+ Added current_stock to products');
    }
    if (!(await columnExists('products', 'retail_price'))) {
        await connection.query('ALTER TABLE products ADD COLUMN retail_price DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER selling_price');
        await connection.query('UPDATE products SET retail_price = selling_price');
        console.log('+ Added retail_price to products');
    }

    // Triggers on products to keep stock & current_stock, part_number & sku, selling_price & retail_price synchronized
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
            IF NEW.current_stock IS NULL THEN
                SET NEW.current_stock = COALESCE(NEW.stock, 0);
            END IF;
            IF NEW.stock IS NULL THEN
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

    // Create / replace view items for compatibility
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
    console.log('+ Synchronized products/items triggers and items VIEW');

    // 3. inventory_transactions: broaden transaction_type and add loss_transaction_id & remarks
    await connection.query('ALTER TABLE inventory_transactions MODIFY COLUMN transaction_type VARCHAR(50) NOT NULL;');
    if (!(await columnExists('inventory_transactions', 'loss_transaction_id'))) {
        await connection.query('ALTER TABLE inventory_transactions ADD COLUMN loss_transaction_id BIGINT DEFAULT NULL AFTER reference_id');
        console.log('+ Added loss_transaction_id to inventory_transactions');
    }
    if (!(await columnExists('inventory_transactions', 'remarks'))) {
        await connection.query('ALTER TABLE inventory_transactions ADD COLUMN remarks TEXT DEFAULT NULL AFTER notes');
        console.log('+ Added remarks to inventory_transactions');
    }

    // 4. receiving_records: reference_no and unique constraint on (supplier_id, reference_no)
    if (!(await columnExists('receiving_records', 'reference_no'))) {
        await connection.query('ALTER TABLE receiving_records ADD COLUMN reference_no VARCHAR(100) DEFAULT NULL AFTER reference_number');
        await connection.query('UPDATE receiving_records SET reference_no = reference_number WHERE reference_no IS NULL');
        console.log('+ Added reference_no to receiving_records');
    }
    // Drop single reference_number unique key if exists, add unique (supplier_id, reference_no)
    try {
        await connection.query('ALTER TABLE receiving_records DROP INDEX reference_number');
    } catch (e) { /* ignore if not exists */ }
    try {
        await connection.query('ALTER TABLE receiving_records ADD UNIQUE KEY uq_supplier_ref (supplier_id, reference_no)');
    } catch (e) { /* ignore if exists */ }

    // 5. receiving_record_items: item_id
    if (!(await columnExists('receiving_record_items', 'item_id'))) {
        await connection.query('ALTER TABLE receiving_record_items ADD COLUMN item_id INT DEFAULT NULL AFTER product_id');
        await connection.query('UPDATE receiving_record_items SET item_id = product_id WHERE item_id IS NULL');
        console.log('+ Added item_id to receiving_record_items');
    }

    console.log('✅ Schema alignment complete.\n');
    await connection.end();
}

alignSchema().catch(e => {
    console.error('Schema alignment failed:', e);
    process.exit(1);
});
