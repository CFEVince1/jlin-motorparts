const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.LOGIN_RATE_LIMIT_MAX 
        ? parseInt(process.env.LOGIN_RATE_LIMIT_MAX, 10) 
        : (process.env.NODE_ENV === 'production' ? 10 : 30), // Around 10 attempts in production to prevent password guessing
    message: { message: 'Too many login attempts from this IP, please try again after 15 minutes' },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

router.post('/login', loginLimiter, authController.login);
router.post('/logout', authController.logout);
router.get('/verify', authMiddleware, authController.verify);

module.exports = router;
