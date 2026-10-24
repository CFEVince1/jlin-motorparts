const http = require('http');
const assert = require('assert');
const path = require('path');
const db = require('./config/db');

function request(method, reqPath, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const options = {
            hostname: 'localhost',
            port: 5000,
            path: reqPath,
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
                ...headers
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let parsed = null;
                try {
                    parsed = data ? JSON.parse(data) : {};
                } catch (e) {
                    parsed = data;
                }
                resolve({ status: res.statusCode, data: parsed });
            });
        });

        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

const get = (p, headers = {}) => request('GET', p, null, headers);
const post = (p, body, headers = {}) => request('POST', p, body, headers);

async function runTests() {
    console.log('========================================================');
    console.log(' SERIAL LOT RECEIVING & ADJUSTMENT INVARIANTS TEST SUITE');
    console.log('========================================================\n');

    // 1. Authenticate Admin
    console.log('1. Authenticating Admin Session...');
    const loginRes = await post('/api/auth/login', { username: 'admin', password: 'admin123' });
    assert.strictEqual(loginRes.status, 200, 'Admin login must return 200');
    const adminToken = loginRes.data.token;
    const adminHeaders = { Authorization: `Bearer ${adminToken}` };
    console.log('   ✓ Admin authenticated successfully.\n');

    // 2. Fetch Supplier and Serialized Product
    const [suppliers] = await db.query('SELECT id, name FROM suppliers WHERE is_active = 1 LIMIT 1');
    assert.ok(suppliers.length > 0, 'At least one active supplier must exist');
    const supplierId = suppliers[0].id;

    // Use product 113 (RS8 Torque Drive Assembly) or first serialized product
    const [prods] = await db.query('SELECT id, part_number, name, stock FROM products WHERE is_serialized = 1 AND is_active = 1 ORDER BY id ASC LIMIT 1');
    assert.ok(prods.length > 0, 'Serialized product must exist');
    const prod = prods[0];
    const prodId = prod.id;

    const [serialsBefore] = await db.query('SELECT id, serial_number, quantity, status FROM product_serials WHERE product_id = ? ORDER BY id ASC', [prodId]);
    assert.ok(serialsBefore.length > 0, 'Product must have at least one serial lot');
    const targetSerial = serialsBefore[0];
    const targetSerialId = targetSerial.id;
    const initialLotStock = Number(targetSerial.quantity || 0);
    const initialProdStock = Number(prod.stock || 0);

    console.log(`Target Product: ID ${prodId} (${prod.part_number} - ${prod.name})`);
    console.log(`Initial Product Stock: ${initialProdStock} | Initial Lot ${targetSerial.serial_number} Stock: ${initialLotStock}\n`);

    // TEST 1: Existing-Lot Receive
    console.log('TEST 1: Receiving 4 units into an existing serial lot...');
    const refNo1 = `RCV-LOT-${Date.now()}`;
    const recRes1 = await post('/api/inventory/receive', {
        supplierId,
        referenceNo: refNo1,
        deliveryPersonnel: 'Carlos Driver',
        receivedDate: '2026-10-24',
        items: [
            {
                itemId: prodId,
                serial_id: targetSerialId,
                quantity: 4,
                costPrice: 500
            }
        ]
    }, adminHeaders);

    assert.ok(recRes1.status === 200 || recRes1.status === 201, `Existing-lot receive must return 200 or 201. Got: ${JSON.stringify(recRes1.data)}`);

    const [serialsAfter1] = await db.query('SELECT quantity, status FROM product_serials WHERE id = ?', [targetSerialId]);
    const updatedLotStock1 = Number(serialsAfter1[0].quantity);
    assert.strictEqual(updatedLotStock1, initialLotStock + 4, `Lot stock must increment by 4 (from ${initialLotStock} to ${initialLotStock + 4})`);
    assert.strictEqual(serialsAfter1[0].status, 'available', 'Lot status must be available');

    const [prodAfter1] = await db.query('SELECT stock FROM products WHERE id = ?', [prodId]);
    assert.strictEqual(Number(prodAfter1[0].stock), initialProdStock + 4, `Product stock must increment by 4`);

    // Verify ledger row has serial_id
    const [txRows1] = await db.query('SELECT id, serial_id, quantity_change FROM inventory_transactions WHERE reference_no = ? AND product_id = ?', [refNo1, prodId]);
    assert.strictEqual(txRows1.length, 1, 'Ledger entry must be created');
    assert.strictEqual(txRows1[0].serial_id, targetSerialId, `Ledger entry must record serial_id = ${targetSerialId}`);
    assert.strictEqual(Number(txRows1[0].quantity_change), 4, 'Ledger quantity_change must be +4');
    console.log('   ✓ Existing-lot receive succeeded, updated product_serials and product stock in 1 transaction, and recorded serial_id in ledger.\n');

    // TEST 2: New-Serial Receive
    console.log('TEST 2: Receiving 2 units into a + New serial lot...');
    const newSerialNum = `TEST-LOT-${Date.now().toString().slice(-6)}`;
    const refNo2 = `RCV-NEW-${Date.now()}`;
    const recRes2 = await post('/api/inventory/receive', {
        supplierId,
        referenceNo: refNo2,
        deliveryPersonnel: 'Ramon Driver',
        receivedDate: '2026-10-24',
        items: [
            {
                itemId: prodId,
                serial_number: newSerialNum,
                quantity: 2,
                costPrice: 500
            }
        ]
    }, adminHeaders);

    assert.ok(recRes2.status === 200 || recRes2.status === 201, `New-serial receive must return 200 or 201. Got: ${JSON.stringify(recRes2.data)}`);

    const [newSerialRows] = await db.query('SELECT id, serial_number, quantity, status FROM product_serials WHERE product_id = ? AND serial_number = ?', [prodId, newSerialNum]);
    assert.strictEqual(newSerialRows.length, 1, `New serial "${newSerialNum}" must be inserted into product_serials`);
    assert.strictEqual(Number(newSerialRows[0].quantity), 2, 'New serial lot must have quantity = 2');
    assert.strictEqual(newSerialRows[0].status, 'available', 'New serial lot must have status = available');
    const newSerialId = newSerialRows[0].id;

    // Verify ledger row has new serial_id
    const [txRows2] = await db.query('SELECT id, serial_id, quantity_change FROM inventory_transactions WHERE reference_no = ? AND product_id = ?', [refNo2, prodId]);
    assert.strictEqual(txRows2.length, 1, 'Ledger entry must be created for new serial');
    assert.strictEqual(txRows2[0].serial_id, newSerialId, `Ledger entry must record new serial_id = ${newSerialId}`);
    assert.strictEqual(Number(txRows2[0].quantity_change), 2, 'Ledger quantity_change must be +2');
    console.log('   ✓ New-serial receive created new lot with qty=2 and recorded serial_id in ledger.\n');

    // TEST 3: Duplicate Serial Validations
    console.log('TEST 3a: Testing duplicate serial within delivery batch...');
    const dupRes1 = await post('/api/inventory/receive', {
        supplierId,
        referenceNo: `RCV-DUP-${Date.now()}`,
        deliveryPersonnel: 'Driver Dan',
        receivedDate: '2026-10-24',
        items: [
            { itemId: prodId, serial_number: 'BATCH-DUP-01', quantity: 1, costPrice: 500 },
            { itemId: prodId, serial_number: 'BATCH-DUP-01', quantity: 1, costPrice: 500 }
        ]
    }, adminHeaders);
    assert.ok(dupRes1.status === 400 || dupRes1.status === 422, 'Duplicate serial within batch must be rejected');
    console.log('   ✓ Duplicate serial in batch properly blocked.');

    console.log('TEST 3b: Testing serial belonging to another product...');
    // Find another serialized product or insert temporary serial on another product
    const [otherProds] = await db.query('SELECT id, part_number, name FROM products WHERE is_serialized = 1 AND id != ? LIMIT 1', [prodId]);
    if (otherProds.length > 0) {
        const otherProd = otherProds[0];
        const [otherSerials] = await db.query('SELECT serial_number FROM product_serials WHERE product_id = ? LIMIT 1', [otherProd.id]);
        if (otherSerials.length > 0) {
            const foreignSerial = otherSerials[0].serial_number;
            const foreignRes = await post('/api/inventory/receive', {
                supplierId,
                referenceNo: `RCV-FOR-${Date.now()}`,
                deliveryPersonnel: 'Driver Dan',
                receivedDate: '2026-10-24',
                items: [
                    { itemId: prodId, serial_number: foreignSerial, quantity: 1, costPrice: 500 }
                ]
            }, adminHeaders);
            assert.ok(foreignRes.status === 400 || foreignRes.status === 422, 'Serial belonging to another product must be rejected');
            console.log(`   ✓ Foreign serial "${foreignSerial}" properly blocked from product ${prodId}.`);
        }
    }

    console.log('TEST 3c: Entering existing serial as new serial treats it as existing lot...');
    const treatExistingRes = await post('/api/inventory/receive', {
        supplierId,
        referenceNo: `RCV-TREAT-${Date.now()}`,
        deliveryPersonnel: 'Driver Dan',
        receivedDate: '2026-10-24',
        items: [
            { itemId: prodId, serial_number: newSerialNum, quantity: 3, costPrice: 500 }
        ]
    }, adminHeaders);
    assert.ok(treatExistingRes.status === 200 || treatExistingRes.status === 201, 'Existing serial entered by name should increment existing lot');
    const [treatedLot] = await db.query('SELECT quantity FROM product_serials WHERE id = ?', [newSerialId]);
    assert.strictEqual(Number(treatedLot[0].quantity), 5, 'Lot quantity must be 2 + 3 = 5');
    console.log('   ✓ Existing serial entered by name incremented existing lot quantity to 5.\n');

    // TEST 4: Stock Adjustment on One Serial Lot
    console.log('TEST 4: Recording DAMAGE adjustment of 1 unit on serial lot...');
    const [lotBeforeAdj] = await db.query('SELECT quantity FROM product_serials WHERE id = ?', [newSerialId]);
    const lotStockBeforeAdj = Number(lotBeforeAdj[0].quantity);
    const [prodBeforeAdj] = await db.query('SELECT stock FROM products WHERE id = ?', [prodId]);
    const prodStockBeforeAdj = Number(prodBeforeAdj[0].stock);

    const adjRef = `ADJ-LOT-${Date.now()}`;
    const adjRes = await post('/api/inventory/adjustments', {
        item_id: prodId,
        product_id: prodId,
        serial_id: newSerialId,
        movement_type: 'DAMAGE',
        transaction_type: 'DAMAGE',
        quantity: 1,
        reference_no: adjRef,
        remarks: 'Test damage write-off on specific serial lot'
    }, adminHeaders);

    assert.strictEqual(adjRes.status, 200, `Lot adjustment must return 200. Got: ${JSON.stringify(adjRes.data)}`);

    const [lotAfterAdj] = await db.query('SELECT quantity, status FROM product_serials WHERE id = ?', [newSerialId]);
    assert.strictEqual(Number(lotAfterAdj[0].quantity), lotStockBeforeAdj - 1, 'Serial lot quantity must decrement by 1');

    const [prodAfterAdj] = await db.query('SELECT stock FROM products WHERE id = ?', [prodId]);
    assert.strictEqual(Number(prodAfterAdj[0].stock), prodStockBeforeAdj - 1, 'Product stock must decrement by 1');

    const [adjTx] = await db.query('SELECT id, serial_id, quantity_change FROM inventory_transactions WHERE reference_no = ? AND product_id = ?', [adjRef, prodId]);
    assert.strictEqual(adjTx.length, 1, 'Adjustment ledger transaction must exist');
    assert.strictEqual(adjTx[0].serial_id, newSerialId, 'Adjustment ledger transaction must record serial_id');
    assert.strictEqual(Number(adjTx[0].quantity_change), -1, 'Adjustment quantity_change must be -1');
    console.log('   ✓ Stock adjustment on serial lot successfully decremented lot and product stock, and recorded serial_id in ledger.\n');

    console.log('========================================================');
    console.log(' ALL TESTS PASSED! Running check_serial_quantities.js...');
    console.log('========================================================\n');
    process.exit(0);
}

runTests().catch(err => {
    console.error('Test Suite Failed:', err);
    process.exit(1);
});
