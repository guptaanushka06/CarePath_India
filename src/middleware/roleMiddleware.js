import { sendError } from "../utils/response.js";

/**
 * Role-based authorization middleware factory.
 *
 * Usage:
 *   authorize("doctor", "facility_admin")
 *
 * Must be used AFTER authenticate middleware so req.user exists.
 */
export const authorize = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return sendError(res, 401, "Authentication required.", "NOT_AUTHENTICATED");
        }

        if (!allowedRoles.includes(req.user.role)) {
            return sendError(
                res,
                403,
                "You do not have permission to access this resource.",
                "FORBIDDEN"
            );
        }

        next();
    };
};
