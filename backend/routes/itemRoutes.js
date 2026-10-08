const express = require('express');
const router = express.Router();
const itemController = require('../controllers/itemController');
const { authenticateToken } = require('../middleware/auth');
const roleMiddleware = require('../middleware/roleMiddleware');

router.use(authenticateToken);

const adminOnly = roleMiddleware(['admin']);

// CRUD items
router.get('/', itemController.getAllItems);
router.get('/:id', itemController.getItemById);
router.post('/', adminOnly, itemController.createItem);
router.put('/:id', adminOnly, itemController.updateItem);

// Item ledger & open losses
router.get('/:id/ledger', itemController.getItemLedger);
router.get('/:id/open-losses', itemController.getOpenLosses);

module.exports = router;
