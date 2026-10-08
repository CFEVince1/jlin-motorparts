const express = require('express');
const router = express.Router();
const supplierController = require('../controllers/supplierController');
const { authenticateToken } = require('../middleware/auth');
const roleMiddleware = require('../middleware/roleMiddleware');

const adminOnly = roleMiddleware(['admin']);

// All routes require authentication
router.use(authenticateToken);

// GET /api/suppliers - View suppliers (staff and admin)
router.get('/', supplierController.getSuppliers);

// GET /api/suppliers/:id - View single supplier
router.get('/:id', supplierController.getSupplierById);

// POST /api/suppliers - Register new supplier (admin only)
router.post('/', adminOnly, supplierController.createSupplier);

// PUT /api/suppliers/:id - Update supplier (admin only)
router.put('/:id', adminOnly, supplierController.updateSupplier);

// DELETE /api/suppliers/:id - Deactivate supplier (admin only)
router.delete('/:id', adminOnly, supplierController.deleteSupplier);

module.exports = router;
