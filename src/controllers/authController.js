import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { sql } from "../db.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ─── POST /api/auth/register ──────────────────────────────────
export const register = async (req, res, next) => {
    try {
        const { full_name, email, password, phone, role } = req.body;

        // Check if email already exists
        const existing = await sql`
            SELECT id FROM users WHERE email = ${email}
        `;
        if (existing.length > 0) {
            return sendError(res, 409, "Email is already registered.", "EMAIL_EXISTS");
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Insert user
        const result = await sql`
            INSERT INTO users (full_name, email, password, phone, role)
            VALUES (${full_name}, ${email}, ${hashedPassword}, ${phone || null}, ${role || "patient"})
            RETURNING id, full_name, email, phone, role, is_active, created_at
        `;

        const user = result[0];

        // Generate JWT
        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: "24h" }
        );

        return sendSuccess(res, 201, "User registered successfully.", { user, token });
    } catch (error) {
        next(error);
    }
};

// ─── POST /api/auth/login ─────────────────────────────────────
export const login = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        // Find user
        const result = await sql`
            SELECT * FROM users WHERE email = ${email}
        `;
        if (result.length === 0) {
            return sendError(res, 401, "Invalid email or password.", "INVALID_CREDENTIALS");
        }

        const user = result[0];

        // Check active status
        if (!user.is_active) {
            return sendError(res, 403, "Account is deactivated.", "ACCOUNT_INACTIVE");
        }

        // Compare password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return sendError(res, 401, "Invalid email or password.", "INVALID_CREDENTIALS");
        }

        // Generate JWT
        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: "24h" }
        );

        // Strip password from response
        const { password: _, ...safeUser } = user;

        return sendSuccess(res, 200, "Login successful.", { user: safeUser, token });
    } catch (error) {
        next(error);
    }
};

// ─── GET /api/auth/me ─────────────────────────────────────────
export const getMe = async (req, res, next) => {
    try {
        const result = await sql`
            SELECT id, full_name, email, phone, role, is_active, created_at, updated_at
            FROM users
            WHERE id = ${req.user.id}
        `;

        if (result.length === 0) {
            return sendError(res, 404, "User not found.", "USER_NOT_FOUND");
        }

        return sendSuccess(res, 200, "User profile retrieved.", { user: result[0] });
    } catch (error) {
        next(error);
    }
};
