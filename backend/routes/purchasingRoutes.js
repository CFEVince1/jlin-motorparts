const express = require('express');
const router = express.Router();
const purchasingController = require('../controllers/purchasingController');
const { authenticateToken } = require('../middleware/auth');
const roleMiddleware = require('../middleware/roleMiddleware');

router.use(authenticateToken);

const adminOnly = roleMiddleware(['admin']);

// Purchase Orders (Viewable by staff and admin, modifiable by admin/staff)
router.get('/orders', purchasingController.getPurchaseOrders);
router.get('/orders/:id', purchasingController.getPurchaseOrderById);
router.post('/orders', adminOnly, purchasingController.createPurchaseOrder);
router.put('/orders/:id/status', adminOnly, purchasingController.updateOrderStatus);

// Pre-Acceptance Supplier Returns
router.get('/returns', purchasingController.getSupplierReturns);
router.put('/returns/:id/resolve', adminOnly, purchasingController.resolveSupplierReturn);

module.exports = router;
