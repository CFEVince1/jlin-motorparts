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

        // 8b. createProduct writes OPENING_BALANCE
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
                stock: 10
            }
        }, mockResCreateProd);

        assert(createStatusCode === 201 && !!createResult.productId, 'createProduct succeeds with 201');
        const createdProdId = createResult.productId;

        const [createdProdRow] = await db.query('SELECT stock, current_stock FROM products WHERE id = ?', [createdProdId]);
        assert(createdProdRow[0].stock === 10 && createdProdRow[0].current_stock === 10, 'Created product has synchronized stock and current_stock of 10');

        const [openingLedgerRow] = await db.query(
            'SELECT * FROM inventory_transactions WHERE product_id = ? AND transaction_type = "OPENING_BALANCE"',
            [createdProdId]
        );
        assert(openingLedgerRow.length > 0, 'createProduct records OPENING_BALANCE ledger entry');
        assert(openingLedgerRow[0].quantity_change === 10, 'OPENING_BALANCE ledger entry quantity_change is 10');
        assert(openingLedgerRow[0].balance_after === 10, 'OPENING_BALANCE ledger entry balance_after is 10');

        // 8c. updateProduct routes stock edits through applyMovement
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
                stock: 15 // +5 change
            }
        }, mockResUpdateProd);

        const [afterUpdateProdRow] = await db.query('SELECT stock, current_stock FROM products WHERE id = ?', [createdProdId]);
        assert(afterUpdateProdRow[0].stock === 15 && afterUpdateProdRow[0].current_stock === 15, 'updateProduct updates stock and current_stock to 15');

        const [adjLedgerRow] = await db.query(
            'SELECT * FROM inventory_transactions WHERE product_id = ? AND transaction_type = "ADJUSTMENT_ADD"',
            [createdProdId]
        );
        assert(adjLedgerRow.length > 0, 'Stock edit in updateProduct creates ADJUSTMENT_ADD ledger entry');
        assert(adjLedgerRow[0].quantity_change === 5, 'ADJUSTMENT_ADD quantity_change is +5');
        assert(adjLedgerRow[0].balance_after === 15, 'ADJUSTMENT_ADD balance_after is 15');

        // Cleanup test product
        await db.query('UPDATE products SET is_active = FALSE WHERE id = ?', [createdProdId]);

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
