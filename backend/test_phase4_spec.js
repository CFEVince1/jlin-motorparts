const http = require('http');
const assert = require('assert');

function request(method, path, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const options = {
            hostname: 'localhost',
            port: 5000,
            path,
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

const get = (path, headers = {}) => request('GET', path, null, headers);
const post = (path, body, headers = {}) => request('POST', path, body, headers);

async function runPhase4Tests() {
    console.log('====================================================');
    console.log(' PHASE 4 AUTOMATED POS & RECEIPT SPECIFICATION TEST');
    console.log('====================================================\n');

    // 1. Authenticate Admin & Staff
    console.log('1. Authenticating Admin Session...');
    const loginRes = await post('/api/auth/login', { username: 'admin', password: 'admin123' });
    assert.strictEqual(loginRes.status, 200);
    const adminToken = loginRes.data.token;
    const adminHeaders = { Authorization: `Bearer ${adminToken}` };
    console.log('   ✓ Admin authenticated.\n');

    // 2. Fetch demo items
    console.log('2. Fetching demo items for POS checkout...');
    const itemsRes = await get('/api/items', adminHeaders);
    assert.strictEqual(itemsRes.status, 200);
    const brakePad = itemsRes.data.find(i => i.sku === 'JLR-BP-AEROX');
    assert.ok(brakePad, 'JLR-BP-AEROX must exist');

    // Stock up item so we have enough inventory
    const recRef = `REC-POS-${Date.now()}`;
    await post('/api/inventory/receive', {
        supplierId: 1,
        referenceNo: recRef,
        items: [{ itemId: brakePad.id, quantity: 20, costPrice: 200.00 }]
    }, adminHeaders);

    const refetchedItem = await get(`/api/items/${brakePad.id}`, adminHeaders);
    const initialStock = refetchedItem.data.current_stock;
    const unitPrice = refetchedItem.data.retail_price;
    console.log(`   ✓ Item: ${brakePad.name} | Price: ₱${unitPrice} | Stock: ${initialStock}\n`);

    // 3. Test CASH Payment Invariants
    console.log('3. Testing CASH Payment Invariants...');
    const orderQty = 2;
    const expectedTotal = unitPrice * orderQty;

    // Fail: Insufficient cash tendered
    const failCashRes = await post('/api/sales/checkout', {
        paymentMethod: 'Cash',
        tenderedAmount: expectedTotal - 50, // Less than total
        items: [{ productId: brakePad.id, quantity: orderQty }]
    }, adminHeaders);
    assert.strictEqual(failCashRes.status, 422, 'Insufficient cash must return 422');
    console.log('   ✓ Insufficient cash rejected with HTTP 422.');

    // Pass: Valid cash checkout with change calculation in integer centavos
    const cashTendered = expectedTotal + 100;
    const passCashRes = await post('/api/sales/checkout', {
        paymentMethod: 'Cash',
        tenderedAmount: cashTendered,
        customer_name: 'Juan Dela Cruz',
        items: [{ productId: brakePad.id, quantity: orderQty }]
    }, adminHeaders);
    assert.strictEqual(passCashRes.status, 201);
    const cashOrder = passCashRes.data.order;
    assert.strictEqual(Number(cashOrder.total_amount), expectedTotal);
    assert.strictEqual(Number(cashOrder.tendered_amount), cashTendered);
    assert.strictEqual(Number(cashOrder.change_due), 100);
    assert.ok(cashOrder.order_number.startsWith('SO-'), `Order number must follow SO-YYYY-NNNN format: ${cashOrder.order_number}`);
    console.log(`   ✓ CASH Checkout success: Order ${cashOrder.order_number} | Total: ₱${expectedTotal} | Change: ₱100\n`);

    // 4. Test GCASH Payment Invariants
    console.log('4. Testing GCASH Payment Invariants...');
    
    // Fail: Missing or short reference number (< 6 chars)
    const failGcashRef = await post('/api/sales/checkout', {
        paymentMethod: 'GCash',
        paymentReference: '12345', // Only 5 characters
        items: [{ productId: brakePad.id, quantity: 1 }]
    }, adminHeaders);
    assert.strictEqual(failGcashRef.status, 422, 'GCash reference < 6 chars must return 422');
    console.log('   ✓ GCash reference < 6 characters rejected with HTTP 422.');

    // Pass: Valid GCash checkout
    const validGcashRef = '102938472910';
    const passGcashRes = await post('/api/sales/checkout', {
        paymentMethod: 'GCash',
        paymentReference: validGcashRef,
        customer_name: 'Maria Clara',
        items: [{ productId: brakePad.id, quantity: 1 }]
    }, adminHeaders);
    assert.strictEqual(passGcashRes.status, 201);
    const gcashOrder = passGcashRes.data.order;
    assert.strictEqual(Number(gcashOrder.total_amount), Number(unitPrice));
    assert.strictEqual(Number(gcashOrder.tendered_amount), Number(unitPrice), 'GCash tendered amount must equal exact total');
    assert.strictEqual(Number(gcashOrder.change_due), 0, 'GCash change must be 0.00');
    assert.strictEqual(gcashOrder.payment_reference, validGcashRef);
    assert.ok(gcashOrder.order_number.startsWith('SO-'));
    console.log(`   ✓ GCASH Checkout success: Order ${gcashOrder.order_number} | Ref: ${gcashOrder.payment_reference} | Change: ₱0.00\n`);

    // 5. Verify Ledger Deductions & Stock Balance
    console.log('5. Verifying Inventory Ledger & Deductions...');
    const postSaleItem = await get(`/api/items/${brakePad.id}`, adminHeaders);
    const expectedStock = initialStock - (orderQty + 1);
    assert.strictEqual(postSaleItem.data.current_stock, expectedStock, `Stock must drop from ${initialStock} to ${expectedStock}`);

    const ledgerRes = await get(`/api/items/${brakePad.id}/ledger?limit=10`, adminHeaders);
    const salesTx = ledgerRes.data.data.filter(t => t.transaction_type === 'SALE');
    assert.ok(salesTx.length >= 2, 'Ledger should record both SALE movements');
    const latestSale = salesTx[salesTx.length - 1];
    assert.strictEqual(latestSale.reference_no, gcashOrder.order_number);
    assert.strictEqual(Number(latestSale.quantity_change), -1);
    console.log(`   ✓ Inventory ledger properly recorded SALE row with reference: ${latestSale.reference_no}.\n`);

    console.log('====================================================');
    console.log(' ALL PHASE 4 SPECIFICATIONS VERIFIED & PASSING! ');
    console.log('====================================================');
}

runPhase4Tests().catch(err => {
    console.error('\n❌ Phase 4 Test failure:', err.message);
    process.exit(1);
});
