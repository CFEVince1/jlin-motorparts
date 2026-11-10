const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');
const { authenticateToken } = require('../middleware/auth');
const roleMiddleware = require('../middleware/roleMiddleware');

router.use(authenticateToken);

const adminOnly = roleMiddleware(['admin']);

// Core inventory listing
router.get('/', inventoryController.getInventory);

// Stock receiving & adjustments (Restricted to Administrators to prevent unauthorized stock-in / write-offs)
router.post('/receive', adminOnly, inventoryController.receiveStock);
router.post('/adjustments', roleMiddleware(['admin', 'staff']), inventoryController.recordAdjustment);

// Stock receiving audit log & history (Accessible to Admin & Cashier/Staff for parcel inspection)
router.get('/receiving-history', roleMiddleware(['admin', 'cashier', 'staff']), inventoryController.getReceivingHistory);
router.get('/receiving-records', roleMiddleware(['admin', 'cashier', 'staff']), inventoryController.getReceivingHistory);
router.get('/receive/history', roleMiddleware(['admin', 'cashier', 'staff']), inventoryController.getReceivingHistory);

// Audit & stock movements
router.get('/items/:id/open-losses', inventoryController.getOpenLosses);
router.get('/items/:id/ledger', inventoryController.getItemLedger);
router.get('/movements', inventoryController.getAllMovements);

// Categories & Brands Management
router.get('/categories', inventoryController.getCategories);
router.post('/categories', adminOnly, inventoryController.createCategory);
router.put('/categories/:id', adminOnly, inventoryController.updateCategory);
router.delete('/categories/:id', adminOnly, inventoryController.deleteCategory);

router.get('/brands', inventoryController.getBrands);
router.post('/brands', adminOnly, inventoryController.createBrand);
router.put('/brands/rename', adminOnly, inventoryController.renameBrand);
router.delete('/brands/:id', adminOnly, inventoryController.deleteBrand);

// Physical Stock Count / Inventory Audit
router.post('/physical-audit', roleMiddleware(['admin', 'staff']), inventoryController.recordPhysicalAudit);

module.exports = router;
