const express = require('express');
const router = express.Router();
const staffController = require('../controllers/staffController');
const { authenticateToken } = require('../middleware/auth');
const roleMiddleware = require('../middleware/roleMiddleware');

// PATCH /api/staff/profile
router.patch('/profile', authenticateToken, staffController.updateProfile);

// POST /api/staff/recovery-codes (admin only)
router.post(
  '/recovery-codes',
  authenticateToken,
  roleMiddleware(['admin']),
  staffController.generateRecoveryCodes
);

module.exports = router;
