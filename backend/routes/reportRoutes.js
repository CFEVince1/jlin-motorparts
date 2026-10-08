const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { authenticateToken } = require('../middleware/auth');
const roleMiddleware = require('../middleware/roleMiddleware');

router.use(authenticateToken);

// Only Admin can view reports
const adminOnly = roleMiddleware(['admin']);

// Allow staff to view their daily sales and global low stock
router.get('/daily', reportController.getDailySales);
router.get('/monthly', adminOnly, reportController.getMonthlySales);
router.get('/low-stock', reportController.getLowStock);
router.get('/best-selling', adminOnly, reportController.getBestSelling);
router.get('/sales-by-motorcycle', adminOnly, reportController.getSalesByMotorcycle);

router.get('/by-cashier', adminOnly, reportController.getSalesByCashier);
router.get('/categories', adminOnly, reportController.getCategories);
router.get('/brands', adminOnly, reportController.getBrands);

// Admin Dashboard stats
router.get('/admin-stats', adminOnly, reportController.getAdminStats);

// Non-sales adjustments report
router.get('/adjustments', adminOnly, reportController.getAdjustmentsReport);

module.exports = router;
