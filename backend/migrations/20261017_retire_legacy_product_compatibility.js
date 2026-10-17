const db = require('../config/db');

async function runMigration() {
    try {
        console.log('[Migration] Retiring legacy product_compatibility table...');

        // Verify if product_compatibility table exists
        const [tables] = await db.query(
            `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_compatibility'`
        );

        if (tables.length > 0) {
            // Ensure any unmigrated mappings are transferred to product_compatibilities before dropping
            await db.query(`
                INSERT IGNORE INTO product_compatibilities (product_id, motorcycle_model_id, compatibility_status)
                SELECT pc.product_id, mm.id, 'COMPATIBLE'
                FROM product_compatibility pc
                JOIN motorcycle_units mu ON pc.motorcycle_unit_id = mu.id
                JOIN motorcycle_models mm ON 
                    mm.brand = mu.brand 
                    AND mm.model = mu.model 
                    AND (
                        (mm.year_model IS NULL AND mu.year_model IS NULL)
                        OR mm.year_model = mu.year_model
                    )
            `);

            await db.query('DROP TABLE IF EXISTS product_compatibility');
            console.log('[Migration] Legacy product_compatibility dropped successfully. product_compatibilities is now the single source of truth.');
        } else {
            console.log('[Migration] Legacy product_compatibility table already retired.');
        }

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
