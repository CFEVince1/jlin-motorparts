const roleMiddleware = (allowedRoles) => {
    return (req, res, next) => {
        const userRole = String(req.user?.role || '').toLowerCase();
        const allowed = allowedRoles.map(r => String(r).toLowerCase());
        if (!req.user || !allowed.includes(userRole)) {
            return res.status(403).json({ message: 'Access denied: Insufficient permissions' });
        }
        next();
    };
};

module.exports = roleMiddleware;
