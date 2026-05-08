require('dotenv').config();
const db = require('./config/db');

async function testSale() {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Check if user 1 exists
        const [users] = await connection.query('SELECT id FROM users LIMIT 1');
        if (!users.length) throw new Error("No users found");
        const user_id = users[0].id;

        // 2. Check variants
        const [variants] = await connection.query('SELECT id, stock, price FROM product_variants WHERE stock > 0 LIMIT 1');
        if (!variants.length) throw new Error("No variants found");
        const variant = variants[0];

        // 3. Test insert
        const [saleResult] = await connection.query(
            'INSERT INTO sales (user_id, total_amount, payment_method) VALUES (?, ?, ?)',
            [user_id, variant.price, 'Cash']
        );

        console.log("Insert successful", saleResult.insertId);

        await connection.query(
            'INSERT INTO sales_items (sale_id, variant_id, quantity, price, subtotal) VALUES (?, ?, ?, ?, ?)',
            [saleResult.insertId, variant.id, 1, variant.price, variant.price]
        );

        console.log("Sales items insert successful");

        await connection.rollback();
        console.log("Rolled back");
        process.exit(0);

    } catch (err) {
        console.error("Test failed with error:", err.message);
        process.exit(1);
    } finally {
        connection.release();
    }
}

testSale();
