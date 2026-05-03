require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

function getRandomDate() {
    // Generate a random date within the last 12 months
    const now = new Date();
    const past = new Date();
    past.setMonth(now.getMonth() - 12);
    
    return new Date(past.getTime() + Math.random() * (now.getTime() - past.getTime()));
}

async function seedTransactions() {
    try {
        const pool = mysql.createPool({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: process.env.DB_PORT,
            ...(process.env.DB_HOST && process.env.DB_HOST.includes('aivencloud') 
                ? { ssl: { 
                    ca: require('fs').readFileSync(require('path').join(__dirname, 'ca.pem')),
                    rejectUnauthorized: true 
                } } 
                : {})
        });

        console.log("Checking user 'test'...");
        
        let [users] = await pool.query('SELECT id FROM users WHERE username = ?', ['test']);
        let userId;

        if (users.length === 0) {
            const hashedPassword = await bcrypt.hash('test123', 10);
            const [result] = await pool.query(
                'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
                ['test', hashedPassword, 'staff']
            );
            userId = result.insertId;
            console.log("Created new user 'test' with ID:", userId);
        } else {
            userId = users[0].id;
            console.log("Found existing user 'test' with ID:", userId);
        }

        console.log("Fetching active products...");
        const [products] = await pool.query('SELECT id, selling_price, stock FROM products WHERE is_active = true AND stock > 0');
        
        if (products.length === 0) {
            console.error("No active products with stock found. Cannot seed transactions.");
            process.exit(1);
        }

        console.log(`Found ${products.length} products. Seeding 100 transactions...`);

        for (let i = 0; i < 100; i++) {
            const numItems = Math.floor(Math.random() * 3) + 1; // 1 to 3 items per transaction
            let totalAmount = 0;
            const items = [];

            for (let j = 0; j < numItems; j++) {
                const product = products[Math.floor(Math.random() * products.length)];
                const qty = Math.floor(Math.random() * 2) + 1; // 1 or 2 qty
                
                const subtotal = product.selling_price * qty;
                totalAmount += subtotal;

                items.push({
                    product_id: product.id,
                    quantity: qty,
                    price: product.selling_price,
                    subtotal: subtotal
                });
            }

            const paymentMethod = 'Cash';
            const tendered = totalAmount + (Math.random() > 0.5 ? 100 : 0);
            const change = tendered - totalAmount;
            const saleDate = getRandomDate();

            // Insert Sale
            const [saleResult] = await pool.query(
                'INSERT INTO sales (user_id, total_amount, tendered_amount, change_due, payment_method, sale_date) VALUES (?, ?, ?, ?, ?, ?)',
                [userId, totalAmount, tendered, change, paymentMethod, saleDate]
            );
            const saleId = saleResult.insertId;

            // Insert Sale Items
            for (let item of items) {
                await pool.query(
                    'INSERT INTO sale_items (sale_id, product_id, quantity, price, subtotal) VALUES (?, ?, ?, ?, ?)',
                    [saleId, item.product_id, item.quantity, item.price, item.subtotal]
                );
                
                // We'll also loosely update the stock, though for mock data it might push stock negative.
                await pool.query('UPDATE products SET stock = stock - ? WHERE id = ?', [item.quantity, item.product_id]);
            }
        }

        console.log("✅ Successfully seeded 100 transactions across different months for user 'test'!");
        process.exit(0);

    } catch (error) {
        console.error("❌ Error seeding transactions:", error);
        process.exit(1);
    }
}

seedTransactions();
