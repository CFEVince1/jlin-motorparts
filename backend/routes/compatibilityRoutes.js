const express = require('express');
const router = express.Router();
const compatibilityController = require('../controllers/compatibilityController');
const { authenticateToken } = require('../middleware/auth');
const roleMiddleware = require('../middleware/roleMiddleware');

router.use(authenticateToken);

// Accessible by all authenticated staff & admins
router.get('/options', compatibilityController.getCompatibilityOptions);
router.get('/search', compatibilityController.searchCompatibility);

// Admin-only management routes
const adminOnly = roleMiddleware(['admin']);

// Motorcycle Units CRUD
router.get('/motorcycle-units', adminOnly, compatibilityController.getMotorcycleUnits);
router.post('/motorcycle-units', adminOnly, compatibilityController.createMotorcycleUnit);
router.put('/motorcycle-units/:id', adminOnly, compatibilityController.updateMotorcycleUnit);
router.delete('/motorcycle-units/:id', adminOnly, compatibilityController.deleteMotorcycleUnit);

// Compatibility Groups CRUD
router.get('/groups', adminOnly, compatibilityController.getCompatibilityGroups);
router.post('/groups', adminOnly, compatibilityController.createCompatibilityGroup);
router.put('/groups/:id', adminOnly, compatibilityController.updateCompatibilityGroup);
router.delete('/groups/:id', adminOnly, compatibilityController.deleteCompatibilityGroup);

module.exports = router;
