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

// Transaction History
router.get('/', salesController.getSales);
router.get('/:id', salesController.getSaleById);

module.exports = router;
