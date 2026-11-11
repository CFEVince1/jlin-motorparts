require('dotenv').config();
const db = require('../config/db');

async function migrate() {
    console.log('Migrating item_swaps table...');
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS item_swaps (
                id INT AUTO_INCREMENT PRIMARY KEY,
                swap_code VARCHAR(100) UNIQUE NOT NULL,
                sale_id INT NULL,
                order_number VARCHAR(100) NULL,
                customer_name VARCHAR(150) NULL,
                returned_product_id INT NOT NULL,
                returned_product_name VARCHAR(255) NOT NULL,
                returned_part_number VARCHAR(100) NULL,
                returned_brand VARCHAR(100) NULL,
                returned_qty INT NOT NULL DEFAULT 1,
                returned_unit_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                returned_credit_total DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                returned_disposition VARCHAR(50) NOT NULL DEFAULT 'RESTOCK',
                new_product_id INT NOT NULL,
                new_product_name VARCHAR(255) NOT NULL,
                new_part_number VARCHAR(100) NULL,
                new_brand VARCHAR(100) NULL,
                new_qty INT NOT NULL DEFAULT 1,
                new_unit_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                new_total_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                price_difference DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                customer_top_up_paid DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                cash_refund_given DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                payment_method VARCHAR(50) NOT NULL DEFAULT 'None',
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
        console.log('item_swaps table created or already exists.');

        const [tables] = await db.query('SHOW TABLES');
        console.log('Current tables:', tables.map(t => Object.values(t)[0]));
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

migrate();
