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
const put = (path, body, headers = {}) => request('PUT', path, body, headers);
const patch = (path, body, headers = {}) => request('PATCH', path, body, headers);

async function runTests() {
    console.log('====================================================');
    console.log(' PHASE 2 AUTOMATED SPECIFICATION TEST SUITE');
    console.log('====================================================\n');

    let adminToken = '';
    let staffToken = '';

    // 1. Authenticate as Admin
    console.log('1. Testing Authentication & JWT Payload Structure...');
    const adminLoginRes = await post('/api/auth/login', {
        username: 'admin',
        password: 'admin123'
    });
    assert.strictEqual(adminLoginRes.status, 200);
    adminToken = adminLoginRes.data.token;
    assert.ok(adminToken, 'Admin token should exist');
    assert.ok(adminLoginRes.data.user.token_version !== undefined, 'User object should include token_version');

    // Decode token payload (base64)
    const payloadPart = adminToken.split('.')[1];
    const payload = JSON.parse(Buffer.from(payloadPart, 'base64').toString('utf8'));
    assert.strictEqual(payload.username, 'admin');
    assert.ok(payload.tokenVersion !== undefined, 'JWT payload MUST include tokenVersion');
    console.log('   ✓ Admin JWT issues valid token with tokenVersion:', payload.tokenVersion);

    // Authenticate as Staff
    const staffLoginRes = await post('/api/auth/login', {
        username: 'staff',
        password: 'staff123'
    });
    assert.strictEqual(staffLoginRes.status, 200);
    staffToken = staffLoginRes.data.token;
    console.log('   ✓ Staff authentication verified.\n');

    const adminHeaders = { Authorization: `Bearer ${adminToken}` };
    const staffHeaders = { Authorization: `Bearer ${staffToken}` };

    // 2. Supplier Management API
    console.log('2. Testing Supplier Management API (/api/suppliers)...');
    
    // GET /api/suppliers
    const suppliersRes = await get('/api/suppliers', staffHeaders);
    assert.strictEqual(suppliersRes.status, 200);
    assert.ok(Array.isArray(suppliersRes.data), 'Response should be an array');
    console.log(`   ✓ GET /api/suppliers returns ${suppliersRes.data.length} registered vendors.`);
    const existingYamaha = suppliersRes.data.find(s => s.name && s.name.includes('Yamaha'));
    assert.ok(existingYamaha, 'Yamaha Motor Philippines should be present');

    // POST /api/suppliers
    const uniqueSupplierName = `Test Supplier ${Date.now()}`;
    const createSuppRes = await post('/api/suppliers', {
        name: uniqueSupplierName,
        contact_person: 'Maria Santos',
        phone: '09171234567',
        email: 'maria@testvendor.ph',
        address: 'Calasiao, Pangasinan'
    }, adminHeaders);
    assert.strictEqual(createSuppRes.status, 201);
    const createdSupplier = createSuppRes.data.supplier;
    assert.strictEqual(createdSupplier.name, uniqueSupplierName);
    console.log(`   ✓ POST /api/suppliers creates vendor: "${uniqueSupplierName}" (ID: ${createdSupplier.id})`);

    // POST duplicate supplier should fail (422)
    const dupRes = await post('/api/suppliers', {
        name: uniqueSupplierName,
        contact_person: 'Duplicate Test'
    }, adminHeaders);
    assert.strictEqual(dupRes.status, 422, 'Duplicate supplier must return 422');
    console.log('   ✓ POST duplicate supplier rejected with HTTP 422.');

    // PUT /api/suppliers/:id
    const updatedName = `${uniqueSupplierName} Updated`;
    const updateSuppRes = await put(`/api/suppliers/${createdSupplier.id}`, {
        name: updatedName,
        contact_person: 'Maria Santos-Reyes',
        phone: '09187654321'
    }, adminHeaders);
    assert.strictEqual(updateSuppRes.status, 200);
    assert.strictEqual(updateSuppRes.data.supplier.name, updatedName);
    assert.strictEqual(updateSuppRes.data.supplier.contact_person, 'Maria Santos-Reyes');
    console.log('   ✓ PUT /api/suppliers/:id successfully updates supplier attributes.\n');

    // 3. Product Master API Integrity
    console.log('3. Testing Product Master API Integrity (/api/items)...');
    
    // POST /api/items must force current_stock = 0 and insert OPENING_BALANCE
    const uniqueSku = `TEST-SKU-${Date.now()}`;
    const createItemRes = await post('/api/items', {
        sku: uniqueSku,
        name: `Test Brake Cable ${Date.now()}`,
        brand: 'Yamaha Genuine Parts',
        category: 'Cables',
        retail_price: 250.00,
        cost_price: 180.00,
        current_stock: 999 // ATTEMPT TO TAMPER STOCK ON CREATION
    }, adminHeaders);
    assert.strictEqual(createItemRes.status, 201);
    const createdItem = createItemRes.data.item;
    assert.strictEqual(createdItem.current_stock, 0, 'current_stock must be forced to 0 regardless of input');
    console.log(`   ✓ POST /api/items forces current_stock = 0 (tampering with 999 was ignored). Item ID: ${createdItem.id}`);

    // Verify OPENING_BALANCE in ledger
    const ledgerRes = await get(`/api/inventory/items/${createdItem.id}/ledger`, adminHeaders);
    assert.strictEqual(ledgerRes.status, 200);
    const openingRow = ledgerRes.data.transactions.find(t => t.transaction_type === 'OPENING_BALANCE');
    assert.ok(openingRow, 'Initial OPENING_BALANCE ledger row must exist');
    assert.strictEqual(Number(openingRow.quantity_change), 0);
    assert.strictEqual(Number(openingRow.balance_after), 0);
    console.log('   ✓ Atomic OPENING_BALANCE ledger row verified in database.');

    // PUT /api/items/:id parameter whitelist strictly omitting current_stock
    const updateItemRes = await put(`/api/items/${createdItem.id}`, {
        name: 'Updated Brake Cable Name',
        retail_price: 280.00,
        current_stock: 500, // ATTEMPT TO TAMPER STOCK VIA EDIT
        stock: 500
    }, adminHeaders);
    assert.strictEqual(updateItemRes.status, 200);
    assert.strictEqual(updateItemRes.data.item.name, 'Updated Brake Cable Name');
    assert.strictEqual(Number(updateItemRes.data.item.retail_price), 280.00);

    // Re-fetch item to verify stock remains 0
    const refetchItemRes = await get(`/api/items/${createdItem.id}`, adminHeaders);
    assert.strictEqual(refetchItemRes.data.current_stock, 0, 'current_stock must remain 0 after PUT');
    console.log('   ✓ PUT /api/items/:id parameter whitelist strictly protects current_stock against tampering.\n');

    // 4. Staff Profile & Session Revocation
    console.log('4. Testing Staff Profile & Session Invalidation (/api/staff/profile)...');
    
    // Attempt update with wrong current password (must fail with 422)
    const wrongPwRes = await patch('/api/staff/profile', {
        current_password: 'wrong_password_here',
        new_password: 'staffNewPassword123'
    }, staffHeaders);
    assert.strictEqual(wrongPwRes.status, 422, 'Password mismatch must return 422');
    console.log('   ✓ PATCH /api/staff/profile rejects incorrect password with HTTP 422.');

    // Successful update with correct password
    const updateProfileRes = await patch('/api/staff/profile', {
        current_password: 'staff123',
        new_password: 'staffNewPassword123'
    }, staffHeaders);
    assert.strictEqual(updateProfileRes.status, 200);
    const newStaffToken = updateProfileRes.data.token;
    assert.ok(newStaffToken, 'Fresh token must be returned');
    console.log('   ✓ Password updated, token_version incremented, new token issued.');

    // Old staff token must now be rejected with 401
    const staleRes = await get('/api/suppliers', staffHeaders);
    assert.strictEqual(staleRes.status, 401, 'Stale token must return 401');
    console.log('   ✓ Prior session token immediately rejected by auth middleware (HTTP 401 Session Revoked).');

    // New token must work
    const newStaffHeaders = { Authorization: `Bearer ${newStaffToken}` };
    const validWithNewToken = await get('/api/suppliers', newStaffHeaders);
    assert.strictEqual(validWithNewToken.status, 200);
    console.log('   ✓ New token with incremented tokenVersion authenticates seamlessly.');

    // Revert staff password back to staff123 so standard credentials remain intact
    const revertRes = await patch('/api/staff/profile', {
        current_password: 'staffNewPassword123',
        new_password: 'staff123'
    }, newStaffHeaders);
    assert.strictEqual(revertRes.status, 200);
    console.log('   ✓ Staff credentials restored back to baseline (staff / staff123).\n');

    // 5. Parts Compatibility Engine
    console.log('5. Testing Parts Compatibility Engine (/api/compatibility)...');
    
    // GET /api/compatibility/options
    const optionsRes = await get('/api/compatibility/options', adminHeaders);
    assert.strictEqual(optionsRes.status, 200);
    assert.ok(Array.isArray(optionsRes.data), 'Options should be an array of brands');
    const yamahaBrand = optionsRes.data.find(b => b.brand.toLowerCase() === 'yamaha');
    assert.ok(yamahaBrand, 'Yamaha brand must exist in options hierarchy');
    assert.ok(yamahaBrand.models && yamahaBrand.models.length > 0, 'Models list must exist');
    console.log(`   ✓ GET /api/compatibility/options returned 3-tier tree with Brand: "${yamahaBrand.brand}".`);

    // Find Aerox 155 V1 & V3
    let v1Id = null;
    let v3Id = null;
    for (const m of yamahaBrand.models) {
        for (const v of m.versions) {
            if (v.version && v.version.includes('V1')) v1Id = v.id;
            if (v.version && v.version.includes('V3')) v3Id = v.id;
        }
    }
    assert.ok(v1Id, 'Yamaha Aerox 155 V1 model ID should exist');
    assert.ok(v3Id, 'Yamaha Aerox 155 V3 model ID should exist');

    // GET /api/compatibility/search for V1
    const v1SearchRes = await get(`/api/compatibility/search?modelId=${v1Id}`, adminHeaders);
    assert.strictEqual(v1SearchRes.status, 200);
    assert.ok(Array.isArray(v1SearchRes.data.compatible), 'compatible bucket must be an array');
    assert.ok(Array.isArray(v1SearchRes.data.notCompatible), 'notCompatible bucket must be an array');
    const v1BrakePad = v1SearchRes.data.compatible.find(i => i.sku === 'JLR-BP-AEROX');
    assert.ok(v1BrakePad, 'JLR-BP-AEROX must be in COMPATIBLE bucket for V1');
    assert.ok(v1BrakePad.current_stock !== undefined, 'Item must include current_stock');
    console.log('   ✓ V1 Search: JLR-BP-AEROX correctly classified as COMPATIBLE.');

    // GET /api/compatibility/search for V3
    const v3SearchRes = await get(`/api/compatibility/search?modelId=${v3Id}`, adminHeaders);
    assert.strictEqual(v3SearchRes.status, 200);
    const v3BrakePad = v3SearchRes.data.notCompatible.find(i => i.sku === 'JLR-BP-AEROX');
    assert.ok(v3BrakePad, 'JLR-BP-AEROX must be in NOT_COMPATIBLE bucket for V3');
    console.log(`   ✓ V3 Search: JLR-BP-AEROX correctly classified as NOT_COMPATIBLE ("${v3BrakePad.notes}").`);

    console.log('\n====================================================');
    console.log(' ALL PHASE 2 SPECIFICATIONS VERIFIED & PASSING! ');
    console.log('====================================================');
}

runTests().catch(err => {
    console.error('\n❌ Test failure:', err.message);
    process.exit(1);
});
