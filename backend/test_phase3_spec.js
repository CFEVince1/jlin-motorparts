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

async function runPhase3Tests() {
    console.log('====================================================');
    console.log(' PHASE 3 AUTOMATED SPECIFICATION TEST SUITE');
    console.log('====================================================\n');

    // 1. Authenticate as Admin
    console.log('1. Authenticating Admin Session...');
    const loginRes = await post('/api/auth/login', { username: 'admin', password: 'admin123' });
    assert.strictEqual(loginRes.status, 200);
    const adminToken = loginRes.data.token;
    const adminHeaders = { Authorization: `Bearer ${adminToken}` };
    console.log('   ✓ Admin authenticated.\n');

    // 2. Fetch Supplier & Seed Items
    console.log('2. Fetching Supplier & Demo Item (JLR-BP-AEROX)...');
    const suppRes = await get('/api/suppliers', adminHeaders);
    assert.strictEqual(suppRes.status, 200);
    const supplier = suppRes.data.find(s => s.name.includes('Yamaha')) || suppRes.data[0];
    assert.ok(supplier, 'Supplier must exist');

    const itemsRes = await get('/api/items', adminHeaders);
    assert.strictEqual(itemsRes.status, 200);
    const brakePad = itemsRes.data.find(i => i.sku === 'JLR-BP-AEROX');
    const oilFilter = itemsRes.data.find(i => i.sku === 'JLR-OF-AEROX');
    assert.ok(brakePad, 'JLR-BP-AEROX must exist');
    assert.ok(oilFilter, 'JLR-OF-AEROX must exist');
    console.log(`   ✓ Supplier: ${supplier.name} (ID: ${supplier.id})`);
    console.log(`   ✓ Item 1: ${brakePad.name} (ID: ${brakePad.id}, Current Stock: ${brakePad.current_stock})`);
    console.log(`   ✓ Item 2: ${oilFilter.name} (ID: ${oilFilter.id}, Current Stock: ${oilFilter.current_stock})\n`);

    // 3. Multi-Item Stock Receiving (POST /api/inventory/receive)
    console.log('3. Testing Multi-Item Stock Receiving (POST /api/inventory/receive)...');
    const testRefNo = `TEST-REC-${Date.now()}`;
    const receivePayload = {
        supplierId: supplier.id,
        referenceNo: testRefNo,
        notes: 'Testing multi-item stock receiving',
        items: [
            { itemId: oilFilter.id, quantity: 15, costPrice: 120.00 },
            { itemId: brakePad.id, quantity: 10, costPrice: 200.00 } // Unsorted, should sort internally to prevent deadlock
        ]
    };
    const recRes = await post('/api/inventory/receive', receivePayload, adminHeaders);
    assert.strictEqual(recRes.status, 201);
    console.log(`   ✓ Stock received successfully with Ref: ${testRefNo}`);
    assert.strictEqual(recRes.data.receiving_record.items.length, 2);

    // Verify stock updated on both items
    const refetchedBrake = await get(`/api/items/${brakePad.id}`, adminHeaders);
    const refetchedOil = await get(`/api/items/${oilFilter.id}`, adminHeaders);
    assert.strictEqual(refetchedBrake.data.current_stock, brakePad.current_stock + 10);
    assert.strictEqual(refetchedOil.data.current_stock, oilFilter.current_stock + 15);
    console.log(`   ✓ Stock updated atomically: Brake Pad = ${refetchedBrake.data.current_stock}, Oil Filter = ${refetchedOil.data.current_stock}`);

    // Duplicate receiving reference should be rejected (422)
    const dupRecRes = await post('/api/inventory/receive', receivePayload, adminHeaders);
    assert.strictEqual(dupRecRes.status, 422, 'Duplicate receiving reference must return 422');
    console.log('   ✓ Duplicate receiving reference rejected with HTTP 422.\n');

    // 4. Stock Adjustments: DAMAGE, LOSS, RETURN_TO_SUPPLIER
    console.log('4. Testing Adjustments (DAMAGE, LOSS, RETURN_TO_SUPPLIER)...');
    
    // DAMAGE (-1)
    const damageRef = `TEST-DMG-${Date.now()}`;
    const dmgRes = await post('/api/inventory/adjustments', {
        itemId: brakePad.id,
        transactionType: 'DAMAGE',
        quantity: 1,
        referenceNo: damageRef,
        remarks: 'Friction pad chipped during unpacking'
    }, adminHeaders);
    assert.ok(dmgRes.status === 200 || dmgRes.status === 201);
    console.log(`   ✓ Recorded DAMAGE (-1). Ref: ${damageRef}`);

    // RETURN_TO_SUPPLIER (-1)
    const rtsRef = `TEST-RTS-${Date.now()}`;
    const rtsRes = await post('/api/inventory/adjustments', {
        itemId: brakePad.id,
        transactionType: 'RETURN_TO_SUPPLIER',
        quantity: 1,
        referenceNo: rtsRef,
        remarks: 'Returning damaged unit to Yamaha'
    }, adminHeaders);
    assert.ok(rtsRes.status === 200 || rtsRes.status === 201);
    console.log(`   ✓ Recorded RETURN_TO_SUPPLIER (-1). Ref: ${rtsRef}`);

    // LOSS (-2)
    const lossRef = `TEST-LOSS-${Date.now()}`;
    const lossRes = await post('/api/inventory/adjustments', {
        itemId: brakePad.id,
        transactionType: 'LOSS',
        quantity: 2,
        referenceNo: lossRef,
        remarks: 'Discrepancy identified during physical cycle count'
    }, adminHeaders);
    assert.ok(lossRes.status === 200 || lossRes.status === 201);
    const lossTxId = lossRes.data.transaction.transactionId || lossRes.data.transaction.id;
    console.log(`   ✓ Recorded LOSS (-2). Loss TX ID: ${lossTxId}, Ref: ${lossRef}\n`);

    // 5. Open Losses Endpoint (GET /api/items/:id/open-losses)
    console.log('5. Testing Open Losses Endpoint (GET /api/items/:id/open-losses)...');
    const openLossRes = await get(`/api/items/${brakePad.id}/open-losses`, adminHeaders);
    assert.strictEqual(openLossRes.status, 200);
    assert.ok(Array.isArray(openLossRes.data), 'Open losses should return an array');
    const targetLoss = openLossRes.data.find(l => l.id === lossTxId);
    assert.ok(targetLoss, 'Recorded LOSS transaction must appear in open-losses');
    assert.strictEqual(Number(targetLoss.reported_lost), 2);
    assert.strictEqual(Number(targetLoss.already_restored), 0);
    assert.strictEqual(Number(targetLoss.restorable_balance), 2);
    console.log(`   ✓ Open Loss detected: ID ${targetLoss.id}, Reported: 2, Restorable Balance: 2\n`);

    // 6. Loss Restoration via FOUND (POST /api/inventory/adjustments)
    console.log('6. Testing Loss Restoration (FOUND adjustment)...');
    
    // Attempting to restore MORE than reported loss must fail (422)
    const overRestoreRes = await post('/api/inventory/adjustments', {
        itemId: brakePad.id,
        transactionType: 'FOUND',
        quantity: 5, // Exceeds restorable balance of 2
        referenceNo: `TEST-FD-FAIL-${Date.now()}`,
        remarks: 'Invalid over-restoration attempt',
        lossTransactionId: lossTxId
    }, adminHeaders);
    assert.strictEqual(overRestoreRes.status, 422, 'Over-restoration must return 422');
    console.log('   ✓ Over-restoration quantity rejected with HTTP 422.');

    // Partial restoration (+1)
    const foundRef1 = `TEST-FD1-${Date.now()}`;
    const foundRes1 = await post('/api/inventory/adjustments', {
        itemId: brakePad.id,
        transactionType: 'FOUND',
        quantity: 1,
        referenceNo: foundRef1,
        remarks: 'Found 1 unit behind shelf rack B',
        lossTransactionId: lossTxId
    }, adminHeaders);
    assert.ok(foundRes1.status === 200 || foundRes1.status === 201);
    console.log(`   ✓ Partial FOUND (+1) restored against Loss ID: ${lossTxId}. Ref: ${foundRef1}`);

    // Check remaining restorable balance (should now be 1)
    const checkLossRes = await get(`/api/items/${brakePad.id}/open-losses`, adminHeaders);
    const updatedLoss = checkLossRes.data.find(l => l.id === lossTxId);
    assert.ok(updatedLoss, 'Loss record still has remaining balance');
    assert.strictEqual(Number(updatedLoss.restorable_balance), 1);
    console.log(`   ✓ Remaining restorable balance accurately decremented to: ${updatedLoss.restorable_balance}`);

    // Restore final unit (+1)
    const foundRef2 = `TEST-FD2-${Date.now()}`;
    const foundRes2 = await post('/api/inventory/adjustments', {
        itemId: brakePad.id,
        transactionType: 'FOUND',
        quantity: 1,
        referenceNo: foundRef2,
        remarks: 'Found remaining 1 unit misplaced in storage bin C',
        lossTransactionId: lossTxId
    }, adminHeaders);
    assert.ok(foundRes2.status === 200 || foundRes2.status === 201);
    console.log(`   ✓ Final FOUND (+1) restored against Loss ID: ${lossTxId}.`);

    // Verify loss record is now fully resolved and disappears from open-losses
    const finalLossRes = await get(`/api/items/${brakePad.id}/open-losses`, adminHeaders);
    const resolvedLoss = finalLossRes.data.find(l => l.id === lossTxId);
    assert.strictEqual(resolvedLoss, undefined, 'Fully restored loss should no longer appear in open-losses');
    console.log('   ✓ Fully restored LOSS record cleanly removed from active open-losses picker.\n');

    // 7. Audit Ledger (GET /api/items/:id/ledger)
    console.log('7. Testing Audit Ledger (GET /api/items/:id/ledger)...');
    const ledgerRes = await get(`/api/items/${brakePad.id}/ledger?limit=50`, adminHeaders);
    assert.strictEqual(ledgerRes.status, 200);
    const records = ledgerRes.data.data;
    assert.ok(Array.isArray(records), 'Ledger data should be an array');
    assert.ok(records.length >= 6, 'Should contain all recorded movements');

    // Verify strict ID ordering (it.id ASC)
    for (let i = 1; i < records.length; i++) {
        assert.ok(records[i].id > records[i - 1].id, 'Ledger records must be strictly ordered by it.id ASC');
    }
    console.log(`   ✓ Audit Ledger verified: ${records.length} entries strictly sorted by it.id ASC.`);
    console.log(`     Last 3 movements: ${records.slice(-3).map(r => `${r.transaction_type} (${r.quantity_change > 0 ? '+' : ''}${r.quantity_change}) -> Balance: ${r.balance_after}`).join(' | ')}\n`);

    // 8. Adjustments Reporting (GET /api/reports/adjustments)
    console.log('8. Testing Adjustments Report (GET /api/reports/adjustments)...');
    const today = new Date().toISOString().split('T')[0];
    const reportRes = await get(`/api/reports/adjustments?from=${today}&to=${today}`, adminHeaders);
    assert.strictEqual(reportRes.status, 200);
    assert.ok(reportRes.data.adjustments.length > 0, 'Adjustments list should not be empty');
    assert.ok(Array.isArray(reportRes.data.grouped_totals), 'grouped_totals should be an array');
    assert.ok(reportRes.data.summary.total_adjustments > 0, 'Summary total adjustments > 0');
    console.log(`   ✓ Adjustments Report verified:`);
    console.log(`     - Total Adjustments: ${reportRes.data.summary.total_adjustments}`);
    console.log(`     - Total Units: ${reportRes.data.summary.total_units}`);
    console.log(`     - Total Cost Value: ₱${reportRes.data.summary.total_value.toLocaleString()}`);
    console.log(`     - Grouped Categories: ${reportRes.data.grouped_totals.map(g => `${g.transaction_type}: ${g.count} items`).join(', ')}`);

    console.log('\n====================================================');
    console.log(' ALL PHASE 3 SPECIFICATIONS VERIFIED & PASSING! ');
    console.log('====================================================');
}

runPhase3Tests().catch(err => {
    console.error('\n❌ Phase 3 Test failure:', err.message);
    process.exit(1);
});
