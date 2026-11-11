const express = require('express');
const router = express.Router();
const swapController = require('../controllers/swapController');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

// Look up past sale by order/receipt number
router.get('/lookup-order', swapController.lookupOrder);

// Quick recent sales list for easy receipt selection
router.get('/recent-sales', swapController.getRecentSales);

// Get list of swaps & summary metrics
router.get('/', swapController.getSwaps);

// Process an item swap
router.post('/', swapController.processSwap);

module.exports = router;
