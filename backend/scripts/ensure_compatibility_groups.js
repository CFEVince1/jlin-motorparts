require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../config/db');

(async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS compatibility_groups (
      id INT AUTO_INCREMENT PRIMARY KEY,
      group_name VARCHAR(150) NOT NULL UNIQUE,
      description TEXT,
      INDEX idx_group_name (group_name)
    )
  `);

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
    )
  `);

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
    )
  `);

  // Seed default platform groups if empty
  const [existingGroups] = await db.query('SELECT COUNT(*) as cnt FROM compatibility_groups');
  if (existingGroups[0].cnt === 0) {
    const defaultGroups = [
      { name: 'Yamaha Aerox Platform', desc: 'Aerox 155 V1, V2, V3 series' },
      { name: 'Honda Click Platform', desc: 'Click 125, Click 150, Click 160 series' },
      { name: 'Suzuki Raider Platform', desc: 'Raider 150 Carb, Raider FI series' },
      { name: 'Yamaha Mio Platform', desc: 'Mio Sporty, Mio i125, Mio Soul i125 series' }
    ];

    for (const g of defaultGroups) {
      const [res] = await db.query(
        'INSERT INTO compatibility_groups (group_name, description) VALUES (?, ?)',
        [g.name, g.desc]
      );
      const groupId = res.insertId;

      // Link matching units
      if (g.name.includes('Aerox')) {
        await db.query(`
          INSERT IGNORE INTO compatibility_group_units (compatibility_group_id, motorcycle_unit_id)
          SELECT ?, id FROM motorcycle_units WHERE model LIKE '%Aerox%'
        `, [groupId]);
      } else if (g.name.includes('Click')) {
        await db.query(`
          INSERT IGNORE INTO compatibility_group_units (compatibility_group_id, motorcycle_unit_id)
          SELECT ?, id FROM motorcycle_units WHERE model LIKE '%Click%'
        `, [groupId]);
      } else if (g.name.includes('Raider')) {
        await db.query(`
          INSERT IGNORE INTO compatibility_group_units (compatibility_group_id, motorcycle_unit_id)
          SELECT ?, id FROM motorcycle_units WHERE model LIKE '%Raider%'
        `, [groupId]);
      } else if (g.name.includes('Mio')) {
        await db.query(`
          INSERT IGNORE INTO compatibility_group_units (compatibility_group_id, motorcycle_unit_id)
          SELECT ?, id FROM motorcycle_units WHERE model LIKE '%Mio%'
        `, [groupId]);
      }
    }
    console.log('Seeded default platform groups.');
  }

  console.log('Compatibility groups tables ready.');
  process.exit(0);
})().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
