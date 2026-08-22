import { sql } from "../db.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ─── GET /api/doctors ─────────────────────────────────────────
export const listDoctors = async (req, res, next) => {
    try {
        const { facility_id, specialization } = req.query;

        let doctors;

        if (facility_id && specialization) {
            doctors = await sql`
                SELECT d.id, d.specialization, d.availability,
                       d.facility_id, d.created_at,
                       u.id AS user_id, u.full_name, u.email, u.phone,
                       f.name AS facility_name, f.facility_type
                FROM doctors d
                JOIN users u ON u.id = d.user_id
                LEFT JOIN facilities f ON f.id = d.facility_id
                WHERE d.facility_id = ${facility_id}
                  AND d.specialization ILIKE ${"%" + specialization + "%"}
                ORDER BY u.full_name
            `;
        } else if (facility_id) {
            doctors = await sql`
                SELECT d.id, d.specialization, d.availability,
                       d.facility_id, d.created_at,
                       u.id AS user_id, u.full_name, u.email, u.phone,
                       f.name AS facility_name, f.facility_type
                FROM doctors d
                JOIN users u ON u.id = d.user_id
                LEFT JOIN facilities f ON f.id = d.facility_id
                WHERE d.facility_id = ${facility_id}
                ORDER BY u.full_name
            `;
        } else if (specialization) {
            doctors = await sql`
                SELECT d.id, d.specialization, d.availability,
                       d.facility_id, d.created_at,
                       u.id AS user_id, u.full_name, u.email, u.phone,
                       f.name AS facility_name, f.facility_type
                FROM doctors d
                JOIN users u ON u.id = d.user_id
                LEFT JOIN facilities f ON f.id = d.facility_id
                WHERE d.specialization ILIKE ${"%" + specialization + "%"}
                ORDER BY u.full_name
            `;
        } else {
            doctors = await sql`
                SELECT d.id, d.specialization, d.availability,
                       d.facility_id, d.created_at,
                       u.id AS user_id, u.full_name, u.email, u.phone,
                       f.name AS facility_name, f.facility_type
                FROM doctors d
                JOIN users u ON u.id = d.user_id
                LEFT JOIN facilities f ON f.id = d.facility_id
                ORDER BY u.full_name
            `;
        }

        return sendSuccess(res, 200, "Doctors retrieved.", {
            count: doctors.length,
            doctors,
        });
    } catch (error) {
        next(error);
    }
};

// ─── GET /api/doctors/:id ─────────────────────────────────────
export const getDoctor = async (req, res, next) => {
    try {
        const { id } = req.params;

        const result = await sql`
            SELECT d.id, d.specialization, d.availability,
                   d.facility_id, d.created_at, d.updated_at,
                   u.id AS user_id, u.full_name, u.email, u.phone,
                   f.name AS facility_name, f.facility_type, f.district
            FROM doctors d
            JOIN users u ON u.id = d.user_id
            LEFT JOIN facilities f ON f.id = d.facility_id
            WHERE d.id = ${id}
        `;

        if (result.length === 0) {
            return sendError(res, 404, "Doctor not found.", "DOCTOR_NOT_FOUND");
        }

        return sendSuccess(res, 200, "Doctor retrieved.", { doctor: result[0] });
    } catch (error) {
        next(error);
    }
};

// ─── POST /api/doctors ────────────────────────────────────────
export const createDoctor = async (req, res, next) => {
    try {
        const { user_id, facility_id, specialization, availability } = req.body;

        // Verify user exists and has role 'doctor'
        const userCheck = await sql`
            SELECT id, role FROM users WHERE id = ${user_id}
        `;
        if (userCheck.length === 0) {
            return sendError(res, 404, "User not found.", "USER_NOT_FOUND");
        }
        if (userCheck[0].role !== "doctor") {
            return sendError(res, 400, "User does not have the doctor role.", "INVALID_ROLE");
        }

        // Check if doctor profile already exists for this user
        const existingDoctor = await sql`
            SELECT id FROM doctors WHERE user_id = ${user_id}
        `;
        if (existingDoctor.length > 0) {
            return sendError(res, 409, "Doctor profile already exists for this user.", "DOCTOR_EXISTS");
        }

        // Verify facility exists if provided
        if (facility_id) {
            const facilityCheck = await sql`
                SELECT id FROM facilities WHERE id = ${facility_id}
            `;
            if (facilityCheck.length === 0) {
                return sendError(res, 404, "Facility not found.", "FACILITY_NOT_FOUND");
            }
        }

        const result = await sql`
            INSERT INTO doctors (user_id, facility_id, specialization, availability)
            VALUES (
                ${user_id},
                ${facility_id || null},
                ${specialization || null},
                ${availability || null}
            )
            RETURNING *
        `;

        return sendSuccess(res, 201, "Doctor profile created successfully.", {
            doctor: result[0],
        });
    } catch (error) {
        next(error);
    }
};

// ─── PATCH /api/doctors/:id ───────────────────────────────────
export const updateDoctor = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { facility_id, specialization, availability } = req.body;

        // Doctors can only update their own profile, unless admin
        const doctorRecord = await sql`
            SELECT user_id FROM doctors WHERE id = ${id}
        `;
        if (doctorRecord.length === 0) {
            return sendError(res, 404, "Doctor not found.", "DOCTOR_NOT_FOUND");
        }

        if (
            req.user.id !== doctorRecord[0].user_id &&
            req.user.role !== "facility_admin" &&
            req.user.role !== "district_admin"
        ) {
            return sendError(res, 403, "You can only update your own profile.", "FORBIDDEN");
        }

        const result = await sql`
            UPDATE doctors
            SET
                facility_id    = COALESCE(${facility_id || null}, facility_id),
                specialization = COALESCE(${specialization || null}, specialization),
                availability   = COALESCE(${availability || null}, availability),
                updated_at     = CURRENT_TIMESTAMP
            WHERE id = ${id}
            RETURNING *
        `;

        return sendSuccess(res, 200, "Doctor profile updated successfully.", {
            doctor: result[0],
        });
    } catch (error) {
        next(error);
    }
};
