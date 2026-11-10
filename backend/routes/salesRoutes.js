const express = require('express');
const router = express.Router();
const salesController = require('../controllers/salesController');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

// POS Checkout
router.post('/checkout', salesController.checkout);
router.post('/', salesController.checkout);

// Best Sellers
router.get('/best-sellers', salesController.getBestSellers);

// Returns & Refunds History (Must be before /:id)
router.get('/returns/metrics', salesController.getReturnSummaryMetrics);
router.get('/returns/history', salesController.getReturnsHistory);
router.get('/returns/audit-history', salesController.getReturnRefundAuditHistory);
router.post('/returns/damage-to-supplier', salesController.returnDamageToSupplier);
router.post('/returns/process', async (req, res, next) => {
    let saleId = req.body.sale_id || req.body.saleId || req.body.id;
    if (!saleId && (req.body.order_number || req.body.orderNumber)) {
        try {
            const ord = req.body.order_number || req.body.orderNumber;
            const db = require('../config/db');
            const [sales] = await db.query('SELECT id FROM sales WHERE order_number = ? OR receipt_no = ? LIMIT 1', [ord, ord]);
            if (sales.length > 0) saleId = sales[0].id;
        } catch (err) {
            return next(err);
        }
    }
    if (!saleId) {
        return res.status(400).json({ message: 'Valid sale ID or order number is required' });
    }
    req.params.id = saleId;
    return salesController.processSaleRefund(req, res, next);
});

// Transaction History & Void & Refund
router.get('/', salesController.getSales);
router.get('/:id', salesController.getSaleById);
router.post('/:id/refund', salesController.processSaleRefund);
router.post('/:id/void', salesController.voidAndReopen);
router.post('/:id/void-and-reopen', salesController.voidAndReopen);

module.exports = router;
