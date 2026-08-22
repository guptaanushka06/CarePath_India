/**
 * AI Controller — Rural CareLink
 *
 * Handles AI-specific endpoints:
 *   POST /api/ai/summarize  — AI-assisted patient medical summary
 *   POST /api/ai/translate  — Multilingual text processing
 *   POST /api/ai/escalate   — Emergency escalation recommendation (clinical confirmation required)
 *
 * IMPORTANT AI SAFETY:
 *   - All AI output is decision SUPPORT only.
 *   - AI does NOT diagnose, prescribe, or make final emergency decisions.
 *   - Every response includes a safety disclaimer.
 *   - AI triage remains on POST /api/triage (existing endpoint).
 */

import { sql } from "../db.js";
import { sendSuccess, sendError } from "../utils/response.js";
import { generateSummary, translateText } from "../services/aiService.js";
import { evaluateEscalationNeed, triggerEmergencyAlert, buildEscalationRecord } from "../services/emergencyService.js";
import { writeAuditLog } from "../middleware/auditMiddleware.js";

// ─── POST /api/ai/summarize ────────────────────────────────────────────────

/**
 * Generates an AI-assisted longitudinal summary for a patient.
 * Requires authorized access (health_worker, doctor, facility_admin, district_admin).
 * Patients cannot request summaries (use /api/records/:patientId instead).
 */
export const generatePatientSummary = async (req, res, next) => {
    try {
        const { patient_id } = req.body;

        if (!patient_id) {
            return sendError(res, 400, "patient_id is required.", "VALIDATION_ERROR");
        }

        const patientIdNum = parseInt(patient_id, 10);
        if (isNaN(patientIdNum)) {
            return sendError(res, 400, "patient_id must be a valid integer.", "VALIDATION_ERROR");
        }

        // Fetch patient with user details
        const patientResult = await sql`
            SELECT p.*, u.full_name, u.email, u.phone
            FROM patients p
            LEFT JOIN users u ON u.id = p.user_id
            WHERE p.id = ${patientIdNum}
        `;
        if (patientResult.length === 0) {
            return sendError(res, 404, "Patient not found.", "PATIENT_NOT_FOUND");
        }
        const patient = patientResult[0];

        // Fetch longitudinal data
        const [records, triage, referrals, followups] = await Promise.all([
            sql`SELECT * FROM medical_records WHERE patient_id = ${patientIdNum} ORDER BY visit_date DESC LIMIT 10`,
            sql`SELECT * FROM triage_records WHERE patient_id = ${patientIdNum} ORDER BY created_at DESC LIMIT 5`,
            sql`SELECT * FROM referrals WHERE patient_id = ${patientIdNum} ORDER BY created_at DESC LIMIT 5`,
            sql`SELECT * FROM followups WHERE patient_id = ${patientIdNum} ORDER BY followup_date DESC LIMIT 5`,
        ]);

        // Generate AI summary
        const summary = await generateSummary({ patient, records, triage, referrals, followups });

        // Audit
        await writeAuditLog({
            user_id: req.user.id,
            action: "AI_SUMMARY_GENERATED",
            resource_type: "patient",
            resource_id: patientIdNum,
            metadata: { patient_id: patientIdNum, source: summary.source },
            ip_address: req.ip,
        });

        return sendSuccess(res, 200, "AI-assisted patient summary generated.", {
            patient_id: patientIdNum,
            summary,
            data_sources: {
                medical_records: records.length,
                triage_records: triage.length,
                referrals: referrals.length,
                followups: followups.length,
            },
        });
    } catch (error) {
        next(error);
    }
};

// ─── POST /api/ai/translate ────────────────────────────────────────────────

/**
 * Translates clinical text for multilingual support.
 * Supported by: all authenticated roles.
 */
export const translateClinicalText = async (req, res, next) => {
    try {
        const { text, source_language, target_language } = req.body;

        if (!text || typeof text !== "string" || text.trim() === "") {
            return sendError(res, 400, "text is required and must be a non-empty string.", "VALIDATION_ERROR");
        }

        const supportedLanguages = ["en", "hi", "mr", "ta", "te", "kn", "auto"];

        if (source_language && !supportedLanguages.includes(source_language)) {
            return sendError(
                res,
                400,
                `source_language must be one of: ${supportedLanguages.join(", ")}.`,
                "VALIDATION_ERROR"
            );
        }

        if (!target_language || !supportedLanguages.filter(l => l !== "auto").includes(target_language)) {
            return sendError(
                res,
                400,
                `target_language is required and must be one of: ${supportedLanguages.filter(l => l !== "auto").join(", ")}.`,
                "VALIDATION_ERROR"
            );
        }

        // Text length limit to prevent abuse
        if (text.length > 5000) {
            return sendError(res, 400, "Text is too long. Maximum 5000 characters.", "VALIDATION_ERROR");
        }

        const result = await translateText(text, source_language || "auto", target_language);

        // Audit translation event
        await writeAuditLog({
            user_id: req.user.id,
            action: "AI_TRANSLATION",
            resource_type: "translation",
            resource_id: null,
            metadata: {
                source_language: source_language || "auto",
                target_language,
                text_length: text.length,
                source: result.source,
            },
            ip_address: req.ip,
        });

        return sendSuccess(res, 200, "Translation processed.", { translation: result });
    } catch (error) {
        next(error);
    }
};

// ─── POST /api/ai/escalate ─────────────────────────────────────────────────

/**
 * Evaluates a triage record for emergency escalation recommendation.
 * FINAL escalation decision is made by the health worker, NOT the AI.
 *
 * Requires: health_worker, doctor, facility_admin
 */
export const evaluateEscalation = async (req, res, next) => {
    try {
        const { triage_id, confirm_escalation, worker_phone } = req.body;

        if (!triage_id) {
            return sendError(res, 400, "triage_id is required.", "VALIDATION_ERROR");
        }

        const triageIdNum = parseInt(triage_id, 10);
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

        // Evaluate escalation need from AI triage result
        const aiResponse = triageRecord.ai_response || {};
        const escalationEval = evaluateEscalationNeed({
            risk_level: triageRecord.risk_level,
            urgency: triageRecord.urgency,
            recommended_care_level: triageRecord.recommended_care_level,
            red_flags: Array.isArray(triageRecord.red_flags) ? triageRecord.red_flags : [],
            ...aiResponse,
        });

        let notificationResult = null;

        // Only send notification if clinical staff explicitly confirms escalation
        if (confirm_escalation === true && escalationEval.escalation_recommended) {
            // Fetch patient name for notification
            const patientResult = await sql`
                SELECT p.id, u.full_name AS patient_name, u.phone AS patient_phone
                FROM patients p
                LEFT JOIN users u ON u.id = p.user_id
                WHERE p.id = ${triageRecord.patient_id}
            `;
            const patient = patientResult[0] || {};

            // Fetch worker name
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

        // Build escalation record for audit
        const escalationRecord = buildEscalationRecord({
            patient_id: triageRecord.patient_id,
            triage_id: triageIdNum,
            confirmed_by_user_id: req.user.id,
            escalation_evaluation: escalationEval,
            notification_result: notificationResult,
        });

        // Audit
        await writeAuditLog({
            user_id: req.user.id,
            action: confirm_escalation ? "EMERGENCY_ESCALATION_CONFIRMED" : "EMERGENCY_ESCALATION_EVALUATED",
            resource_type: "triage",
            resource_id: triageIdNum,
            metadata: {
                patient_id: triageRecord.patient_id,
                risk_level: triageRecord.risk_level,
                escalation_recommended: escalationEval.escalation_recommended,
                confirmed: confirm_escalation === true,
            },
            ip_address: req.ip,
        });

        return sendSuccess(
            res,
            200,
            confirm_escalation
                ? "Emergency escalation confirmed by clinical staff."
                : "Escalation evaluation complete. Awaiting clinical confirmation.",
            {
                escalation_evaluation: escalationEval,
                escalation_record: escalationRecord,
                notification: notificationResult,
                safety_notice:
                    "AI provides escalation RECOMMENDATIONS only. " +
                    "Final emergency decisions must be made by qualified health professionals.",
            }
        );
    } catch (error) {
        next(error);
    }
};
