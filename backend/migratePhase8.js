const db = require('./config/db');

async function migrate() {
    try {
        console.log('Starting Phase 8 Database Migration...');

        await db.query(`
            CREATE TABLE IF NOT EXISTS compatibility_groups (
                id INT AUTO_INCREMENT PRIMARY KEY,
                group_name VARCHAR(150) NOT NULL UNIQUE,
                description TEXT,
                INDEX idx_group_name (group_name)
            );
        `);
        console.log('Created compatibility_groups table.');

        await db.query(`
            CREATE TABLE IF NOT EXISTS compatibility_group_units (
                id INT AUTO_INCREMENT PRIMARY KEY,
                compatibility_group_id INT NOT NULL,
                motorcycle_unit_id INT NOT NULL,
                UNIQUE KEY unique_group_unit (compatibility_group_id, motorcycle_unit_id),
                INDEX idx_group_unit_group (compatibility_group_id),
                INDEX idx_group_unit_motorcycle (motorcycle_unit_id),
                FOREIGN KEY (compatibility_group_id) REFERENCES compatibility_groups(id) ON DELETE CASCADE,
                FOREIGN KEY (motorcycle_unit_id) REFERENCES motorcycle_units(id) ON DELETE CASCADE
            );
        `);
        console.log('Created compatibility_group_units table.');

        await db.query(`
            CREATE TABLE IF NOT EXISTS product_compatibility_groups (
                id INT AUTO_INCREMENT PRIMARY KEY,
                product_id INT NOT NULL,
                compatibility_group_id INT NOT NULL,
                UNIQUE KEY unique_product_group (product_id, compatibility_group_id),
                INDEX idx_product_group_product (product_id),
                INDEX idx_product_group_group (compatibility_group_id),
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
                FOREIGN KEY (compatibility_group_id) REFERENCES compatibility_groups(id) ON DELETE CASCADE
            );
        `);
        console.log('Created product_compatibility_groups table.');

        // Seed data (only insert if table is empty to avoid duplicates)
        const [groups] = await db.query('SELECT COUNT(*) as count FROM compatibility_groups');
        if (groups[0].count === 0) {
            await db.query(`
                INSERT INTO compatibility_groups (group_name, description) VALUES
                ('Yamaha Mio Platform', 'Shared parts for Yamaha Mio series'),
                ('Honda Click Platform', 'Shared parts for Honda Click series'),
                ('Suzuki Raider Platform', 'Shared parts for Suzuki Raider series');
            `);
            console.log('Seeded compatibility_groups.');

            await db.query(`
                INSERT INTO compatibility_group_units (compatibility_group_id, motorcycle_unit_id)
                SELECT cg.id, mu.id FROM compatibility_groups cg, motorcycle_units mu
                WHERE cg.group_name = 'Yamaha Mio Platform' AND mu.brand = 'Yamaha' AND mu.model = 'Mio i125';
            `);
            await db.query(`
                INSERT INTO compatibility_group_units (compatibility_group_id, motorcycle_unit_id)
                SELECT cg.id, mu.id FROM compatibility_groups cg, motorcycle_units mu
                WHERE cg.group_name = 'Honda Click Platform' AND mu.brand = 'Honda' AND mu.model = 'Click 125';
            `);
            await db.query(`
                INSERT INTO compatibility_group_units (compatibility_group_id, motorcycle_unit_id)
                SELECT cg.id, mu.id FROM compatibility_groups cg, motorcycle_units mu
                WHERE cg.group_name = 'Suzuki Raider Platform' AND mu.brand = 'Suzuki' AND mu.model = 'Raider FI';
            `);
            console.log('Seeded compatibility_group_units.');
        } else {
            console.log('Seed data already exists, skipping.');
        }

        console.log('Phase 8 Database Migration Completed Successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrate();
