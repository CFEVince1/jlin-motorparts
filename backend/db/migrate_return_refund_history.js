const db = require('../config/db');

async function migrate() {
    try {
        // 1. Add damaged_stock to products if not exists
        const [cols] = await db.query("SHOW COLUMNS FROM products LIKE 'damaged_stock'");
        if (cols.length === 0) {
            await db.query('ALTER TABLE products ADD COLUMN damaged_stock INT NOT NULL DEFAULT 0 AFTER stock');
            console.log('Added damaged_stock column to products table.');
        } else {
            console.log('damaged_stock column already exists.');
        }

        // 2. Create return_refund_history table
        await db.query(`
            CREATE TABLE IF NOT EXISTS return_refund_history (
                id INT AUTO_INCREMENT PRIMARY KEY,
                reference_no VARCHAR(50) NOT NULL,
                order_id INT NULL,
                sale_return_id INT NULL,
                product_id INT NOT NULL,
                product_name VARCHAR(255) NOT NULL,
                part_number VARCHAR(100) NULL,
                movement_type ENUM(
                    'CUSTOMER_RETURN_GOOD',
                    'CUSTOMER_RETURN_DAMAGE',
                    'SHELF_TO_DAMAGE',
                    'DAMAGE_TO_SUPPLIER',
                    'LOSS_INVENTORY',
                    'FOUND_INVENTORY',
                    'INVENTORY_TO_SUPPLIER'
                ) NOT NULL,
                flow_path VARCHAR(100) NOT NULL,
                qty INT NOT NULL,
                target_bucket ENUM('INVENTORY', 'DAMAGE', 'BOTH') NOT NULL,
                effect_badge VARCHAR(30) NOT NULL,
                inv_before INT NOT NULL,
                inv_after INT NOT NULL,
                damage_before INT NOT NULL,
                damage_after INT NOT NULL,
                refund_amount DECIMAL(10,2) DEFAULT 0.00,
                supplier_name VARCHAR(100) NULL,
                status ENUM('COMPLETED', 'PENDING_SUPPLIER_RETURN', 'RETURNED_TO_SUPPLIER') DEFAULT 'COMPLETED',
                remarks TEXT,
                processed_by VARCHAR(50) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_product (product_id),
                INDEX idx_ref (reference_no),
                INDEX idx_movement (movement_type)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        console.log('return_refund_history table verified.');

        // 3. Migrate or seed records
        const [existing] = await db.query('SELECT COUNT(*) as cnt FROM return_refund_history');
        if (existing[0].cnt === 0) {
            console.log('Seeding initial return_refund_history audit entries...');
            // Check for sample product JVT Racing Cam or any active product
            const [prods] = await db.query("SELECT * FROM products WHERE is_active = true ORDER BY id ASC LIMIT 5");
            const p = prods[0] || { id: 1, name: 'JVT Racing Camshaft', part_number: 'JVT-CAM-01', stock: 9, damaged_stock: 0 };
            
            const now = new Date();
            const padTime = (offsetMinutes) => new Date(now.getTime() - offsetMinutes * 60000);

            // Step 1: Customer Return -> Damage (+1 Damage, inv stays 9 -> 9, dmg 0 -> 1)
            await db.query(`
                INSERT INTO return_refund_history (
                    reference_no, order_id, product_id, product_name, part_number,
                    movement_type, flow_path, qty, target_bucket, effect_badge,
                    inv_before, inv_after, damage_before, damage_after, refund_amount,
                    status, remarks, processed_by, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                'DMG-001', 1, p.id, p.name, p.part_number,
                'CUSTOMER_RETURN_DAMAGE', 'Customer Return → Damage', 1, 'DAMAGE', '+1 Damage',
                9, 9, 0, 1, 120.00,
                'PENDING_SUPPLIER_RETURN', 'Customer returned defective unit (ORD-1042); waiting for supplier pickup', 'staff', padTime(180)
            ]);

            // Step 2: Damage -> Return to Supplier (-1 Damage, inv stays 9 -> 9, dmg 1 -> 0)
            await db.query(`
                INSERT INTO return_refund_history (
                    reference_no, order_id, product_id, product_name, part_number,
                    movement_type, flow_path, qty, target_bucket, effect_badge,
                    inv_before, inv_after, damage_before, damage_after,
                    supplier_name, status, remarks, processed_by, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                'SUP-001', 1, p.id, p.name, p.part_number,
                'DAMAGE_TO_SUPPLIER', 'Damage → Return to Supplier', 1, 'DAMAGE', '-1 Damage',
                9, 9, 1, 0,
                'JVT Parts Supplier', 'RETURNED_TO_SUPPLIER', 'Handed defective unit back to JVT Supplier delivery rider', 'admin', padTime(120)
            ]);

            // Step 3: Return/Refund -> Loss (-1 Inventory, inv 9 -> 8, dmg 0 -> 0)
            await db.query(`
                INSERT INTO return_refund_history (
                    reference_no, product_id, product_name, part_number,
                    movement_type, flow_path, qty, target_bucket, effect_badge,
                    inv_before, inv_after, damage_before, damage_after,
                    status, remarks, processed_by, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                'LOS-001', p.id, p.name, p.part_number,
                'LOSS_INVENTORY', 'Loss → Inventory', 1, 'INVENTORY', '-1 Inventory',
                9, 8, 0, 0,
                'COMPLETED', 'Missing 1 pc during afternoon shelf audit', 'admin', padTime(70)
            ]);

            // Step 4: Return/Refund -> Found (+1 Inventory, inv 8 -> 9, dmg 0 -> 0)
            await db.query(`
                INSERT INTO return_refund_history (
                    reference_no, product_id, product_name, part_number,
                    movement_type, flow_path, qty, target_bucket, effect_badge,
                    inv_before, inv_after, damage_before, damage_after,
                    status, remarks, processed_by, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                'FND-001', p.id, p.name, p.part_number,
                'FOUND_INVENTORY', 'Found → Inventory', 1, 'INVENTORY', '+1 Inventory',
                8, 9, 0, 0,
                'COMPLETED', 'Found misplaced box under display counter', 'staff', padTime(40)
            ]);

            // Step 5: Return/Refund -> Return to Supplier Direct (-2 Inventory, inv 9 -> 7, dmg 0 -> 0)
            await db.query(`
                INSERT INTO return_refund_history (
                    reference_no, product_id, product_name, part_number,
                    movement_type, flow_path, qty, target_bucket, effect_badge,
                    inv_before, inv_after, damage_before, damage_after,
                    supplier_name, status, remarks, processed_by, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                'SUP-002', p.id, p.name, p.part_number,
                'INVENTORY_TO_SUPPLIER', 'Return to Supplier → Inventory', 2, 'INVENTORY', '-2 Inventory',
                9, 7, 0, 0,
                'Yamaha Genuine Supplier', 'COMPLETED', 'Returned 2 pcs wrong model (Mio Sporty instead of Mio i125) to supplier', 'admin', padTime(15)
            ]);

            console.log('Seeded complete audit trail live example data into return_refund_history.');
        }

        console.log('Migration finished successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Migration error:', err);
        process.exit(1);
    }
}

migrate();
