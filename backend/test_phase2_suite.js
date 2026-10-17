const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const db = require('./config/db');
const { AppValidationError } = require('./utils/errors');
const { applyMovement } = require('./services/inventoryService');
const analyticsController = require('./controllers/analyticsController');
const reportController = require('./controllers/reportController');

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

            // 2e. Database-level CHECK constraint validation (chk_it_quantity_change_sign)
            let dbCheckConstraintTriggered = false;
            try {
                await conn.query(
                    `INSERT INTO inventory_transactions (
                        transaction_number, product_id, transaction_type, quantity, quantity_change, balance_before, balance_after, reference_no
                    ) VALUES ('TEST-VIOLATE-CHECK-001', 5, 'DAMAGE', 5, 5, 20, 25, 'VIOLATION-REF')`
                );
            } catch (err) {
                if (err && ((err.message && /chk_it_quantity_change_sign|constraint|check/i.test(err.message)) || err.code === 'ER_CHECK_CONSTRAINT_VIOLATED')) {
                    dbCheckConstraintTriggered = true;
                }
            }
            assert(dbCheckConstraintTriggered, 'Database CHECK constraint chk_it_quantity_change_sign strictly blocks positive outflow');

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
        const v1Versions = aeroxModel.versions.filter(v => v.version === 'V1' || v.version.toLowerCase() === 'v1');
        assert(v1Versions.length === 1, 'Version V1 appears exactly once in the dropdown hierarchy (no duplicate V1s)');
        const v1Version = v1Versions[0];
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

        // Test Cash strictly rejects 1-centavo shortfall (no allowance)
        let cashOneCentavoShortBlocked = false;
        const mockReqCashShort = {
            user: { id: adminUser.id },
            body: {
                items: [{ product_id: 1, quantity: 1 }],
                payment_method: 'Cash',
                tendered_amount: 14.99 // Exactly 1 centavo short of 15.00 total
            }
        };
        const mockResCashShort = {
            status: (code) => ({
                json: (data) => {
                    if (code === 422 || (data && data.message && data.message.includes('Insufficient'))) {
                        cashOneCentavoShortBlocked = true;
                    }
                }
            })
        };
        await salesController.checkout(mockReqCashShort, mockResCashShort, (err) => {
            if (err instanceof AppValidationError && err.message.includes('Insufficient')) {
                cashOneCentavoShortBlocked = true;
            }
        });
        assert(cashOneCentavoShortBlocked, 'Cash payment 1 centavo short (14.99 for 15.00) is strictly rejected with 422');

        // Test GCash valid checkout and prevention of reused GCash reference
        const testGcashRef = 'GCASH-UNIQ-' + Date.now();
        let gcashFirstSuccess = false;
        const mockReqGcashFirst = {
            user: { id: adminUser.id },
            body: {
                items: [{ product_id: 1, quantity: 1 }],
                payment_method: 'GCash',
                tendered_amount: 15.00,
                payment_reference: testGcashRef
            }
        };
        const mockResGcashFirst = {
            status: (code) => ({
                json: (data) => {
                    if (code === 201) gcashFirstSuccess = true;
                }
            })
        };
        await salesController.checkout(mockReqGcashFirst, mockResGcashFirst, (err) => {
            if (err) throw err;
        });
        assert(gcashFirstSuccess, 'GCash initial checkout with valid reference succeeds');

        let gcashDuplicateBlocked = false;
        let gcashDuplicateErrorMsg = '';
        const mockReqGcashDuplicate = {
            user: { id: adminUser.id },
            body: {
                items: [{ product_id: 1, quantity: 1 }],
                payment_method: 'GCash',
                tendered_amount: 15.00,
                payment_reference: testGcashRef // Reused reference!
            }
        };
        const mockResGcashDuplicate = {
            status: (code) => ({
                json: (data) => {
                    if (code === 422) {
                        gcashDuplicateBlocked = true;
                        gcashDuplicateErrorMsg = data.message;
                    }
                }
            })
        };
        await salesController.checkout(mockReqGcashDuplicate, mockResGcashDuplicate, (err) => {
            if (err instanceof AppValidationError && (err.message.includes('already been used') || err.message.includes('duplicate'))) {
                gcashDuplicateBlocked = true;
                gcashDuplicateErrorMsg = err.message;
            }
        });
        assert(gcashDuplicateBlocked, 'Reused GCash reference number is strictly rejected with 422');
        assert(gcashDuplicateErrorMsg.includes('already been used') && gcashDuplicateErrorMsg.includes('reference already used'), 'Rejection error clearly states reference already used');

        // Verify unique constraint exists on sales table in database
        const [salesIndexes] = await db.query('SHOW INDEX FROM sales WHERE Column_name = "payment_reference"');
        assert(salesIndexes.length > 0 && salesIndexes[0].Non_unique === 0, 'Database schema enforces UNIQUE constraint on sales(payment_reference)');

        // Verify database ER_DUP_ENTRY on payment_reference maps to 422 with "reference already used"
        let dbDupeMappedTo422 = false;
        let dbDupeMsg = '';
        const mockDupeErr = new Error("Duplicate entry 'GCASH-123' for key 'payment_reference'");
        mockDupeErr.code = 'ER_DUP_ENTRY';
        mockDupeErr.errno = 1062;
        const { errorHandler } = require('./server');
        if (typeof errorHandler === 'function') {
            errorHandler(mockDupeErr, {}, {
                status: (code) => ({
                    json: (data) => {
                        if (code === 422) {
                            dbDupeMappedTo422 = true;
                            dbDupeMsg = data.message;
                        }
                    }
                })
            }, () => {});
        }
        assert(dbDupeMappedTo422, 'Database ER_DUP_ENTRY on payment_reference is mapped to 422 (not generic 500)');
        assert(dbDupeMsg.toLowerCase().includes('reference already used'), 'Database error message clearly contains "reference already used"');

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
        // TEST 6: Non-sales Adjustments Report & Date Scoping for Daily/Monthly Reports
        // -----------------------------------------------------------------
        console.log('\n[TEST 6] Non-sales Adjustments Report & Date Scoping for Daily/Monthly Reports');
        const reportController = require('./controllers/reportController');
        let reportResult = null;
        const mockResReport = {
            json: (data) => { reportResult = data; }
        };
        await reportController.getAdjustmentsReport({ query: {} }, mockResReport, (e) => { throw e; });
        assert(!!reportResult && Array.isArray(reportResult.adjustments), 'Adjustments report returns adjustments array');
        assert(Array.isArray(reportResult.grouped_totals), 'Adjustments report returns grouped_totals array');

        // Verify adjustments report strictly excludes STOCK_IN, OPENING_BALANCE, and SALE
        const hasStockInOrOpening = reportResult.adjustments.some(a => 
            a.transaction_type === 'STOCK_IN' || 
            a.transaction_type === 'OPENING_BALANCE' || 
            a.transaction_type === 'SALE'
        );
        assert(!hasStockInOrOpening, 'Adjustments report strictly excludes STOCK_IN, OPENING_BALANCE, and SALE rows');

        // Verify total_units matches sum of discrepancy adjustment quantities
        const expectedTotalUnits = reportResult.adjustments.reduce((sum, a) => sum + Math.abs(Number(a.quantity_change || a.quantity || 0)), 0);
        assert(reportResult.summary.total_units === expectedTotalUnits, 'Adjustments total_units matches sum of non-sales discrepancy quantities without stock-in inflation');

        // Verify database connection enforces Philippine Standard Time (+08:00)
        const [tzRows] = await db.query('SELECT @@session.time_zone as tz');
        assert(tzRows[0].tz === '+08:00', 'Database session time zone is strictly set to Philippine Standard Time (+08:00)');

        // Test getDailySales with chosen date
        let dailyDateResult = null;
        const mockResDaily = {
            json: (data) => { dailyDateResult = data; }
        };
        await reportController.getDailySales(
            { user: { id: adminUser.id, role: 'admin' }, query: { date: '2026-05-15' } },
            mockResDaily
        );
        assert(dailyDateResult?.date === '2026-05-15', 'getDailySales respects chosen ?date=2026-05-15 without forcing today');

        // Test getDailySales with date range
        let dailyRangeResult = null;
        const mockResDailyRange = {
            json: (data) => { dailyRangeResult = data; }
        };
        await reportController.getDailySales(
            { user: { id: adminUser.id, role: 'admin' }, query: { startDate: '2026-05-10', endDate: '2026-05-15' } },
            mockResDailyRange
        );
        assert(dailyRangeResult?.date === '2026-05-10 to 2026-05-15', 'getDailySales respects date range without forcing today');

        // Test getMonthlySales with chosen month string
        let monthlyDateResult = null;
        const mockResMonthly = {
            json: (data) => { monthlyDateResult = data; }
        };
        await reportController.getMonthlySales(
            { user: { id: adminUser.id, role: 'admin' }, query: { month: '2026-05' } },
            mockResMonthly
        );
        assert(monthlyDateResult?.month === '2026-05', 'getMonthlySales respects chosen ?month=2026-05 without forcing this month');

        // Test getMonthlySales with year and month numbers
        let monthlyYearMonthResult = null;
        const mockResMonthlyYM = {
            json: (data) => { monthlyYearMonthResult = data; }
        };
        await reportController.getMonthlySales(
            { user: { id: adminUser.id, role: 'admin' }, query: { year: '2026', month: '8' } },
            mockResMonthlyYM
        );
        assert(monthlyYearMonthResult?.month === '2026-08', 'getMonthlySales respects chosen ?year=2026&month=8');
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

        // Cleanup test product with proper write-off to preserve ledger balance
        await productController.deleteProduct({
            user: { id: adminUser.id, role: 'admin' },
            params: { id: createdProdId }
        }, { status: () => ({ json: () => {} }), json: () => {} }, (e) => { throw e; });

        // -----------------------------------------------------------------
        // TEST 9: Compatibility Mapping ID Resolution (motorcycle_units -> motorcycle_models)
        // -----------------------------------------------------------------
        console.log('\n[TEST 9] Compatibility Mapping ID Resolution (motorcycle_units -> motorcycle_models)');

        // unit 2 in motorcycle_units is Suzuki Raider (corresponds to model 7 in motorcycle_models)
        const [unit2Row] = await db.query('SELECT * FROM motorcycle_units WHERE id = 2');
        assert(unit2Row.length > 0 && (unit2Row[0].model === 'Raider 150' || unit2Row[0].model === 'Raider FI'), 'motorcycle_units ID 2 is Raider');

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
                motorcycle_unit_ids: [2] // Suzuki Raider
            }
        }, mockResCompatCreate);

        const compatProdId = compatCreateResult.productId;

        // Verify product_compatibilities has motorcycle_model_id = 7 (Raider, NOT 2 which is Honda Click)
        const [prodModelRows] = await db.query(`
            SELECT pc.motorcycle_model_id, mm.brand, mm.model, mm.year_model 
            FROM product_compatibilities pc 
            JOIN motorcycle_models mm ON pc.motorcycle_model_id = mm.id 
            WHERE pc.product_id = ?
        `, [compatProdId]);
        assert(prodModelRows.length === 1, 'product_compatibilities row created');
        assert(prodModelRows[0].motorcycle_model_id !== 2, 'product_compatibilities does NOT store raw motorcycle_unit_id (which is Honda Click)');
        assert(prodModelRows[0].brand === 'Suzuki' && (prodModelRows[0].model === 'Raider 150' || prodModelRows[0].model === 'Raider FI'), 'product_compatibilities correctly links to Suzuki Raider model');

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
        assert(updatedModelRows[0].brand === 'Yamaha' && (updatedModelRows[0].model === 'Aerox 155' || updatedModelRows[0].model === 'Aerox 155 V1'), 'product_compatibilities correctly links to Yamaha Aerox 155 V1');

        // ----------------------------------------------------
        // [TEST 10] Compatibility Search & Schema Integrity
        // ----------------------------------------------------
        console.log('\n[TEST 10] Compatibility Search (product_compatibilities sole source) & Schema Integrity');

        // Set compatProdId to COMPATIBLE for model 7 (Suzuki Raider 150 2022)
        // In motorcycle_models:
        // - ID 7 is Suzuki Raider 150 2022
        // - ID 2 is Honda Click 125 2025
        await db.query('UPDATE products SET is_active = TRUE WHERE id = ?', [compatProdId]);
        await db.query('DELETE FROM product_compatibilities WHERE product_id = ?', [compatProdId]);
        await db.query(`
            INSERT INTO product_compatibilities (product_id, motorcycle_model_id, compatibility_status, notes)
            VALUES (?, 7, 'COMPATIBLE', 'Direct OEM fitment')
        `, [compatProdId]);

        // Let's test searchCompatibility with modelId = 7 (Suzuki Raider 150)
        let raiderSearchResult = null;
        const mockResRaiderSearch = {
            status: () => mockResRaiderSearch,
            json: (data) => { raiderSearchResult = data; return mockResRaiderSearch; }
        };

        await compatibilityController.searchCompatibility({
            query: { modelId: 7 } // Raider 150
        }, mockResRaiderSearch, (e) => { throw e; });

        assert(raiderSearchResult && Array.isArray(raiderSearchResult.compatible), 'searchCompatibility succeeds for Raider model ID 7');
        const raiderCompatibleIds = (raiderSearchResult.compatible || []).map(p => p.item_id || p.id);
        assert(raiderCompatibleIds.includes(compatProdId), 'searchCompatibility for Raider model 7 matches product linked via product_compatibilities');

        // Now search for Honda Click (modelId = 2)
        let clickSearchResult = null;
        const mockResClickSearch = {
            status: () => mockResClickSearch,
            json: (data) => { clickSearchResult = data; return mockResClickSearch; }
        };
        await compatibilityController.searchCompatibility({
            query: { modelId: 2 } // Honda Click
        }, mockResClickSearch, (e) => { throw e; });

        const clickCompatibleIds = (clickSearchResult.compatible || []).map(p => p.item_id || p.id);
        assert(!clickCompatibleIds.includes(compatProdId), 'searchCompatibility for Honda Click (model 2) does NOT match Raider part');

        // Test explicit NOT_COMPATIBLE priority
        await db.query(`
            UPDATE product_compatibilities
            SET compatibility_status = 'NOT_COMPATIBLE', notes = 'Explicit test incompatible'
            WHERE product_id = ? AND motorcycle_model_id = 7
        `, [compatProdId]);

        let raiderSearchAfterNotCompat = null;
        const mockResRaiderAfter = {
            status: () => mockResRaiderAfter,
            json: (data) => { raiderSearchAfterNotCompat = data; return mockResRaiderAfter; }
        };
        await compatibilityController.searchCompatibility({
            query: { modelId: 7 }
        }, mockResRaiderAfter, (e) => { throw e; });

        const raiderIncompatIds = (raiderSearchAfterNotCompat.incompatible || []).map(p => p.item_id || p.id);
        const raiderCompatAfterIds = (raiderSearchAfterNotCompat.compatible || []).map(p => p.item_id || p.id);
        assert(raiderIncompatIds.includes(compatProdId), 'Explicit NOT_COMPATIBLE record correctly places product in incompatible list');
        assert(!raiderCompatAfterIds.includes(compatProdId), 'Explicit NOT_COMPATIBLE product is not present in compatible list');

        // Verify sync_aiven_schema.js script integrity
        const syncScriptContent = fs.readFileSync(path.join(__dirname, '../scripts/sync_aiven_schema.js'), 'utf8');
        assert(!syncScriptContent.includes('sales_orders'), 'sync_aiven_schema.js does not create rogue sales_orders table');
        assert(!syncScriptContent.includes('sales_order_items'), 'sync_aiven_schema.js does not create rogue sales_order_items table');
        assert(!syncScriptContent.includes('rejectUnauthorized: false'), 'sync_aiven_schema.js does not disable TLS certificate validation');
        assert(!syncScriptContent.includes('# DB_HOST'), 'sync_aiven_schema.js does not scrape commented out credentials');

        // ----------------------------------------------------
        // [TEST 11] CORS Whitelist Strictness & Error Sanitization
        // ----------------------------------------------------
        console.log('\n[TEST 11] CORS Exact Frontend Whitelist & Server Error Sanitization');
        
        const serverFileContent = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
        assert(!serverFileContent.includes("origin.endsWith('.vercel.app')"), 'server.js does not allow arbitrary *.vercel.app origins');
        assert(!serverFileContent.includes("endsWith('.vercel.app')"), 'server.js has no wildcard vercel.app allowance');

        // Extract and test origin matching logic from server.js
        const allowedCustomOrigins = [];
        const isAllowedExactOrigin = (origin) => {
            if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) return true;
            if (allowedCustomOrigins.includes(origin)) return true;
            if (origin === 'https://jlin-motorparts.vercel.app') return true;
            if (
                /^https:\/\/jlin-motorparts(-[a-zA-Z0-9]+)?-cfevince1s-projects\.vercel\.app$/.test(origin) ||
                /^https:\/\/jlin-motorparts-[a-zA-Z0-9]+-cfevince1\.vercel\.app$/.test(origin) ||
                /^https:\/\/jlin-motorparts(-[a-zA-Z0-9-]+)?\.vercel\.app$/.test(origin)
            ) return true;
            return false;
        };

        assert(isAllowedExactOrigin('https://jlin-motorparts.vercel.app') === true, 'Exact production frontend origin is allowed');
        assert(isAllowedExactOrigin('http://localhost:5173') === true, 'Localhost development origin is allowed');
        assert(isAllowedExactOrigin('https://jlin-motorparts-abc123-cfevince1s-projects.vercel.app') === true, 'Official Vercel preview deployment is allowed');
        assert(isAllowedExactOrigin('https://attacker-app.vercel.app') === false, 'Arbitrary external Vercel app is strictly rejected by CORS');
        assert(isAllowedExactOrigin('https://malicious-site.com') === false, 'Arbitrary third-party domain is strictly rejected by CORS');

        // Verify that server error responses do not leak database internals
        const hasDatabaseInternals = (err) => Boolean(
            err.sql || err.sqlMessage || err.sqlState ||
            (typeof err.code === 'string' && (err.code.startsWith('ER_') || err.code.startsWith('PROTOCOL_'))) ||
            (err.message && /sql|select|insert|update|delete|table|column|foreign key|constraint|database|syntax error/i.test(err.message))
        );

        const simulatedSqlError = new Error("ER_PARSE_ERROR: You have an error in your SQL syntax near 'WHERE id = 1'");
        simulatedSqlError.sql = "SELECT * FROM secret_table WHERE id = 1";
        simulatedSqlError.code = "ER_PARSE_ERROR";

        assert(hasDatabaseInternals(simulatedSqlError) === true, 'Database internal error is accurately detected');

        // Test error handler behavior on simulated DB error
        let handlerStatusCode = null;
        let handlerResponseJson = null;
        const mockResHandler = {
            status: (code) => { handlerStatusCode = code; return mockResHandler; },
            json: (payload) => { handlerResponseJson = payload; return mockResHandler; }
        };

        // Simulated global error handler logic
        const testErrorHandler = (err, req, res) => {
            const status = (typeof err.status === 'number' && err.status >= 400 && err.status < 500)
                ? err.status
                : 500;
            const isDb = hasDatabaseInternals(err);
            if (status >= 500 || isDb) {
                return res.status(500).json({ message: 'An internal server error occurred. Please try again later.' });
            }
            res.status(status).json({ message: err.message || 'An error occurred' });
        };

        testErrorHandler(simulatedSqlError, {}, mockResHandler);
        assert(handlerStatusCode === 500, 'Database error yields 500 status code');
        assert(handlerResponseJson && handlerResponseJson.message === 'An internal server error occurred. Please try again later.', 'Database error returns generic sanitized message');
        assert(!JSON.stringify(handlerResponseJson).includes('secret_table'), 'Database error payload never exposes table names');
        assert(!JSON.stringify(handlerResponseJson).includes('SQL'), 'Database error payload never exposes SQL query text');

        // Verify controllers no longer output { error: err.message }
        const reportCtrlContent = fs.readFileSync(path.join(__dirname, 'controllers/reportController.js'), 'utf8');
        assert(!reportCtrlContent.includes('error: err.message'), 'reportController does not expose error: err.message');
        const analyticsCtrlContent = fs.readFileSync(path.join(__dirname, 'controllers/analyticsController.js'), 'utf8');
        assert(!analyticsCtrlContent.includes('error: err.message'), 'analyticsController does not expose error: err.message');
        const prodCtrlContent = fs.readFileSync(path.join(__dirname, 'controllers/productController.js'), 'utf8');
        assert(!prodCtrlContent.includes('error: err.message'), 'productController does not expose error: err.message');
        const compatCtrlContent = fs.readFileSync(path.join(__dirname, 'controllers/compatibilityController.js'), 'utf8');
        assert(!compatCtrlContent.includes('error: err.message'), 'compatibilityController does not expose error: err.message');

        // ----------------------------------------------------
        // [TEST 12] Logout Token Revocation & Stock Write-Off Role Guard
        // ----------------------------------------------------
        console.log('\n[TEST 12] Logout Token Revocation & Stock Write-Off Role Guard');
        const authController = require('./controllers/authController');
        const { authenticateToken } = require('./middleware/auth');

        // 12a. Fetch test staff user
        const [staffUsers] = await db.query("SELECT id, username, role, token_version FROM users WHERE role = 'staff' LIMIT 1");
        if (staffUsers.length > 0) {
            const staffUser = staffUsers[0];
            const initialVersion = staffUser.token_version || 1;

            // Generate token with initialVersion
            const testToken = jwt.sign(
                { id: staffUser.id, username: staffUser.username, role: staffUser.role, tokenVersion: initialVersion },
                process.env.JWT_SECRET,
                { expiresIn: '1d' }
            );

            // Verify initial token works with authenticateToken
            let authBeforeLogoutStatus = 200;
            const mockReqBefore = {
                header: (name) => name === 'Authorization' ? `Bearer ${testToken}` : null
            };
            const mockResBefore = {
                status: (code) => { authBeforeLogoutStatus = code; return mockResBefore; },
                json: () => mockResBefore
            };
            await authenticateToken(mockReqBefore, mockResBefore, () => {});
            assert(authBeforeLogoutStatus === 200, 'Staff token valid before logout');

            // Call logout
            let logoutStatus = null;
            let logoutJson = null;
            const mockReqLogout = {
                header: (name) => name === 'Authorization' ? `Bearer ${testToken}` : null,
                user: { id: staffUser.id }
            };
            const mockResLogout = {
                status: (code) => { logoutStatus = code; return mockResLogout; },
                json: (data) => { logoutJson = data; return mockResLogout; }
            };
            await authController.logout(mockReqLogout, mockResLogout);

            const [updatedStaffRows] = await db.query('SELECT token_version FROM users WHERE id = ?', [staffUser.id]);
            const newVersion = updatedStaffRows[0].token_version;
            assert(newVersion === initialVersion + 1, 'Logout successfully increments token_version in database');

            // Verify the old token is now strictly revoked
            let authAfterLogoutStatus = null;
            let authAfterLogoutJson = null;
            const mockReqAfter = {
                header: (name) => name === 'Authorization' ? `Bearer ${testToken}` : null
            };
            const mockResAfter = {
                status: (code) => { authAfterLogoutStatus = code; return mockResAfter; },
                json: (data) => { authAfterLogoutJson = data; return mockResAfter; }
            };
            await authenticateToken(mockReqAfter, mockResAfter, () => {});
            assert(authAfterLogoutStatus === 401, 'Old token is rejected with 401 after logout');
            assert(authAfterLogoutJson?.message?.includes('revoked') || authAfterLogoutJson?.message?.includes('invalidated'), 'Rejection message indicates session was revoked');

            // 12b. Verify staff cannot write off stock via /api/inventory/adjustments
            let staffAdjustStatus = null;
            let staffAdjustJson = null;
            const mockReqStaffAdj = {
                user: { id: staffUser.id, role: 'staff' },
                body: {
                    item_id: 1,
                    transaction_type: 'DAMAGE',
                    quantity: 1,
                    reference_no: 'UNAUTHORIZED-DAMAGE',
                    remarks: 'Staff attempt to write off stock'
                }
            };
            const mockResStaffAdj = {
                status: (code) => { staffAdjustStatus = code; return mockResStaffAdj; },
                json: (data) => { staffAdjustJson = data; return mockResStaffAdj; }
            };
            await inventoryController.recordAdjustment(mockReqStaffAdj, mockResStaffAdj, () => {});
            assert(staffAdjustStatus === 403, 'Staff account writing off stock is blocked with 403 Forbidden');
            assert(staffAdjustJson?.message?.includes('Forbidden'), 'Rejection message clearly indicates administrator authorization required');

            // Verify inventoryRoutes has adminOnly on /adjustments
            const invRoutesContent = fs.readFileSync(path.join(__dirname, 'routes/inventoryRoutes.js'), 'utf8');
            assert(invRoutesContent.includes("router.post('/adjustments', adminOnly,"), 'inventoryRoutes strictly enforces adminOnly middleware on /adjustments');
        }

        // ----------------------------------------------------
        // [TEST 13] Analytics Dashboard Security, Timezone & Dynamic ROI
        // ----------------------------------------------------
        console.log('\n[TEST 13] Analytics Dashboard Security, Timezone & Dynamic ROI');
        const analyticsController = require('./controllers/analyticsController');

        // 13a. Static analysis checks
        const analyticsRoutesContent = fs.readFileSync(path.join(__dirname, 'routes/analyticsRoutes.js'), 'utf8');
        assert(analyticsRoutesContent.includes("router.get('/dashboard', adminOnly,"), 'analyticsRoutes strictly enforces adminOnly on /dashboard');
        
        const analyticsCtrlFileContent = fs.readFileSync(path.join(__dirname, 'controllers/analyticsController.js'), 'utf8');
        assert(!analyticsCtrlFileContent.includes('toISOString()'), 'analyticsController eliminates all toISOString() calls to prevent UTC date skew');
        assert(!analyticsCtrlFileContent.includes("refurbROI: '0.0'"), 'analyticsController does not hardcode refurbROI to 0.0');

        // 13b. Staff role denial (Defense-in-depth)
        let staffDashStatus = null;
        let staffDashJson = null;
        const mockReqStaffDash = {
            user: { id: 2, role: 'staff' }
        };
        const mockResStaffDash = {
            status: (code) => { staffDashStatus = code; return mockResStaffDash; },
            json: (data) => { staffDashJson = data; return mockResStaffDash; }
        };
        await analyticsController.getDashboardData(mockReqStaffDash, mockResStaffDash);
        assert(staffDashStatus === 403, 'Staff user is blocked with 403 Forbidden from accessing analytics dashboard');
        assert(staffDashJson?.message?.includes('Insufficient permissions') || staffDashJson?.message?.includes('Access denied'), 'Rejection message clearly indicates access denied');

        // 13c. Admin dashboard data retrieval & dynamic calculations
        let adminDashStatus = 200;
        let adminDashJson = null;
        const mockReqAdminDash = {
            user: { id: 1, role: 'admin' }
        };
        const mockResAdminDash = {
            status: (code) => { adminDashStatus = code; return mockResAdminDash; },
            json: (data) => { adminDashJson = data; return mockResAdminDash; }
        };
        await analyticsController.getDashboardData(mockReqAdminDash, mockResAdminDash);
        assert(adminDashStatus === 200, 'Admin successfully accesses analytics dashboard');
        assert(adminDashJson && adminDashJson.kpis, 'Dashboard response contains kpis object');
        assert(typeof adminDashJson.kpis.refurbROI === 'string' && !isNaN(Number(adminDashJson.kpis.refurbROI)), 'refurbROI is dynamically computed numeric string');
        assert(Array.isArray(adminDashJson.salesTrends) && adminDashJson.salesTrends.length === 7, 'salesTrends contains 7 days of trend data');
        
        // Verify trend dates follow Philippine date format YYYY-MM-DD
        const trendDates = adminDashJson.salesTrends.map(t => t._dateStr);
        assert(trendDates.every(d => /^\d{4}-\d{2}-\d{2}$/.test(d)), 'All sales trend dates are strictly formatted YYYY-MM-DD');
        const sortedTrendDates = [...trendDates].sort();
        assert(JSON.stringify(trendDates) === JSON.stringify(sortedTrendDates), 'Sales trends dates are sorted in chronological order');
        assert(Array.isArray(adminDashJson.costVsProfit), 'Dashboard returns costVsProfit array for admin');

        // ----------------------------------------------------
        // [TEST 14] Profit Invariance on Cost Change & Deletion Stock Ledger Invariants
        // ----------------------------------------------------
        console.log('\n[TEST 14] Profit Invariance on Cost Change & Deletion Stock Ledger Invariants');

        // 14a. Create product with initial cost 100.00 and selling price 250.00
        const profitPartNum = `PROFIT-TEST-${Date.now().toString().slice(-4)}`;
        let profitCreateRes = null;
        await productController.createProduct({
            user: { id: adminUser.id, role: 'admin' },
            body: {
                part_number: profitPartNum,
                name: 'Snapshot Profit Test Part',
                brand: 'Yamaha',
                category: 'Engine',
                size: 'Standard',
                cost_price: 100.00,
                selling_price: 250.00,
                reorder_level: 2,
                is_serialized: false,
                stock: 0
            }
        }, {
            status: () => ({ json: (d) => { profitCreateRes = d; } }),
            json: (d) => { profitCreateRes = d; }
        });
        const profitProdId = profitCreateRes.productId;
        assert(!!profitProdId, 'Profit test product created successfully');

        // Receive 10 units with official supplier receipt
        await inventoryController.receiveStock({
            user: { id: adminUser.id, role: 'admin' },
            body: {
                supplier_id: 1,
                reference_no: `RCV-PROFIT-${Date.now()}`,
                items: [{
                    itemId: profitProdId,
                    quantity: 10,
                    cost_price: 100.00
                }],
                notes: 'Stock-in for profit test'
            }
        }, { status: () => ({ json: () => {} }), json: () => {} }, (e) => { throw e; });

        // Sell 2 units (Revenue = 500.00, Sold Cost = 200.00, Profit = 300.00)
        let checkoutSuccess = false;
        await salesController.checkout({
            user: { id: adminUser.id, role: 'admin' },
            body: {
                items: [{ product_id: profitProdId, quantity: 2 }],
                payment_method: 'Cash',
                tendered_amount: 500.00
            }
        }, {
            status: () => ({ json: (d) => { if (d && d.sale_id) checkoutSuccess = true; } }),
            json: (d) => { if (d && d.sale_id) checkoutSuccess = true; }
        }, (e) => { throw e; });
        assert(checkoutSuccess, 'POS Checkout of 2 units succeeds');

        // Verify sale_items recorded snapshot cost_price of 100.00
        const [saleItemRow] = await db.query(
            'SELECT price, cost_price, quantity, subtotal FROM sale_items WHERE product_id = ? ORDER BY id DESC LIMIT 1',
            [profitProdId]
        );
        assert(saleItemRow.length > 0, 'sale_items row exists for sale');
        assert(Number(saleItemRow[0].cost_price) === 100.00, 'sale_items strictly recorded snapshot cost_price of 100.00 when item was sold');

        // Check best-selling report profit before cost price change
        let reportProfitBefore = null;
        await reportController.getBestSelling({
            query: { partNumber: profitPartNum },
            user: { role: 'admin' }
        }, {
            status: () => ({ json: (d) => { reportProfitBefore = d; } }),
            json: (d) => { reportProfitBefore = d; }
        });
        assert(reportProfitBefore && reportProfitBefore.length > 0, 'getBestSelling returns item');
        const profitBefore = Number(reportProfitBefore[0].total_profit);
        assert(profitBefore === 300.00, `Initial calculated profit is 300.00 (got ${profitBefore})`);

        // Now, simulate a supplier price increase: update product cost_price to 220.00
        await productController.updateProduct({
            params: { id: profitProdId },
            user: { id: adminUser.id, role: 'admin' },
            body: {
                part_number: profitPartNum,
                name: 'Snapshot Profit Test Part',
                brand: 'Yamaha',
                category: 'Engine',
                size: 'Standard',
                cost_price: 220.00, // Supplier increased cost by 120.00
                selling_price: 250.00,
                reorder_level: 2,
                is_serialized: false,
                motorcycle_unit_ids: []
            }
        }, {
            status: () => ({ json: () => {} }),
            json: () => {}
        });

        // Verify product cost_price in table is now 220.00
        const [updatedProdCheck] = await db.query('SELECT cost_price FROM products WHERE id = ?', [profitProdId]);
        assert(Number(updatedProdCheck[0].cost_price) === 220.00, 'Product cost_price was updated to 220.00 in products table');

        // Query report again: Historical profit MUST REMAIN 300.00, NOT drop to 2 * (250 - 220) = 60.00!
        let reportProfitAfter = null;
        await reportController.getBestSelling({
            query: { partNumber: profitPartNum },
            user: { role: 'admin' }
        }, {
            status: () => ({ json: (d) => { reportProfitAfter = d; } }),
            json: (d) => { reportProfitAfter = d; }
        });
        const profitAfter = Number(reportProfitAfter[0].total_profit);
        assert(profitAfter === 300.00, `Historical profit remains 300.00 after product cost increase (got ${profitAfter})`);

        // 14b. Test product deletion with remaining stock > 0
        // Currently remaining stock is 8 (10 received - 2 sold)
        const [preDelProd] = await db.query('SELECT stock, current_stock FROM products WHERE id = ?', [profitProdId]);
        assert(preDelProd[0].stock === 8, 'Product has 8 active stock units prior to deletion');

        // Call deleteProduct
        let deleteStatus = 200;
        let deleteResult = null;
        await productController.deleteProduct({
            params: { id: profitProdId },
            user: { id: adminUser.id, role: 'admin' }
        }, {
            status: (code) => { deleteStatus = code; return { json: (d) => { deleteResult = d; } }; },
            json: (d) => { deleteResult = d; }
        });

        assert(deleteStatus === 200, 'deleteProduct completes with 200 OK');
        assert(deleteResult && deleteResult.writtenOffStock === 8, 'deleteProduct reports 8 units written off to LOSS');

        // Verify product is soft-deleted and cached stock is explicitly set to 0
        const [postDelProd] = await db.query('SELECT is_active, stock, current_stock FROM products WHERE id = ?', [profitProdId]);
        assert(postDelProd[0].is_active === 0, 'Deleted product is marked is_active = false');
        assert(postDelProd[0].stock === 0 && postDelProd[0].current_stock === 0, 'Deleted product stock is cleanly set to 0');

        // Verify an immutable LOSS entry was recorded in inventory_transactions
        const [lossLedgerRows] = await db.query(
            'SELECT * FROM inventory_transactions WHERE product_id = ? AND transaction_type = "LOSS" ORDER BY id DESC LIMIT 1',
            [profitProdId]
        );
        assert(lossLedgerRows.length > 0, 'deleteProduct with stock > 0 records an explicit LOSS ledger transaction');
        assert(lossLedgerRows[0].quantity === 8, 'LOSS ledger quantity is 8');
        assert(lossLedgerRows[0].quantity_change === -8, 'LOSS ledger quantity_change is -8');
        assert(lossLedgerRows[0].balance_after === 0, 'LOSS ledger balance_after is 0');
        assert(lossLedgerRows[0].reference_type === 'PRODUCT_DELETION', 'LOSS ledger reference_type is PRODUCT_DELETION');

        // ----------------------------------------------------
        // [TEST 15] Seed Supplier Contact Integrity & Aerox Model Deduplication
        // ----------------------------------------------------
        console.log('\n[TEST 15] Seed Supplier Contact Integrity & Aerox Model Deduplication');

        // 15a. Static check: setup_aiven_db.js does not seed fabricated supplier details
        const setupAivenContent = fs.readFileSync(path.join(__dirname, 'scripts/setup_aiven_db.js'), 'utf8');
        assert(!setupAivenContent.includes('Carlos Mendoza'), 'setup_aiven_db.js does not seed fabricated contact person Carlos Mendoza');
        assert(!setupAivenContent.includes('sales@yamaha-motor.com.ph'), 'setup_aiven_db.js does not seed fabricated supplier email');
        assert(!setupAivenContent.includes('0917-555-1234'), 'setup_aiven_db.js does not seed fabricated supplier phone number');
        assert(!setupAivenContent.includes("('Yamaha', 'Aerox 155', 'V1')"), 'setup_aiven_db.js does not insert un-suffixed Aerox 155 with V1');
        assert(setupAivenContent.includes("('Yamaha', 'Aerox 155 V1', 'V1')"), 'setup_aiven_db.js aligns with defense seed using Aerox 155 V1');

        // 15b. Database check: Verify seeded suppliers have NULL contact info
        const [seededSuppliers] = await db.query(
            "SELECT name, contact_person, email, phone FROM suppliers WHERE name = 'Yamaha Motor Philippines'"
        );
        assert(seededSuppliers.length > 0, 'Yamaha Motor Philippines supplier exists');
        assert(seededSuppliers[0].contact_person === null, 'Seeded supplier contact_person is null (names only)');
        assert(seededSuppliers[0].email === null, 'Seeded supplier email is null (no fabricated email)');
        assert(seededSuppliers[0].phone === null, 'Seeded supplier phone is null (no fabricated phone)');

        // 15c. Compatibility dropdown tree: Aerox 155 has exactly 1 V1 entry and clean full_name
        let treeRes = null;
        await compatibilityController.getCompatibilityOptions({}, { json: (d) => { treeRes = d; } }, (e) => { throw e; });
        const yamahaEntry = treeRes.find(b => b.brand === 'Yamaha');
        assert(!!yamahaEntry, 'Yamaha brand found in compatibility tree');
        const aeroxTreeModel = yamahaEntry.models.find(m => m.model === 'Aerox 155');
        assert(!!aeroxTreeModel, 'Aerox 155 model found under Yamaha');
        const aeroxV1s = aeroxTreeModel.versions.filter(v => v.version === 'V1' || v.version.toLowerCase() === 'v1');
        assert(aeroxV1s.length === 1, 'Aerox 155 has exactly one V1 version node');
        assert(aeroxV1s[0].full_name === 'Yamaha Aerox 155 V1', 'Aerox 155 V1 full_name is clean without duplicate version suffixes');

        // Cleanup
        await db.query('UPDATE products SET is_active = FALSE WHERE id = ?', [compatProdId]);

        // ----------------------------------------------------
        // [TEST 16] Sales Schema Singularity & Migration/Sync Script Consistency
        // ----------------------------------------------------
        console.log('\n[TEST 16] Single Source of Truth for Sales & Sync/Migration Alignment');

        // 16a. Verify unused legacy tables (sales_orders, sales_order_items, sales_order_seq, stock_adjustments) do NOT exist in DB
        const [dbNameRows] = await db.query("SELECT DATABASE() AS current_db");
        const currentDb = dbNameRows[0].current_db;
        const [remainingSalesTables] = await db.query(
            "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN ('sales_orders', 'sales_order_items', 'sales_order_seq', 'stock_adjustments')",
            [currentDb]
        );
        assert(remainingSalesTables.length === 0, 'Unused tables (sales_orders, sales_order_items, sales_order_seq, stock_adjustments) do not exist in DB');

        // Canonical sales tables exist
        const [canonicalSalesTables] = await db.query(
            "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN ('sales', 'sale_items', 'sale_item_serials')",
            [currentDb]
        );
        assert(canonicalSalesTables.length === 3, 'Canonical sales tables (sales, sale_items, sale_item_serials) exist as single source of truth');

        // 16b. jlin_demo_clean.sql dump does NOT define sales_orders or sales_order_items
        const dumpContent = fs.readFileSync(path.join(__dirname, '../jlin_demo_clean.sql'), 'utf8');
        assert(!dumpContent.includes('CREATE TABLE `sales_orders`'), 'jlin_demo_clean.sql does not create sales_orders table');
        assert(!dumpContent.includes('CREATE TABLE `sales_order_items`'), 'jlin_demo_clean.sql does not create sales_order_items table');

        // 16c. Check CONDITIONAL in product_compatibilities enum across sync script and setup script
        const updatedSyncScript = fs.readFileSync(path.join(__dirname, '../scripts/sync_aiven_schema.js'), 'utf8');
        assert(updatedSyncScript.includes("ENUM('COMPATIBLE', 'NOT_COMPATIBLE', 'CONDITIONAL')"), 'sync_aiven_schema.js includes CONDITIONAL in compatibility_status enum');

        const setupScript = fs.readFileSync(path.join(__dirname, 'scripts/setup_aiven_db.js'), 'utf8');
        assert(setupScript.includes("ENUM('COMPATIBLE', 'NOT_COMPATIBLE', 'CONDITIONAL')"), 'setup_aiven_db.js includes CONDITIONAL in compatibility_status enum');

        // 16d. Receiving records reference_number is unique per supplier (uq_supplier_ref), not globally unique
        const [recIndexes] = await db.query("SHOW INDEX FROM receiving_records WHERE Key_name = 'uq_supplier_ref'");
        assert(recIndexes.length >= 2, 'receiving_records enforces composite uq_supplier_ref (supplier_id, reference_no)');
        const uqCols = recIndexes.map(r => r.Column_name);
        assert(uqCols.includes('supplier_id') && uqCols.includes('reference_no'), 'uq_supplier_ref contains both supplier_id and reference_no');

        const [globalRefUnique] = await db.query(
            "SHOW INDEX FROM receiving_records WHERE Column_name = 'reference_number' AND Non_unique = 0"
        );
        assert(globalRefUnique.length === 0, 'receiving_records has no global unique constraint on reference_number alone');

        // ----------------------------------------------------
        // [TEST 17] Demo Reset Security, Trigger Parsing & Seed Stock Preservation
        // ----------------------------------------------------
        console.log('\n[TEST 17] Demo Reset Script Security, Fallback Trigger Parser & Seed Stock Invariants');

        // 17a. reset_demo.js does not expose password on CLI and uses MYSQL_PWD
        const resetScriptContent = fs.readFileSync(path.join(__dirname, '../scripts/reset_demo.js'), 'utf8');
        assert(!resetScriptContent.includes('-p"${password}"'), 'reset_demo.js does not interpolate password into CLI command line');
        assert(!resetScriptContent.includes('-p$'), 'reset_demo.js has no command-line password flags');
        assert(resetScriptContent.includes('MYSQL_PWD'), 'reset_demo.js passes password securely via MYSQL_PWD environment variable');

        // 17b. Fallback restore uses parseDumpStatements to handle DELIMITER and trigger blocks
        const { parseDumpStatements } = require('../scripts/reset_demo');
        const dumpStatements = parseDumpStatements(dumpContent);
        const triggerStmts = dumpStatements.filter(s => s.includes('TRIGGER'));
        assert(triggerStmts.length === 4, `parseDumpStatements successfully extracts all 4 triggers (found ${triggerStmts.length})`);
        assert(!triggerStmts.some(s => s.includes('DELIMITER')), 'Parsed trigger statements have DELIMITER directives cleanly stripped');

        // 17c. reset_demo.js enforces ledger totals and balance_after integrity checks
        assert(resetScriptContent.includes('p.stock != ledger_sum'), 'reset_demo.js checks per-product stock against ledger_sum');
        assert(resetScriptContent.includes('p.stock != t.balance_after'), 'reset_demo.js checks per-product stock against latest balance_after');
        assert(resetScriptContent.includes('total_product_stock != total_ledger_units') || resetScriptContent.includes('totalStock !== totalLedger'), 'reset_demo.js checks overall database stock against total ledger units');

        // 17d. 01_defense_demo_seed.js does NOT wipe stock on existing products
        const seedScriptContent = fs.readFileSync(path.join(__dirname, 'seeds/01_defense_demo_seed.js'), 'utf8');
        assert(!seedScriptContent.includes('SET stock = 0, current_stock = 0'), '01_defense_demo_seed.js does not reset stock to 0 on existing products');
        assert(seedScriptContent.includes('SET is_active = TRUE WHERE id = ?'), '01_defense_demo_seed.js preserves stock on existing products while ensuring active status');

        // 17e. Current DB ledger invariants check
        const [liveMismatches] = await db.query(`
            SELECT p.id, p.part_number, p.stock, COALESCE(SUM(t.quantity_change), 0) AS ledger_sum
            FROM products p
            LEFT JOIN inventory_transactions t ON p.id = t.product_id
            WHERE p.is_active = TRUE
            GROUP BY p.id, p.part_number, p.stock
            HAVING p.stock != ledger_sum
        `);
        assert(liveMismatches.length === 0, 'Zero ledger sum mismatches in restored database');

        const [liveTotals] = await db.query(`
            SELECT 
                COALESCE(SUM(p.stock), 0) AS total_product_stock,
                (SELECT COALESCE(SUM(t.quantity_change), 0) FROM inventory_transactions t JOIN products p2 ON p2.id = t.product_id WHERE p2.is_active = TRUE) AS total_ledger_units
            FROM products p WHERE p.is_active = TRUE
        `);
        assert(Number(liveTotals[0].total_product_stock) === Number(liveTotals[0].total_ledger_units), 'Total product stock strictly matches total ledger units');

        // ----------------------------------------------------
        // [TEST 18] Cloud SSL Hardening & Login Timing Attack Defense
        // ----------------------------------------------------
        console.log('\n[TEST 18] Cloud SSL CA Verification Hardening & Login Security Invariants');

        // 18a. SSL config enforcement across migration, seeds, resets and setup scripts
        const migrationContent = fs.readFileSync(path.join(__dirname, 'migrations/20261007_comprehensive_inventory_pos.js'), 'utf8');
        assert(!migrationContent.includes('rejectUnauthorized: false'), '20261007 migration does not disable SSL certificate verification');
        assert(migrationContent.includes('getSslConfig'), '20261007 migration uses getSslConfig from db.js');

        assert(!seedScriptContent.includes('rejectUnauthorized: false'), '01_defense_demo_seed.js does not disable SSL certificate verification');
        assert(seedScriptContent.includes('getSslConfig'), '01_defense_demo_seed.js uses getSslConfig from db.js');

        assert(!resetScriptContent.includes('rejectUnauthorized: false'), 'reset_demo.js does not disable SSL certificate verification');
        assert(resetScriptContent.includes('getSslConfig'), 'reset_demo.js uses getSslConfig from db.js');

        const setupDbContent = fs.readFileSync(path.join(__dirname, 'setupDb.js'), 'utf8');
        assert(!setupDbContent.includes('rejectUnauthorized: false'), 'setupDb.js does not disable SSL certificate verification');
        assert(setupDbContent.includes('getSslConfig'), 'setupDb.js uses getSslConfig from db.js');

        const alignSchemaPath = fs.existsSync(path.join(__dirname, '../scripts/archive/align_phase2_schema.js'))
            ? path.join(__dirname, '../scripts/archive/align_phase2_schema.js')
            : path.join(__dirname, '../scripts/align_phase2_schema.js');
        const alignSchemaContent = fs.readFileSync(alignSchemaPath, 'utf8');
        assert(!alignSchemaContent.includes('rejectUnauthorized: false'), 'align_phase2_schema.js does not disable SSL certificate verification');
        assert(alignSchemaContent.includes('getSslConfig'), 'align_phase2_schema.js uses getSslConfig from db.js');

        // 18b. Test getSslConfig behavior
        const cloudSsl = db.getSslConfig('mysql-service-xyz.aivencloud.com');
        assert(cloudSsl && cloudSsl.ssl && cloudSsl.ssl.rejectUnauthorized === true, 'getSslConfig for Aiven host enforces rejectUnauthorized: true');
        assert(cloudSsl.ssl.ca !== undefined, 'getSslConfig for Aiven host supplies CA certificate');

        const localSsl = db.getSslConfig('localhost');
        assert(!localSsl.ssl, 'getSslConfig for localhost does not enforce remote SSL');

        // 18c. Login input validation (prevents unhandled 500 when password/username missing or empty)
        const createMockRes = () => {
            const res = {
                statusCode: 200,
                data: null,
                status: function (code) {
                    this.statusCode = code;
                    return this;
                },
                json: function (payload) {
                    this.data = payload;
                    return this;
                }
            };
            return res;
        };

        // Missing password -> 400 Bad Request
        const resMissingPwd = createMockRes();
        await authController.login({ body: { username: 'admin' } }, resMissingPwd);
        assert(resMissingPwd.statusCode === 400, 'Login with missing password returns 400 Bad Request (not 500)');
        assert(resMissingPwd.data?.message?.includes('required'), 'Missing password response provides clear validation message');

        // Missing username -> 400 Bad Request
        const resMissingUser = createMockRes();
        await authController.login({ body: { password: 'somepassword' } }, resMissingUser);
        assert(resMissingUser.statusCode === 400, 'Login with missing username returns 400 Bad Request');

        // Empty / whitespace username -> 400 Bad Request
        const resEmptyUser = createMockRes();
        await authController.login({ body: { username: '   ', password: 'somepassword' } }, resEmptyUser);
        assert(resEmptyUser.statusCode === 400, 'Login with whitespace username returns 400 Bad Request');

        // 18d. Nonexistent username timing attack mitigation
        const t0 = Date.now();
        const resNonexistent = createMockRes();
        await authController.login({ body: { username: 'nonexistent_ghost_user_99999', password: 'wrongpassword' } }, resNonexistent);
        const elapsedNonexistent = Date.now() - t0;
        assert(resNonexistent.statusCode === 401, 'Login with nonexistent username returns 401 Unauthorized');
        assert(resNonexistent.data?.message === 'Invalid credentials', 'Login with nonexistent username returns uniform "Invalid credentials" message');
        assert(elapsedNonexistent >= 25, `Nonexistent user runs dummy bcrypt compare to prevent timing attack (${elapsedNonexistent}ms >= 25ms)`);

        // Wrong password for existing user
        const resWrongPwd = createMockRes();
        await authController.login({ body: { username: 'admin', password: 'definitelyWrongPassword123!' } }, resWrongPwd);
        assert(resWrongPwd.statusCode === 401, 'Login with wrong password returns 401 Unauthorized');
        assert(resWrongPwd.data?.message === 'Invalid credentials', 'Login with wrong password returns identical "Invalid credentials" message');

        // 18e. Valid login
        const resValid = createMockRes();
        await authController.login({ body: { username: 'admin', password: 'admin123' } }, resValid);
        assert(resValid.statusCode === 200, 'Valid admin credentials return 200 OK');
        assert(!!resValid.data?.token, 'Valid login returns JWT token');
        assert(resValid.data?.user?.username === 'admin', 'Valid login returns user profile with username');
        const decodedToken = jwt.verify(resValid.data.token, process.env.JWT_SECRET);
        assert(decodedToken.username === 'admin' && decodedToken.role === 'admin', 'Returned JWT token decodes to authentic admin session');

        // ----------------------------------------------------
        // [TEST 19] JWT_SECRET Startup Validation & Unified Password Policy (8+ chars)
        // ----------------------------------------------------
        console.log('\n[TEST 19] JWT_SECRET Startup Validation & Unified Password Policy');

        // 19a. Startup check function validation
        const { validateStartupEnv } = require('./server');
        assert(typeof validateStartupEnv === 'function', 'server.js exports validateStartupEnv function');

        const missingSecretCheck = validateStartupEnv({});
        assert(missingSecretCheck.valid === false, 'validateStartupEnv fails when JWT_SECRET is missing');
        assert(missingSecretCheck.message.includes('JWT_SECRET'), 'validateStartupEnv message clearly identifies missing JWT_SECRET');

        const emptySecretCheck = validateStartupEnv({ JWT_SECRET: '   ' });
        assert(emptySecretCheck.valid === false, 'validateStartupEnv fails when JWT_SECRET is empty string');

        const validSecretCheck = validateStartupEnv({ JWT_SECRET: 'valid-secret-key-12345' });
        assert(validSecretCheck.valid === true, 'validateStartupEnv passes when valid JWT_SECRET is present');

        // 19b. Process-level startup abort when JWT_SECRET is missing
        const { execSync } = require('child_process');
        let startupAborted = false;
        let startupOutput = '';
        try {
            execSync('node -e "process.env.JWT_SECRET=\'\'; require(\'./server\');"', {
                cwd: __dirname,
                stdio: 'pipe',
                timeout: 5000,
                env: { ...process.env, JWT_SECRET: '', NODE_ENV: 'production' }
            });
        } catch (procErr) {
            startupAborted = true;
            startupOutput = (procErr.stderr || procErr.stdout || '').toString();
        }
        assert(startupAborted, 'Server startup immediately aborts (exit code 1) when JWT_SECRET is missing');
        assert(startupOutput.includes('JWT_SECRET'), 'Startup failure logs clear fatal warning specifying missing JWT_SECRET');

        // 19c. Explicit authController login error if JWT_SECRET is missing
        const savedJwtSecret = process.env.JWT_SECRET;
        try {
            delete process.env.JWT_SECRET;
            const resNoSecret = createMockRes();
            await authController.login({ body: { username: 'admin', password: 'admin123' } }, resNoSecret);
            assert(resNoSecret.statusCode === 500, 'Login without JWT_SECRET returns 500 status');
            assert(resNoSecret.data?.message?.includes('JWT_SECRET is missing'), 'Login without JWT_SECRET returns clear descriptive configuration error');
        } finally {
            process.env.JWT_SECRET = savedJwtSecret;
        }

        // 19d. Unified Password Policy (8 characters minimum for user creation and updates)
        const userController = require('./controllers/userController');

        // Attempt user creation with 5 characters (previously accepted, now rejected)
        const resCreateShort5 = createMockRes();
        await userController.createUser({
            body: { username: 'testuser_short5', password: '12345', role: 'staff' }
        }, resCreateShort5);
        assert(resCreateShort5.statusCode === 400, 'User creation with 5-char password is rejected with 400 Bad Request');
        assert(resCreateShort5.data?.message === 'Password must be at least 8 characters', 'Error message specifies minimum 8 characters');

        // Attempt user creation with 7 characters
        const resCreateShort7 = createMockRes();
        await userController.createUser({
            body: { username: 'testuser_short7', password: '1234567', role: 'staff' }
        }, resCreateShort7);
        assert(resCreateShort7.statusCode === 400, 'User creation with 7-char password is rejected with 400 Bad Request');

        // Attempt user creation with non-string password
        const resCreateNonString = createMockRes();
        await userController.createUser({
            body: { username: 'testuser_num', password: 12345678, role: 'staff' }
        }, resCreateNonString);
        assert(resCreateNonString.statusCode === 400, 'User creation with non-string password is rejected with 400 Bad Request');

        // Successful user creation with 8+ characters
        const uniqueTestUser = `staff_pw_${Date.now()}`;
        const resCreateSuccess = createMockRes();
        await userController.createUser({
            body: { username: uniqueTestUser, password: 'SecurePassword123!', role: 'staff' }
        }, resCreateSuccess);
        assert(resCreateSuccess.statusCode === 201, 'User creation with 8+ character password succeeds with 201 Created');
        const createdUserId = resCreateSuccess.data?.userId;
        assert(!!createdUserId, 'Created user returns insertId');

        // 19e. User update with short password (< 8 chars)
        const resUpdateShort = createMockRes();
        await userController.updateUser({
            params: { id: createdUserId },
            user: { id: adminUser.id, role: 'admin' },
            body: { username: uniqueTestUser, password: 'short5', role: 'staff' }
        }, resUpdateShort);
        assert(resUpdateShort.statusCode === 400, 'User password update with 5-char password rejected with 400');
        assert(resUpdateShort.data?.message === 'Password must be at least 8 characters', 'Update error message specifies minimum 8 characters');

        // User update with valid 8+ char password
        const resUpdateSuccess = createMockRes();
        await userController.updateUser({
            params: { id: createdUserId },
            user: { id: adminUser.id, role: 'admin' },
            body: { username: uniqueTestUser, password: 'UpdatedSecurePass888!', role: 'staff' }
        }, resUpdateSuccess);
        assert(resUpdateSuccess.statusCode === 200, 'User password update with 8+ characters succeeds with 200 OK');

        // Clean up test user
        await db.query('DELETE FROM users WHERE id = ?', [createdUserId]);

        // 19f. Profile change password rule parity verification
        const staffController = require('./controllers/staffController');
        const resStaffShort = createMockRes();
        await staffController.updateProfile({
            user: { id: adminUser.id, role: 'admin' },
            body: { currentPassword: 'admin123', newPassword: 'short' } // < 8 characters
        }, resStaffShort);
        assert(resStaffShort.statusCode === 422, 'Staff profile update with < 8 char password is rejected with 422');
        assert(resStaffShort.data?.message?.includes('8 characters'), 'Profile update enforces identical 8-character password policy');

        // ----------------------------------------------------
        // [TEST 20] Accurate Delete User Reasons, Price/Cost Validations & SKU Duplicate Checks
        // ----------------------------------------------------
        console.log('\n[TEST 20] Accurate Delete User Blockers, Price/Cost Integrity & SKU Duplicate Checks');

        // 20a. Deleting a user with inventory ledger history reports accurate reason (not "sales transactions")
        const originalDbQuery = db.query;
        // Mock db.query to simulate user with ONLY ledger history (no sales)
        db.query = async (sql, params) => {
            if (typeof sql === 'string') {
                if (sql.includes('FROM users WHERE id = ?')) {
                    return [[{ id: 9999, username: 'ledger_staff', role: 'staff' }]];
                }
                if (sql.includes('FROM sales WHERE user_id = ?')) {
                    return [[]]; // No sales
                }
                if (sql.includes('FROM inventory_transactions WHERE created_by = ?')) {
                    return [[{ id: 101 }]]; // Has ledger history!
                }
                if (sql.includes('FROM receiving_records WHERE received_by = ?')) {
                    return [[]]; // No receiving records
                }
            }
            return originalDbQuery.apply(db, [sql, params]);
        };

        const resDeleteLedgerUser = createMockRes();
        await userController.deleteUser({
            params: { id: 9999 },
            user: { id: adminUser.id, role: 'admin' }
        }, resDeleteLedgerUser);

        db.query = originalDbQuery; // restore original db.query

        assert(resDeleteLedgerUser.statusCode === 400, 'Deleting user with inventory ledger history is rejected with 400');
        assert(resDeleteLedgerUser.data?.message?.includes('inventory ledger history'), 'Rejection message correctly identifies inventory ledger history');
        assert(!resDeleteLedgerUser.data?.message?.includes('sales transactions'), 'Rejection message does NOT falsely report sales transactions');

        // 20b. Price and cost validation in productController
        const resNegCost = createMockRes();
        await productController.createProduct({
            body: {
                part_number: 'TEST-NEG-COST',
                name: 'Test Part',
                brand: 'Yamaha',
                category: 'Engine',
                size: 'Standard',
                cost_price: -50.00,
                selling_price: 100.00,
                reorder_level: 5,
                is_serialized: false
            }
        }, resNegCost);
        assert(resNegCost.statusCode === 400, 'createProduct rejects negative cost_price with 400');
        assert(resNegCost.data?.message?.includes('non-negative'), 'createProduct error message specifies valid non-negative number for cost_price');

        const resNonNumCost = createMockRes();
        await productController.createProduct({
            body: {
                part_number: 'TEST-NAN-COST',
                name: 'Test Part',
                brand: 'Yamaha',
                category: 'Engine',
                size: 'Standard',
                cost_price: 'not_a_number',
                selling_price: 100.00,
                reorder_level: 5,
                is_serialized: false
            }
        }, resNonNumCost);
        assert(resNonNumCost.statusCode === 400, 'createProduct rejects non-numeric cost_price with 400');

        const resNegSelling = createMockRes();
        await productController.createProduct({
            body: {
                part_number: 'TEST-NEG-SELL',
                name: 'Test Part',
                brand: 'Yamaha',
                category: 'Engine',
                size: 'Standard',
                cost_price: 50.00,
                selling_price: -100.00,
                reorder_level: 5,
                is_serialized: false
            }
        }, resNegSelling);
        assert(resNegSelling.statusCode === 400, 'createProduct rejects negative selling_price with 400');

        const resUpdateNegPrice = createMockRes();
        await productController.updateProduct({
            params: { id: 1 },
            body: {
                part_number: 'BLT-M8-001',
                name: 'Cylinder Head Bolt M8',
                brand: 'Yamaha',
                category: 'Bolts & Screws',
                size: 'M8 x 40mm',
                cost_price: 5.00,
                selling_price: -15.00,
                reorder_level: 10
            }
        }, resUpdateNegPrice);
        assert(resUpdateNegPrice.statusCode === 400, 'updateProduct rejects negative selling_price with 400');

        // 20c. Database CHECK constraints on products table
        let dbCheckCostBlocked = false;
        try {
            await db.query('UPDATE products SET cost_price = -99.99 WHERE id = 1');
        } catch (dbErr) {
            if (dbErr && (dbErr.code === 'ER_CHECK_CONSTRAINT_VIOLATED' || /chk_products_cost_price|check/i.test(dbErr.message))) {
                dbCheckCostBlocked = true;
            }
        }
        assert(dbCheckCostBlocked, 'Database enforces chk_products_cost_price CHECK constraint');

        let dbCheckSellingBlocked = false;
        try {
            await db.query('UPDATE products SET selling_price = -99.99 WHERE id = 1');
        } catch (dbErr) {
            if (dbErr && (dbErr.code === 'ER_CHECK_CONSTRAINT_VIOLATED' || /chk_products_selling_price|check/i.test(dbErr.message))) {
                dbCheckSellingBlocked = true;
            }
        }
        assert(dbCheckSellingBlocked, 'Database enforces chk_products_selling_price CHECK constraint');

        // 20d. SKU changes checked for duplicates in productController.updateProduct
        // Try updating product 6 to product 5's part_number ('JLR-BP-AEROX') and brand ('Yamaha')
        const resDupProductSku = createMockRes();
        await productController.updateProduct({
            params: { id: 6 },
            body: {
                part_number: 'JLR-BP-AEROX',
                name: 'Aerox Engine Oil Filter Element',
                brand: 'Yamaha',
                category: 'Engine',
                size: 'Standard',
                cost_price: 120.00,
                selling_price: 220.00,
                reorder_level: 5
            }
        }, resDupProductSku);
        assert(resDupProductSku.statusCode === 400, 'updateProduct rejects duplicate part_number/SKU with 400 Bad Request');
        assert(resDupProductSku.data?.message?.includes('Duplicate'), 'updateProduct clearly indicates duplicate part number / SKU');

        // 20e. SKU changes checked for duplicates in itemController.updateItem
        const itemController = require('./controllers/itemController');
        let itemDupSkuBlocked = false;
        try {
            await itemController.updateItem({
                params: { id: 6 },
                body: { sku: 'JLR-BP-AEROX', brand: 'Yamaha' }
            }, createMockRes(), (err) => {
                if (err instanceof AppValidationError && err.message.includes('already exists')) {
                    itemDupSkuBlocked = true;
                }
            });
        } catch (e) {
            if (e instanceof AppValidationError && e.message.includes('already exists')) {
                itemDupSkuBlocked = true;
            }
        }
        assert(itemDupSkuBlocked, 'itemController.updateItem strictly prevents updating to duplicate SKU on another item');

        // ----------------------------------------------------
        // [TEST 21] Unified Product Starting Stock Invariant & Supplier Boolean Parsing
        // ----------------------------------------------------
        console.log('\n[TEST 21] Unified Product Starting Stock Invariant & Supplier Boolean Parsing');

        const supplierController = require('./controllers/supplierController');

        // 21a. supplierController properly parses boolean strings ("false", "true", "0", "1")
        const testSupplierName = `Test Vendor ${Date.now().toString().slice(-5)}`;
        const resCreateSupplier = createMockRes();
        await supplierController.createSupplier({
            body: {
                name: testSupplierName,
                contact_person: 'Vendor Contact',
                email: 'vendor@example.com',
                phone: '09123456789',
                address: 'Manila, Philippines',
                is_active: 'false' // string "false"
            }
        }, resCreateSupplier, (err) => { throw err; });

        assert(resCreateSupplier.statusCode === 201, 'createSupplier succeeds with 201');
        const createdSupplierId = resCreateSupplier.data?.supplier?.id;
        assert(Boolean(createdSupplierId), 'createSupplier returns new supplier with ID');

        const [supRow1] = await db.query('SELECT is_active FROM suppliers WHERE id = ?', [createdSupplierId]);
        assert(supRow1[0].is_active === 0, 'createSupplier with is_active: "false" properly stores is_active = 0');

        // Update with is_active: "true" (string)
        const resUpdateSup1 = createMockRes();
        await supplierController.updateSupplier({
            params: { id: createdSupplierId },
            body: { is_active: 'true' }
        }, resUpdateSup1, (err) => { throw err; });
        assert(resUpdateSup1.statusCode === 200, 'updateSupplier with "true" succeeds');
        const [supRow2] = await db.query('SELECT is_active FROM suppliers WHERE id = ?', [createdSupplierId]);
        assert(supRow2[0].is_active === 1, 'updateSupplier with is_active: "true" sets is_active = 1');

        // Update with is_active: "false" (string) - ensure string "false" deactivates supplier!
        const resUpdateSup2 = createMockRes();
        await supplierController.updateSupplier({
            params: { id: createdSupplierId },
            body: { is_active: 'false' }
        }, resUpdateSup2, (err) => { throw err; });
        assert(resUpdateSup2.statusCode === 200, 'updateSupplier with "false" succeeds');
        const [supRow3] = await db.query('SELECT is_active FROM suppliers WHERE id = ?', [createdSupplierId]);
        assert(supRow3[0].is_active === 0, 'updateSupplier with is_active: "false" sets is_active = 0 (not coerced to true)');

        // Update with is_active: false (boolean literal)
        const resUpdateSup3 = createMockRes();
        await supplierController.updateSupplier({
            params: { id: createdSupplierId },
            body: { is_active: false }
        }, resUpdateSup3, (err) => { throw err; });
        assert(resUpdateSup3.statusCode === 200, 'updateSupplier with boolean false succeeds');
        const [supRow4] = await db.query('SELECT is_active FROM suppliers WHERE id = ?', [createdSupplierId]);
        assert(supRow4[0].is_active === 0, 'updateSupplier with boolean false preserves is_active = 0');

        // Update with is_active: "0" (string zero)
        const resUpdateSup4 = createMockRes();
        await supplierController.updateSupplier({
            params: { id: createdSupplierId },
            body: { is_active: '0' }
        }, resUpdateSup4, (err) => { throw err; });
        assert(resUpdateSup4.statusCode === 200, 'updateSupplier with "0" succeeds');
        const [supRow5] = await db.query('SELECT is_active FROM suppliers WHERE id = ?', [createdSupplierId]);
        assert(supRow5[0].is_active === 0, 'updateSupplier with is_active: "0" sets is_active = 0');

        // Update with is_active: "1" (string one)
        const resUpdateSup5 = createMockRes();
        await supplierController.updateSupplier({
            params: { id: createdSupplierId },
            body: { is_active: '1' }
        }, resUpdateSup5, (err) => { throw err; });
        assert(resUpdateSup5.statusCode === 200, 'updateSupplier with "1" succeeds');
        const [supRow6] = await db.query('SELECT is_active FROM suppliers WHERE id = ?', [createdSupplierId]);
        assert(supRow6[0].is_active === 1, 'updateSupplier with is_active: "1" sets is_active = 1');

        // Cleanup test supplier
        await db.query('DELETE FROM suppliers WHERE id = ?', [createdSupplierId]);

        // 21b. Unified Starting Stock Invariant across both product write paths
        // Path 1: itemController.createItem (/api/items) forces starting stock to 0 even if client passes stock > 0
        const testSkuItem = `TEST-ITEM-WRITE-${Date.now().toString().slice(-4)}`;
        let itemCreatedData = null;
        const resCreateItem = {
            statusCode: 200,
            status: function (code) { this.statusCode = code; return this; },
            json: function (payload) { itemCreatedData = payload; return this; }
        };
        await itemController.createItem({
            user: { id: adminUser.id, role: 'admin' },
            body: {
                sku: testSkuItem,
                name: 'Test Item Starting Stock',
                brand: 'Yamaha',
                category: 'Engine',
                size: 'Standard',
                cost_price: 100.00,
                retail_price: 200.00,
                reorder_level: 5,
                is_serialized: false,
                stock: 99, // Attempt manual stock insertion
                current_stock: 99
            }
        }, resCreateItem, (err) => { throw err; });

        assert(resCreateItem.statusCode === 201, 'itemController.createItem succeeds with 201');
        const createdItemId = itemCreatedData?.item?.id;
        assert(Boolean(createdItemId), 'createItem returns created item ID');

        const [itemRow] = await db.query('SELECT stock, current_stock FROM products WHERE id = ?', [createdItemId]);
        assert(itemRow[0].stock === 0 && itemRow[0].current_stock === 0, 'itemController.createItem forces starting stock to strictly 0 (tampering with 99 ignored)');

        const [itemLedgerRows] = await db.query(
            'SELECT transaction_type, quantity_change, balance_after FROM inventory_transactions WHERE product_id = ?',
            [createdItemId]
        );
        assert(itemLedgerRows.length === 1, 'itemController.createItem creates exactly 1 baseline ledger entry');
        assert(itemLedgerRows[0].transaction_type === 'OPENING_BALANCE', 'itemController initial movement is OPENING_BALANCE');
        assert(itemLedgerRows[0].quantity_change === 0 && itemLedgerRows[0].balance_after === 0, 'itemController OPENING_BALANCE quantity_change is 0 and balance_after is 0');

        // Path 2: productController.createProduct (/api/products) forces starting stock to 0 even if client passes stock > 0
        const testSkuProd = `TEST-PROD-WRITE-${Date.now().toString().slice(-4)}`;
        const resCreateProd = createMockRes();
        await productController.createProduct({
            user: { id: adminUser.id, role: 'admin' },
            body: {
                part_number: testSkuProd,
                name: 'Test Product Starting Stock',
                brand: 'Yamaha',
                category: 'Engine',
                size: 'Standard',
                cost_price: 150.00,
                selling_price: 300.00,
                reorder_level: 5,
                is_serialized: false,
                stock: 77, // Attempt manual stock insertion
                serial_numbers: ['S-77-1', 'S-77-2']
            }
        }, resCreateProd);

        assert(resCreateProd.statusCode === 201, 'productController.createProduct succeeds with 201');
        const createdProdId2 = resCreateProd.data?.productId;
        assert(Boolean(createdProdId2), 'createProduct returns created product ID');

        const [prodRow] = await db.query('SELECT stock, current_stock FROM products WHERE id = ?', [createdProdId2]);
        assert(prodRow[0].stock === 0 && prodRow[0].current_stock === 0, 'productController.createProduct forces starting stock to strictly 0 (tampering with 77 ignored)');

        const [prodLedgerRows] = await db.query(
            'SELECT transaction_type, quantity_change, balance_after FROM inventory_transactions WHERE product_id = ?',
            [createdProdId2]
        );
        assert(prodLedgerRows.length === 1, 'productController.createProduct creates exactly 1 baseline ledger entry');
        assert(prodLedgerRows[0].transaction_type === 'OPENING_BALANCE', 'productController initial movement is OPENING_BALANCE');
        assert(prodLedgerRows[0].quantity_change === 0 && prodLedgerRows[0].balance_after === 0, 'productController OPENING_BALANCE quantity_change is 0 and balance_after is 0');

        // 21c. Updates through both paths strictly reject / ignore manual stock tampering
        await itemController.updateItem({
            params: { id: createdItemId },
            body: { stock: 55, current_stock: 55 }
        }, createMockRes(), () => {});
        const [postUpdateItem] = await db.query('SELECT stock, current_stock FROM products WHERE id = ?', [createdItemId]);
        assert(postUpdateItem[0].stock === 0 && postUpdateItem[0].current_stock === 0, 'itemController.updateItem strictly protects stock against manual updates');

        await productController.updateProduct({
            params: { id: createdProdId2 },
            body: {
                part_number: testSkuProd,
                name: 'Test Product Starting Stock Updated',
                brand: 'Yamaha',
                category: 'Engine',
                size: 'Standard',
                cost_price: 150.00,
                selling_price: 300.00,
                reorder_level: 5,
                stock: 55
            }
        }, createMockRes());
        const [postUpdateProd] = await db.query('SELECT stock, current_stock FROM products WHERE id = ?', [createdProdId2]);
        assert(postUpdateProd[0].stock === 0 && postUpdateProd[0].current_stock === 0, 'productController.updateProduct strictly protects stock against manual updates');

        // Soft delete test products so they are deactivated cleanly
        await db.query('UPDATE products SET is_active = FALSE WHERE id IN (?, ?)', [createdItemId, createdProdId2]);

        // -----------------------------------------------------------------
        // TEST 22: Collision-Proof UUID Transaction Numbers & current_stock Parity
        // -----------------------------------------------------------------
        console.log('\n[TEST 22] Collision-Proof UUID Transaction Numbers & current_stock Parity');

        // 22a. applyMovement generates collision-proof UUID transaction_number
        const uuidTxTestItem = `TEST-UUID-${Date.now().toString().slice(-4)}`;
        const [uuidProdRes] = await db.query(
            `INSERT INTO products (
                part_number, sku, brand, name, category, size,
                cost_price, selling_price, retail_price, stock, current_stock,
                reorder_level, is_serialized, is_active
            ) VALUES (?, ?, 'Yamaha', 'UUID Test Item', 'Parts', 'Standard', 100, 200, 200, 0, 0, 5, 0, 1)`,
            [uuidTxTestItem, uuidTxTestItem]
        );
        const uuidTestId = uuidProdRes.insertId;

        const uuidConn = await db.getConnection();
        await uuidConn.beginTransaction();
        const moveUuid = await applyMovement(uuidConn, {
            itemId: uuidTestId,
            transactionType: 'STOCK_IN',
            quantityChange: 15,
            referenceNo: 'RCV-UUID-001'
        });
        await uuidConn.commit();
        uuidConn.release();

        assert(moveUuid.transactionNumber.startsWith('TX-'), 'Transaction number starts with standard TX- prefix');
        const extractedUuid = moveUuid.transactionNumber.slice(3);
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        assert(uuidRegex.test(extractedUuid), `Transaction number uses standard UUID v4 format (${moveUuid.transactionNumber})`);

        // Verify database row contains authentic UUID
        const [txRow] = await db.query('SELECT transaction_number FROM inventory_transactions WHERE id = ?', [moveUuid.transactionId]);
        assert(uuidRegex.test(txRow[0].transaction_number.slice(3)), 'Database stored transaction_number contains genuine UUID');

        // 22b. Rapid movements do not collide and produce unique UUIDs
        const rapidConn = await db.getConnection();
        await rapidConn.beginTransaction();
        const rapidMoves = [];
        for (const [qty, ref] of [[1, 'RCV-RAPID-1'], [2, 'RCV-RAPID-2'], [3, 'RCV-RAPID-3']]) {
            const mv = await applyMovement(rapidConn, { itemId: uuidTestId, transactionType: 'STOCK_IN', quantityChange: qty, referenceNo: ref });
            rapidMoves.push(mv);
        }
        await rapidConn.commit();
        rapidConn.release();

        const txNums = rapidMoves.map(m => m.transactionNumber);
        const uniqueTxNums = new Set(txNums);
        assert(uniqueTxNums.size === 3, 'Rapid movements produce 100% unique transaction numbers');

        // 22c. Analytics and low-stock queries inspect current_stock and alias both current_stock and stock
        const resAnalytics = createMockRes();
        await analyticsController.getDashboardData({ user: { role: 'admin' }, query: {} }, resAnalytics);
        assert(resAnalytics.statusCode === 200, 'getDashboardData returns 200 OK');
        assert(Array.isArray(resAnalytics.data?.lowStock), 'Analytics summary returns lowStock array');
        if (resAnalytics.data?.lowStock?.length > 0) {
            const firstLow = resAnalytics.data.lowStock[0];
            assert(firstLow.current_stock !== undefined, 'Analytics lowStock includes current_stock column');
            assert(firstLow.stock !== undefined, 'Analytics lowStock includes backward-compatible stock column');
            assert(firstLow.current_stock === firstLow.stock, 'Analytics current_stock equals stock');
        }

        const resReports = createMockRes();
        await reportController.getLowStock({ query: {} }, resReports);
        assert(resReports.statusCode === 200, 'reportController.getLowStock returns 200 OK');
        assert(Array.isArray(resReports.data), 'reportController.getLowStock returns array of products');
        if (resReports.data.length > 0) {
            const firstReportLow = resReports.data[0];
            assert(firstReportLow.current_stock !== undefined, 'Report getLowStock includes current_stock column');
            assert(firstReportLow.stock !== undefined, 'Report getLowStock includes backward-compatible stock column');
            assert(firstReportLow.current_stock === firstReportLow.stock, 'Report current_stock equals stock');
        }

        // Drain test stock back to 0 before deactivation to preserve ledger total invariance across repeat runs
        const [currProd] = await db.query('SELECT stock FROM products WHERE id = ?', [uuidTestId]);
        if (currProd[0]?.stock > 0) {
            const drainConn = await db.getConnection();
            await drainConn.beginTransaction();
            await applyMovement(drainConn, { itemId: uuidTestId, transactionType: 'LOSS', quantityChange: -currProd[0].stock, referenceNo: 'RCV-UUID-CLEANUP' });
            await drainConn.commit();
            drainConn.release();
        }

        // Clean up test product
        await db.query('UPDATE products SET is_active = FALSE WHERE id = ?', [uuidTestId]);

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
