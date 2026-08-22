/**
 * Teleconsultation Controller — Rural CareLink
 *
 * Manages teleconsultation records.
 *
 * IMPORTANT: Requires the teleconsultations table. Gracefully handles
 * the case where the table has not yet been created by Developer 1.
 *
 * Required schema (for Developer 1 to add):
 *   See src/services/teleconsultationService.js for CREATE TABLE SQL.
 *
 * Endpoints:
 *   POST   /api/teleconsultations              — Create consultation
 *   GET    /api/teleconsultations/:id          — Get consultation details
 *   PATCH  /api/teleconsultations/:id/status   — Update status
 *   POST   /api/teleconsultations/:id/end      — End consultation (doctor notes)
 */

import { sql } from "../db.js";
import { sendSuccess, sendError } from "../utils/response.js";
import {
    buildConsultationPayload,
    validateStatusTransition,
    generateJoinUrl,
    buildEndConsultationUpdate,
    VALID_CONSULTATION_STATUSES,
} from "../services/teleconsultationService.js";
import { writeAuditLog } from "../middleware/auditMiddleware.js";
import { sendTeleconsultationInvite } from "../services/notificationService.js";

// ─── Helper: check teleconsultations table exists ─────────────────────────
async function teleconsultationsTableExists() {
    try {
        await sql`SELECT 1 FROM teleconsultations LIMIT 1`;
        return true;
    } catch {
        return false;
    }
}

// ─── POST /api/teleconsultations ─────────────────────────────────────────

export const createTeleconsultation = async (req, res, next) => {
    try {
        const tableExists = await teleconsultationsTableExists();
        if (!tableExists) {
            return sendError(
                res,
                503,
                "Teleconsultations feature requires database setup. The 'teleconsultations' table has not been created. " +
                "Please ask Developer 1 to add the table schema and run: npm run init-db",
                "TABLE_NOT_READY"
            );
        }

        const { patient_id, doctor_id, consultation_type, triage_id, scheduled_at } = req.body;

        if (!patient_id) {
            return sendError(res, 400, "patient_id is required.", "VALIDATION_ERROR");
        }

        const patientIdNum = parseInt(patient_id, 10);
        if (isNaN(patientIdNum)) {
            return sendError(res, 400, "patient_id must be a valid integer.", "VALIDATION_ERROR");
        }

        // Verify patient exists
        const patientCheck = await sql`SELECT id FROM patients WHERE id = ${patientIdNum}`;
        if (patientCheck.length === 0) {
            return sendError(res, 404, "Patient not found.", "PATIENT_NOT_FOUND");
        }

        // Verify doctor if provided
        if (doctor_id) {
            const doctorIdNum = parseInt(doctor_id, 10);
            const doctorCheck = await sql`SELECT id FROM doctors WHERE id = ${doctorIdNum}`;
            if (doctorCheck.length === 0) {
                return sendError(res, 404, "Doctor not found.", "DOCTOR_NOT_FOUND");
            }
        }

        // Validate consultation type
        const validTypes = ["video", "audio", "chat"];
        if (consultation_type && !validTypes.includes(consultation_type)) {
            return sendError(res, 400, `consultation_type must be one of: ${validTypes.join(", ")}.`, "VALIDATION_ERROR");
        }

        const payload = buildConsultationPayload({
            patient_id,
            doctor_id: doctor_id || null,
            created_by: req.user.id,
            consultation_type,
            triage_id: triage_id || null,
            scheduled_at: scheduled_at || null,
        });

        const result = await sql`
            INSERT INTO teleconsultations (
                patient_id, doctor_id, created_by, status,
                consultation_type, triage_id, scheduled_at
            )
            VALUES (
                ${payload.patient_id},
                ${payload.doctor_id},
                ${payload.created_by},
                ${payload.status},
                ${payload.consultation_type},
                ${payload.triage_id},
                ${payload.scheduled_at}
            )
            RETURNING *
        `;

        const consultation = result[0];
        const joinUrl = generateJoinUrl(consultation.id);

        // Send notification invite if we have a contact
        const patientInfo = await sql`
            SELECT u.full_name, u.phone FROM patients p LEFT JOIN users u ON u.id = p.user_id WHERE p.id = ${patientIdNum}
        `;
        if (patientInfo[0]?.phone) {
            await sendTeleconsultationInvite({
                to: patientInfo[0].phone,
                recipientName: patientInfo[0].full_name || "Patient",
                consultationId: consultation.id,
                joinUrl,
                scheduledAt: scheduled_at || "To be confirmed",
            }).catch(err => console.warn("[TeleconsultationCtrl] Notification failed:", err.message));
        }

        await writeAuditLog({
            user_id: req.user.id,
            action: "TELECONSULTATION_CREATED",
            resource_type: "teleconsultation",
            resource_id: consultation.id,
            metadata: { patient_id: patientIdNum, consultation_type: payload.consultation_type },
            ip_address: req.ip,
        });

        return sendSuccess(res, 201, "Teleconsultation created.", {
            consultation: { ...consultation, join_url: joinUrl },
            provider: process.env.VIDEO_PROVIDER || "mock",
            note: "This is a provider-agnostic teleconsultation. Integrate a real video provider via VIDEO_PROVIDER env var.",
        });
    } catch (error) {
        next(error);
    }
};

// ─── GET /api/teleconsultations/:id ──────────────────────────────────────

export const getTeleconsultation = async (req, res, next) => {
    try {
        const tableExists = await teleconsultationsTableExists();
        if (!tableExists) {
            return sendError(res, 503, "Teleconsultations feature not yet available.", "TABLE_NOT_READY");
        }

        const { id } = req.params;
        const idNum = parseInt(id, 10);
        if (isNaN(idNum)) {
            return sendError(res, 400, "Consultation ID must be a valid integer.", "VALIDATION_ERROR");
        }

        const result = await sql`
            SELECT
                tc.*,
                p.user_id AS patient_user_id,
                u_patient.full_name AS patient_name,
                u_doctor.full_name AS doctor_name
            FROM teleconsultations tc
            LEFT JOIN patients p ON p.id = tc.patient_id
            LEFT JOIN users u_patient ON u_patient.id = p.user_id
            LEFT JOIN doctors d ON d.id = tc.doctor_id
            LEFT JOIN users u_doctor ON u_doctor.id = d.user_id
            WHERE tc.id = ${idNum}
        `;

        if (result.length === 0) {
            return sendError(res, 404, "Teleconsultation not found.", "NOT_FOUND");
        }

        const consultation = result[0];

        // Authorization: patients can only view their own consultations
        if (req.user.role === "patient" && consultation.patient_user_id !== req.user.id) {
            return sendError(res, 403, "You are not authorized to view this consultation.", "FORBIDDEN");
        }

        return sendSuccess(res, 200, "Teleconsultation retrieved.", { consultation });
    } catch (error) {
        next(error);
    }
};

// ─── PATCH /api/teleconsultations/:id/status ─────────────────────────────

export const updateTeleconsultationStatus = async (req, res, next) => {
    try {
        const tableExists = await teleconsultationsTableExists();
        if (!tableExists) {
            return sendError(res, 503, "Teleconsultations feature not yet available.", "TABLE_NOT_READY");
        }

        const { id } = req.params;
        const { status } = req.body;
        const idNum = parseInt(id, 10);

        if (isNaN(idNum)) {
            return sendError(res, 400, "Consultation ID must be a valid integer.", "VALIDATION_ERROR");
        }

        if (!status) {
            return sendError(res, 400, "status is required.", "VALIDATION_ERROR");
        }

        // Fetch current consultation
        const existing = await sql`SELECT * FROM teleconsultations WHERE id = ${idNum}`;
        if (existing.length === 0) {
            return sendError(res, 404, "Teleconsultation not found.", "NOT_FOUND");
        }

        const current = existing[0];

        // Validate transition
        const transition = validateStatusTransition(current.status, status);
        if (!transition.valid) {
            return sendError(res, 400, transition.reason, "INVALID_STATUS_TRANSITION");
        }

        const now = new Date().toISOString();
        const setStartedAt = status === "active" && !current.started_at;

        let result;
        if (setStartedAt) {
            result = await sql`
                UPDATE teleconsultations
                SET status = ${status}, started_at = ${now}, updated_at = ${now}
                WHERE id = ${idNum}
                RETURNING *
            `;
        } else {
            result = await sql`
                UPDATE teleconsultations
                SET status = ${status}, updated_at = ${now}
                WHERE id = ${idNum}
                RETURNING *
            `;
        }

        await writeAuditLog({
            user_id: req.user.id,
            action: "TELECONSULTATION_STATUS_UPDATED",
            resource_type: "teleconsultation",
            resource_id: idNum,
            metadata: { from: current.status, to: status },
            ip_address: req.ip,
        });

        return sendSuccess(res, 200, "Teleconsultation status updated.", { consultation: result[0] });
    } catch (error) {
        next(error);
    }
};

// ─── POST /api/teleconsultations/:id/end ─────────────────────────────────

export const endTeleconsultation = async (req, res, next) => {
    try {
        const tableExists = await teleconsultationsTableExists();
        if (!tableExists) {
            return sendError(res, 503, "Teleconsultations feature not yet available.", "TABLE_NOT_READY");
        }

        const { id } = req.params;
        const { doctor_notes } = req.body;
        const idNum = parseInt(id, 10);

        if (isNaN(idNum)) {
            return sendError(res, 400, "Consultation ID must be a valid integer.", "VALIDATION_ERROR");
        }

        const existing = await sql`SELECT * FROM teleconsultations WHERE id = ${idNum}`;
        if (existing.length === 0) {
            return sendError(res, 404, "Teleconsultation not found.", "NOT_FOUND");
        }

        const current = existing[0];

        if (current.status === "completed") {
            return sendError(res, 400, "Teleconsultation is already completed.", "ALREADY_COMPLETED");
        }

        if (current.status === "cancelled") {
            return sendError(res, 400, "Cannot end a cancelled teleconsultation.", "INVALID_STATUS");
        }

        const update = buildEndConsultationUpdate(current, doctor_notes);

        const result = await sql`
            UPDATE teleconsultations
            SET
                status = ${update.status},
                ended_at = ${update.ended_at},
                duration_minutes = ${update.duration_minutes},
                doctor_notes = ${update.doctor_notes},
                updated_at = ${update.ended_at}
            WHERE id = ${idNum}
            RETURNING *
        `;

        await writeAuditLog({
            user_id: req.user.id,
            action: "TELECONSULTATION_ENDED",
            resource_type: "teleconsultation",
            resource_id: idNum,
            metadata: { duration_minutes: update.duration_minutes },
            ip_address: req.ip,
        });

        return sendSuccess(res, 200, "Teleconsultation ended.", { consultation: result[0] });
    } catch (error) {
        next(error);
    }
};
