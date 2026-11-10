const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticateToken } = require('../middleware/auth');
const roleMiddleware = require('../middleware/roleMiddleware');

// Only admin can manage users & role permissions
router.use(authenticateToken);
router.use(roleMiddleware(['admin']));

router.get('/roles/permissions', userController.getRolePermissions);
router.put('/roles/permissions', userController.updateRolePermissions);

router.get('/', userController.getAllUsers);
router.post('/', userController.createUser);
router.put('/:id/toggle-status', userController.toggleUserStatus);
router.put('/:id', userController.updateUser);
router.delete('/:id', userController.deleteUser);

module.exports = router;
