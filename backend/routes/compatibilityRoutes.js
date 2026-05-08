const express = require('express');
const router = express.Router();
const compatibilityController = require('../controllers/compatibilityController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

router.use(authMiddleware);

// Only admin can manage compatibility structures
const adminOnly = roleMiddleware(['admin']);
router.use(adminOnly);

// Motorcycle Units CRUD
router.get('/motorcycle-units', compatibilityController.getMotorcycleUnits);
router.post('/motorcycle-units', compatibilityController.createMotorcycleUnit);
router.put('/motorcycle-units/:id', compatibilityController.updateMotorcycleUnit);
router.delete('/motorcycle-units/:id', compatibilityController.deleteMotorcycleUnit);

// Compatibility Groups CRUD
router.get('/groups', compatibilityController.getCompatibilityGroups);
router.post('/groups', compatibilityController.createCompatibilityGroup);
router.put('/groups/:id', compatibilityController.updateCompatibilityGroup);
router.delete('/groups/:id', compatibilityController.deleteCompatibilityGroup);

module.exports = router;
