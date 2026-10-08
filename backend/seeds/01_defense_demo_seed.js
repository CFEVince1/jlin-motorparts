const path = require('path');
const fs = require('fs');

// Ensure module resolution for backend/node_modules
const possibleModulePaths = [
    path.join(__dirname, '..', 'backend', 'node_modules'),
    path.join(__dirname, 'node_modules'),
    path.join(process.cwd(), 'backend', 'node_modules'),
    path.join(process.cwd(), 'node_modules')
];
for (const p of possibleModulePaths) {
    if (fs.existsSync(p) && !module.paths.includes(p)) {
        module.paths.push(p);
    }
}

// Load environment variables
const envPaths = [
    path.join(__dirname, '..', 'backend', '.env'),
    path.join(__dirname, '.env'),
    path.join(process.cwd(), 'backend', '.env'),
    path.join(process.cwd(), '.env')
];
for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
        require('dotenv').config({ path: envPath });
        break;
    }
}

const mysql = require('mysql2/promise');

async function seed(knex) {
    // ----------------------------------------------------
    // GUARD CLAUSE: Skip execution in production
    // ----------------------------------------------------
    if (process.env.NODE_ENV === 'production') {
        console.warn('⚠️  [GUARD CLAUSE] Skipping demo seed: process.env.NODE_ENV === "production"');
        return;
    }

    console.log('=====================================================');
    console.log(' Running Seed: 01_defense_demo_seed');
    console.log(' Environment: ' + (process.env.NODE_ENV || 'development'));
    console.log('=====================================================\n');

    const config = {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT, 10) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'jlin_inventory_db',
        multipleStatements: true,
        ...(process.env.DB_HOST && process.env.DB_HOST.includes('aivencloud') 
            ? { ssl: { rejectUnauthorized: false } } 
            : {})
    };

    console.log(`Connecting to database ${config.database}...`);
    const connection = await mysql.createConnection(config);
    console.log('Connected.\n');

    try {
        // Helper: Check column
        async function columnExists(tableName, columnName) {
            const [rows] = await connection.query(
                `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
                 WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
                [config.database, tableName, columnName]
            );
            return rows.length > 0;
        }

        // Ensure reference_no and quantity_change exist on inventory_transactions
        if (!(await columnExists('inventory_transactions', 'reference_no'))) {
            await connection.query(`ALTER TABLE inventory_transactions ADD COLUMN reference_no VARCHAR(100) DEFAULT NULL AFTER transaction_number`);
            console.log('  + Added column `reference_no` to `inventory_transactions`');
        }
        if (!(await columnExists('inventory_transactions', 'quantity_change'))) {
            await connection.query(`ALTER TABLE inventory_transactions ADD COLUMN quantity_change INT DEFAULT 0 AFTER quantity`);
            console.log('  + Added column `quantity_change` to `inventory_transactions`');
        }

        // Ensure compatibility_status exists on product_compatibilities
        if (!(await columnExists('product_compatibilities', 'compatibility_status'))) {
            await connection.query(`ALTER TABLE product_compatibilities ADD COLUMN compatibility_status ENUM('COMPATIBLE', 'NOT_COMPATIBLE', 'CONDITIONAL') NOT NULL DEFAULT 'COMPATIBLE' AFTER motorcycle_model_id`);
            console.log('  + Added column `compatibility_status` to `product_compatibilities`');
        }

        // ----------------------------------------------------
        // 1. PRIMARY SUPPLIER: Yamaha Motor Philippines
        // (Names only, no fabricated contact details)
        // ----------------------------------------------------
        console.log('1. Seeding primary supplier: Yamaha Motor Philippines...');
        const [existingSupplier] = await connection.query(
            `SELECT id FROM suppliers WHERE name = 'Yamaha Motor Philippines' LIMIT 1`
        );
        let supplierId;
        if (existingSupplier.length > 0) {
            supplierId = existingSupplier[0].id;
            console.log(`   Supplier already exists (ID: ${supplierId}).`);
        } else {
            const [suppResult] = await connection.query(`
                INSERT INTO suppliers (name, contact_person, email, phone, address, is_active)
                VALUES ('Yamaha Motor Philippines', NULL, NULL, NULL, NULL, TRUE);
            `);
            supplierId = suppResult.insertId;
            console.log(`   ✓ Seeded supplier 'Yamaha Motor Philippines' (ID: ${supplierId}, names only, no fabricated contact details).`);
        }

        // ----------------------------------------------------
        // 2. TARGET MOTORCYCLE MODELS: Yamaha Aerox 155 V1 & V3
        // ----------------------------------------------------
        console.log('\n2. Seeding target motorcycle models: Yamaha Aerox 155 V1 and Yamaha Aerox 155 V3...');
        
        async function getOrCreateModel(brand, model, yearModel) {
            // Check motorcycle_models
            const [existing] = await connection.query(
                `SELECT id FROM motorcycle_models WHERE brand = ? AND model = ? AND (year_model = ? OR year_model IS NULL) LIMIT 1`,
                [brand, model, yearModel]
            );
            if (existing.length > 0) {
                return existing[0].id;
            }
            const [ins] = await connection.query(
                `INSERT INTO motorcycle_models (brand, model, year_model) VALUES (?, ?, ?)`,
                [brand, model, yearModel]
            );
            return ins.insertId;
        }

        async function ensureLegacyUnit(brand, model, yearModel) {
            const [existing] = await connection.query(
                `SELECT id FROM motorcycle_units WHERE brand = ? AND model = ? LIMIT 1`,
                [brand, model]
            );
            if (existing.length > 0) {
                return existing[0].id;
            }
            const [ins] = await connection.query(
                `INSERT INTO motorcycle_units (brand, model, year_model) VALUES (?, ?, ?)`,
                [brand, model, yearModel]
            );
            return ins.insertId;
        }

        const modelV1Id = await getOrCreateModel('Yamaha', 'Aerox 155 V1', 'V1');
        const modelV3Id = await getOrCreateModel('Yamaha', 'Aerox 155 V3', 'V3');
        const legacyUnitV1Id = await ensureLegacyUnit('Yamaha', 'Aerox 155 V1', 'V1');
        const legacyUnitV3Id = await ensureLegacyUnit('Yamaha', 'Aerox 155 V3', 'V3');

        console.log(`   ✓ Model Yamaha Aerox 155 V1 ready (Model ID: ${modelV1Id}).`);
        console.log(`   ✓ Model Yamaha Aerox 155 V3 ready (Model ID: ${modelV3Id}).`);

        // ----------------------------------------------------
        // 3. PRIMARY ITEMS: JLR-BP-AEROX and JLR-OF-AEROX
        // (Initial current_stock = 0)
        // ----------------------------------------------------
        console.log('\n3. Seeding primary items: JLR-BP-AEROX & JLR-OF-AEROX (initial stock = 0)...');

        async function getOrCreateProduct(productData) {
            const [existing] = await connection.query(
                `SELECT id, part_number, stock FROM products WHERE part_number = ? AND brand = ? LIMIT 1`,
                [productData.part_number, productData.brand]
            );
            if (existing.length > 0) {
                // Ensure initial stock is 0 for defense demo baseline
                await connection.query(`UPDATE products SET stock = 0, is_active = TRUE WHERE id = ?`, [existing[0].id]);
                console.log(`   Product ${productData.part_number} exists (ID: ${existing[0].id}, stock reset to 0).`);
                return existing[0].id;
            }
            const [res] = await connection.query(`
                INSERT INTO products (
                    part_number, name, brand, category, size, measurement, thread_type,
                    cost_price, selling_price, stock, reorder_level, is_serialized, is_active
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, TRUE)
            `, [
                productData.part_number,
                productData.name,
                productData.brand,
                productData.category,
                productData.size,
                productData.measurement || null,
                productData.thread_type || null,
                productData.cost_price,
                productData.selling_price,
                productData.reorder_level || 5,
                productData.is_serialized ? 1 : 0
            ]);
            console.log(`   ✓ Created product ${productData.part_number}: ${productData.name} (ID: ${res.insertId}, initial stock = 0).`);
            return res.insertId;
        }

        const prodBrakePadId = await getOrCreateProduct({
            part_number: 'JLR-BP-AEROX',
            name: 'Aerox Front Brake Pad Set',
            brand: 'Yamaha',
            category: 'Brakes',
            size: 'Standard',
            measurement: 'Aerox OEM Front Caliper Fitment',
            cost_price: 250.00,
            selling_price: 450.00,
            reorder_level: 5,
            is_serialized: false
        });

        const prodOilFilterId = await getOrCreateProduct({
            part_number: 'JLR-OF-AEROX',
            name: 'Aerox Engine Oil Filter Element',
            brand: 'Yamaha',
            category: 'Maintenance',
            size: 'Standard',
            measurement: 'Yamaha BlueCore 155cc Engine',
            cost_price: 120.00,
            selling_price: 220.00,
            reorder_level: 5,
            is_serialized: false
        });

        // ----------------------------------------------------
        // 4. BASELINE OPENING_BALANCE LEDGER ROWS
        // (quantity_change = 0, balance_after = 0, reference_no = OPENING-<DB_DATE>)
        // ----------------------------------------------------
        console.log('\n4. Inserting baseline OPENING_BALANCE ledger rows (quantity_change = 0, balance_after = 0)...');

        // Fetch DB Date string
        const [dateRows] = await connection.query(`SELECT DATE_FORMAT(NOW(), '%Y%m%d') as db_date, NOW() as cur_time;`);
        const dbDate = dateRows[0].db_date;
        const referenceNo = `OPENING-${dbDate}`;

        // Get admin user ID
        const [adminUsers] = await connection.query(`SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1;`);
        const adminId = adminUsers.length > 0 ? adminUsers[0].id : 1;

        async function ensureOpeningBalance(productId, partNumber) {
            const [existingTx] = await connection.query(
                `SELECT id FROM inventory_transactions 
                 WHERE product_id = ? AND transaction_type = 'OPENING_BALANCE' LIMIT 1`,
                [productId]
            );
            if (existingTx.length > 0) {
                console.log(`   OPENING_BALANCE ledger row already exists for ${partNumber} (ID: ${existingTx[0].id}).`);
                return existingTx[0].id;
            }

            const txNumber = `TX-${referenceNo}-${partNumber}`;
            const [ins] = await connection.query(`
                INSERT INTO inventory_transactions (
                    transaction_number,
                    reference_no,
                    product_id,
                    transaction_type,
                    quantity,
                    quantity_change,
                    balance_before,
                    balance_after,
                    unit_cost,
                    reference_type,
                    reference_id,
                    notes,
                    created_by,
                    created_at
                ) VALUES (?, ?, ?, 'OPENING_BALANCE', 0, 0, 0, 0, (SELECT cost_price FROM products WHERE id = ?), 'OPENING_BALANCE', ?, ?, ?, NOW())
            `, [
                txNumber,
                referenceNo,
                productId,
                productId,
                productId,
                `Baseline OPENING_BALANCE for defense demo item ${partNumber} (reference: ${referenceNo})`,
                adminId
            ]);
            console.log(`   ✓ Created OPENING_BALANCE row for ${partNumber} (Tx ID: ${ins.insertId}, quantity_change=0, balance_after=0, reference_no=${referenceNo}).`);
            return ins.insertId;
        }

        await ensureOpeningBalance(prodBrakePadId, 'JLR-BP-AEROX');
        await ensureOpeningBalance(prodOilFilterId, 'JLR-OF-AEROX');

        // ----------------------------------------------------
        // 5. SEED COMPATIBILITY MATRIX:
        // JLR-BP-AEROX: COMPATIBLE on V1, NOT_COMPATIBLE on V3
        // JLR-OF-AEROX: COMPATIBLE on both (V1 and V3)
        // ----------------------------------------------------
        console.log('\n5. Seeding compatibility matrix:');
        console.log('   - JLR-BP-AEROX: COMPATIBLE on V1 | NOT_COMPATIBLE on V3');
        console.log('   - JLR-OF-AEROX: COMPATIBLE on V1 | COMPATIBLE on V3');

        async function setCompatibility(productId, modelId, status, legacyUnitId) {
            // Insert or update in product_compatibilities
            const [existing] = await connection.query(
                `SELECT id FROM product_compatibilities WHERE product_id = ? AND motorcycle_model_id = ? LIMIT 1`,
                [productId, modelId]
            );
            if (existing.length > 0) {
                await connection.query(
                    `UPDATE product_compatibilities SET compatibility_status = ?, notes = ? WHERE id = ?`,
                    [status, status, existing[0].id]
                );
            } else {
                await connection.query(
                    `INSERT INTO product_compatibilities (product_id, motorcycle_model_id, compatibility_status, notes)
                     VALUES (?, ?, ?, ?)`,
                    [productId, modelId, status, status]
                );
            }

            // Sync legacy product_compatibility table:
            // Only insert if COMPATIBLE; remove if NOT_COMPATIBLE
            if (legacyUnitId) {
                if (status === 'COMPATIBLE') {
                    await connection.query(
                        `INSERT IGNORE INTO product_compatibility (product_id, motorcycle_unit_id) VALUES (?, ?)`,
                        [productId, legacyUnitId]
                    );
                } else {
                    await connection.query(
                        `DELETE FROM product_compatibility WHERE product_id = ? AND motorcycle_unit_id = ?`,
                        [productId, legacyUnitId]
                    );
                }
            }
        }

        // JLR-BP-AEROX
        await setCompatibility(prodBrakePadId, modelV1Id, 'COMPATIBLE', legacyUnitV1Id);
        await setCompatibility(prodBrakePadId, modelV3Id, 'NOT_COMPATIBLE', legacyUnitV3Id);

        // JLR-OF-AEROX
        await setCompatibility(prodOilFilterId, modelV1Id, 'COMPATIBLE', legacyUnitV1Id);
        await setCompatibility(prodOilFilterId, modelV3Id, 'COMPATIBLE', legacyUnitV3Id);

        console.log('   ✓ Compatibility matrix verified and seeded.');

        console.log('\n=====================================================');
        console.log(' 01_defense_demo_seed Completed Successfully! ');
        console.log('=====================================================\n');

        await connection.end();
        return;
    } catch (err) {
        console.error('❌ Seed failed with error:', err);
        await connection.end();
        throw err;
    }
}

// Support both Knex seed:run and standalone node execution
exports.seed = seed;

if (require.main === module) {
    seed()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}
