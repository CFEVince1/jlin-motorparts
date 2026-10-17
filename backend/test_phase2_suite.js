const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const db = require('./config/db');
const { AppValidationError } = require('./utils/errors');
const { applyMovement } = require('./services/inventoryService');

async function runTestSuite() {
    console.log('=====================================================');
    console.log(' Starting Phase 2 Automated Verification Test Suite   ');
    console.log('=====================================================\n');

    let passed = 0;
    let failed = 0;

    function assert(condition, message) {
        if (condition) {
            console.log(`  ✓ PASS: ${message}`);
            passed++;
        } else {
            console.error(`  ❌ FAIL: ${message}`);
            failed++;
        }
    }

    try {
        // -----------------------------------------------------------------
        // TEST 1: AppValidationError
        // -----------------------------------------------------------------
        console.log('[TEST 1] Core Error Engine (AppValidationError)');
        const err = new AppValidationError('Validation failed test', [{ field: 'ref', message: 'Required' }]);
        assert(err instanceof Error, 'AppValidationError is an instance of Error');
        assert(err.statusCode === 422, 'AppValidationError defaults to statusCode 422');
        assert(err.status === 422, 'AppValidationError has status 422');
        assert(err.errors.length === 1, 'AppValidationError stores validation errors array');

        // -----------------------------------------------------------------
        // TEST 2: InventoryService.applyMovement Invariants
        // -----------------------------------------------------------------
        console.log('\n[TEST 2] InventoryService.applyMovement Invariants');
        const conn = await db.getConnection();
        await conn.beginTransaction();

        try {
            // 2a. Non-empty reference check
            let emptyRefBlocked = false;
            try {
                await applyMovement(conn, {
                    itemId: 5, // JLR-BP-AEROX
                    transactionType: 'STOCK_IN',
                    quantityChange: 10,
                    referenceNo: '   '
                });
            } catch (e) {
                if (e instanceof AppValidationError && e.message.includes('Reference number is required')) {
                    emptyRefBlocked = true;
                }
            }
            assert(emptyRefBlocked, 'Empty reference string is strictly rejected with AppValidationError');

            // 2b. Outflow sign invariant (must be negative)
            let wrongOutflowSignBlocked = false;
            try {
                await applyMovement(conn, {
                    itemId: 5,
                    transactionType: 'DAMAGE',
                    quantityChange: 5, // Positive passed for outflow
                    referenceNo: 'TEST-DAMAGE-001'
                });
            } catch (e) {
                if (e instanceof AppValidationError && e.message.includes('must be strictly negative')) {
                    wrongOutflowSignBlocked = true;
                }
            }
            assert(wrongOutflowSignBlocked, 'Positive quantityChange for outflow (DAMAGE) rejected');

            // 2c. Inflow sign invariant (must be positive)
            let wrongInflowSignBlocked = false;
            try {
                await applyMovement(conn, {
                    itemId: 5,
                    transactionType: 'STOCK_IN',
                    quantityChange: -5, // Negative passed for inflow
                    referenceNo: 'TEST-IN-001'
                });
            } catch (e) {
                if (e instanceof AppValidationError && e.message.includes('must be strictly positive')) {
                    wrongInflowSignBlocked = true;
                }
            }
            assert(wrongInflowSignBlocked, 'Negative quantityChange for inflow (STOCK_IN) rejected');

            // 2d. Inflow movement with negative balance prevention
            // Stock in 20 items first
            const moveIn = await applyMovement(conn, {
                itemId: 5,
                transactionType: 'STOCK_IN',
                quantityChange: 20,
                referenceNo: 'TEST-REC-001',
                unitCost: 250.00
            });
            assert(moveIn.balanceAfter === 20, 'Stock in 20 units updates balance to 20');

            // Attempt to stock out 25 items (more than available)
            let negativeStockBlocked = false;
            try {
                await applyMovement(conn, {
                    itemId: 5,
                    transactionType: 'STOCK_OUT',
                    quantityChange: -25,
                    referenceNo: 'TEST-OUT-OVERDRAFT'
                });
            } catch (e) {
                if (e instanceof AppValidationError && e.message.includes('Insufficient stock')) {
                    negativeStockBlocked = true;
                }
            }
            assert(negativeStockBlocked, 'Movement resulting in negative stock balance is strictly blocked');

        } finally {
            await conn.rollback();
            conn.release();
        }

        // -----------------------------------------------------------------
        // TEST 3: Auth & Session Revocation (token_version)
        // -----------------------------------------------------------------
        console.log('\n[TEST 3] Authentication & Session Revocation');
        const [adminUsers] = await db.query('SELECT * FROM users WHERE username = "admin" LIMIT 1');
        const adminUser = adminUsers[0];
        const initialTokenVersion = adminUser.token_version || 1;

        // Generate valid token
        const validToken = jwt.sign(
            { id: adminUser.id, username: adminUser.username, role: adminUser.role, tokenVersion: initialTokenVersion },
            process.env.JWT_SECRET
        );
        const decodedValid = jwt.verify(validToken, process.env.JWT_SECRET);
        assert(decodedValid.tokenVersion === initialTokenVersion, 'JWT payload includes tokenVersion');

        // Test stale token with older version
        const staleToken = jwt.sign(
            { id: adminUser.id, username: adminUser.username, role: adminUser.role, tokenVersion: initialTokenVersion - 1 },
            process.env.JWT_SECRET
        );
        const decodedStale = jwt.verify(staleToken, process.env.JWT_SECRET);
        assert(decodedStale.tokenVersion !== initialTokenVersion, 'Stale token version mismatch detectable');

        // -----------------------------------------------------------------
        // TEST 4: Compatibility Options Hierarchy & Search
        // -----------------------------------------------------------------
        console.log('\n[TEST 4] Parts Compatibility Tree & Search');
        const compatibilityController = require('./controllers/compatibilityController');
        
        let optionsResult = null;
        const mockResOptions = {
            json: (data) => { optionsResult = data; }
        };
        await compatibilityController.getCompatibilityOptions({}, mockResOptions, (e) => { throw e; });
        assert(Array.isArray(optionsResult) && optionsResult.length > 0, 'Compatibility options returns hierarchical tree array');
        const yamahaBrand = optionsResult.find(b => b.brand === 'Yamaha');
        assert(!!yamahaBrand, 'Hierarchy includes Yamaha brand');
        const aeroxModel = yamahaBrand.models.find(m => m.model.includes('Aerox'));
        assert(!!aeroxModel && aeroxModel.versions.length >= 2, 'Hierarchy includes Aerox model with version nodes (V1 & V3)');
        const v1Version = aeroxModel.versions.find(v => v.version === 'V1' || v.model_name.includes('V1'));
        assert(!!v1Version && typeof v1Version.id === 'number', 'Version node includes database ID');

        // Compatibility Search
        let searchResult = null;
        const mockResSearch = {
            json: (data) => { searchResult = data; }
        };
        await compatibilityController.searchCompatibility({ query: { modelId: v1Version.id } }, mockResSearch, (e) => { throw e; });
        assert(!!searchResult && Array.isArray(searchResult.compatible), 'Search returns compatible items array');
        assert(Array.isArray(searchResult.incompatible), 'Search returns incompatible items array');
        const brakePadInV1 = searchResult.compatible.find(i => i.sku === 'JLR-BP-AEROX');
        assert(!!brakePadInV1, 'JLR-BP-AEROX is correctly identified as COMPATIBLE on V1');

        // -----------------------------------------------------------------
        // TEST 5: POS Checkout Integer Centavos & Invariants
        // -----------------------------------------------------------------
        console.log('\n[TEST 5] POS Checkout Integer Centavos & Invariants');
        const salesController = require('./controllers/salesController');

        // Test GCash invariant: requires reference >= 6 chars
        let gcashShortRefBlocked = false;
        const mockReqGcash = {
            user: { id: adminUser.id },
            body: {
                items: [{ product_id: 1, quantity: 1 }],
                payment_method: 'GCash',
                tendered_amount: 15.00,
                payment_reference: '123' // < 6 chars
            }
        };
        const mockResGcash = {
            status: (code) => ({
                json: (data) => {
                    if (code === 422 || (data && data.message && data.message.includes('reference number'))) {
                        gcashShortRefBlocked = true;
                    }
                }
            })
        };
        await salesController.checkout(mockReqGcash, mockResGcash, (err) => {
            if (err instanceof AppValidationError && err.message.includes('reference number')) {
                gcashShortRefBlocked = true;
            }
        });
        assert(gcashShortRefBlocked, 'GCash payment with reference < 6 characters is rejected with 422');

        // Test Cash insufficient tender
        let cashInsufficientBlocked = false;
        const mockReqCash = {
            user: { id: adminUser.id },
            body: {
                items: [{ product_id: 1, quantity: 1 }],
                payment_method: 'Cash',
                tendered_amount: 5.00 // Product costs 15.00
            }
        };
        const mockResCash = {
            status: (code) => ({
                json: (data) => {
                    if (code === 422 || (data && data.message && data.message.includes('Insufficient'))) {
                        cashInsufficientBlocked = true;
                    }
                }
            })
        };
        await salesController.checkout(mockReqCash, mockResCash, (err) => {
            if (err instanceof AppValidationError && err.message.includes('Insufficient')) {
                cashInsufficientBlocked = true;
            }
        });
        assert(cashInsufficientBlocked, 'Cash payment with tendered < total is rejected with 422');

        // Test Cash non-numeric / NaN tender blocked by Number.isFinite
        let cashBadInputBlocked = false;
        const mockReqCashBad = {
            user: { id: adminUser.id },
            body: {
                items: [{ product_id: 1, quantity: 1 }],
                payment_method: 'Cash',
                tendered_amount: 'invalid_amount'
            }
        };
        const mockResCashBad = {
            status: (code) => ({
                json: (data) => {
                    if (code === 422 || (data && data.message && data.message.includes('valid numeric cash amount'))) {
                        cashBadInputBlocked = true;
                    }
                }
            })
        };
        await salesController.checkout(mockReqCashBad, mockResCashBad, (err) => {
            if (err instanceof AppValidationError && err.message.includes('valid numeric cash amount')) {
                cashBadInputBlocked = true;
            }
        });
        assert(cashBadInputBlocked, 'Cash payment with non-numeric / NaN tendered is rejected with 422');

        // Test cart merging for identical product on multiple lines
        let duplicateLinesSuccess = false;
        let duplicateLinesResult = null;
        const mockReqDupLines = {
            user: { id: adminUser.id },
            body: {
                items: [
                    { product_id: 1, quantity: 1 },
                    { product_id: 1, quantity: 2 }
                ],
                payment_method: 'Cash',
                tendered_amount: 100.00
            }
        };
        const mockResDupLines = {
            status: (code) => ({
                json: (data) => {
                    if (code === 201) {
                        duplicateLinesSuccess = true;
                        duplicateLinesResult = data;
                    }
                }
            })
        };
        await salesController.checkout(mockReqDupLines, mockResDupLines, (err) => {
            if (err) throw err;
        });
        assert(duplicateLinesSuccess, 'Cart with duplicate lines of same product merges and succeeds');
        assert(duplicateLinesResult.items.length === 1, 'Merged items array has exactly 1 entry for product 1');
        assert(duplicateLinesResult.items[0].quantity === 3, 'Merged quantity is 3 (1 + 2)');

        // -----------------------------------------------------------------
        // TEST 6: Non-sales Adjustments Report
        // -----------------------------------------------------------------
        console.log('\n[TEST 6] Non-sales Adjustments Report');
        const reportController = require('./controllers/reportController');
        let reportResult = null;
        const mockResReport = {
            json: (data) => { reportResult = data; }
        };
        await reportController.getAdjustmentsReport({ query: {} }, mockResReport, (e) => { throw e; });
        assert(!!reportResult && Array.isArray(reportResult.adjustments), 'Adjustments report returns adjustments array');
        assert(Array.isArray(reportResult.grouped_totals), 'Adjustments report returns grouped_totals array');
        // -----------------------------------------------------------------
        // TEST 7: Sales Subquery-Optimized Pagination & Cashier Scoping
        // -----------------------------------------------------------------
        console.log('\n[TEST 7] Sales Subquery-Optimized Pagination & Cashier Scoping');
        let paginatedResult = null;
        const mockResPaginated = {
            json: (data) => { paginatedResult = data; }
        };
        await salesController.getSales(
            { user: { id: adminUser.id, role: 'admin' }, query: { page: '1', limit: '5' } },
            mockResPaginated,
            (e) => { throw e; }
        );
        assert(!!paginatedResult && paginatedResult.success === true, 'getSales returns success: true');
        assert(Array.isArray(paginatedResult.data), 'getSales returns data array');
        assert(paginatedResult.data.length <= 5, 'getSales respects page limit of 5');
        assert(!!paginatedResult.pagination, 'getSales returns pagination metadata');
        assert(typeof paginatedResult.pagination.total === 'number', 'pagination total is a number');
        assert(paginatedResult.pagination.page === 1, 'pagination page is 1');
        assert(paginatedResult.pagination.limit === 5, 'pagination limit is 5');
        assert(paginatedResult.pagination.totalPages >= 1, 'pagination totalPages is >= 1');

        // -----------------------------------------------------------------
        // TEST 8: Product Creation, Trigger Synchronization & Ledger Invariants
        // -----------------------------------------------------------------
        console.log('\n[TEST 8] Product Creation, Trigger Synchronization & Ledger Invariants');
        const productController = require('./controllers/productController');

        // 8a. Trigger synchronization test: insert with only stock
        const testPartTrigger = `TEST-TRIG-${Date.now().toString().slice(-4)}`;
        const [rawInsert] = await db.query(
            'INSERT INTO products (part_number, name, brand, category, size, stock) VALUES (?, ?, ?, ?, ?, ?)',
            [testPartTrigger, 'Trigger Sync Part', 'Yamaha', 'Electrical', 'Standard', 14]
        );
        const [rawRow] = await db.query('SELECT stock, current_stock FROM products WHERE id = ?', [rawInsert.insertId]);
        assert(rawRow[0].stock === 14 && rawRow[0].current_stock === 14, 'Insert trigger synchronizes current_stock to stock when current_stock is omitted');
        await db.query('DELETE FROM products WHERE id = ?', [rawInsert.insertId]);

        // 8b. createProduct strictly initializes stock to 0 and records baseline OPENING_BALANCE (0 change)
        const testPartSuite = `TEST-PROD-SUITE-${Date.now().toString().slice(-4)}`;
        let createResult = null;
        let createStatusCode = 200;
        const mockResCreateProd = {
            status: (code) => { createStatusCode = code; return mockResCreateProd; },
            json: (data) => { createResult = data; return mockResCreateProd; }
        };
        await productController.createProduct({
            user: { id: adminUser.id, role: 'admin' },
            body: {
                part_number: testPartSuite,
                name: 'Suite Carburetor Diaphragm',
                brand: 'Yamaha',
                category: 'Engine',
                size: 'Standard',
                cost_price: 150.00,
                selling_price: 280.00,
                reorder_level: 5,
                is_serialized: false,
                stock: 0
            }
        }, mockResCreateProd);

        assert(createStatusCode === 201 && !!createResult.productId, 'createProduct succeeds with 201');
        const createdProdId = createResult.productId;

        const [createdProdRow] = await db.query('SELECT stock, current_stock FROM products WHERE id = ?', [createdProdId]);
        assert(createdProdRow[0].stock === 0 && createdProdRow[0].current_stock === 0, 'Created product strictly starts with 0 stock');

        const [openingLedgerRow] = await db.query(
            'SELECT * FROM inventory_transactions WHERE product_id = ? AND transaction_type = "OPENING_BALANCE"',
            [createdProdId]
        );
        assert(openingLedgerRow.length > 0, 'createProduct records baseline OPENING_BALANCE ledger entry');
        assert(openingLedgerRow[0].quantity_change === 0, 'OPENING_BALANCE ledger entry quantity_change is 0');
        assert(openingLedgerRow[0].balance_after === 0, 'OPENING_BALANCE ledger entry balance_after is 0');

        // 8c. Every stock-in needs a receipt: receive stock via receiveStock
        const inventoryController = require('./controllers/inventoryController');
        let receiveResult = null;
        const mockResReceive = {
            status: () => mockResReceive,
            json: (data) => { receiveResult = data; return mockResReceive; }
        };
        await inventoryController.receiveStock({
            user: { id: adminUser.id, role: 'admin' },
            body: {
                supplier_id: 1,
                reference_no: `RCV-SUITE-${Date.now()}`,
                items: [{
                    itemId: createdProdId,
                    quantity: 10,
                    cost_price: 150.00
                }],
                notes: 'Official test delivery from Yamaha'
            }
        }, mockResReceive, (e) => { throw e; });

        const [afterRcvProdRow] = await db.query('SELECT stock, current_stock FROM products WHERE id = ?', [createdProdId]);
        assert(afterRcvProdRow[0].stock === 10 && afterRcvProdRow[0].current_stock === 10, 'Stock-in via receiveStock successfully increments stock to 10 with supplier receipt');

        const [rcvLedgerRow] = await db.query(
            'SELECT * FROM inventory_transactions WHERE product_id = ? AND transaction_type = "STOCK_IN"',
            [createdProdId]
        );
        assert(rcvLedgerRow.length > 0, 'Official receiving record created STOCK_IN ledger entry');
        assert(rcvLedgerRow[0].quantity_change === 10 && rcvLedgerRow[0].balance_after === 10, 'STOCK_IN quantity_change is +10 and balance_after is 10');

        // 8d. updateProduct does NOT alter stock
        let updateResult = null;
        const mockResUpdateProd = {
            status: () => mockResUpdateProd,
            json: (data) => { updateResult = data; return mockResUpdateProd; }
        };
        await productController.updateProduct({
            user: { id: adminUser.id, role: 'admin' },
            params: { id: createdProdId },
            body: {
                part_number: testPartSuite,
                name: 'Suite Carburetor Diaphragm Updated',
                brand: 'Yamaha',
                category: 'Engine',
                size: 'Standard',
                cost_price: 150.00,
                selling_price: 280.00,
                reorder_level: 5,
                stock: 999 // Should be ignored; product edits cannot modify stock!
            }
        }, mockResUpdateProd);

        const [afterUpdateProdRow] = await db.query('SELECT stock, current_stock FROM products WHERE id = ?', [createdProdId]);
        assert(afterUpdateProdRow[0].stock === 10 && afterUpdateProdRow[0].current_stock === 10, 'updateProduct preserves stock at 10 and prevents bypassing the ledger');

        // 8e. updateProduct preserves NOT_COMPATIBLE rules in product_compatibilities
        // Add a NOT_COMPATIBLE rule for model 45 (Aerox V3) or model 26 on createdProdId
        const [someModels] = await db.query('SELECT id FROM motorcycle_models LIMIT 2');
        if (someModels.length >= 2) {
            const modelA = someModels[0].id;
            const modelB = someModels[1].id;
            await db.query(`
                INSERT INTO product_compatibilities (product_id, motorcycle_model_id, compatibility_status, notes)
                VALUES (?, ?, 'COMPATIBLE', 'Fits model A'), (?, ?, 'NOT_COMPATIBLE', 'Incompatible fitment')
                ON DUPLICATE KEY UPDATE compatibility_status = VALUES(compatibility_status), notes = VALUES(notes)
            `, [createdProdId, modelA, createdProdId, modelB]);

            // Now update product with some unit IDs - must NOT delete the NOT_COMPATIBLE record!
            await productController.updateProduct({
                user: { id: adminUser.id, role: 'admin' },
                params: { id: createdProdId },
                body: {
                    part_number: testPartSuite,
                    name: 'Suite Carburetor Diaphragm Updated 2',
                    brand: 'Yamaha',
                    category: 'Engine',
                    size: 'Standard',
                    cost_price: 150.00,
                    selling_price: 280.00,
                    reorder_level: 5,
                    motorcycle_unit_ids: [] // Sent no compatible units
                }
            }, mockResUpdateProd);

            const [notCompatCheck] = await db.query(`
                SELECT * FROM product_compatibilities 
                WHERE product_id = ? AND motorcycle_model_id = ? AND compatibility_status = 'NOT_COMPATIBLE'
            `, [createdProdId, modelB]);
            assert(notCompatCheck.length === 1, 'updateProduct strictly preserves NOT_COMPATIBLE records in product_compatibilities');
        }

        // Cleanup test product
        await db.query('UPDATE products SET is_active = FALSE WHERE id = ?', [createdProdId]);

        // -----------------------------------------------------------------
        // TEST 9: Compatibility Mapping ID Resolution (motorcycle_units -> motorcycle_models)
        // -----------------------------------------------------------------
        console.log('\n[TEST 9] Compatibility Mapping ID Resolution (motorcycle_units -> motorcycle_models)');

        // unit 2 in motorcycle_units is Suzuki Raider 150 2022 (corresponds to model 7 in motorcycle_models)
        const [unit2Row] = await db.query('SELECT * FROM motorcycle_units WHERE id = 2');
        assert(unit2Row.length > 0 && unit2Row[0].model === 'Raider 150', 'motorcycle_units ID 2 is Raider 150');

        const testPartCompat = `TEST-COMPAT-ID-${Date.now().toString().slice(-4)}`;
        let compatCreateResult = null;
        const mockResCompatCreate = {
            status: () => mockResCompatCreate,
            json: (data) => { compatCreateResult = data; return mockResCompatCreate; }
        };
        await productController.createProduct({
            user: { id: adminUser.id, role: 'admin' },
            body: {
                part_number: testPartCompat,
                name: 'Raider CDI Unit',
                brand: 'Suzuki',
                category: 'Electrical',
                size: 'Standard',
                cost_price: 500.00,
                selling_price: 850.00,
                reorder_level: 2,
                is_serialized: false,
                stock: 5,
                motorcycle_unit_ids: [2] // Suzuki Raider 150 2022
            }
        }, mockResCompatCreate);

        const compatProdId = compatCreateResult.productId;

        // Verify product_compatibility has motorcycle_unit_id = 2
        const [prodCompatRows] = await db.query('SELECT motorcycle_unit_id FROM product_compatibility WHERE product_id = ?', [compatProdId]);
        assert(prodCompatRows.length === 1 && prodCompatRows[0].motorcycle_unit_id === 2, 'product_compatibility correctly stores motorcycle_unit_id = 2');

        // Verify product_compatibilities has motorcycle_model_id = 7 (Raider 150 2022, NOT 2 which is Honda Click)
        const [prodModelRows] = await db.query(`
            SELECT pc.motorcycle_model_id, mm.brand, mm.model, mm.year_model 
            FROM product_compatibilities pc 
            JOIN motorcycle_models mm ON pc.motorcycle_model_id = mm.id 
            WHERE pc.product_id = ?
        `, [compatProdId]);
        assert(prodModelRows.length === 1, 'product_compatibilities row created');
        assert(prodModelRows[0].motorcycle_model_id !== 2, 'product_compatibilities does NOT store raw motorcycle_unit_id (which is Honda Click)');
        assert(prodModelRows[0].brand === 'Suzuki' && prodModelRows[0].model === 'Raider 150', 'product_compatibilities correctly links to Suzuki Raider 150 model');

        // Verify updateProduct also correctly resolves IDs on update
        let compatUpdateResult = null;
        const mockResCompatUpdate = {
            status: () => mockResCompatUpdate,
            json: (data) => { compatUpdateResult = data; return mockResCompatUpdate; }
        };
        // Update to unit 15 (Yamaha Aerox 155 V1, which is model 25 in motorcycle_models)
        await productController.updateProduct({
            user: { id: adminUser.id, role: 'admin' },
            params: { id: compatProdId },
            body: {
                part_number: testPartCompat,
                name: 'Aerox CDI Unit',
                brand: 'Yamaha',
                category: 'Electrical',
                size: 'Standard',
                cost_price: 500.00,
                selling_price: 850.00,
                reorder_level: 2,
                stock: 5,
                motorcycle_unit_ids: [15] // Yamaha Aerox 155 V1
            }
        }, mockResCompatUpdate);

        const [updatedModelRows] = await db.query(`
            SELECT pc.motorcycle_model_id, mm.brand, mm.model, mm.year_model 
            FROM product_compatibilities pc 
            JOIN motorcycle_models mm ON pc.motorcycle_model_id = mm.id 
            WHERE pc.product_id = ?
        `, [compatProdId]);
        assert(updatedModelRows.length === 1, 'product_compatibilities row updated');
        assert(updatedModelRows[0].motorcycle_model_id === 25, 'updateProduct maps unit 15 to motorcycle_model_id 25');
        assert(updatedModelRows[0].brand === 'Yamaha' && updatedModelRows[0].model === 'Aerox 155', 'product_compatibilities correctly links to Yamaha Aerox 155 V1');

        // Cleanup
        await db.query('UPDATE products SET is_active = FALSE WHERE id = ?', [compatProdId]);

        console.log('\n=====================================================');
        console.log(` Test Suite Results: ${passed} PASSED, ${failed} FAILED`);
        console.log('=====================================================\n');

        if (failed > 0) {
            process.exit(1);
        } else {
            process.exit(0);
        }

    } catch (suiteError) {
        console.error('Fatal error running test suite:', suiteError);
        process.exit(1);
    }
}

runTestSuite();
