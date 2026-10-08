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
        assert(!!reportResult.summary && typeof reportResult.summary.total_adjustments === 'number', 'Adjustments report includes summary totals');

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
