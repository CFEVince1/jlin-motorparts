require('dotenv').config();
const db = require('../config/db');

async function migrate() {
    console.log('Migrating item_swaps & sale_items tables...');
    try {
        // 1. Ensure sale_items.qty_swapped exists
        const [saleItemCols] = await db.query("SHOW COLUMNS FROM sale_items");
        const saleColNames = saleItemCols.map(c => c.Field);
        if (!saleColNames.includes('qty_swapped')) {
            await db.query("ALTER TABLE sale_items ADD COLUMN qty_swapped INT NOT NULL DEFAULT 0 AFTER qty_returned");
            console.log(' -> Added qty_swapped to sale_items');
        }

        // 2. Ensure item_swaps table exists
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

        // Check if existing item_swaps table is missing any columns
        const [swapCols] = await db.query("SHOW COLUMNS FROM item_swaps");
        const swapColNames = swapCols.map(c => c.Field);

        if (!swapColNames.includes('sale_item_id')) {
            await db.query("ALTER TABLE item_swaps ADD COLUMN sale_item_id INT NULL AFTER sale_id");
            console.log(' -> Added sale_item_id to item_swaps');
        }
        if (!swapColNames.includes('shift_id')) {
            await db.query("ALTER TABLE item_swaps ADD COLUMN shift_id INT NULL AFTER payment_method");
            console.log(' -> Added shift_id to item_swaps');
        }
        if (!swapColNames.includes('cashier_id')) {
            await db.query("ALTER TABLE item_swaps ADD COLUMN cashier_id INT NULL AFTER shift_id");
            console.log(' -> Added cashier_id to item_swaps');
        }
        if (!swapColNames.includes('old_cost_price')) {
            await db.query("ALTER TABLE item_swaps ADD COLUMN old_cost_price DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER returned_credit_total");
            console.log(' -> Added old_cost_price to item_swaps');
        }
        if (!swapColNames.includes('new_cost_price')) {
            await db.query("ALTER TABLE item_swaps ADD COLUMN new_cost_price DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER new_total_price");
            console.log(' -> Added new_cost_price to item_swaps');
        }
        if (!swapColNames.includes('cogs_adjustment')) {
            await db.query("ALTER TABLE item_swaps ADD COLUMN cogs_adjustment DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER new_cost_price");
            console.log(' -> Added cogs_adjustment to item_swaps');
        }
        if (!swapColNames.includes('replacement_items_json')) {
            await db.query("ALTER TABLE item_swaps ADD COLUMN replacement_items_json TEXT NULL AFTER cogs_adjustment");
            console.log(' -> Added replacement_items_json to item_swaps');
        }

        console.log('Migration completed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

migrate();
