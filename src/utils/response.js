/**
 * Standard API response helpers.
 *
 * Success: { success: true, message, data }
 * Error:   { success: false, message, error }
 */

export const sendSuccess = (res, statusCode, message, data = null) => {
    const response = { success: true, message };
    if (data !== null) response.data = data;
    return res.status(statusCode).json(response);
};

export const sendError = (res, statusCode, message, errorCode = null) => {
    const response = { success: false, message };
    if (errorCode) response.error = errorCode;
    return res.status(statusCode).json(response);
};
