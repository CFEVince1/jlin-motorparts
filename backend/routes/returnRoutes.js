const express = require('express');
const router = express.Router();
const salesController = require('../controllers/salesController');
const { authenticateToken } = require('../middleware/auth');
const db = require('../config/db');

router.use(authenticateToken);

/**
 * POST /api/returns/process
 * Customer Return & Refund endpoint
 * Supports resolving sale by sale_id, saleId, order_number, receipt_no, or id
 */
router.post('/process', async (req, res, next) => {
    try {
        let saleId = req.body.sale_id || req.body.saleId || req.body.id;
        const orderNumber = req.body.order_number || req.body.orderNumber || req.body.receipt_no;

        if (!saleId && orderNumber) {
            const [sales] = await db.query(
                'SELECT id FROM sales WHERE order_number = ? OR receipt_no = ? LIMIT 1',
                [orderNumber, orderNumber]
            );
            if (sales.length > 0) {
                saleId = sales[0].id;
            }
        }

        if (!saleId) {
            return res.status(400).json({
                message: 'Valid sale ID (sale_id) or order number (order_number) is required to process return/refund.'
            });
        }

        req.params.id = saleId;
        return salesController.processSaleRefund(req, res, next);
    } catch (err) {
        next(err);
    }
});

// Returns reporting & metrics routes
router.get('/metrics', salesController.getReturnSummaryMetrics);
router.get('/history', salesController.getReturnsHistory);
router.get('/audit-history', salesController.getReturnRefundAuditHistory);
router.post('/damage-to-supplier', salesController.returnDamageToSupplier);

module.exports = router;
