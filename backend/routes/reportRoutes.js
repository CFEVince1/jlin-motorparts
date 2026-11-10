const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { authenticateToken } = require('../middleware/auth');
const roleMiddleware = require('../middleware/roleMiddleware');

router.use(authenticateToken);

// Only Admin can view reports
const adminOnly = roleMiddleware(['admin']);

// Allow staff to view their daily sales and global low stock
router.get('/dashboard-summary', reportController.getDashboardSummary);
router.get('/daily', reportController.getDailySales);
router.get('/monthly', adminOnly, reportController.getMonthlySales);
router.get('/low-stock', reportController.getLowStock);
router.get('/best-selling', reportController.getBestSelling);
router.get('/sales-by-motorcycle', adminOnly, reportController.getSalesByMotorcycle);

router.get('/by-cashier', adminOnly, reportController.getSalesByCashier);
router.get('/staff-today', adminOnly, reportController.getStaffTodaySales);
router.get('/categories', adminOnly, reportController.getCategories);
router.get('/brands', reportController.getBrands);

// Admin Dashboard stats
router.get('/admin-stats', adminOnly, reportController.getAdminStats);

// Module 1: Owner Command Center Dashboard (P&L, Low Stock Alerts, Payment Approvals & Pending Payments Tracker)
router.get('/owner-dashboard', reportController.getOwnerDashboardData);
router.post('/verify-customer-gcash/:id', adminOnly, reportController.verifyCustomerGCashPayment);
router.post('/reject-customer-gcash/:id', adminOnly, reportController.rejectCustomerGCashPayment);
router.post('/settle-customer-balance/:id', adminOnly, reportController.settleCustomerBalancePayment);
router.post('/approve-supplier-po-payment/:id', adminOnly, reportController.approveSupplierPOPayment);
router.post('/reject-supplier-po-payment/:id', adminOnly, reportController.rejectSupplierPOPayment);
router.post('/confirm-supplier-cod/:id', adminOnly, reportController.confirmSupplierCODPayment);
router.post('/create-quick-po', adminOnly, reportController.createQuickPurchaseOrder);
router.post('/create-quick-purchase-order', adminOnly, reportController.createQuickPurchaseOrder);

// Non-sales adjustments report
router.get('/adjustments', adminOnly, reportController.getAdjustmentsReport);


// Module 6 & 9: Reports & Analytics (Admin Only)
router.get('/sales-net-profit', adminOnly, reportController.getSalesNetProfitReport);
router.get('/fast-moving-dead-stock', adminOnly, reportController.getFastMovingDeadStockReport);
router.get('/stock-card-valuation', adminOnly, reportController.getStockCardValuationReport);
router.get('/fb-supplier-spend-price-history', adminOnly, reportController.getFBSupplierSpendPriceHistoryReport);
router.get('/return-defect-loss', adminOnly, reportController.getReturnDefectLossReport);
router.get('/expenses-cashflow', adminOnly, reportController.getExpensesAndCashFlowReport);
router.post('/expenses', adminOnly, reportController.createOperatingExpense);

module.exports = router;
