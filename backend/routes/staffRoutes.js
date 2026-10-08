const express = require('express');
const router = express.Router();
const staffController = require('../controllers/staffController');
const { authenticateToken } = require('../middleware/auth');

// PATCH /api/staff/profile
router.patch('/profile', authenticateToken, staffController.updateProfile);

module.exports = router;
