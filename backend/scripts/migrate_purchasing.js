const pool = require('../config/db');

async function migrate() {
    console.log('Running Purchasing module database migrations...');

    // 1. Add missing columns to supplier_orders if needed
    const [cols] = await pool.query('DESCRIBE supplier_orders');
    const colNames = cols.map(c => c.Field);

    if (!colNames.includes('po_number')) {
        await pool.query('ALTER TABLE supplier_orders ADD COLUMN po_number VARCHAR(100) NULL AFTER order_id');
        console.log('Added po_number to supplier_orders');
    }
    if (!colNames.includes('messenger_quote_img')) {
        await pool.query('ALTER TABLE supplier_orders ADD COLUMN messenger_quote_img TEXT NULL AFTER payment_proof_img');
        console.log('Added messenger_quote_img to supplier_orders');
    }
    if (!colNames.includes('notes')) {
        await pool.query('ALTER TABLE supplier_orders ADD COLUMN notes TEXT NULL');
        console.log('Added notes to supplier_orders');
    }

    // Populate po_number for existing rows
    await pool.query(`UPDATE supplier_orders SET po_number = CONCAT('PO-2026-', LPAD(order_id, 4, '0')) WHERE po_number IS NULL OR po_number = ''`);

    // 2. Create supplier_returns table
    await pool.query(`
        CREATE TABLE IF NOT EXISTS supplier_returns (
            id INT AUTO_INCREMENT PRIMARY KEY,
            return_reference VARCHAR(100) NOT NULL,
            receiving_record_id INT NULL,
            supplier_id INT NOT NULL,
            supplier_name VARCHAR(255) NOT NULL,
            fb_page_name VARCHAR(255) NULL,
            messenger_url VARCHAR(255) NULL,
            product_id INT NOT NULL,
            product_name VARCHAR(255) NOT NULL,
            part_number VARCHAR(100) NULL,
            quantity_rejected INT NOT NULL,
            unit_cost DECIMAL(10,2) NOT NULL,
            total_value_owed DECIMAL(10,2) NOT NULL,
            rejection_reason VARCHAR(255) NOT NULL,
            unboxing_proof_url TEXT NULL,
            unboxing_video_notes TEXT NULL,
            resolution_status ENUM('Waiting for Messenger Reply', 'Refunded via GCash', 'Credit Applied to Next PO') DEFAULT 'Waiting for Messenger Reply',
            resolution_notes TEXT NULL,
            resolved_at DATETIME NULL,
            resolved_by INT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_supp_id (supplier_id),
            INDEX idx_resolution (resolution_status)
        )
    `);
    console.log('Created or verified supplier_returns table');

    // Populate realistic initial supplier returns from past rejected receiving records if any
    const [existingReturns] = await pool.query('SELECT COUNT(*) as count FROM supplier_returns');
    if (existingReturns[0].count === 0) {
        await pool.query(`
            INSERT INTO supplier_returns (
                return_reference, receiving_record_id, supplier_id, supplier_name, fb_page_name, messenger_url,
                product_id, product_name, part_number, quantity_rejected, unit_cost, total_value_owed,
                rejection_reason, unboxing_proof_url, unboxing_video_notes, resolution_status, created_at
            ) VALUES 
            (
                'RET-2026-001', 1, 14, 'Brembo & RCB Online Hub (FB Supplier)', 'Brembo & RCB Motorcycle Performance Hub', 'https://m.me/rcbbrembophonline',
                5, 'Bendix Brake Pads Ceramic', 'BND-BP-CER', 2, 5000.00, 10000.00,
                'Cracked / Broken in Transit (Packaging crushed by courier rider)',
                'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?w=500',
                'Unboxing video taken with Lalamove rider present. Both ceramic pad backings were fractured.',
                'Waiting for Messenger Reply',
                DATE_SUB(NOW(), INTERVAL 2 DAY)
            ),
            (
                'RET-2026-002', 2, 13, 'JVT Racing Parts Direct (Facebook Wholesale)', 'JVT Racing Parts Official Philippines', 'https://m.me/jvtracingpartsph',
                2, 'JVT Tensioner Manual Alloy', 'JVT-TMA-01', 3, 380.00, 1140.00,
                'Wrong Part / Incompatible Motorcycle Spec Shipped by FB Seller',
                'https://images.unsplash.com/photo-1486006920555-c77dce18193b?w=500',
                'Ordered Mio i125 tensioner, seller shipped Click 150 v1 spec.',
                'Refunded via GCash',
                DATE_SUB(NOW(), INTERVAL 5 DAY)
            ),
            (
                'RET-2026-003', 3, 16, 'MTRT Performance Facebook Direct', 'MTRT Performance Racing Parts Direct', 'https://m.me/mtrtracingdirectph',
                10, 'aRacer RC Mini 5 ECU', 'ARA-RC-MN5', 1, 8500.00, 8500.00,
                'Defective Electrical / Damaged Wire Harness upon unboxing',
                'https://images.unsplash.com/photo-1563720223185-11003d516935?w=500',
                'Pin #4 bent flat inside plug during packing at FB seller warehouse.',
                'Credit Applied to Next PO',
                DATE_SUB(NOW(), INTERVAL 8 DAY)
            )
        `);
        console.log('Seeded sample pre-acceptance supplier returns');
    }

    console.log('Migration finished successfully!');
    process.exit(0);
}

migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
