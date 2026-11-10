const db = require('../config/db');

async function setup() {
    try {
        console.log('Ensuring restock_requests table exists...');
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
        console.log('restock_requests table verified successfully!');
        process.exit(0);
    } catch (err) {
        console.error('Failed to setup restock_requests table:', err);
        process.exit(1);
    }
}

setup();
