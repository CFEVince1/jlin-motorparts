const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

router.use(authMiddleware);

// Only Admin can view reports
const adminOnly = roleMiddleware(['admin']);

router.get('/daily', adminOnly, reportController.getDailySales);
router.get('/monthly', adminOnly, reportController.getMonthlySales);
router.get('/low-stock', adminOnly, reportController.getLowStock);
router.get('/best-selling', adminOnly, reportController.getBestSelling);

// ADD THIS NEW ROUTE
router.get('/by-cashier', adminOnly, reportController.getSalesByCashier);

module.exports = router;
