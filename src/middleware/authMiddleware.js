import jwt from "jsonwebtoken";
import { sendError } from "../utils/response.js";

/**
 * Verifies the JWT from the Authorization header.
 * On success attaches decoded payload to req.user.
 *
 * Expected header format:  Authorization: Bearer <token>
 */
export const authenticate = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return sendError(res, 401, "Access denied. No token provided.", "NO_TOKEN");
        }

        const token = authHeader.split(" ")[1];

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Attach user info to request object
        req.user = {
            id: decoded.id,
            email: decoded.email,
            role: decoded.role,
        };

        next();
    } catch (error) {
        if (error.name === "TokenExpiredError") {
            return sendError(res, 401, "Token has expired.", "TOKEN_EXPIRED");
        }
        if (error.name === "JsonWebTokenError") {
            return sendError(res, 401, "Invalid token.", "INVALID_TOKEN");
        }
        return sendError(res, 500, "Authentication error.", "AUTH_ERROR");
    }
};
