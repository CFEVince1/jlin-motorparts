const db = require('../config/db');

async function runMigration() {
    try {
        console.log('[Migration] Dropping legacy rogue sales_orders tables...');

        await db.query('DROP TABLE IF EXISTS sales_order_items');
        await db.query('DROP TABLE IF EXISTS sales_orders');
        await db.query('DROP TABLE IF EXISTS sales_order_seq');

        console.log('[Migration] Legacy sales_orders tables dropped successfully. Single source of truth is sales & sale_items.');
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
