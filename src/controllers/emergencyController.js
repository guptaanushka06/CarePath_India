/**
 * Emergency Controller — Rural CareLink Developer 2
 *
 * Implements the emergency escalation workflow:
 *
 *   POST /api/emergency/escalate
 *     Clinical staff submits a confirmed escalation.
 *     AI evaluates the triage record (decision support only).
 *     If confirm_escalation=true, record is persisted (if table exists)
 *     and emergency alert is sent.
 *
 *   GET /api/emergency/:id
 *     Retrieve an escalation record by ID.
 *     Requires: health_worker, doctor, facility_admin, district_admin.
 *
 *   PATCH /api/emergency/:id/status
 *     Update the status of an escalation record.
 *     Requires: doctor, facility_admin, district_admin.
 *
 * IMPORTANT:
 *   - AI is NEVER the final authority. confirm_escalation must be
 *     explicitly set to true by an authorized clinical user.
 *   - The existing POST /api/ai/escalate is preserved as an
 *     AI evaluation/recommendation endpoint (no persistence).
 *   - This controller adds the persistence + workflow layer.
 *   - If emergency_escalations table does not exist, escalations
 *     are processed and audited but not stored (graceful degradation).
 *
 * Database dependency:
 *   emergency_escalations table — owned by Developer 1.
 *   Schema documented below for initDB.js.
 *
 *   CREATE TABLE IF NOT EXISTS emergency_escalations (
 *     id SERIAL PRIMARY KEY,
 *     patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
 *     triage_id INTEGER REFERENCES triage_records(id) ON DELETE SET NULL,
 *     confirmed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
 *     escalation_recommended BOOLEAN NOT NULL,
 *     recommended_care_level VARCHAR(100),
 *     red_flags JSONB,
 *     status VARCHAR(30) DEFAULT 'active',
 *     notification_status VARCHAR(30) DEFAULT 'not_sent',
 *     ai_safety_notice TEXT,
 *     escalated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 *     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
 *   );
 */

import { sql } from "../db.js";
import { sendSuccess, sendError } from "../utils/response.js";
import {
    evaluateEscalationNeed,
    triggerEmergencyAlert,
} from "../services/emergencyService.js";
import { writeAuditLog } from "../middleware/auditMiddleware.js";

// ─── Schema cache ──────────────────────────────────────────────────────────

let escalationTableConfirmed = null; // null = not checked, true = exists, false = missing

async function escalationTableExists() {
    if (escalationTableConfirmed !== null) return escalationTableConfirmed;
    try {
        await sql`SELECT 1 FROM emergency_escalations LIMIT 1`;
        escalationTableConfirmed = true;
    } catch {
        escalationTableConfirmed = false;
    }
    return escalationTableConfirmed;
}

// Valid status transitions
const VALID_STATUSES = ["active", "dispatched", "resolved", "cancelled"];

// ─── POST /api/emergency/escalate ─────────────────────────────────────────

/**
 * Confirm an emergency escalation.
 * - Evaluates the triage record for AI-assisted escalation need.
 * - Requires explicit confirm_escalation: true for the alert to fire.
 * - Persists to emergency_escalations if table exists; degrades gracefully.
 *
 * Body: { triage_id, patient_id, confirm_escalation, worker_phone }
 * Roles: health_worker, doctor, facility_admin
 */
export const createEscalation = async (req, res, next) => {
    try {
        const { triage_id, patient_id, confirm_escalation, worker_phone } = req.body;

        // Validate required fields
        if (!patient_id) {
            return sendError(res, 400, "patient_id is required.", "VALIDATION_ERROR");
        }
        if (!triage_id) {
            return sendError(res, 400, "triage_id is required.", "VALIDATION_ERROR");
        }

        const patientIdNum = parseInt(patient_id, 10);
        const triageIdNum = parseInt(triage_id, 10);

        if (isNaN(patientIdNum)) {
            return sendError(res, 400, "patient_id must be a valid integer.", "VALIDATION_ERROR");
        }
        if (isNaN(triageIdNum)) {
            return sendError(res, 400, "triage_id must be a valid integer.", "VALIDATION_ERROR");
        }

        // Fetch triage record
        const triageResult = await sql`
            SELECT tr.*, p.user_id AS patient_user_id
            FROM triage_records tr
            LEFT JOIN patients p ON p.id = tr.patient_id
            WHERE tr.id = ${triageIdNum}
        `;
        if (triageResult.length === 0) {
            return sendError(res, 404, "Triage record not found.", "TRIAGE_NOT_FOUND");
        }

        const triageRecord = triageResult[0];

        // Enforce that the triage record belongs to the specified patient
        if (triageRecord.patient_id !== patientIdNum) {
            return sendError(
                res,
                400,
                "triage_id does not match the specified patient_id.",
                "VALIDATION_ERROR"
            );
        }

        // AI evaluation (decision support — not a final decision)
        const aiResponse = triageRecord.ai_response || {};
        const escalationEval = evaluateEscalationNeed({
            risk_level: triageRecord.risk_level,
            urgency: triageRecord.urgency,
            recommended_care_level: triageRecord.recommended_care_level,
            red_flags: Array.isArray(triageRecord.red_flags) ? triageRecord.red_flags : [],
            ...aiResponse,
        });

        let notificationResult = null;
        const isConfirmed = confirm_escalation === true;

        // Only trigger alert when clinical staff explicitly confirms
        if (isConfirmed && escalationEval.escalation_recommended) {
            const patientResult = await sql`
                SELECT p.id, u.full_name AS patient_name, u.phone AS patient_phone
                FROM patients p
                LEFT JOIN users u ON u.id = p.user_id
                WHERE p.id = ${patientIdNum}
            `;
            const patient = patientResult[0] || {};

            const workerResult = await sql`SELECT full_name FROM users WHERE id = ${req.user.id}`;
            const workerName = workerResult[0]?.full_name || "Health Worker";

            notificationResult = await triggerEmergencyAlert({
                workerPhone: worker_phone || patient.patient_phone,
                workerName,
                patientName: patient.patient_name || "Patient",
                riskLevel: triageRecord.risk_level,
                redFlags: Array.isArray(triageRecord.red_flags) ? triageRecord.red_flags : [],
            });
        }

        // Persist escalation record if table exists
        let savedRecord = null;
        const tableExists = await escalationTableExists();

        if (tableExists && isConfirmed) {
            const redFlagsJson = JSON.stringify(escalationEval.red_flags || []);
            const notifStatus = notificationResult?.status || "not_sent";

            const inserted = await sql`
                INSERT INTO emergency_escalations (
                    patient_id, triage_id, confirmed_by,
                    escalation_recommended, recommended_care_level,
                    red_flags, status, notification_status, ai_safety_notice
                )
                VALUES (
                    ${patientIdNum},
                    ${triageIdNum},
                    ${req.user.id},
                    ${escalationEval.escalation_recommended},
                    ${escalationEval.recommended_care_level},
                    ${redFlagsJson}::jsonb,
                    'active',
                    ${notifStatus},
                    ${escalationEval.ai_safety_notice}
                )
                RETURNING *
            `;
            savedRecord = inserted[0] || null;
        } else if (!tableExists && isConfirmed) {
            console.warn(
                "[EmergencyController] emergency_escalations table not found. " +
                "Escalation processed but not persisted. Developer 1 must add table."
            );
        }

        // Audit
        await writeAuditLog({
            user_id: req.user.id,
            action: isConfirmed ? "EMERGENCY_ESCALATION_CONFIRMED" : "EMERGENCY_ESCALATION_EVALUATED",
            resource_type: "emergency_escalation",
            resource_id: savedRecord?.id || triageIdNum,
            metadata: {
                patient_id: patientIdNum,
                triage_id: triageIdNum,
                escalation_recommended: escalationEval.escalation_recommended,
                confirmed: isConfirmed,
                table_exists: tableExists,
            },
            ip_address: req.ip,
        });

        return sendSuccess(
            res,
            isConfirmed ? 201 : 200,
            isConfirmed
                ? "Emergency escalation confirmed and recorded."
                : "Escalation evaluated. Set confirm_escalation: true to confirm.",
            {
                escalation_evaluation: escalationEval,
                escalation_record: savedRecord,
                notification: notificationResult,
                persistence_status: tableExists
                    ? "persisted"
                    : "BLOCKED — emergency_escalations table not yet created by Developer 1",
                safety_notice:
                    "AI provides escalation RECOMMENDATIONS only. " +
                    "Final emergency decisions must be made by qualified health professionals.",
            }
        );
    } catch (error) {
        next(error);
    }
};

// ─── GET /api/emergency/:id ────────────────────────────────────────────────

/**
 * Retrieve an escalation record by ID.
 * Roles: health_worker, doctor, facility_admin, district_admin
 */
export const getEscalation = async (req, res, next) => {
    try {
        const idNum = parseInt(req.params.id, 10);
        if (isNaN(idNum)) {
            return sendError(res, 400, "id must be a valid integer.", "VALIDATION_ERROR");
        }

        const tableExists = await escalationTableExists();
        if (!tableExists) {
            return sendError(
                res,
                503,
                "emergency_escalations table not yet available. Developer 1 dependency pending.",
                "TABLE_NOT_FOUND"
            );
        }

        const result = await sql`
            SELECT
                ee.*,
                u.full_name AS confirmed_by_name,
                p.id AS patient_id
            FROM emergency_escalations ee
            LEFT JOIN users u ON u.id = ee.confirmed_by
            LEFT JOIN patients p ON p.id = ee.patient_id
            WHERE ee.id = ${idNum}
        `;

        if (result.length === 0) {
            return sendError(res, 404, "Escalation record not found.", "NOT_FOUND");
        }

        return sendSuccess(res, 200, "Escalation record retrieved.", {
            escalation: result[0],
        });
    } catch (error) {
        next(error);
    }
};

// ─── PATCH /api/emergency/:id/status ─────────────────────────────────────

/**
 * Update the status of an escalation record.
 * Roles: doctor, facility_admin, district_admin
 * Body: { status: "active" | "dispatched" | "resolved" | "cancelled" }
 */
export const updateEscalationStatus = async (req, res, next) => {
    try {
        const idNum = parseInt(req.params.id, 10);
        if (isNaN(idNum)) {
            return sendError(res, 400, "id must be a valid integer.", "VALIDATION_ERROR");
        }

        const { status } = req.body;

        if (!status) {
            return sendError(res, 400, "status is required.", "VALIDATION_ERROR");
        }

        if (!VALID_STATUSES.includes(status)) {
            return sendError(
                res,
                400,
                `status must be one of: ${VALID_STATUSES.join(", ")}.`,
                "VALIDATION_ERROR"
            );
        }

        const tableExists = await escalationTableExists();
        if (!tableExists) {
            return sendError(
                res,
                503,
                "emergency_escalations table not yet available. Developer 1 dependency pending.",
                "TABLE_NOT_FOUND"
            );
        }

        // Check record exists
        const existing = await sql`
            SELECT id, status FROM emergency_escalations WHERE id = ${idNum}
        `;
        if (existing.length === 0) {
            return sendError(res, 404, "Escalation record not found.", "NOT_FOUND");
        }

        // Prevent re-updating already resolved/cancelled records
        const currentStatus = existing[0].status;
        if (currentStatus === "resolved" || currentStatus === "cancelled") {
            return sendError(
                res,
                409,
                `Cannot update a ${currentStatus} escalation record.`,
                "CONFLICT"
            );
        }

        const updated = await sql`
            UPDATE emergency_escalations
            SET status = ${status}, updated_at = CURRENT_TIMESTAMP
            WHERE id = ${idNum}
            RETURNING *
        `;

        // Audit
        await writeAuditLog({
            user_id: req.user.id,
            action: "EMERGENCY_STATUS_UPDATED",
            resource_type: "emergency_escalation",
            resource_id: idNum,
            metadata: {
                previous_status: currentStatus,
                new_status: status,
            },
            ip_address: req.ip,
        });

        return sendSuccess(res, 200, "Escalation status updated.", {
            escalation: updated[0],
        });
    } catch (error) {
        next(error);
    }
};
