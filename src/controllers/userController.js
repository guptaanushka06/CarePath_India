import { sql } from "../db.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ─── GET /api/users/:id ───────────────────────────────────────
export const getUser = async (req, res, next) => {
    try {
        const { id } = req.params;

        const result = await sql`
            SELECT id, full_name, email, phone, role, is_active, created_at, updated_at
            FROM users
            WHERE id = ${id}
        `;

        if (result.length === 0) {
            return sendError(res, 404, "User not found.", "USER_NOT_FOUND");
        }

        return sendSuccess(res, 200, "User retrieved.", { user: result[0] });
    } catch (error) {
        next(error);
    }
};

// ─── PATCH /api/users/:id ─────────────────────────────────────
export const updateUser = async (req, res, next) => {
    try {
        const { id } = req.params;

        // Users can only update their own profile, unless they are admin
        if (
            req.user.id !== parseInt(id) &&
            req.user.role !== "district_admin" &&
            req.user.role !== "facility_admin"
        ) {
            return sendError(res, 403, "You can only update your own profile.", "FORBIDDEN");
        }

        const { full_name, phone } = req.body;

        const result = await sql`
            UPDATE users
            SET
                full_name = COALESCE(${full_name || null}, full_name),
                phone     = COALESCE(${phone || null}, phone),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ${id}
            RETURNING id, full_name, email, phone, role, is_active, created_at, updated_at
        `;

        if (result.length === 0) {
            return sendError(res, 404, "User not found.", "USER_NOT_FOUND");
        }

        return sendSuccess(res, 200, "User updated successfully.", { user: result[0] });
    } catch (error) {
        next(error);
    }
};
