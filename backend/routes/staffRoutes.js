const express = require('express');
const router = express.Router();
const staffController = require('../controllers/staffController');
const recoveryController = require('../controllers/recoveryController');
const { authenticateToken } = require('../middleware/auth');
const roleMiddleware = require('../middleware/roleMiddleware');

const adminOnly = roleMiddleware(['admin']);

// PATCH /api/staff/profile
router.patch('/profile', authenticateToken, staffController.updateProfile);

// Recovery email (admin only)
router.get('/email', authenticateToken, adminOnly, recoveryController.getEmailStatus);
router.post('/email/request', authenticateToken, adminOnly, recoveryController.requestEmailVerification);
router.post('/email/confirm', authenticateToken, adminOnly, recoveryController.confirmEmailVerification);

module.exports = router;
