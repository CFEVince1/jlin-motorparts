const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

router.use(authMiddleware);

// All authenticated users can GET products
router.get('/', productController.getAllProducts);

// Only admin can create, update, delete
const adminOnly = roleMiddleware(['admin']);
router.post('/', adminOnly, productController.createProduct);
router.put('/:id', adminOnly, productController.updateProduct);
router.delete('/:id', adminOnly, productController.deleteProduct);
router.get('/:id/serials', productController.getProductSerials);

module.exports = router;
