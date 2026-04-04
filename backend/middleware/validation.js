const { body, validationResult } = require('express-validator');

exports.validateStock = [
    body('product_id')
        .isInt()
        .withMessage('product_id must be an integer'),
    body('quantity')
        .isInt({ min: 1, max: 1000 })
        .withMessage('quantity must be an integer between 1 and 1000'),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        next();
    }
];
