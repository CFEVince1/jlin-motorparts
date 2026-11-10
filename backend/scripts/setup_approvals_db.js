const db = require('../config/db');

async function setupApprovals() {
    try {
        console.log('Setting up Approvals database table...');

        // 1. Check & add pin column to users if missing
        const [userCols] = await db.query("SHOW COLUMNS FROM users LIKE 'pin'");
        if (userCols.length === 0) {
            await db.query("ALTER TABLE users ADD COLUMN pin VARCHAR(20) DEFAULT '1234'");
            console.log("Added 'pin' column to users table (default: '1234')");
        } else {
            console.log("'pin' column already exists on users table");
        }

        // Set default pin for admin user if null
        await db.query("UPDATE users SET pin = '1234' WHERE pin IS NULL OR pin = ''");

        // 2. Create approval_requests table
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
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log("Verified 'approval_requests' table exists");

        // Check if sample data exists, if empty add demo requests so the Admin can immediately test all 3 categories
        const [existing] = await db.query('SELECT COUNT(*) as cnt FROM approval_requests');
        if (existing[0].cnt === 0) {
            console.log('Inserting initial realistic pending approval requests for testing...');
            await db.query(`
                INSERT INTO approval_requests (
                    request_type, status, receipt_number, product_id, item_name, quantity, 
                    original_price, cost_price, requested_value, remaining_profit, financial_impact, 
                    reason, cashier_id, cashier_name, metadata
                ) VALUES 
                (
                    'VOID_REFUND', 'PENDING', 'INV-2026-0891', 1, 'Bendix Brake Pads Ceramic', 1,
                    8333.50, 5000.00, 8333.50, 0.00, 8333.50,
                    'Customer mistakenly bought wrong brake caliper size, requesting cash refund with unopened box.',
                    2, 'cashier1', JSON_OBJECT('action', 'RETURN_REFUND', 'payment_method', 'Cash')
                ),
                (
                    'VOID_REFUND', 'PENDING', 'INV-2026-0895', 2, 'Brembo 2-Piston Crab Caliper', 1,
                    10500.00, 8000.00, 10500.00, 0.00, 10500.00,
                    'Cashier double-scanned receipt during rush hour. Transaction was not paid yet by customer.',
                    2, 'cashier1', JSON_OBJECT('action', 'VOID', 'payment_method', 'Cash')
                ),
                (
                    'DISCOUNT', 'PENDING', NULL, 3, 'Brembo 4-Piston Caliper (P4) + Brake Pads Cart', 2,
                    15270.00, 12200.00, 1500.00, 1570.00, 1500.00,
                    'Loyal customer mechanic buying bundle package requesting ₱1,500 promo discount.',
                    2, 'cashier1', JSON_OBJECT('discount_type', 'fixed', 'discount_val', 1500, 'cost_price', 12200, 'original_price', 15270)
                ),
                (
                    'PRICE_OVERRIDE', 'PENDING', NULL, 6, 'aRacer RC Super X ECU', 1,
                    18500.00, 15000.00, 17200.00, 2200.00, 1300.00,
                    'Matching promotional Facebook post price announcement that has not been updated in inventory database yet.',
                    2, 'cashier1', JSON_OBJECT('override_type', 'PRICE_MATCH', 'original_price', 18500, 'overridden_price', 17200, 'cost_price', 15000)
                )
            `);
            console.log('Inserted sample pending requests across all 3 categories.');
        }

        console.log('Approvals database setup completed successfully!');
        process.exit(0);
    } catch (err) {
        console.error('Error during approvals DB setup:', err);
        process.exit(1);
    }
}

setupApprovals();
