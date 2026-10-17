require('dotenv').config();

// Critical startup validation: verify JWT_SECRET is configured
function validateStartupEnv(env = process.env) {
    if (!env.JWT_SECRET || !String(env.JWT_SECRET).trim()) {
        const errorMsg = 'FATAL: JWT_SECRET environment variable is missing or empty. Server cannot start securely without a configured JWT_SECRET.';
        return { valid: false, message: errorMsg };
    }
    return { valid: true };
}

const startupCheck = validateStartupEnv();
if (!startupCheck.valid) {
    console.error(startupCheck.message);
    if (process.env.NODE_ENV !== 'test') {
        process.exit(1);
    }
}

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

// Exact allowed frontend URLs and verified project previews
const isAllowedExactOrigin = (origin) => {
  // 1. Allow local development
  if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
    return true;
  }

  // 2. Allow custom FRONTEND_URL if defined
  if (allowedCustomOrigins.includes(origin)) {
    return true;
  }

  // 3. Allow exact production domain
  if (origin === 'https://jlin-motorparts.vercel.app') {
    return true;
  }

  // 4. Allow official Vercel preview deployments strictly matching this project
  if (
    /^https:\/\/jlin-motorparts(-[a-zA-Z0-9]+)?-cfevince1s-projects\.vercel\.app$/.test(origin) ||
    /^https:\/\/jlin-motorparts-[a-zA-Z0-9]+-cfevince1\.vercel\.app$/.test(origin) ||
    /^https:\/\/jlin-motorparts(-[a-zA-Z0-9-]+)?\.vercel\.app$/.test(origin)
  ) {
    return true;
  }

  return false;
};

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    // Allow server-to-server, curl, Postman or same-origin requests with no origin
    if (!origin) return callback(null, true);
    
    if (isAllowedExactOrigin(origin)) {
      return callback(null, true);
    }
    
    // Reject any unauthorized origin (e.g. arbitrary other *.vercel.app apps)
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

    // Always log the full technical error details and stack trace on the server console
    console.error('[Internal Server Error Details]:', err);

    // Determine status code
    const status = (typeof err.status === 'number' && err.status >= 400 && err.status < 500)
        ? err.status
        : ((typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 500)
            ? err.statusCode
            : 500);

    // If it's a 500 or contains database / SQL internals, return a generic message
    const hasDatabaseInternals = Boolean(
        err.sql || err.sqlMessage || err.sqlState ||
        (typeof err.code === 'string' && (err.code.startsWith('ER_') || err.code.startsWith('PROTOCOL_'))) ||
        (err.message && /sql|select|insert|update|delete|table|column|foreign key|constraint|database|syntax error/i.test(err.message))
    );

    if (status >= 500 || hasDatabaseInternals) {
        return res.status(500).json({ 
            message: 'An internal server error occurred. Please try again later.' 
        });
    }

    res.status(status).json({ 
        message: err.message || 'An error occurred' 
    });
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}

module.exports = app;
module.exports.validateStartupEnv = validateStartupEnv;

