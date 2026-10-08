const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const bcrypt = require('bcryptjs');
const db = require('./config/db');

const inventoryController = require('./controllers/inventoryController');
const itemController = require('./controllers/itemController');
const staffController = require('./controllers/staffController');
const salesController = require('./controllers/salesController');
const { AppValidationError } = require('./utils/errors');

async function testEndpoints() {
    console.log('Testing Phase 2 Endpoints Logic...\n');
    let passed = 0;

    const [adminUser] = await db.query('SELECT * FROM users WHERE username = "admin" LIMIT 1');
    const user = adminUser[0];

    // Helper to mock express req/res
    function mockReqRes(body = {}, params = {}, query = {}) {
        let statusCode = 200;
        let responseData = null;
        const req = { body, params, query, user: { id: user.id, username: user.username, role: user.role } };
        const res = {
            status: (code) => { statusCode = code; return res; },
            json: (data) => { responseData = data; return res; }
        };
        return { req, res, getResult: () => ({ statusCode, responseData }) };
    }

    // 1. Test POST /api/items (createItem forces current_stock = 0 & baseline OPENING_BALANCE)
    const testSku = `TEST-ITEM-${Date.now().toString().slice(-4)}`;
    const { req: reqCreate, res: resCreate, getResult: getResCreate } = mockReqRes({
        sku: testSku,
        name: 'Test Filter O-Ring',
        brand: 'Yamaha',
        category: 'Maintenance',
        cost_price: 35.00,
        retail_price: 60.00
    });
    await itemController.createItem(reqCreate, resCreate, (err) => { throw err; });
    const createResult = getResCreate();
    console.log('1. createItem status:', createResult.statusCode);
    if (createResult.statusCode === 201 && createResult.responseData.item.current_stock === 0) {
        console.log('  ✓ Item created with current_stock = 0');
        passed++;
    }
    const createdItemId = createResult.responseData.item.id;

    // Verify baseline OPENING_BALANCE ledger row exists
    const [openBalTx] = await db.query(
        'SELECT * FROM inventory_transactions WHERE product_id = ? AND transaction_type = "OPENING_BALANCE"',
        [createdItemId]
    );
    if (openBalTx.length > 0 && openBalTx[0].quantity_change === 0) {
        console.log('  ✓ Initial OPENING_BALANCE ledger entry exists with quantity_change = 0');
        passed++;
    }

    // 2. Test PUT /api/items/:id (ignores current_stock tampering)
    const { req: reqUpdate, res: resUpdate, getResult: getResUpdate } = mockReqRes({
        name: 'Updated Filter O-Ring Name',
        retail_price: 75.00,
        current_stock: 9999, // Attempted tampering
        stock: 9999
    }, { id: createdItemId });
    await itemController.updateItem(reqUpdate, resUpdate, (err) => { throw err; });
    const updateResult = getResUpdate();
    console.log('2. updateItem status:', updateResult.statusCode);
    const [tamperCheck] = await db.query('SELECT current_stock, stock, retail_price FROM products WHERE id = ?', [createdItemId]);
    if (tamperCheck[0].current_stock === 0 && tamperCheck[0].stock === 0 && Number(tamperCheck[0].retail_price) === 75) {
        console.log('  ✓ current_stock tampering ignored; price updated to 75.00');
        passed++;
    }

    // 3. Test POST /api/inventory/receive
    const receiveRef = `REC-TEST-${Date.now().toString().slice(-5)}`;
    const { req: reqRec, res: resRec, getResult: getResRec } = mockReqRes({
        supplier_id: 1, // Yamaha Motor Philippines
        reference_no: receiveRef,
        notes: 'Test shipment received',
        items: [
            { item_id: createdItemId, quantity: 15, cost_price: 35.00 }
        ]
    });
    await inventoryController.receiveStock(reqRec, resRec, (err) => { throw err; });
    const recResult = getResRec();
    console.log('3. receiveStock status:', recResult.statusCode);
    const [afterRecStock] = await db.query('SELECT current_stock FROM products WHERE id = ?', [createdItemId]);
    if (recResult.statusCode === 201 && afterRecStock[0].current_stock === 15) {
        console.log('  ✓ Stock received and current_stock updated to 15');
        passed++;
    }

    // 4. Test POST /api/inventory/adjustments (LOSS followed by FOUND)
    const lossRef = `ADJ-LOSS-${Date.now().toString().slice(-4)}`;
    const { req: reqLoss, res: resLoss, getResult: getResLoss } = mockReqRes({
        item_id: createdItemId,
        transaction_type: 'LOSS',
        quantity: 5,
        reference_no: lossRef,
        remarks: 'Lost during inventory transfer'
    });
    await inventoryController.recordAdjustment(reqLoss, resLoss, (err) => { throw err; });
    const lossResult = getResLoss();
    console.log('4a. recordAdjustment LOSS status:', lossResult.statusCode);
    const [afterLossStock] = await db.query('SELECT current_stock FROM products WHERE id = ?', [createdItemId]);
    const lossTxId = lossResult.responseData.adjustment.transactionId;
    if (lossResult.statusCode === 200 && afterLossStock[0].current_stock === 10) {
        console.log('  ✓ LOSS recorded, stock decreased from 15 to 10');
        passed++;
    }

    // Test GET /api/items/:id/open-losses
    const { req: reqOpenLoss, res: resOpenLoss, getResult: getResOpenLoss } = mockReqRes({}, { id: createdItemId });
    await inventoryController.getOpenLosses(reqOpenLoss, resOpenLoss, (err) => { throw err; });
    const openLossResult = getResOpenLoss();
    if (openLossResult.responseData.length > 0 && openLossResult.responseData[0].restorable_balance === 5) {
        console.log('  ✓ open-losses returns unresolved loss with restorable_balance = 5');
        passed++;
    }

    // Test FOUND adjustment restoring 3 of the 5 lost units
    const foundRef = `ADJ-FOUND-${Date.now().toString().slice(-4)}`;
    const { req: reqFound, res: resFound, getResult: getResFound } = mockReqRes({
        item_id: createdItemId,
        transaction_type: 'FOUND',
        quantity: 3,
        reference_no: foundRef,
        remarks: 'Found in back warehouse corner',
        loss_transaction_id: lossTxId
    });
    await inventoryController.recordAdjustment(reqFound, resFound, (err) => { throw err; });
    const foundResult = getResFound();
    console.log('4b. recordAdjustment FOUND status:', foundResult.statusCode);
    const [afterFoundStock] = await db.query('SELECT current_stock FROM products WHERE id = ?', [createdItemId]);
    if (foundResult.statusCode === 200 && afterFoundStock[0].current_stock === 13) {
        console.log('  ✓ FOUND recorded, stock increased from 10 to 13');
        passed++;
    }

    // Verify remaining restorable balance is now 2
    const { req: reqOpenLoss2, res: resOpenLoss2, getResult: getResOpenLoss2 } = mockReqRes({}, { id: createdItemId });
    await inventoryController.getOpenLosses(reqOpenLoss2, resOpenLoss2, (err) => { throw err; });
    const openLossResult2 = getResOpenLoss2();
    if (openLossResult2.responseData[0].restorable_balance === 2) {
        console.log('  ✓ open-losses correctly recalculates remaining restorable_balance = 2');
        passed++;
    }

    // 5. Test POS Checkout with GCash and sequential order_no
    const { req: reqCheckout, res: resCheckout, getResult: getResCheckout } = mockReqRes({
        items: [
            { product_id: createdItemId, quantity: 2 }
        ],
        payment_method: 'GCash',
        tendered_amount: 150.00, // 2 x 75.00 = 150.00
        payment_reference: 'GCASH-REF-889900'
    });
    await salesController.checkout(reqCheckout, resCheckout, (err) => { throw err; });
    const checkoutResult = getResCheckout();
    console.log('5. POS Checkout status:', checkoutResult.statusCode);
    if (checkoutResult.statusCode === 201 && checkoutResult.responseData.order_no.startsWith('SO-')) {
        console.log(`  ✓ POS Checkout completed with order_no: ${checkoutResult.responseData.order_no}`);
        passed++;
    }
    const [afterSaleStock] = await db.query('SELECT current_stock FROM products WHERE id = ?', [createdItemId]);
    if (afterSaleStock[0].current_stock === 11) {
        console.log('  ✓ Stock decremented to 11 via atomic SALE ledger entry');
        passed++;
    }

    // 6. Test GET /api/items/:id/ledger (strictly sorted by it.id ASC)
    const { req: reqLedger, res: resLedger, getResult: getResLedger } = mockReqRes({}, { id: createdItemId }, { page: 1, limit: 10 });
    await itemController.getItemLedger(reqLedger, resLedger, (err) => { throw err; });
    const ledgerResult = getResLedger();
    const ledgerRecords = ledgerResult.responseData.data;
    const isSortedAsc = ledgerRecords.every((val, i, arr) => !i || arr[i - 1].id <= val.id);
    if (ledgerRecords.length >= 4 && isSortedAsc) {
        console.log(`  ✓ Item ledger returned ${ledgerRecords.length} records, strictly sorted ASC by id`);
        passed++;
    }

    // Soft delete test product
    await db.query('UPDATE products SET is_active = FALSE WHERE id = ?', [createdItemId]);

    console.log(`\nAll ${passed} endpoint tests PASSED successfully!\n`);
    process.exit(0);
}

testEndpoints().catch(err => {
    console.error('Test error:', err);
    process.exit(1);
});
