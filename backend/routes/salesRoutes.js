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
router.get('/returns/history', salesController.getReturnsHistory);

// Transaction History & Void & Refund
router.get('/', salesController.getSales);
router.get('/:id', salesController.getSaleById);
router.post('/:id/refund', salesController.processSaleRefund);
router.post('/:id/void-and-reopen', salesController.voidAndReopen);

module.exports = router;
