/**
 * Application Validation Error
 * Used for client-side and business logic validation failures.
 * Default HTTP status: 422 Unprocessable Entity
 */
class AppValidationError extends Error {
    constructor(message, errors = []) {
        super(message);
        this.name = 'AppValidationError';
        this.statusCode = 422;
        this.status = 422;
        this.errors = errors;
        Error.captureStackTrace(this, this.constructor);
    }
}

class AppNotFoundError extends Error {
    constructor(message = 'Resource not found') {
        super(message);
        this.name = 'AppNotFoundError';
        this.statusCode = 404;
        this.status = 404;
    }
}

module.exports = {
    AppValidationError,
    AppNotFoundError
};
