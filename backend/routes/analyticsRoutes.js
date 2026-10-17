const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

router.use(authMiddleware);

const adminOnly = roleMiddleware(['admin']);

router.get('/dashboard', adminOnly, analyticsController.getDashboardData);

module.exports = router;

