/**
 * Queue Controller — Rural CareLink Developer 1
 *
 * POST   /api/queue/token                — Generate a queue token
 * GET    /api/queue/facility/:facilityId — Get facility's current queue
 * GET    /api/queue/:id                  — Get single queue entry
 * PATCH  /api/queue/:id/status           — Update queue entry status
 *
 * Queue token numbers are auto-assigned per facility per day.
 * Tokens reset at midnight (per queue_date).
 */

import { sql } from "../db.js";
import { sendSuccess, sendError } from "../utils/response.js";

const VALID_STATUSES = ["waiting", "called", "in_progress", "completed", "skipped", "cancelled"];
const VALID_PRIORITIES = ["normal", "urgent", "emergency"];

// ─── POST /api/queue/token ────────────────────────────────────────────────
export const generateToken = async (req, res, next) => {
    try {
        const { patient_id, facility_id, appointment_id, priority } = req.body;

        if (!patient_id) {
            return sendError(res, 400, "patient_id is required.", "VALIDATION_ERROR");
        }
        if (!facility_id) {
            return sendError(res, 400, "facility_id is required.", "VALIDATION_ERROR");
        }

        const patientIdNum = parseInt(patient_id, 10);
        const facilityIdNum = parseInt(facility_id, 10);
        if (isNaN(patientIdNum)) {
            return sendError(res, 400, "patient_id must be a valid integer.", "VALIDATION_ERROR");
        }
        if (isNaN(facilityIdNum)) {
            return sendError(res, 400, "facility_id must be a valid integer.", "VALIDATION_ERROR");
        }

        if (priority && !VALID_PRIORITIES.includes(priority)) {
            return sendError(
                res, 400,
                `priority must be one of: ${VALID_PRIORITIES.join(", ")}.`,
                "VALIDATION_ERROR"
            );
        }

        // Verify patient and facility exist
        const patientCheck = await sql`SELECT id FROM patients WHERE id = ${patientIdNum}`;
        if (patientCheck.length === 0) {
            return sendError(res, 404, "Patient not found.", "PATIENT_NOT_FOUND");
        }

        const facilityCheck = await sql`SELECT id FROM facilities WHERE id = ${facilityIdNum}`;
        if (facilityCheck.length === 0) {
            return sendError(res, 404, "Facility not found.", "FACILITY_NOT_FOUND");
        }

        // Verify appointment if provided
        let appointmentIdNum = null;
        if (appointment_id) {
            appointmentIdNum = parseInt(appointment_id, 10);
            if (isNaN(appointmentIdNum)) {
                return sendError(res, 400, "appointment_id must be a valid integer.", "VALIDATION_ERROR");
            }
            const apptCheck = await sql`SELECT id FROM appointments WHERE id = ${appointmentIdNum}`;
            if (apptCheck.length === 0) {
                return sendError(res, 404, "Appointment not found.", "APPOINTMENT_NOT_FOUND");
            }
        }

        // Check if patient already has an active token today at this facility
        const existingToken = await sql`
            SELECT id, token_number FROM queue
            WHERE facility_id = ${facilityIdNum}
              AND patient_id = ${patientIdNum}
              AND queue_date = CURRENT_DATE
              AND status NOT IN ('completed', 'cancelled', 'skipped')
        `;
        if (existingToken.length > 0) {
            return sendError(
                res, 409,
                `Patient already has active queue token #${existingToken[0].token_number} at this facility today.`,
                "DUPLICATE_TOKEN"
            );
        }

        // Auto-assign next token number for today at this facility
        const maxTokenResult = await sql`
            SELECT COALESCE(MAX(token_number), 0) AS max_token
            FROM queue
            WHERE facility_id = ${facilityIdNum}
              AND queue_date = CURRENT_DATE
        `;
        const nextToken = parseInt(maxTokenResult[0].max_token, 10) + 1;

        const result = await sql`
            INSERT INTO queue (
                facility_id, patient_id, appointment_id,
                token_number, queue_date, status, priority
            )
            VALUES (
                ${facilityIdNum},
                ${patientIdNum},
                ${appointmentIdNum},
                ${nextToken},
                CURRENT_DATE,
                'waiting',
                ${priority || "normal"}
            )
            RETURNING *
        `;

        return sendSuccess(res, 201, "Queue token generated successfully.", {
            queue_entry: result[0],
            token_number: result[0].token_number,
        });
    } catch (error) {
        next(error);
    }
};

// ─── GET /api/queue/facility/:facilityId ──────────────────────────────────
// IMPORTANT: Must be registered BEFORE /:id in router
export const getFacilityQueue = async (req, res, next) => {
    try {
        const { facilityId } = req.params;
        const idNum = parseInt(facilityId, 10);
        if (isNaN(idNum)) {
            return sendError(res, 400, "facilityId must be a valid integer.", "VALIDATION_ERROR");
        }

        // Patients cannot access facility queue lists
        if (req.user.role === "patient") {
            return sendError(res, 403, "Patients cannot access facility queue lists.", "FORBIDDEN");
        }

        const facilityCheck = await sql`SELECT id FROM facilities WHERE id = ${idNum}`;
        if (facilityCheck.length === 0) {
            return sendError(res, 404, "Facility not found.", "FACILITY_NOT_FOUND");
        }

        const queue = await sql`
            SELECT
                q.*,
                pu.full_name AS patient_name,
                a.appointment_date
            FROM queue q
            LEFT JOIN patients p ON p.id = q.patient_id
            LEFT JOIN users pu ON pu.id = p.user_id
            LEFT JOIN appointments a ON a.id = q.appointment_id
            WHERE q.facility_id = ${idNum}
              AND q.queue_date = CURRENT_DATE
            ORDER BY
                CASE q.priority
                    WHEN 'emergency' THEN 1
                    WHEN 'urgent' THEN 2
                    ELSE 3
                END,
                q.token_number ASC
        `;

        const waiting = queue.filter(e => e.status === "waiting").length;
        const called = queue.filter(e => e.status === "called" || e.status === "in_progress").length;

        return sendSuccess(res, 200, "Facility queue retrieved.", {
            facility_id: idNum,
            date: new Date().toISOString().slice(0, 10),
            total: queue.length,
            waiting,
            active: called,
            queue,
        });
    } catch (error) {
        next(error);
    }
};

// ─── GET /api/queue/:id ───────────────────────────────────────────────────
export const getQueueEntry = async (req, res, next) => {
    try {
        const idNum = parseInt(req.params.id, 10);
        if (isNaN(idNum)) {
            return sendError(res, 400, "Queue entry ID must be a valid integer.", "VALIDATION_ERROR");
        }

        const result = await sql`
            SELECT
                q.*,
                pu.full_name AS patient_name,
                f.name AS facility_name,
                a.appointment_date
            FROM queue q
            LEFT JOIN patients p ON p.id = q.patient_id
            LEFT JOIN users pu ON pu.id = p.user_id
            LEFT JOIN facilities f ON f.id = q.facility_id
            LEFT JOIN appointments a ON a.id = q.appointment_id
            WHERE q.id = ${idNum}
        `;

        if (result.length === 0) {
            return sendError(res, 404, "Queue entry not found.", "NOT_FOUND");
        }

        const entry = result[0];

        // Patients can only view their own queue entry
        if (req.user.role === "patient") {
            const patCheck = await sql`SELECT user_id FROM patients WHERE id = ${entry.patient_id}`;
            if (patCheck.length === 0 || patCheck[0].user_id !== req.user.id) {
                return sendError(res, 403, "You are not authorized to view this queue entry.", "FORBIDDEN");
            }
        }

        return sendSuccess(res, 200, "Queue entry retrieved.", { queue_entry: entry });
    } catch (error) {
        next(error);
    }
};

// ─── PATCH /api/queue/:id/status ─────────────────────────────────────────
export const updateQueueStatus = async (req, res, next) => {
    try {
        const idNum = parseInt(req.params.id, 10);
        if (isNaN(idNum)) {
            return sendError(res, 400, "Queue entry ID must be a valid integer.", "VALIDATION_ERROR");
        }

        const { status } = req.body;
        if (!status) {
            return sendError(res, 400, "status is required.", "VALIDATION_ERROR");
        }
        if (!VALID_STATUSES.includes(status)) {
            return sendError(
                res, 400,
                `status must be one of: ${VALID_STATUSES.join(", ")}.`,
                "VALIDATION_ERROR"
            );
        }

        const existing = await sql`SELECT * FROM queue WHERE id = ${idNum}`;
        if (existing.length === 0) {
            return sendError(res, 404, "Queue entry not found.", "NOT_FOUND");
        }

        const entry = existing[0];

        // Terminal states — cannot update
        if (entry.status === "completed" || entry.status === "cancelled") {
            return sendError(
                res, 409,
                `Cannot update a ${entry.status} queue entry.`,
                "CONFLICT"
            );
        }

        // Set timestamps based on status transition
        let result;
        if (status === "called") {
            result = await sql`
                UPDATE queue
                SET status = ${status}, called_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                WHERE id = ${idNum}
                RETURNING *
            `;
        } else if (status === "completed") {
            result = await sql`
                UPDATE queue
                SET status = ${status}, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                WHERE id = ${idNum}
                RETURNING *
            `;
        } else {
            result = await sql`
                UPDATE queue
                SET status = ${status}, updated_at = CURRENT_TIMESTAMP
                WHERE id = ${idNum}
                RETURNING *
            `;
        }

        return sendSuccess(res, 200, "Queue entry status updated.", { queue_entry: result[0] });
    } catch (error) {
        next(error);
    }
};
