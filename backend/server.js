require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { AppValidationError, AppNotFoundError } = require('./utils/errors');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 5000;

// Allowed origins configuration
const allowedCustomOrigins = process.env.FRONTEND_URL 
  ? process.env.FRONTEND_URL.split(',').map(o => o.trim()).filter(Boolean)
  : [];

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    // Allow server-to-server, curl, Postman or same-origin requests with no origin
    if (!origin) return callback(null, true);
    
    // Allow local development
    if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
      return callback(null, true);
    }
    
    // Allow custom FRONTEND_URL if defined
    if (allowedCustomOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // Allow official production frontend and Vercel preview deployments
    if (
      origin === 'https://jlin-motorparts.vercel.app' ||
      /^https:\/\/jlin-motorparts(-[a-z0-9-]+)?\.vercel\.app$/.test(origin) ||
      origin.endsWith('.vercel.app')
    ) {
      return callback(null, true);
    }
    
    // In production, reject disallowed origins
    if (process.env.NODE_ENV === 'production') {
      return callback(new Error('Not allowed by CORS'));
    }

    // Default reject in development for unknown origins as well
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true 
}));
app.use(express.json());
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"]
        }
    },
    hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true
    }
}));

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/staff', require('./routes/staffRoutes'));
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/items', require('./routes/itemRoutes'));
app.use('/api/inventory', require('./routes/inventoryRoutes'));
app.use('/api/sales', require('./routes/salesRoutes'));
app.use('/api/reports', require('./routes/reportRoutes'));
app.use('/api/analytics', require('./routes/analyticsRoutes'));
app.use('/api/compatibility', require('./routes/compatibilityRoutes'));
app.use('/api/suppliers', require('./routes/supplierRoutes'));

// Basic health check
app.get('/', (req, res) => {
    res.send('JLIN Motorcycle Parts API is running');
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'jlin-inventory-api', timestamp: new Date().toISOString() });
});

// Centralized error handling middleware
app.use((err, req, res, next) => {
    if (err.message === 'Not allowed by CORS') {
        return res.status(403).json({
            error: 'Forbidden',
            message: 'Origin not allowed by CORS'
        });
    }

    if (err instanceof AppValidationError || err.name === 'AppValidationError' || err.statusCode === 422 || err.status === 422) {
        return res.status(err.statusCode || 422).json({
            error: err.message,
            message: err.message,
            errors: err.errors || []
        });
    }

    if (err instanceof AppNotFoundError || err.name === 'AppNotFoundError' || err.statusCode === 404 || err.status === 404) {
        return res.status(404).json({ message: err.message });
    }

    console.error('Unhandled server error:', err);
    res.status(err.status || 500).json({ 
        message: err.message || 'Something went wrong on the server' 
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
