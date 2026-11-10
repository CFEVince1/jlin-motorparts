const express = require('express');
const router = express.Router();
const supplierController = require('../controllers/supplierController');
const { authenticateToken } = require('../middleware/auth');
const roleMiddleware = require('../middleware/roleMiddleware');

const adminOnly = roleMiddleware(['admin']);

// GET /api/suppliers - View suppliers (any authenticated user can view for dropdowns)
router.get('/', authenticateToken, supplierController.getSuppliers);

// SECTION 6: SUPPLIER PAYMENT PROOFS & MESSENGER QUOTES (MIDDLE BRANCH)
router.get('/proofs', authenticateToken, supplierController.getProofs);
router.post('/proofs', authenticateToken, adminOnly, supplierController.createProof);
router.delete('/proofs/:id', authenticateToken, adminOnly, supplierController.deleteProof);

// SECTION 6: SUPPLIER LEDGER (FINANCIAL STATEMENTS & BALANCES)
router.get('/ledger/summary', authenticateToken, supplierController.getGlobalLedgerSummary);
router.get('/:id/ledger', authenticateToken, supplierController.getSupplierLedger);
router.post('/:id/payments', authenticateToken, adminOnly, supplierController.recordSupplierPayment);

// GET /api/suppliers/:id - View single supplier
router.get('/:id', authenticateToken, supplierController.getSupplierById);

// Modifying routes require strictly Administrator privileges
router.post('/', authenticateToken, adminOnly, supplierController.createSupplier);
router.put('/:id', authenticateToken, adminOnly, supplierController.updateSupplier);
router.delete('/:id', authenticateToken, adminOnly, supplierController.deleteSupplier);

module.exports = router;
