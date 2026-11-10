const express = require('express');
const router = express.Router();
const restockController = require('../controllers/restockRequestController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

const adminOnly = roleMiddleware(['admin', 'Admin']);

// All routes require authentication
router.use(authMiddleware);

// 1. Get restock requests (Filtered by status, etc.)
router.get('/', restockController.getRestockRequests);

// 2. Staff creates / submits a restock request (single or bulk)
router.post('/', restockController.createRestockRequest);
router.post('/bulk', restockController.createRestockRequest);

// 3. Admin approves restock request (and optionally generates PO)
router.post('/:id/approve', adminOnly, restockController.approveRestockRequest);

// 4. Admin rejects restock request
router.post('/:id/reject', adminOnly, restockController.rejectRestockRequest);

module.exports = router;
