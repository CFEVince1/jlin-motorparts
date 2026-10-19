const db = require('../config/db');

async function migrate() {
    console.log('[Migration] Updating sales table schema for split payments...');
    try {
        await db.query("ALTER TABLE sales MODIFY COLUMN payment_method VARCHAR(50) NOT NULL DEFAULT 'Cash'");
        console.log('✓ payment_method column modified to VARCHAR(50)');
    } catch (e) {
        console.log('Note on payment_method:', e.message);
    }

    try {
        await db.query("ALTER TABLE sales ADD COLUMN cash_amount DECIMAL(10,2) DEFAULT NULL");
        console.log('✓ cash_amount column added');
    } catch (e) {
        console.log('Note on cash_amount:', e.message);
    }

    try {
        await db.query("ALTER TABLE sales ADD COLUMN gcash_amount DECIMAL(10,2) DEFAULT NULL");
        console.log('✓ gcash_amount column added');
    } catch (e) {
        console.log('Note on gcash_amount:', e.message);
    }

    const [cols] = await db.query("DESCRIBE sales");
    console.log('[Migration] Columns in sales:', cols.filter(c => ['payment_method', 'cash_amount', 'gcash_amount'].includes(c.Field)));
    process.exit(0);
}

migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
