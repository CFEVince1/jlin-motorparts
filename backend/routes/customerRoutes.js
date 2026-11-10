const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

// Customer list & directory
router.get('/', customerController.getCustomers);
router.post('/', customerController.createCustomer);
router.get('/:id/history', customerController.getCustomerPurchaseHistory);
router.get('/:id', customerController.getCustomerById);
router.put('/:id', customerController.updateCustomer);
router.delete('/:id', customerController.deleteCustomer);

// Receipt lookup & warranty processing
router.get('/receipt/lookup/:receiptNo', customerController.lookupReceipt);
router.post('/warranty-return', customerController.processWarrantyReturn);

module.exports = router;
