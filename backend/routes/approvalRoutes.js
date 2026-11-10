const express = require('express');
const router = express.Router();
const approvalController = require('../controllers/approvalController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

const adminOnly = roleMiddleware(['admin', 'Admin']);

// All approval routes require valid JWT authentication
router.use(authMiddleware);

// 1. Get approvals list (Admin or Cashier view)
router.get('/', approvalController.getApprovals);

// 2. Get approval stats (Pending counts by category)
router.get('/stats', approvalController.getApprovalStats);

// 3. Cashier creates approval request (Void/Refund, Discount, Price Override)
router.post('/', approvalController.createApprovalRequest);

// 4. Admin PIN / Password Instant Override
router.post('/verify-pin', approvalController.verifyAdminPin);

// 4.1 Request POS Discount OTP to Admin Gmail
router.post('/discount-otp/request', approvalController.requestDiscountOtp);

// 4.2 Verify POS Discount OTP
router.post('/discount-otp/verify', approvalController.verifyDiscountOtp);

// 5. Admin Approve request
router.post('/:id/approve', adminOnly, approvalController.approveRequest);

// 6. Admin Reject request
router.post('/:id/reject', adminOnly, approvalController.rejectRequest);

module.exports = router;
