import { sql } from "../db.js";
import { sendSuccess, sendError } from "../utils/response.js";

const VALID_STATUSES = ["pending", "completed", "cancelled"];

// ─── POST /api/followups ──────────────────────────────────────────────────
export const createFollowup = async (req, res, next) => {
    try {
        const {
            patient_id,
            doctor_id,
            facility_id,
            followup_date,
            reason,
            notes,
        } = req.body;

        // Validate required fields
        if (!patient_id) {
            return sendError(res, 400, "patient_id is required.", "VALIDATION_ERROR");
        }
        if (!followup_date) {
            return sendError(res, 400, "followup_date is required.", "VALIDATION_ERROR");
        }

        const patientIdNum = parseInt(patient_id, 10);
        if (isNaN(patientIdNum)) {
            return sendError(res, 400, "patient_id must be a valid integer.", "VALIDATION_ERROR");
        }

        // Validate date format
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(followup_date)) {
            return sendError(
                res,
                400,
                "followup_date must be in YYYY-MM-DD format.",
                "VALIDATION_ERROR"
            );
        }

        // Verify patient exists
        const patientCheck = await sql`
            SELECT id FROM patients WHERE id = ${patientIdNum}
        `;
        if (patientCheck.length === 0) {
            return sendError(res, 404, "Patient not found.", "PATIENT_NOT_FOUND");
        }

        // Verify doctor if supplied
        if (doctor_id) {
            const doctorIdNum = parseInt(doctor_id, 10);
            if (isNaN(doctorIdNum)) {
                return sendError(res, 400, "doctor_id must be a valid integer.", "VALIDATION_ERROR");
            }
            const doctorCheck = await sql`
                SELECT id FROM doctors WHERE id = ${doctorIdNum}
            `;
            if (doctorCheck.length === 0) {
                return sendError(res, 404, "Doctor not found.", "DOCTOR_NOT_FOUND");
            }
        }

        // Verify facility if supplied
        if (facility_id) {
            const facilityIdNum = parseInt(facility_id, 10);
            if (isNaN(facilityIdNum)) {
                return sendError(res, 400, "facility_id must be a valid integer.", "VALIDATION_ERROR");
            }
            const facilityCheck = await sql`
                SELECT id FROM facilities WHERE id = ${facilityIdNum}
            `;
            if (facilityCheck.length === 0) {
                return sendError(res, 404, "Facility not found.", "FACILITY_NOT_FOUND");
            }
        }

        const result = await sql`
            INSERT INTO followups (
                patient_id, doctor_id, facility_id,
                followup_date, reason, status, notes
            )
            VALUES (
                ${patientIdNum},
                ${doctor_id ? parseInt(doctor_id, 10) : null},
                ${facility_id ? parseInt(facility_id, 10) : null},
                ${followup_date},
                ${reason || null},
                'pending',
                ${notes || null}
            )
            RETURNING *
        `;

        return sendSuccess(res, 201, "Follow-up scheduled successfully.", {
            followup: result[0],
        });
    } catch (error) {
        next(error);
    }
};

// ─── GET /api/followups/patient/:patientId ────────────────────────────────
export const getPatientFollowups = async (req, res, next) => {
    try {
        const { patientId } = req.params;

        const idNum = parseInt(patientId, 10);
        if (isNaN(idNum)) {
            return sendError(res, 400, "patientId must be a valid integer.", "VALIDATION_ERROR");
        }

        // Verify patient exists
        const patientCheck = await sql`
            SELECT id, user_id FROM patients WHERE id = ${idNum}
        `;
        if (patientCheck.length === 0) {
            return sendError(res, 404, "Patient not found.", "PATIENT_NOT_FOUND");
        }

        // Authorization: patients can only view their own follow-ups
        if (
            req.user.role === "patient" &&
            patientCheck[0].user_id !== req.user.id
        ) {
            return sendError(
                res,
                403,
                "You are not authorized to view this patient's follow-ups.",
                "FORBIDDEN"
            );
        }

        const followups = await sql`
            SELECT
                fu.id, fu.patient_id, fu.doctor_id, fu.facility_id,
                fu.followup_date, fu.reason, fu.status, fu.notes,
                fu.completed_at, fu.created_at, fu.updated_at,
                u.full_name AS doctor_name,
                d.specialization AS doctor_specialization,
                f.name AS facility_name
            FROM followups fu
            LEFT JOIN doctors d ON d.id = fu.doctor_id
            LEFT JOIN users u ON u.id = d.user_id
            LEFT JOIN facilities f ON f.id = fu.facility_id
            WHERE fu.patient_id = ${idNum}
            ORDER BY fu.followup_date ASC
        `;

        return sendSuccess(res, 200, "Patient follow-ups retrieved.", {
            patient_id: idNum,
            count: followups.length,
            followups,
        });
    } catch (error) {
        next(error);
    }
};

// ─── GET /api/followups/overdue ───────────────────────────────────────────
export const getOverdueFollowups = async (req, res, next) => {
    try {
        // Patients cannot access aggregate overdue lists
        if (req.user.role === "patient") {
            return sendError(
                res,
                403,
                "Patients cannot access overdue follow-up lists.",
                "FORBIDDEN"
            );
        }

        const followups = await sql`
            SELECT
                fu.id, fu.patient_id, fu.doctor_id, fu.facility_id,
                fu.followup_date, fu.reason, fu.status, fu.notes,
                fu.completed_at, fu.created_at, fu.updated_at,
                pu.full_name AS patient_name,
                u.full_name AS doctor_name,
                f.name AS facility_name
            FROM followups fu
            LEFT JOIN patients p ON p.id = fu.patient_id
            LEFT JOIN users pu ON pu.id = p.user_id
            LEFT JOIN doctors d ON d.id = fu.doctor_id
            LEFT JOIN users u ON u.id = d.user_id
            LEFT JOIN facilities f ON f.id = fu.facility_id
            WHERE fu.followup_date < CURRENT_DATE
              AND fu.status != 'completed'
            ORDER BY fu.followup_date ASC
        `;

        return sendSuccess(res, 200, "Overdue follow-ups retrieved.", {
            count: followups.length,
            followups,
        });
    } catch (error) {
        next(error);
    }
};

// ─── PATCH /api/followups/:id ─────────────────────────────────────────────
export const updateFollowup = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status, notes, followup_date, reason } = req.body;

        const idNum = parseInt(id, 10);
        if (isNaN(idNum)) {
            return sendError(res, 400, "Follow-up ID must be a valid integer.", "VALIDATION_ERROR");
        }

        // Fetch existing follow-up
        const existing = await sql`
            SELECT fu.*, p.user_id AS patient_user_id
            FROM followups fu
            LEFT JOIN patients p ON p.id = fu.patient_id
            WHERE fu.id = ${idNum}
        `;
        if (existing.length === 0) {
            return sendError(res, 404, "Follow-up not found.", "FOLLOWUP_NOT_FOUND");
        }

        const followup = existing[0];

        // Patients can only view/update their own follow-ups
        if (
            req.user.role === "patient" &&
            followup.patient_user_id !== req.user.id
        ) {
            return sendError(
                res,
                403,
                "You are not authorized to update this follow-up.",
                "FORBIDDEN"
            );
        }

        // Validate status if provided
        if (status && !VALID_STATUSES.includes(status)) {
            return sendError(
                res,
                400,
                `status must be one of: ${VALID_STATUSES.join(", ")}.`,
                "VALIDATION_ERROR"
            );
        }

        // Validate followup_date if provided
        if (followup_date) {
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateRegex.test(followup_date)) {
                return sendError(
                    res,
                    400,
                    "followup_date must be in YYYY-MM-DD format.",
                    "VALIDATION_ERROR"
                );
            }
        }

        // Build completed_at logic using separate query branches
        // This avoids nested sql template tag issues with @neondatabase/serverless
        let result;

        if (status === "completed" && followup.status !== "completed") {
            // Completing a follow-up — set completed_at to NOW
            result = await sql`
                UPDATE followups
                SET
                    status        = COALESCE(${status || null}, status),
                    notes         = COALESCE(${notes || null}, notes),
                    followup_date = COALESCE(${followup_date || null}::date, followup_date),
                    reason        = COALESCE(${reason || null}, reason),
                    completed_at  = CURRENT_TIMESTAMP,
                    updated_at    = CURRENT_TIMESTAMP
                WHERE id = ${idNum}
                RETURNING *
            `;
        } else if (status && status !== "completed" && followup.status === "completed") {
            // Reopening a completed follow-up — clear completed_at
            result = await sql`
                UPDATE followups
                SET
                    status        = COALESCE(${status || null}, status),
                    notes         = COALESCE(${notes || null}, notes),
                    followup_date = COALESCE(${followup_date || null}::date, followup_date),
                    reason        = COALESCE(${reason || null}, reason),
                    completed_at  = NULL,
                    updated_at    = CURRENT_TIMESTAMP
                WHERE id = ${idNum}
                RETURNING *
            `;
        } else {
            // Other updates — preserve existing completed_at
            result = await sql`
                UPDATE followups
                SET
                    status        = COALESCE(${status || null}, status),
                    notes         = COALESCE(${notes || null}, notes),
                    followup_date = COALESCE(${followup_date || null}::date, followup_date),
                    reason        = COALESCE(${reason || null}, reason),
                    updated_at    = CURRENT_TIMESTAMP
                WHERE id = ${idNum}
                RETURNING *
            `;
        }

        return sendSuccess(res, 200, "Follow-up updated successfully.", {
            followup: result[0],
        });
    } catch (error) {
        next(error);
    }
};

// ─── GET /api/followups/:id ───────────────────────────────────────────────
export const getFollowupById = async (req, res, next) => {
    try {
        const idNum = parseInt(req.params.id, 10);
        if (isNaN(idNum)) {
            return sendError(res, 400, "Follow-up ID must be a valid integer.", "VALIDATION_ERROR");
        }

        const result = await sql`
            SELECT
                fu.id, fu.patient_id, fu.doctor_id, fu.facility_id,
                fu.followup_date, fu.reason, fu.status, fu.notes,
                fu.completed_at, fu.created_at, fu.updated_at,
                pu.full_name AS patient_name,
                u.full_name AS doctor_name,
                d.specialization AS doctor_specialization,
                f.name AS facility_name
            FROM followups fu
            LEFT JOIN patients p ON p.id = fu.patient_id
            LEFT JOIN users pu ON pu.id = p.user_id
            LEFT JOIN doctors d ON d.id = fu.doctor_id
            LEFT JOIN users u ON u.id = d.user_id
            LEFT JOIN facilities f ON f.id = fu.facility_id
            WHERE fu.id = ${idNum}
        `;

        if (result.length === 0) {
            return sendError(res, 404, "Follow-up not found.", "FOLLOWUP_NOT_FOUND");
        }

        const followup = result[0];

        // Patients can only view their own follow-ups
        if (req.user.role === "patient") {
            const patCheck = await sql`SELECT user_id FROM patients WHERE id = ${followup.patient_id}`;
            if (patCheck.length === 0 || patCheck[0].user_id !== req.user.id) {
                return sendError(res, 403, "You are not authorized to view this follow-up.", "FORBIDDEN");
            }
        }

        return sendSuccess(res, 200, "Follow-up retrieved.", { followup });
    } catch (error) {
        next(error);
    }
};

// ─── GET /api/followups/high-risk ─────────────────────────────────────────
// Returns follow-ups for patients with high-risk triage records that are still pending
export const getHighRiskFollowups = async (req, res, next) => {
    try {
        if (req.user.role === "patient") {
            return sendError(res, 403, "Patients cannot access high-risk follow-up lists.", "FORBIDDEN");
        }

        const followups = await sql`
            SELECT DISTINCT
                fu.id, fu.patient_id, fu.doctor_id, fu.facility_id,
                fu.followup_date, fu.reason, fu.status, fu.notes,
                fu.completed_at, fu.created_at, fu.updated_at,
                pu.full_name AS patient_name,
                u.full_name AS doctor_name,
                f.name AS facility_name,
                tr.risk_level AS latest_triage_risk,
                tr.urgency AS latest_triage_urgency
            FROM followups fu
            INNER JOIN patients p ON p.id = fu.patient_id
            LEFT JOIN users pu ON pu.id = p.user_id
            LEFT JOIN doctors d ON d.id = fu.doctor_id
            LEFT JOIN users u ON u.id = d.user_id
            LEFT JOIN facilities f ON f.id = fu.facility_id
            INNER JOIN (
                SELECT DISTINCT ON (patient_id)
                    patient_id, risk_level, urgency, created_at
                FROM triage_records
                WHERE risk_level IN ('high', 'critical')
                ORDER BY patient_id, created_at DESC
            ) tr ON tr.patient_id = fu.patient_id
            WHERE fu.status = 'pending'
            ORDER BY fu.followup_date ASC
        `;

        return sendSuccess(res, 200, "High-risk follow-ups retrieved.", {
            count: followups.length,
            followups,
        });
    } catch (error) {
        next(error);
    }
};

