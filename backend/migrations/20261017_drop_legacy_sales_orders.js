const db = require('../config/db');

async function runMigration() {
    try {
        console.log('[Migration] Dropping legacy rogue sales_orders tables...');

        await db.query('DROP TABLE IF EXISTS sales_order_items');
        await db.query('DROP TABLE IF EXISTS sales_orders');
        await db.query('DROP TABLE IF EXISTS sales_order_seq');
        await db.query('DROP TABLE IF EXISTS stock_adjustments');

        console.log('[Migration] Legacy sales_orders and stock_adjustments tables dropped successfully. Single source of truth is sales, sale_items & inventory_transactions.');
        if (require.main === module) {
            process.exit(0);
        }
    } catch (err) {
        console.error('[Migration Error]:', err);
        if (require.main === module) {
            process.exit(1);
        }
        throw err;
    }
}

if (require.main === module) {
    runMigration();
}

module.exports = runMigration;
