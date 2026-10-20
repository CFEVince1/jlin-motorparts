const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const db = require('../config/db');

async function seed() {
    // ----------------------------------------------------
    // GUARD CLAUSE: Skip execution in production
    // ----------------------------------------------------
    if (process.env.NODE_ENV === 'production') {
        console.warn('⚠️  [GUARD CLAUSE] Skipping demo seed: process.env.NODE_ENV === "production"');
        process.exit(0);
    }

    console.log('==================================================');
    console.log(' Seeding 40+ Realistic Motorcycle Parts & 7-Day Sales');
    console.log('==================================================\n');

    const conn = await db.getConnection();

    try {
        await conn.beginTransaction();

        // 1. Purge "Snapshot Profit Test Part" and test artifacts
        console.log('1. Cleaning up old test data (Snapshot Profit Test Part)...');
        await conn.query("DELETE FROM sale_items WHERE product_name LIKE '%Snapshot%' OR product_name LIKE '%Test Part%'");
        await conn.query("UPDATE products SET is_active = FALSE, name = CONCAT('[ARCHIVED] ', name) WHERE name LIKE '%Snapshot%' AND name NOT LIKE '[ARCHIVED]%'");
        console.log('   ✓ Test data deactivated and cleaned from sales reporting.');

        // Clean up orphan sales
        await conn.query(`
            DELETE s FROM sales s
            LEFT JOIN sale_items si ON s.id = si.sale_id
            WHERE si.id IS NULL
        `);

        // 2. Ensure Clean Capitalized Motorcycle Models
        console.log('\n2. Ensuring standard motorcycle models with clean casing...');
        const models = [
            { brand: 'Yamaha', model: 'Aerox 155' },
            { brand: 'Yamaha', model: 'NMAX 155' },
            { brand: 'Yamaha', model: 'Mio i125' },
            { brand: 'Yamaha', model: 'Sniper 155' },
            { brand: 'Honda', model: 'Click 125i' },
            { brand: 'Honda', model: 'Click 150i' },
            { brand: 'Honda', model: 'Beat FI' },
            { brand: 'Honda', model: 'ADV 160' },
            { brand: 'Honda', model: 'PCX 160' },
            { brand: 'Suzuki', model: 'Raider 150 FI' },
            { brand: 'Suzuki', model: 'Smash 115' },
            { brand: 'Universal', model: 'Universal Fit' }
        ];

        const modelMap = {};
        for (const m of models) {
            const [exist] = await conn.query(
                "SELECT id FROM motorcycle_models WHERE brand = ? AND model = ? LIMIT 1",
                [m.brand, m.model]
            );
            if (exist.length > 0) {
                modelMap[`${m.brand}_${m.model}`] = exist[0].id;
            } else {
                const [ins] = await conn.query(
                    "INSERT INTO motorcycle_models (brand, model) VALUES (?, ?)",
                    [m.brand, m.model]
                );
                modelMap[`${m.brand}_${m.model}`] = ins.insertId;
            }
        }
        console.log(`   ✓ ${Object.keys(modelMap).length} models verified.`);

        // 3. Define 42 Realistic Motorcycle Parts (Deduplicated names)
        console.log('\n3. Seeding 42 realistic parts across brands & categories...');
        const parts = [
            // Engine
            { part_number: 'JVT-CB-66MM', name: 'JVT Cylinder Block Kit 66mm Ceramic', brand: 'JVT', category: 'Engine', size: '66mm', cost: 4800, price: 7500, stock: 18, models: ['Yamaha_Aerox 155', 'Yamaha_NMAX 155'] },
            { part_number: 'UMA-CAM-STAGE2', name: 'Uma Racing High Camshaft Stage 2', brand: 'Uma Racing', category: 'Engine', size: 'Stage 2', cost: 1800, price: 2950, stock: 12, models: ['Yamaha_Sniper 155', 'Suzuki_Raider 150 FI'] },
            { part_number: 'BRT-PISTON-58', name: 'BRT Forged Piston Kit 58.5mm Pin 14', brand: 'BRT', category: 'Engine', size: '58.5mm', cost: 1400, price: 2200, stock: 15, models: ['Honda_Click 125i', 'Honda_Beat FI'] },
            { part_number: 'YAM-VALVE-SPR', name: 'Yamaha Racing Valve Spring Set', brand: 'Yamaha', category: 'Engine', size: 'Standard', cost: 650, price: 1100, stock: 24, models: ['Yamaha_Aerox 155', 'Yamaha_Sniper 155'] },
            { part_number: 'HON-OIL-PUMP', name: 'Honda Genuine High Flow Oil Pump', brand: 'Honda', category: 'Engine', size: 'OEM', cost: 750, price: 1250, stock: 8, models: ['Honda_Click 125i', 'Honda_Click 150i'] },
            { part_number: 'SUZ-CYL-STD', name: 'Suzuki Genuine Cylinder Block Assembly', brand: 'Suzuki', category: 'Engine', size: 'Standard 62mm', cost: 3200, price: 4800, stock: 5, models: ['Suzuki_Raider 150 FI'] },
            
            // CVT / Transmission
            { part_number: 'JVT-CVT-V3', name: 'JVT V3 Pulley Set with Drive Face', brand: 'JVT', category: 'CVT', size: '13.5 Deg', cost: 1600, price: 2650, stock: 20, models: ['Honda_Click 125i', 'Honda_Click 150i'] },
            { part_number: 'GAT-BELT-AER', name: 'Gates Powerlink High-Tenacity Drive Belt', brand: 'Gates', category: 'CVT', size: '842-20-30', cost: 600, price: 1050, stock: 35, models: ['Yamaha_Aerox 155', 'Yamaha_NMAX 155'] },
            { part_number: 'KOS-FLY-09G', name: 'Koso Racing Flyball Roller Set 9g', brand: 'Koso', category: 'CVT', size: '9 Grams (6pcs)', cost: 220, price: 420, stock: 50, models: ['Honda_Click 125i', 'Honda_Beat FI'] },
            { part_number: 'KOS-FLY-11G', name: 'Koso Racing Flyball Roller Set 11g', brand: 'Koso', category: 'CVT', size: '11 Grams (6pcs)', cost: 220, price: 420, stock: 45, models: ['Yamaha_Aerox 155', 'Yamaha_Mio i125'] },
            { part_number: 'RCB-BELL-V2', name: 'RCB CNC Lightened Clutch Bell', brand: 'RCB', category: 'CVT', size: 'Grooved', cost: 1200, price: 1950, stock: 14, models: ['Yamaha_Aerox 155', 'Honda_Click 150i'] },
            { part_number: 'MTR-CENT-1500', name: 'MTRT Torque Center Spring 1500 RPM', brand: 'MTRT', category: 'CVT', size: '1500 RPM', cost: 350, price: 650, stock: 28, models: ['Honda_Click 125i', 'Yamaha_Mio i125'] },
            { part_number: 'HON-CLU-LIN', name: 'Honda OEM Carbon Clutch Lining Set', brand: 'Honda', category: 'CVT', size: 'Standard', cost: 780, price: 1350, stock: 19, models: ['Honda_Click 125i', 'Honda_ADV 160'] },

            // Brakes (Distinct deduplicated products)
            { part_number: 'RCB-S1-CAL-FR', name: 'RCB S1 Dual Piston Front Caliper 28mm', brand: 'RCB', category: 'Brakes', size: '2-Piston Axial', cost: 1850, price: 2950, stock: 11, models: ['Yamaha_Aerox 155', 'Honda_Click 125i'] },
            { part_number: 'BRM-PAD-CER', name: 'Brembo Sintered Racing Front Brake Pads', brand: 'Brembo', category: 'Brakes', size: 'Ceramic Composite', cost: 650, price: 1150, stock: 22, models: ['Yamaha_Aerox 155', 'Yamaha_NMAX 155'] },
            { part_number: 'NIS-DISC-260', name: 'Nissin Floating Disc Rotor 260mm', brand: 'Nissin', category: 'Brakes', size: '260mm 4-Hole', cost: 1450, price: 2400, stock: 8, models: ['Yamaha_Aerox 155', 'Yamaha_Mio i125'] },
            { part_number: 'RCB-HOSE-950', name: 'RCB Steel Braided Teflon Brake Line', brand: 'RCB', category: 'Brakes', size: '950mm Blue', cost: 550, price: 920, stock: 30, models: ['Universal_Universal Fit'] },
            { part_number: 'YAM-SHOE-RR', name: 'Yamaha OEM Rear Drum Brake Shoe Set', brand: 'Yamaha', category: 'Brakes', size: 'Standard', cost: 220, price: 420, stock: 26, models: ['Yamaha_Aerox 155', 'Yamaha_Mio i125'] },
            { part_number: 'BRM-MST-14R', name: 'Brembo Radial Brake Master Cylinder 14mm', brand: 'Brembo', category: 'Brakes', size: '14mm Piston', cost: 3800, price: 5900, stock: 4, models: ['Universal_Universal Fit'] },
            { part_number: 'YAM-BP-NMAX', name: 'Yamaha NMAX Rear Disc Brake Pad Set', brand: 'Yamaha', category: 'Brakes', size: 'Rear OEM', cost: 280, price: 480, stock: 0, models: ['Yamaha_NMAX 155'] },

            // Electrical
            { part_number: 'NGK-CPR9EAIX', name: 'NGK Iridium IX Laser Welded Spark Plug', brand: 'NGK', category: 'Electrical', size: 'CPR9EAIX-9', cost: 260, price: 480, stock: 60, models: ['Yamaha_Aerox 155', 'Honda_Click 125i', 'Suzuki_Raider 150 FI'] },
            { part_number: 'KOS-VOLT-MINI', name: 'Koso Mini 3 Digital Voltmeter & Clock', brand: 'Koso', category: 'Electrical', size: 'Compact LED', cost: 850, price: 1450, stock: 16, models: ['Universal_Universal Fit'] },
            { part_number: 'UMA-COIL-FI', name: 'Uma Racing Super Ignition Coil EFI', brand: 'Uma Racing', category: 'Electrical', size: 'High Voltage', cost: 950, price: 1650, stock: 14, models: ['Yamaha_Sniper 155', 'Suzuki_Raider 150 FI'] },
            { part_number: 'ECU-RAIDER-01', name: 'Suzuki Raider FI Programmable Racing ECU', brand: 'Suzuki', category: 'Electrical', size: 'Full Standalone', cost: 1600, price: 2500, stock: 3, models: ['Suzuki_Raider 150 FI'] },
            { part_number: 'KOS-THERMO', name: 'Koso Digital Engine Temperature Sensor', brand: 'Koso', category: 'Electrical', size: 'M10 Thread', cost: 720, price: 1250, stock: 9, models: ['Yamaha_Aerox 155', 'Honda_Click 150i'] },
            { part_number: 'DEN-HORN-WP', name: 'Denso Waterproof Compact Disc Horn Set', brand: 'Denso', category: 'Electrical', size: '12V 110dB', cost: 480, price: 820, stock: 25, models: ['Universal_Universal Fit'] },

            // Maintenance / Lubricants
            { part_number: 'MOT-7100-10W40', name: 'Motul 7100 100% Synthetic 10W-40 4T 1L', brand: 'Motul', category: 'Maintenance', size: '1 Liter', cost: 420, price: 680, stock: 40, models: ['Universal_Universal Fit'] },
            { part_number: 'MOT-SCOOT-EX', name: 'Motul Scooter Expert LE 10W-40 MB 800ml', brand: 'Motul', category: 'Maintenance', size: '800ml', cost: 220, price: 380, stock: 55, models: ['Honda_Click 125i', 'Yamaha_Aerox 155'] },
            { part_number: 'YAM-YAMALUBE', name: 'Yamalube AT Performance 10W-40 800ml', brand: 'Yamaha', category: 'Maintenance', size: '800ml', cost: 180, price: 310, stock: 48, models: ['Yamaha_Aerox 155', 'Yamaha_Mio i125'] },
            { part_number: 'MOT-GEAR-80W90', name: 'Motul Scooter Gear Oil 80W-90 120ml', brand: 'Motul', category: 'Maintenance', size: '120ml Tube', cost: 75, price: 150, stock: 80, models: ['Honda_Click 125i', 'Yamaha_Aerox 155'] },
            { part_number: 'SUZ-OF-RAIDER', name: 'Suzuki Raider 150 FI Oil Filter Element', brand: 'Suzuki', category: 'Maintenance', size: 'OEM Element', cost: 140, price: 240, stock: 2, models: ['Suzuki_Raider 150 FI'] },
            { part_number: 'MOT-COOLANT', name: 'Motul Motocool Expert Hybrid Coolant 1L', brand: 'Motul', category: 'Maintenance', size: '1 Liter', cost: 290, price: 490, stock: 32, models: ['Honda_Click 150i', 'Yamaha_Aerox 155'] },
            { part_number: 'MOT-DOT4-FLUID', name: 'Motul DOT 4 Fully Synthetic Brake Fluid', brand: 'Motul', category: 'Maintenance', size: '500ml', cost: 210, price: 380, stock: 30, models: ['Universal_Universal Fit'] },

            // Suspension & Drive
            { part_number: 'RCB-SHOCK-VD', name: 'RCB VD Series Rear Shock Absorber 305mm', brand: 'RCB', category: 'Suspension', size: '305mm Dual Shock', cost: 6200, price: 9800, stock: 6, models: ['Yamaha_Aerox 155', 'Yamaha_NMAX 155'] },
            { part_number: 'YSS-G-SPORT', name: 'YSS G-Sport Smooth Rear Shock 330mm', brand: 'YSS', category: 'Suspension', size: '330mm Single', cost: 4200, price: 6800, stock: 5, models: ['Honda_Click 125i', 'Honda_Click 150i'] },
            { part_number: 'DID-CHAIN-428', name: 'DID Heavy Duty Roller Chain 428HD-120L', brand: 'DID', category: 'Drive', size: '428HD x 120L Gold', cost: 780, price: 1350, stock: 22, models: ['Yamaha_Sniper 155', 'Suzuki_Raider 150 FI'] },
            { part_number: 'SSS-SPROCKET', name: 'SSS Racing Hard Alloy Sprocket Set 14-42T', brand: 'SSS', category: 'Drive', size: '14T Front / 42T Rear', cost: 950, price: 1650, stock: 16, models: ['Suzuki_Raider 150 FI', 'Yamaha_Sniper 155'] },

            // Fasteners & Hardware
            { part_number: 'JRP-BOLT-M8', name: 'JRP Titanium Flower Head Caliper Bolt M8', brand: 'JRP', category: 'Fasteners', size: 'M8 x 25mm', cost: 45, price: 95, stock: 120, models: ['Universal_Universal Fit'] },
            { part_number: 'JRP-SCREW-M5', name: 'JRP Stainless Fairing Body Screw Set', brand: 'JRP', category: 'Fasteners', size: 'M5 x 16mm (10pcs)', cost: 80, price: 160, stock: 75, models: ['Universal_Universal Fit'] },
            { part_number: 'RCB-GRIP-HG55', name: 'RCB HG55 Soft Dual Density Handlebar Grips', brand: 'RCB', category: 'Accessories', size: '22mm Universal', cost: 180, price: 340, stock: 35, models: ['Universal_Universal Fit'] },
            { part_number: 'JRP-STEM-ALUM', name: 'JRP CNC Aluminum Valve Stem Cap Set', brand: 'JRP', category: 'Accessories', size: '90 Degree Anodized', cost: 70, price: 150, stock: 65, models: ['Universal_Universal Fit'] },
            { part_number: 'YAM-FILTER-ELM', name: 'Yamaha High Flow Air Filter Element', brand: 'Yamaha', category: 'Maintenance', size: 'OEM Fitment', cost: 240, price: 440, stock: 28, models: ['Yamaha_Aerox 155', 'Yamaha_NMAX 155'] }
        ];

        const insertedProductMap = {};

        for (const p of parts) {
            const [existing] = await conn.query(
                "SELECT id FROM products WHERE part_number = ? LIMIT 1",
                [p.part_number]
            );

            let productId;
            if (existing.length > 0) {
                productId = existing[0].id;
                await conn.query(`
                    UPDATE products SET
                        name = ?, brand = ?, category = ?, size = ?,
                        cost_price = ?, selling_price = ?, retail_price = ?,
                        stock = ?, current_stock = ?, is_active = TRUE
                    WHERE id = ?
                `, [p.name, p.brand, p.category, p.size, p.cost, p.price, p.price, p.stock, p.stock, productId]);
            } else {
                const [ins] = await conn.query(`
                    INSERT INTO products (
                        part_number, sku, name, brand, category, size,
                        cost_price, selling_price, retail_price, stock, current_stock,
                        reorder_level, is_serialized, is_active
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 5, FALSE, TRUE)
                `, [p.part_number, p.part_number, p.name, p.brand, p.category, p.size, p.cost, p.price, p.price, p.stock, p.stock]);
                productId = ins.insertId;
            }

            insertedProductMap[p.part_number] = { id: productId, ...p };

            // Link compatibilities
            for (const modelKey of p.models) {
                const modelId = modelMap[modelKey];
                if (modelId) {
                    const [cExist] = await conn.query(
                        "SELECT id FROM product_compatibilities WHERE product_id = ? AND motorcycle_model_id = ? LIMIT 1",
                        [productId, modelId]
                    );
                    if (cExist.length === 0) {
                        await conn.query(
                            "INSERT INTO product_compatibilities (product_id, motorcycle_model_id, compatibility_status) VALUES (?, ?, 'COMPATIBLE')",
                            [productId, modelId]
                        );
                    }
                }
            }
        }

        // Clean up any remaining legacy duplicate products if they exist
        await conn.query("UPDATE products SET is_active = FALSE WHERE part_number = 'YAM-BP-AEROX' OR part_number = 'YAM-OF-AEROX'");

        console.log(`   ✓ 42 motorcycle parts seeded/updated.`);

        // 4. Seed 7-Day Varied Sales with realistic retail dips & surges
        // Natural pattern:
        // Day 6 (Thu): solid ~₱8,800
        // Day 5 (Fri): DIP! ~₱5,200 (Fri < Thu)
        // Day 4 (Sat): Weekend surge ~₱14,800
        // Day 3 (Sun): Weekend PEAK ~₱21,500
        // Day 2 (Mon): Post-weekend DIP! ~₱7,100 (Mon < Sun)
        // Day 1 (Tue): Midweek recovery ~₱13,400
        // Day 0 (Wed/Today): Steady demo activity ~₱11,800
        console.log('\n4. Seeding realistic sales across all 7 days with natural curve dips...');
        const [adminUser] = await conn.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
        const adminId = adminUser.length > 0 ? adminUser[0].id : 1;

        const dailyPlans = [
            { daysAgo: 6, orderCount: 5, items: [
                { key: 'DID-CHAIN-428', qty: 2 },
                { key: 'MOT-7100-10W40', qty: 3 },
                { key: 'NGK-CPR9EAIX', qty: 4 },
                { key: 'JRP-BOLT-M8', qty: 6 },
                { key: 'JVT-CVT-V3', qty: 1 }
            ] }, // ~₱8,800
            { daysAgo: 5, orderCount: 3, items: [
                { key: 'MOT-SCOOT-EX', qty: 4 },
                { key: 'NGK-CPR9EAIX', qty: 3 },
                { key: 'BRM-PAD-CER', qty: 2 }
            ] }, // ~₱5,250 (DIP - Friday lower than Thursday)
            { daysAgo: 4, orderCount: 7, items: [
                { key: 'RCB-S1-CAL-FR', qty: 2 },
                { key: 'JVT-CVT-V3', qty: 2 },
                { key: 'MOT-7100-10W40', qty: 3 },
                { key: 'DID-CHAIN-428', qty: 2 },
                { key: 'GAT-BELT-AER', qty: 2 }
            ] }, // ~₱14,800 (Saturday surge)
            { daysAgo: 3, orderCount: 9, items: [
                { key: 'RCB-SHOCK-VD', qty: 1 },
                { key: 'JVT-CB-66MM', qty: 1 },
                { key: 'BRM-PAD-CER', qty: 2 },
                { key: 'MOT-7100-10W40', qty: 4 },
                { key: 'NGK-CPR9EAIX', qty: 5 }
            ] }, // ~₱21,500 (Sunday Peak)
            { daysAgo: 2, orderCount: 4, items: [
                { key: 'MOT-SCOOT-EX', qty: 4 },
                { key: 'GAT-BELT-AER', qty: 2 },
                { key: 'JRP-BOLT-M8', qty: 10 },
                { key: 'NGK-CPR9EAIX', qty: 4 }
            ] }, // ~₱7,100 (DIP - Monday lower than Sunday)
            { daysAgo: 1, orderCount: 7, items: [
                { key: 'RCB-S1-CAL-FR', qty: 2 },
                { key: 'JVT-CVT-V3', qty: 1 },
                { key: 'MOT-7100-10W40', qty: 3 },
                { key: 'DID-CHAIN-428', qty: 2 }
            ] }, // ~₱13,400 (Tuesday recovery)
            { daysAgo: 0, orderCount: 6, items: [
                { key: 'DID-CHAIN-428', qty: 2 },
                { key: 'BRM-PAD-CER', qty: 2 },
                { key: 'MOT-7100-10W40', qty: 3 },
                { key: 'JRP-BOLT-M8', qty: 12 },
                { key: 'JVT-CVT-V3', qty: 1 }
            ] }  // ~₱11,800 (Wednesday / Today)
        ];

        let orderSequence = 2001;

        for (const plan of dailyPlans) {
            // Delete existing sales for this specific day
            await conn.query(`
                DELETE s FROM sales s
                WHERE DATE(s.sale_date) = DATE_SUB(CURDATE(), INTERVAL ? DAY)
            `, [plan.daysAgo]);

            let dayTotal = 0;
            for (let i = 0; i < plan.items.length; i++) {
                const spec = plan.items[i];
                const item = insertedProductMap[spec.key];
                if (!item) continue;

                const subtotal = item.price * spec.qty;
                dayTotal += subtotal;
                const tendered = Math.ceil(subtotal / 100) * 100;
                const change = tendered - subtotal;

                const [sRes] = await conn.query(`
                    INSERT INTO sales (
                        user_id, total_amount, tendered_amount, change_due,
                        payment_method, sale_date, order_number, payment_status, status, paid_at
                    ) VALUES (
                        ?, ?, ?, ?,
                        'Cash',
                        DATE_ADD(DATE_SUB(CURDATE(), INTERVAL ? DAY), INTERVAL ? HOUR),
                        ?, 'PAID', 'COMPLETED',
                        DATE_ADD(DATE_SUB(CURDATE(), INTERVAL ? DAY), INTERVAL ? HOUR)
                    )
                `, [
                    adminId, subtotal, tendered, change,
                    plan.daysAgo, 9 + (i * 2),
                    `ORD-${plan.daysAgo}-${orderSequence++}`,
                    plan.daysAgo, 9 + (i * 2)
                ]);

                const saleId = sRes.insertId;

                await conn.query(`
                    INSERT INTO sale_items (
                        sale_id, product_id, part_number, product_name,
                        brand, size, quantity, price, cost_price, subtotal
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    saleId, item.id, item.part_number, item.name,
                    item.brand, item.size, spec.qty, item.price, item.cost, subtotal
                ]);
            }
            console.log(`   Day -${plan.daysAgo} seeded: ~₱${dayTotal.toLocaleString()} across ${plan.items.length} orders.`);
        }

        await conn.commit();
        console.log('\n==================================================');
        console.log(' Seed completed successfully!');
        console.log('==================================================');
        process.exit(0);

    } catch (err) {
        await conn.rollback();
        console.error('Seed failed:', err);
        process.exit(1);
    } finally {
        conn.release();
    }
}

seed();
