import { sql } from "../db.js";
import { sendSuccess, sendError } from "../utils/response.js";
import { performTriage } from "../services/aiService.js";

// ─── POST /api/triage ─────────────────────────────────────────────────────
export const createTriage = async (req, res, next) => {
    try {
        const { patient_id, symptoms, vitals } = req.body;

        // Validate patient_id
        if (!patient_id) {
            return sendError(res, 400, "patient_id is required.", "VALIDATION_ERROR");
        }

        const patientIdNum = parseInt(patient_id, 10);
        if (isNaN(patientIdNum)) {
            return sendError(res, 400, "patient_id must be a valid integer.", "VALIDATION_ERROR");
        }

        // Validate symptoms
        if (
            !symptoms ||
            (typeof symptoms === "string" && symptoms.trim().length === 0) ||
            (Array.isArray(symptoms) && symptoms.length === 0)
        ) {
            return sendError(
                res,
                400,
                "symptoms are required and must not be empty.",
                "VALIDATION_ERROR"
            );
        }

        // Validate vitals if provided
        if (vitals !== undefined && vitals !== null && typeof vitals !== "object") {
            return sendError(res, 400, "vitals must be a JSON object.", "VALIDATION_ERROR");
        }

        // Verify patient exists
        const patientCheck = await sql`
            SELECT id FROM patients WHERE id = ${patientIdNum}
        `;
        if (patientCheck.length === 0) {
            return sendError(res, 404, "Patient not found.", "PATIENT_NOT_FOUND");
        }

        // Call AI service for preliminary triage decision support
        let triageResult;
        try {
            triageResult = await performTriage(symptoms, vitals || {});
        } catch (aiError) {
            console.error("[triageController] AI service error:", aiError);
            return sendError(
                res,
                500,
                "Triage service temporarily unavailable. Please retry.",
                "TRIAGE_FAILED"
            );
        }

        // Validate the AI/fallback response structure
        const validRiskLevels = ["low", "medium", "high", "critical"];
        const validUrgency = ["routine", "soon", "urgent", "immediate"];
        const validCareLevels = [
            "sub_centre", "phc", "chc", "district_hospital", "emergency",
        ];

        if (
            !validRiskLevels.includes(triageResult.risk_level) ||
            !validUrgency.includes(triageResult.urgency) ||
            !validCareLevels.includes(triageResult.recommended_care_level)
        ) {
            console.error("[triageController] Invalid triage response:", triageResult);
            return sendError(
                res,
                500,
                "Invalid triage response received. Please retry.",
                "INVALID_TRIAGE_RESPONSE"
            );
        }

        // Serialize JSONB fields
        const symptomsJson = typeof symptoms === "string"
            ? JSON.stringify({ description: symptoms })
            : JSON.stringify(symptoms);

        const vitalsJson = vitals ? JSON.stringify(vitals) : null;
        const redFlagsJson = JSON.stringify(triageResult.red_flags || []);
        const aiResponseJson = JSON.stringify(triageResult);

        // Store triage record — use separate branches to avoid nested sql template tag
        let result;
        if (vitalsJson) {
            result = await sql`
                INSERT INTO triage_records (
                    patient_id, created_by, symptoms, vitals,
                    risk_level, urgency, recommended_care_level,
                    red_flags, ai_response
                )
                VALUES (
                    ${patientIdNum},
                    ${req.user.id},
                    ${symptomsJson}::jsonb,
                    ${vitalsJson}::jsonb,
                    ${triageResult.risk_level},
                    ${triageResult.urgency},
                    ${triageResult.recommended_care_level},
                    ${redFlagsJson}::jsonb,
                    ${aiResponseJson}::jsonb
                )
                RETURNING *
            `;
        } else {
            result = await sql`
                INSERT INTO triage_records (
                    patient_id, created_by, symptoms, vitals,
                    risk_level, urgency, recommended_care_level,
                    red_flags, ai_response
                )
                VALUES (
                    ${patientIdNum},
                    ${req.user.id},
                    ${symptomsJson}::jsonb,
                    NULL,
                    ${triageResult.risk_level},
                    ${triageResult.urgency},
                    ${triageResult.recommended_care_level},
                    ${redFlagsJson}::jsonb,
                    ${aiResponseJson}::jsonb
                )
                RETURNING *
            `;
        }

        return sendSuccess(res, 201, "AI-assisted preliminary triage completed.", {
            triage: result[0],
            ai_assisted_triage: {
                risk_level: triageResult.risk_level,
                urgency: triageResult.urgency,
                recommended_care_level: triageResult.recommended_care_level,
                red_flags: triageResult.red_flags,
                summary: triageResult.summary,
                source: triageResult.source,
                disclaimer:
                    "This is AI-assisted preliminary triage for decision support only. " +
                    "It is NOT a medical diagnosis. A qualified health professional must assess this patient.",
            },
        });
    } catch (error) {
        next(error);
    }
};

// ─── GET /api/triage/:patientId ───────────────────────────────────────────
export const getTriageHistory = async (req, res, next) => {
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

        // Authorization: patients can only view their own triage history
        if (
            req.user.role === "patient" &&
            patientCheck[0].user_id !== req.user.id
        ) {
            return sendError(
                res,
                403,
                "You are not authorized to view this patient's triage history.",
                "FORBIDDEN"
            );
        }

        const records = await sql`
            SELECT
                tr.id, tr.patient_id, tr.created_by,
                tr.symptoms, tr.vitals,
                tr.risk_level, tr.urgency, tr.recommended_care_level,
                tr.red_flags, tr.ai_response, tr.created_at,
                u.full_name AS created_by_name
            FROM triage_records tr
            LEFT JOIN users u ON u.id = tr.created_by
            WHERE tr.patient_id = ${idNum}
            ORDER BY tr.created_at DESC
        `;

        return sendSuccess(res, 200, "Triage history retrieved.", {
            patient_id: idNum,
            count: records.length,
            triage_records: records,
        });
    } catch (error) {
        next(error);
    }
};
