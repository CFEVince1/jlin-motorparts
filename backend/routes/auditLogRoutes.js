const express = require('express');
const router = express.Router();
const auditLogController = require('../controllers/auditLogController');
const { authenticateToken } = require('../middleware/auth');
const roleMiddleware = require('../middleware/roleMiddleware');

router.use(authenticateToken);
// Only Admin can view the Audit Log
router.use(roleMiddleware(['admin']));

router.get('/summary', auditLogController.getAuditSummary);
router.get('/', auditLogController.getAuditLogs);

module.exports = router;
