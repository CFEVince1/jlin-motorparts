const db = require('../config/db');

async function runMigration() {
    try {
        console.log('[Migration] Checking sale_items table for cost_price column...');
        const [cols] = await db.query("SHOW COLUMNS FROM sale_items LIKE 'cost_price'");
        if (cols.length === 0) {
            console.log('[Migration] Adding cost_price column to sale_items...');
            await db.query("ALTER TABLE sale_items ADD COLUMN cost_price DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER price");
            console.log('[Migration] Successfully added cost_price column.');
        } else {
            console.log('[Migration] Column cost_price already exists on sale_items.');
        }

        console.log('[Migration] Backfilling historical cost_price values into sale_items...');
        const [updateResult] = await db.query(`
            UPDATE sale_items si
            LEFT JOIN (
                SELECT product_id, reference_id, MAX(unit_cost) AS unit_cost
                FROM inventory_transactions
                WHERE transaction_type = 'SALE'
                GROUP BY product_id, reference_id
            ) it ON it.product_id = si.product_id AND it.reference_id = si.sale_id
            LEFT JOIN products p ON p.id = si.product_id
            SET si.cost_price = COALESCE(it.unit_cost, p.cost_price, 0.00)
            WHERE si.cost_price = 0.00
        `);
        console.log(`[Migration] Backfilled ${updateResult.affectedRows} historical sale_items rows with snapshot cost prices.`);

        console.log('[Migration] Migration completed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('[Migration Error]:', err);
        process.exit(1);
    }
}

if (require.main === module) {
    runMigration();
}

module.exports = runMigration;
