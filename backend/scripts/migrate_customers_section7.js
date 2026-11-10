const db = require('../config/db');

async function migrate() {
    console.log('--- Starting Section 7 Customers Migration ---');

    // 1. Create customers table
    await db.query(`
        CREATE TABLE IF NOT EXISTS customers (
            id INT AUTO_INCREMENT PRIMARY KEY,
            customer_code VARCHAR(50) UNIQUE NOT NULL,
            name VARCHAR(150) NOT NULL,
            phone_number VARCHAR(50) NOT NULL,
            address TEXT NULL,
            vehicle_model VARCHAR(100) NULL,
            notes TEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('Verified table: customers');

    // 2. Add customer columns to sales
    try {
        const [salesCols] = await db.query('DESCRIBE sales');
        const colNames = salesCols.map(c => c.Field);
        if (!colNames.includes('customer_id')) {
            await db.query('ALTER TABLE sales ADD COLUMN customer_id INT NULL AFTER customer_name');
            console.log('Added column: sales.customer_id');
        }
        if (!colNames.includes('customer_phone')) {
            await db.query('ALTER TABLE sales ADD COLUMN customer_phone VARCHAR(50) NULL AFTER customer_id');
            console.log('Added column: sales.customer_phone');
        }
    } catch (err) {
        console.error('Error adding columns to sales:', err.message);
    }

    // 3. Add customer columns to customer_returns
    try {
        const [retCols] = await db.query('DESCRIBE customer_returns');
        const retColNames = retCols.map(c => c.Field);
        if (!retColNames.includes('customer_id')) {
            await db.query('ALTER TABLE customer_returns ADD COLUMN customer_id INT NULL AFTER sale_id');
            console.log('Added column: customer_returns.customer_id');
        }
        if (!retColNames.includes('customer_name')) {
            await db.query('ALTER TABLE customer_returns ADD COLUMN customer_name VARCHAR(150) NULL AFTER customer_id');
            console.log('Added column: customer_returns.customer_name');
        }
    } catch (err) {
        console.error('Error adding columns to customer_returns:', err.message);
    }

    // 4. Seed sample regular / warranty customers
    const sampleCustomers = [
        {
            code: 'CUST-001',
            name: 'Juan Dela Cruz',
            phone: '0917-555-0101',
            vehicle: 'Honda Click 125i (2022)',
            address: '142 Rizal Ave, Caloocan City',
            notes: 'Regular customer for drive belts and brake pads. Holds active warranty.'
        },
        {
            code: 'CUST-002',
            name: 'Mark Kenneth Santos',
            phone: '0928-888-2345',
            vehicle: 'Yamaha NMAX 155 (V2)',
            address: '77 Samson Road, Caloocan City',
            notes: 'Delivery rider, frequent synthetic oil and clutch spring buyer.'
        },
        {
            code: 'CUST-003',
            name: 'Ricardo Dalisay',
            phone: '0995-123-9876',
            vehicle: 'Yamaha Mio Aerox 155',
            address: '12 Bonifacio St, Quezon City',
            notes: 'Upgrades pulleys and CVT sliders regularly.'
        },
        {
            code: 'CUST-004',
            name: 'Arlene Bautista',
            phone: '0919-444-5678',
            vehicle: 'Honda Beat Fi 110',
            address: '45 MacArthur Hwy, Valenzuela City',
            notes: 'Commuter bike, purchased replacement starter relay with warranty.'
        }
    ];

    for (const c of sampleCustomers) {
        const [existing] = await db.query('SELECT id FROM customers WHERE customer_code = ?', [c.code]);
        if (existing.length === 0) {
            await db.query(`
                INSERT INTO customers (customer_code, name, phone_number, vehicle_model, address, notes, created_at)
                VALUES (?, ?, ?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL 30 DAY))
            `, [c.code, c.name, c.phone, c.vehicle, c.address, c.notes]);
            console.log(`Seeded customer: ${c.code} - ${c.name}`);
        }
    }

    // 5. Link some past sales to customers if they are unassigned
    const [cRows] = await db.query('SELECT id, customer_code, name, phone_number FROM customers');
    const [sRows] = await db.query('SELECT id, order_number, customer_name FROM sales ORDER BY id DESC LIMIT 10');

    if (sRows.length > 0 && cRows.length > 0) {
        // Link first 2 sales to Juan Dela Cruz
        if (sRows[0]) {
            await db.query('UPDATE sales SET customer_id = ?, customer_name = ?, customer_phone = ? WHERE id = ?', [
                cRows[0].id, cRows[0].name, cRows[0].phone_number, sRows[0].id
            ]);
        }
        if (sRows[1]) {
            await db.query('UPDATE sales SET customer_id = ?, customer_name = ?, customer_phone = ? WHERE id = ?', [
                cRows[0].id, cRows[0].name, cRows[0].phone_number, sRows[1].id
            ]);
        }
        // Link next sale to Mark Santos
        if (sRows[2]) {
            await db.query('UPDATE sales SET customer_id = ?, customer_name = ?, customer_phone = ? WHERE id = ?', [
                cRows[1].id, cRows[1].name, cRows[1].phone_number, sRows[2].id
            ]);
        }
        // Link next sale to Ricardo Dalisay
        if (sRows[3]) {
            await db.query('UPDATE sales SET customer_id = ?, customer_name = ?, customer_phone = ? WHERE id = ?', [
                cRows[2].id, cRows[2].name, cRows[2].phone_number, sRows[3].id
            ]);
        }
        console.log('Linked representative sample sales to registered customers.');
    }

    // 6. Update existing customer_returns with customer_name from linked sales
    await db.query(`
        UPDATE customer_returns cr
        JOIN sales s ON cr.sale_id = s.id
        SET cr.customer_id = s.customer_id, cr.customer_name = s.customer_name
        WHERE cr.customer_name IS NULL
    `);
    console.log('Synchronized customer_returns with sales customer metadata.');

    console.log('--- Section 7 Migration Completed Successfully ---');
    process.exit(0);
}

migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
