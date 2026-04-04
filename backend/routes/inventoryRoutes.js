const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const { validateStock } = require('../middleware/validation');

router.use(authMiddleware);

// Admin can manage inventory
const adminOnly = roleMiddleware(['admin']);

router.get('/', adminOnly, inventoryController.getInventory);
router.post('/stock-in', adminOnly, validateStock, inventoryController.stockIn);
router.post('/stock-out', adminOnly, validateStock, inventoryController.stockOut);

module.exports = router;
