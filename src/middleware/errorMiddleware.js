/**
 * Global error-handling middleware.
 *
 * Must be registered LAST in the middleware chain (after all routes).
 * Express recognises it as an error handler because it has 4 parameters.
 */
export const errorHandler = (err, req, res, _next) => {
    console.error("Unhandled error:", err);

    const statusCode = err.statusCode || 500;
    const message = (process.env.NODE_ENV === "development" || err.isOperational)
        ? err.message
        : "An unexpected error occurred. Please try again later.";

    res.status(statusCode).json({
        success: false,
        message,
        ...(process.env.NODE_ENV === "development" && {
            stack: err.stack,
        }),
    });
};

/**
 * Catches requests to undefined routes.
 */
export const notFoundHandler = (req, res) => {
    res.status(404).json({
        success: false,
        message: `Route not found: ${req.method} ${req.originalUrl}`,
        error: "NOT_FOUND",
    });
};
