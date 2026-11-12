const express = require('express');
const router = express.Router();
const cashFloatController = require('../controllers/cashFloatController');
const { authenticateToken } = require('../middleware/auth');
const roleMiddleware = require('../middleware/roleMiddleware');

const adminOnly = roleMiddleware(['admin']);

// All routes require authentication
router.use(authenticateToken);

// Staff & Cashier routes: Shift Management
router.get('/my-float', cashFloatController.getMyCashFloat);
router.get('/active-shift', cashFloatController.getActiveShift);
router.post('/open-shift', cashFloatController.openShift);
router.post('/petty-cash', cashFloatController.recordPettyCashExpense);
router.post('/close-shift', cashFloatController.closeShiftBlindCount);

// Admin-only routes
router.get('/staff-list', adminOnly, cashFloatController.getStaffList);
router.get('/summary', adminOnly, cashFloatController.getSummary);
router.get('/', adminOnly, cashFloatController.getCashFloats);
router.post('/assign', adminOnly, cashFloatController.assignCashFloat);
router.post('/:id/sign-off', adminOnly, cashFloatController.adminSignOff);
router.post('/:id/cancel', adminOnly, cashFloatController.cancelShift);
router.post('/:id/reopen', adminOnly, cashFloatController.reopenShift);
router.post('/:id/cash-drop', cashFloatController.logCashDrop);
router.get('/:id', adminOnly, cashFloatController.getCashFloatById);
router.put('/:id', adminOnly, cashFloatController.updateCashFloat);
router.put('/:id/reconcile', adminOnly, cashFloatController.reconcileShift);
router.put('/:id/return', adminOnly, cashFloatController.returnCashFloat);

module.exports = router;
