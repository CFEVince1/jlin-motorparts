const db = require('../config/db');

async function runMigration() {
    try {
        console.log('[Migration] Aligning suppliers and deduplicating Aerox units/models...');

        // 1. Clear any invented supplier contacts, email, phone, address if present
        await db.query(`
            UPDATE suppliers 
            SET contact_person = NULL, email = NULL, phone = NULL, address = NULL
            WHERE name IN ('Yamaha Motor Philippines', 'Suzuki Philippines Inc.')
        `);
        console.log('[Migration] Suppliers sanitized to names only (no fabricated contact details).');

        // 2. Re-map legacy product_compatibility rows pointing to unit 19 -> 15, unit 20 -> 16
        await db.query('UPDATE IGNORE product_compatibility SET motorcycle_unit_id = 15 WHERE motorcycle_unit_id = 19');
        await db.query('UPDATE IGNORE product_compatibility SET motorcycle_unit_id = 16 WHERE motorcycle_unit_id = 20');
        await db.query('DELETE FROM product_compatibility WHERE motorcycle_unit_id IN (19, 20)');

        // 3. Re-map compatibility_group_units rows
        await db.query('UPDATE IGNORE compatibility_group_units SET motorcycle_unit_id = 15 WHERE motorcycle_unit_id = 19');
        await db.query('UPDATE IGNORE compatibility_group_units SET motorcycle_unit_id = 16 WHERE motorcycle_unit_id = 20');
        await db.query('DELETE FROM compatibility_group_units WHERE motorcycle_unit_id IN (19, 20)');

        // 4. Delete duplicate units 19 and 20
        await db.query('DELETE FROM motorcycle_units WHERE id IN (19, 20)');
        console.log('[Migration] Duplicate motorcycle_units 19 and 20 cleaned.');

        // 5. Re-map V3 product_compatibilities rows pointing to model 44 -> 25, model 45 -> 26
        await db.query('UPDATE IGNORE product_compatibilities SET motorcycle_model_id = 25 WHERE motorcycle_model_id = 44');
        await db.query('UPDATE IGNORE product_compatibilities SET motorcycle_model_id = 26 WHERE motorcycle_model_id = 45');
        await db.query('DELETE FROM product_compatibilities WHERE motorcycle_model_id IN (44, 45)');

        // 6. Delete duplicate models 44 and 45
        await db.query('DELETE FROM motorcycle_models WHERE id IN (44, 45)');
        console.log('[Migration] Duplicate motorcycle_models 44 and 45 cleaned.');

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
