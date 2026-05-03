require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');

const bulkProducts = [
    { name: 'RCB Hand Grips HG55', brand: 'RCB', category: 'Accessories', cost: 150, sell: 250 },
    { name: 'Domino Racing Grips', brand: 'Domino', category: 'Accessories', cost: 300, sell: 450 },
    { name: 'NGK Iridium Spark Plug CR8EIX', brand: 'NGK', category: 'Engine Parts', cost: 350, sell: 500 },
    { name: 'Bendix Brake Pads Ceramic', brand: 'Bendix', category: 'Brakes', cost: 180, sell: 300 },
    { name: 'Elig Brake Pads Sintered', brand: 'Elig', category: 'Brakes', cost: 250, sell: 400 },
    { name: 'Motul 300V 10W40 1L', brand: 'Motul', category: 'Lubricants', cost: 800, sell: 1100 },
    { name: 'Motul Scooter Expert LE 10W40', brand: 'Motul', category: 'Lubricants', cost: 280, sell: 380 },
    { name: 'Yamalube AT Premium 1L', brand: 'Yamalube', category: 'Lubricants', cost: 200, sell: 300 },
    { name: 'Kixx Ultra 4T Scooter 10W40', brand: 'Kixx', category: 'Lubricants', cost: 180, sell: 250 },
    { name: 'Pirelli Diablo Rosso Sport 90/80-14', brand: 'Pirelli', category: 'Tires', cost: 1800, sell: 2300 },
    { name: 'Maxxis Victra S98 100/80-14', brand: 'Maxxis', category: 'Tires', cost: 1500, sell: 1950 },
    { name: 'FDR Sport Zevo 90/80-14', brand: 'FDR', category: 'Tires', cost: 1200, sell: 1600 },
    { name: 'Corsa Platinum R26 90/80-14', brand: 'Corsa', category: 'Tires', cost: 1300, sell: 1750 },
    { name: 'Gates Powerlink V-Belt', brand: 'Gates', category: 'Transmission', cost: 450, sell: 650 },
    { name: 'Bando V-Belt (Aerox/Nmax)', brand: 'Bando', category: 'Transmission', cost: 400, sell: 600 },
    { name: 'MTRT Roller Weights 10g', brand: 'MTRT', category: 'Transmission', cost: 250, sell: 350 },
    { name: 'RS8 Flyballs 12g Set', brand: 'RS8', category: 'Transmission', cost: 200, sell: 300 },
    { name: 'JVT Center Spring 1000 RPM', brand: 'JVT', category: 'Transmission', cost: 300, sell: 450 },
    { name: 'JVT Clutch Spring 1500 RPM', brand: 'JVT', category: 'Transmission', cost: 150, sell: 250 },
    { name: 'Uma Racing Clutch Lining Set', brand: 'Uma Racing', category: 'Transmission', cost: 600, sell: 850 },
    { name: 'TDD LED Headlight Bulb M01B', brand: 'TDD', category: 'Electrical', cost: 250, sell: 400 },
    { name: 'Osram All Season Bulb HS1', brand: 'Osram', category: 'Electrical', cost: 200, sell: 350 },
    { name: 'K&N Washable Air Filter (Aerox)', brand: 'K&N', category: 'Filters', cost: 2000, sell: 2800 },
    { name: 'MTRT High Flow Air Filter', brand: 'MTRT', category: 'Filters', cost: 800, sell: 1200 },
    { name: 'Koso Hurricane Air Filter', brand: 'Koso', category: 'Filters', cost: 900, sell: 1350 },
    { name: 'SSS Sprocket Set 14T-38T', brand: 'SSS', category: 'Transmission', cost: 500, sell: 750 },
    { name: 'Osaki Colored Sprocket Set', brand: 'Osaki', category: 'Transmission', cost: 450, sell: 650 },
    { name: 'DID Heavy Duty Chain 428H', brand: 'DID', category: 'Transmission', cost: 600, sell: 900 },
    { name: 'YBN Gold Chain 428', brand: 'YBN', category: 'Transmission', cost: 400, sell: 650 },
    { name: 'SKF High Speed Bearing 6201', brand: 'SKF', category: 'Engine Parts', cost: 150, sell: 250 },
    { name: 'FAG Engine Bearing Set', brand: 'FAG', category: 'Engine Parts', cost: 600, sell: 950 },
    { name: 'Heng Gold Bolts (Crankcase Set)', brand: 'Heng', category: 'Accessories', cost: 800, sell: 1200 },
    { name: 'Heng Titanium Disc Bolts', brand: 'Heng', category: 'Accessories', cost: 250, sell: 400 },
    { name: 'Morin Braided Brake Hose 36"', brand: 'Morin', category: 'Brakes', cost: 450, sell: 700 },
    { name: 'Earls Brake Line Fittings', brand: 'Earls', category: 'Brakes', cost: 150, sell: 250 },
    { name: 'Motul Factory Line Coolant 1L', brand: 'Motul', category: 'Fluids', cost: 450, sell: 650 },
    { name: 'Engine Ice Coolant 1.89L', brand: 'Engine Ice', category: 'Fluids', cost: 1200, sell: 1600 },
    { name: 'Brembo Dot 4 Brake Fluid', brand: 'Brembo', category: 'Fluids', cost: 350, sell: 550 },
    { name: 'Yamaha Genuine Gear Oil 100ml', brand: 'Yamaha', category: 'Lubricants', cost: 80, sell: 120 },
    { name: 'RS8 Scooter Gear Oil 120ml', brand: 'RS8', category: 'Lubricants', cost: 100, sell: 150 },
    { name: 'Option 1 Throttle Cable', brand: 'Option 1', category: 'Cables', cost: 150, sell: 250 },
    { name: 'Uma Racing Quick Throttle Cable', brand: 'Uma Racing', category: 'Cables', cost: 300, sell: 500 },
    { name: 'JVT Brake Cable Rear', brand: 'JVT', category: 'Cables', cost: 180, sell: 300 },
    { name: 'Yamaha Genuine Oil Filter', brand: 'Yamaha', category: 'Filters', cost: 120, sell: 200 },
    { name: 'KN Oil Filter KN-141', brand: 'K&N', category: 'Filters', cost: 450, sell: 650 },
    { name: 'Pirelli Tubeless Valve CNC', brand: 'Pirelli', category: 'Tires', cost: 150, sell: 250 },
    { name: 'RCB Bar Ends Alloy', brand: 'RCB', category: 'Accessories', cost: 350, sell: 550 },
    { name: 'Nui Racing Brake Lever Spacer', brand: 'Nui Racing', category: 'Accessories', cost: 120, sell: 200 },
    { name: 'Koso Volt Meter Slim', brand: 'Koso', category: 'Electrical', cost: 450, sell: 700 },
    { name: 'Option 1 Horn 12V', brand: 'Option 1', category: 'Electrical', cost: 250, sell: 400 }
];

const serializedProducts = [
    { name: 'aRacer RC Super X ECU', brand: 'aRacer', category: 'Electronics', cost: 15000, sell: 18500 },
    { name: 'aRacer RC Mini 5 ECU', brand: 'aRacer', category: 'Electronics', cost: 8500, sell: 10500 },
    { name: 'Uma Racing M5 ECU', brand: 'Uma Racing', category: 'Electronics', cost: 9000, sell: 11000 },
    { name: 'JVT Racing Cylinder Block 63mm', brand: 'JVT', category: 'Engine Parts', cost: 3500, sell: 4800 },
    { name: 'MTRT Ceramic Block 59mm', brand: 'MTRT', category: 'Engine Parts', cost: 3200, sell: 4500 },
    { name: 'Uma Racing Superhead Pro 20/23', brand: 'Uma Racing', category: 'Engine Parts', cost: 12000, sell: 15000 },
    { name: 'JVT Big Valve Head 24/28', brand: 'JVT', category: 'Engine Parts', cost: 8000, sell: 10500 },
    { name: 'MTRT Racing Crankshaft +3mm', brand: 'MTRT', category: 'Engine Parts', cost: 6500, sell: 8500 },
    { name: 'JVT Crankshaft Assembly', brand: 'JVT', category: 'Engine Parts', cost: 6000, sell: 8000 },
    { name: 'YSS G-Sport Rear Shock', brand: 'YSS', category: 'Suspension', cost: 7500, sell: 9500 },
    { name: 'YSS G-Racing Rear Shock', brand: 'YSS', category: 'Suspension', cost: 15000, sell: 18500 },
    { name: 'Ohlins YA740 Rear Shock', brand: 'Ohlins', category: 'Suspension', cost: 35000, sell: 42000 },
    { name: 'RCB VD Series Rear Shock', brand: 'RCB', category: 'Suspension', cost: 8500, sell: 11000 },
    { name: 'RCB VS Series Rear Shock', brand: 'RCB', category: 'Suspension', cost: 6500, sell: 8500 },
    { name: 'Ohlins FSK Front Fork Spring Kit', brand: 'Ohlins', category: 'Suspension', cost: 12000, sell: 15000 },
    { name: 'Yy Pang Racing Pipe V3', brand: 'Yy Pang', category: 'Exhaust', cost: 4500, sell: 6000 },
    { name: 'JVT Power Pipe V2', brand: 'JVT', category: 'Exhaust', cost: 3800, sell: 5000 },
    { name: 'RS8 Open Pipe EVO', brand: 'RS8', category: 'Exhaust', cost: 3500, sell: 4800 },
    { name: 'Daeng Sai 4 Racing Pipe', brand: 'Daeng', category: 'Exhaust', cost: 5500, sell: 7500 },
    { name: 'Namban Racing Exhaust', brand: 'Namban', category: 'Exhaust', cost: 4800, sell: 6500 },
    { name: 'Koso Throttle Body 32mm', brand: 'Koso', category: 'Engine Parts', cost: 3000, sell: 4200 },
    { name: 'Uma Racing Throttle Body 34mm', brand: 'Uma Racing', category: 'Engine Parts', cost: 3500, sell: 4800 },
    { name: 'Koso High Flow Fuel Injector 160cc', brand: 'Koso', category: 'Engine Parts', cost: 1800, sell: 2500 },
    { name: 'Uma Racing Fuel Injector 200cc', brand: 'Uma Racing', category: 'Engine Parts', cost: 2200, sell: 3000 },
    { name: 'Faito Forged Piston Kit 62mm', brand: 'Faito', category: 'Engine Parts', cost: 2800, sell: 3800 },
    { name: 'Uma Racing Forged Piston 65mm', brand: 'Uma Racing', category: 'Engine Parts', cost: 3200, sell: 4500 },
    { name: 'MTRT Racing Camshaft Stage 2', brand: 'MTRT', category: 'Engine Parts', cost: 1500, sell: 2200 },
    { name: 'JVT Racing Camshaft V3', brand: 'JVT', category: 'Engine Parts', cost: 1800, sell: 2500 },
    { name: 'SWR Racing Cam Profile 3', brand: 'SWR', category: 'Engine Parts', cost: 2000, sell: 2800 },
    { name: 'RCB SP522 Forged Mags 14"', brand: 'RCB', category: 'Wheels', cost: 5500, sell: 7500 },
    { name: 'RCB SP811 Mags 17"', brand: 'RCB', category: 'Wheels', cost: 4800, sell: 6500 },
    { name: 'Brembo 4-Piston Caliper (P4)', brand: 'Brembo', category: 'Brakes', cost: 12000, sell: 15000 },
    { name: 'Brembo 2-Piston Crab Caliper', brand: 'Brembo', category: 'Brakes', cost: 8000, sell: 10500 },
    { name: 'RCB S1 Radial Master Cylinder', brand: 'RCB', category: 'Brakes', cost: 4500, sell: 6000 },
    { name: 'Brembo RCS 15 Corsa Corta', brand: 'Brembo', category: 'Brakes', cost: 18000, sell: 22000 },
    { name: 'Nissin Samurai Brake Caliper', brand: 'Nissin', category: 'Brakes', cost: 4000, sell: 5500 },
    { name: 'Nui Racing Alloy Swing Arm', brand: 'Nui Racing', category: 'Chassis', cost: 3500, sell: 4800 },
    { name: 'QTT Racing Swing Arm', brand: 'QTT', category: 'Chassis', cost: 4200, sell: 5800 },
    { name: 'Koso DOHC Cylinder Head Kit', brand: 'Koso', category: 'Engine Parts', cost: 25000, sell: 32000 },
    { name: 'Uma Racing CVT Pulley Set', brand: 'Uma Racing', category: 'Transmission', cost: 3000, sell: 4200 },
    { name: 'JVT CVT Pulley Kit v2', brand: 'JVT', category: 'Transmission', cost: 2500, sell: 3500 },
    { name: 'MTRT Bell and Clutch Assembly', brand: 'MTRT', category: 'Transmission', cost: 3800, sell: 5000 },
    { name: 'KTech Razor R Rear Shock', brand: 'KTech', category: 'Suspension', cost: 22000, sell: 28000 },
    { name: 'Option 1 Rear Set Alloy', brand: 'Option 1', category: 'Chassis', cost: 2800, sell: 3800 },
    { name: 'TTGR Quick Shifter Kit', brand: 'TTGR', category: 'Electronics', cost: 6500, sell: 8500 },
    { name: 'Kitti Racing CDI Unit', brand: 'Kitti', category: 'Electronics', cost: 2500, sell: 3500 },
    { name: 'Uma Racing Oil Pump High Volume', brand: 'Uma Racing', category: 'Engine Parts', cost: 1200, sell: 1800 },
    { name: 'Koso Digital Speedometer LCD', brand: 'Koso', category: 'Electronics', cost: 5500, sell: 7500 },
    { name: 'JVT Tensioner Manual Alloy', brand: 'JVT', category: 'Engine Parts', cost: 800, sell: 1200 },
    { name: 'RS8 Torque Drive Assembly', brand: 'RS8', category: 'Transmission', cost: 2200, sell: 3000 }
];

async function seedData() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: 27827,
            ssl: { 
                ca: fs.readFileSync('./ca.pem'),
                rejectUnauthorized: true 
            }
        });

        console.log("Connected to database. Seeding products...");

        // Insert Bulk Products
        for (let p of bulkProducts) {
            const stock = Math.floor(Math.random() * 50) + 10; // Random stock 10-60
            await connection.execute(
                `INSERT INTO products (name, brand, category, cost_price, selling_price, stock, is_serialized) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [p.name, p.brand, p.category, p.cost, p.sell, stock, false]
            );
        }
        console.log(`✅ Added ${bulkProducts.length} Bulk Products`);

        // Insert Serialized Products
        for (let p of serializedProducts) {
            const [result] = await connection.execute(
                `INSERT INTO products (name, brand, category, cost_price, selling_price, stock, is_serialized) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [p.name, p.brand, p.category, p.cost, p.sell, 3, true]
            );
            
            const productId = result.insertId;
            
            // Add 3 fake serial numbers for each to give it initial stock
            for (let i = 1; i <= 3; i++) {
                const serial = `${p.brand.substring(0,3).toUpperCase()}-${Math.floor(Math.random() * 90000) + 10000}-${i}`;
                await connection.execute(
                    `INSERT INTO product_serials (product_id, serial_number, status) VALUES (?, ?, 'available')`,
                    [productId, serial]
                );
            }
        }
        console.log(`✅ Added ${serializedProducts.length} Serialized Products with 3 serials each`);

        await connection.end();
        console.log("Finished seeding!");
    } catch (err) {
        console.error("Error seeding data:", err);
    }
}

seedData();
