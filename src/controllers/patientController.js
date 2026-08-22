import { sql } from "../db.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ─── POST /api/patients ───────────────────────────────────────────────────
export const createPatient = async (req, res, next) => {
    try {
        const {
            user_id,
            date_of_birth,
            gender,
            blood_group,
            address,
            district,
            known_conditions,
        } = req.body;

        // Validate required fields
        if (!date_of_birth && !gender && !address) {
            return sendError(
                res,
                400,
                "At least one patient detail (date_of_birth, gender, or address) is required.",
                "VALIDATION_ERROR"
            );
        }

        // Validate gender if provided
        const validGenders = ["male", "female", "other"];
        if (gender && !validGenders.includes(gender.toLowerCase())) {
            return sendError(
                res,
                400,
                "Gender must be one of: male, female, other.",
                "VALIDATION_ERROR"
            );
        }

        // If user_id is supplied, verify the user exists
        if (user_id) {
            const userCheck = await sql`
                SELECT id FROM users WHERE id = ${user_id}
            `;
            if (userCheck.length === 0) {
                return sendError(res, 404, "Supplied user_id does not exist.", "USER_NOT_FOUND");
            }
        }

        const result = await sql`
            INSERT INTO patients (
                user_id, date_of_birth, gender, blood_group,
                address, district, known_conditions
            )
            VALUES (
                ${user_id || null},
                ${date_of_birth || null},
                ${gender ? gender.toLowerCase() : null},
                ${blood_group || null},
                ${address || null},
                ${district || null},
                ${known_conditions || null}
            )
            RETURNING *
        `;

        return sendSuccess(res, 201, "Patient registered successfully.", {
            patient: result[0],
        });
    } catch (error) {
        next(error);
    }
};

// ─── GET /api/patients/search ─────────────────────────────────────────────
// NOTE: Must be registered BEFORE GET /api/patients/:id
export const searchPatients = async (req, res, next) => {
    try {
        const { name, phone, email, patient_id, district } = req.query;

        if (!name && !phone && !email && !patient_id && !district) {
            return sendError(
                res,
                400,
                "At least one search parameter is required: name, phone, email, patient_id, or district.",
                "VALIDATION_ERROR"
            );
        }

        let patients;

        if (patient_id) {
            // Direct ID lookup
            const idNum = parseInt(patient_id, 10);
            if (isNaN(idNum)) {
                return sendError(res, 400, "patient_id must be a valid integer.", "VALIDATION_ERROR");
            }
            patients = await sql`
                SELECT
                    p.id, p.user_id, p.date_of_birth, p.gender, p.blood_group,
                    p.address, p.district, p.known_conditions, p.created_at, p.updated_at,
                    u.full_name, u.email, u.phone
                FROM patients p
                LEFT JOIN users u ON u.id = p.user_id
                WHERE p.id = ${idNum}
            `;
        } else if (email) {
            patients = await sql`
                SELECT
                    p.id, p.user_id, p.date_of_birth, p.gender, p.blood_group,
                    p.address, p.district, p.known_conditions, p.created_at, p.updated_at,
                    u.full_name, u.email, u.phone
                FROM patients p
                LEFT JOIN users u ON u.id = p.user_id
                WHERE u.email ILIKE ${"%" + email + "%"}
                ORDER BY p.created_at DESC
            `;
        } else if (phone) {
            patients = await sql`
                SELECT
                    p.id, p.user_id, p.date_of_birth, p.gender, p.blood_group,
                    p.address, p.district, p.known_conditions, p.created_at, p.updated_at,
                    u.full_name, u.email, u.phone
                FROM patients p
                LEFT JOIN users u ON u.id = p.user_id
                WHERE u.phone ILIKE ${"%" + phone + "%"}
                ORDER BY p.created_at DESC
            `;
        } else if (name) {
            patients = await sql`
                SELECT
                    p.id, p.user_id, p.date_of_birth, p.gender, p.blood_group,
                    p.address, p.district, p.known_conditions, p.created_at, p.updated_at,
                    u.full_name, u.email, u.phone
                FROM patients p
                LEFT JOIN users u ON u.id = p.user_id
                WHERE u.full_name ILIKE ${"%" + name + "%"}
                ORDER BY p.created_at DESC
            `;
        } else if (district) {
            patients = await sql`
                SELECT
                    p.id, p.user_id, p.date_of_birth, p.gender, p.blood_group,
                    p.address, p.district, p.known_conditions, p.created_at, p.updated_at,
                    u.full_name, u.email, u.phone
                FROM patients p
                LEFT JOIN users u ON u.id = p.user_id
                WHERE p.district ILIKE ${"%" + district + "%"}
                ORDER BY p.created_at DESC
            `;
        }

        return sendSuccess(res, 200, "Patient search results.", {
            count: patients.length,
            patients,
        });
    } catch (error) {
        next(error);
    }
};

// ─── GET /api/patients/:id ────────────────────────────────────────────────
export const getPatient = async (req, res, next) => {
    try {
        const { id } = req.params;

        const idNum = parseInt(id, 10);
        if (isNaN(idNum)) {
            return sendError(res, 400, "Patient ID must be a valid integer.", "VALIDATION_ERROR");
        }

        const result = await sql`
            SELECT
                p.id, p.user_id, p.date_of_birth, p.gender, p.blood_group,
                p.address, p.district, p.known_conditions, p.created_at, p.updated_at,
                u.full_name, u.email, u.phone
            FROM patients p
            LEFT JOIN users u ON u.id = p.user_id
            WHERE p.id = ${idNum}
        `;

        if (result.length === 0) {
            return sendError(res, 404, "Patient not found.", "PATIENT_NOT_FOUND");
        }

        const patient = result[0];

        // Authorization: patients can only view their own record
        if (
            req.user.role === "patient" &&
            patient.user_id !== req.user.id
        ) {
            return sendError(
                res,
                403,
                "You are not authorized to view this patient record.",
                "FORBIDDEN"
            );
        }

        return sendSuccess(res, 200, "Patient retrieved.", { patient });
    } catch (error) {
        next(error);
    }
};

// ─── PATCH /api/patients/:id ──────────────────────────────────────────────
export const updatePatient = async (req, res, next) => {
    try {
        const { id } = req.params;

        const idNum = parseInt(id, 10);
        if (isNaN(idNum)) {
            return sendError(res, 400, "Patient ID must be a valid integer.", "VALIDATION_ERROR");
        }

        // Check the patient exists
        const existing = await sql`
            SELECT id, user_id FROM patients WHERE id = ${idNum}
        `;
        if (existing.length === 0) {
            return sendError(res, 404, "Patient not found.", "PATIENT_NOT_FOUND");
        }

        // Authorization: patients can only update their own record
        if (
            req.user.role === "patient" &&
            existing[0].user_id !== req.user.id
        ) {
            return sendError(
                res,
                403,
                "You are not authorized to update this patient record.",
                "FORBIDDEN"
            );
        }

        const {
            date_of_birth,
            gender,
            blood_group,
            address,
            district,
            known_conditions,
        } = req.body;

        // Validate gender if provided
        if (gender) {
            const validGenders = ["male", "female", "other"];
            if (!validGenders.includes(gender.toLowerCase())) {
                return sendError(
                    res,
                    400,
                    "Gender must be one of: male, female, other.",
                    "VALIDATION_ERROR"
                );
            }
        }

        const result = await sql`
            UPDATE patients
            SET
                date_of_birth    = COALESCE(${date_of_birth || null}, date_of_birth),
                gender           = COALESCE(${gender ? gender.toLowerCase() : null}, gender),
                blood_group      = COALESCE(${blood_group || null}, blood_group),
                address          = COALESCE(${address || null}, address),
                district         = COALESCE(${district || null}, district),
                known_conditions = COALESCE(${known_conditions || null}, known_conditions),
                updated_at       = CURRENT_TIMESTAMP
            WHERE id = ${idNum}
            RETURNING *
        `;

        return sendSuccess(res, 200, "Patient updated successfully.", {
            patient: result[0],
        });
    } catch (error) {
        next(error);
    }
};
