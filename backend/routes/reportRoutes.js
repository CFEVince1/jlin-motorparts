const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

router.use(authMiddleware);

// Only Admin can view reports
const adminOnly = roleMiddleware(['admin']);

// Allow staff to view their daily sales and global low stock
router.get('/daily', reportController.getDailySales);
router.get('/monthly', adminOnly, reportController.getMonthlySales);
router.get('/low-stock', reportController.getLowStock);
router.get('/best-selling', adminOnly, reportController.getBestSelling);

// ADD THIS NEW ROUTE
router.get('/by-cashier', adminOnly, reportController.getSalesByCashier);
router.get('/categories', adminOnly, reportController.getCategories);

// Admin Dashboard stats
router.get('/admin-stats', adminOnly, reportController.getAdminStats);

module.exports = router;
