const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');
const { authenticateToken } = require('../middleware/auth');
const roleMiddleware = require('../middleware/roleMiddleware');

router.use(authenticateToken);

const adminOnly = roleMiddleware(['admin']);

// Core inventory listing
router.get('/', inventoryController.getInventory);

// Stock receiving & adjustments (Restricted to Administrators to prevent unauthorized write-offs)
router.post('/receive', adminOnly, inventoryController.receiveStock);
router.post('/adjustments', adminOnly, inventoryController.recordAdjustment);

// Audit & loss recovery
router.get('/items/:id/open-losses', inventoryController.getOpenLosses);
router.get('/items/:id/ledger', inventoryController.getItemLedger);

module.exports = router;
