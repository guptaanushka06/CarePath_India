/**
 * Emergency Service — Rural CareLink
 *
 * Integration logic for Developer 2 emergency escalation.
 *
 * IMPORTANT:
 *   - Developer 1 owns emergency database/API foundation.
 *   - This service does NOT make autonomous emergency decisions.
 *   - AI may FLAG and RECOMMEND escalation; final decision belongs
 *     to the authorized clinical workflow (health worker / doctor).
 *   - AI is NEVER the final authority on emergency actions.
 *
 * This service:
 *   1. Evaluates AI triage output for high/critical risk
 *   2. Returns a structured recommendation (not a command)
 *   3. Integrates with notification service for alerts
 *   4. Provides audit trail for escalation events
 */

import { sendEmergencyAlert } from "./notificationService.js";

// Risk levels that should trigger escalation recommendations
const ESCALATION_RISK_LEVELS = ["high"];
const ESCALATION_URGENCY_LEVELS = ["urgent"];

/**
 * evaluateEscalationNeed — determines whether a triage result
 * warrants an emergency escalation recommendation.
 *
 * Returns a recommendation object — NOT an automatic action.
 * A health worker or doctor MUST confirm escalation.
 *
 * @param {object} triageResult
 * @param {{ risk_level, urgency, recommended_care_level, red_flags, summary }} triageResult
 * @returns {{ escalation_recommended: boolean, reason: string, recommended_care_level: string, red_flags: string[] }}
 */
export function evaluateEscalationNeed(triageResult) {
    const {
        risk_level,
        urgency,
        recommended_care_level,
        red_flags = [],
    } = triageResult || {};

    const isHighRisk = ESCALATION_RISK_LEVELS.includes(risk_level);
    const isUrgent = ESCALATION_URGENCY_LEVELS.includes(urgency);
    const isEmergencyLevel = recommended_care_level === "emergency";

    const escalation_recommended = isHighRisk || isUrgent || isEmergencyLevel;

    let reason = "AI-assisted preliminary triage — decision support only. NOT a diagnosis.";
    if (escalation_recommended) {
        const triggers = [];
        if (isHighRisk) triggers.push(`risk level: ${risk_level}`);
        if (isUrgent) triggers.push(`urgency: ${urgency}`);
        if (isEmergencyLevel) triggers.push("emergency care level recommended");
        reason = `Preliminary triage flagged: ${triggers.join(", ")}. ` +
            "Immediate clinical assessment by a qualified health professional is required. " +
            "This AI recommendation does NOT replace clinical judgment.";
    }

    return {
        escalation_recommended,
        reason,
        recommended_care_level: recommended_care_level || "phc",
        red_flags,
        ai_safety_notice:
            "This is AI-assisted preliminary triage for decision support only. " +
            "The system does NOT diagnose or make final emergency decisions. " +
            "A qualified health professional must assess this patient.",
    };
}

/**
 * triggerEmergencyAlert — sends notifications when clinical staff
 * confirms an emergency escalation.
 *
 * This is called AFTER clinical confirmation, not directly by AI.
 *
 * @param {object} params
 * @param {string} params.workerPhone - Health worker's phone number
 * @param {string} params.workerName
 * @param {string} params.patientName
 * @param {string} params.riskLevel
 * @param {string[]} params.redFlags
 * @returns {Promise<object>} notification result
 */
export async function triggerEmergencyAlert({
    workerPhone,
    workerName,
    patientName,
    riskLevel,
    redFlags = [],
}) {
    if (!workerPhone) {
        return {
            success: false,
            message: "No recipient phone number provided for emergency alert.",
        };
    }

    return sendEmergencyAlert({
        to: workerPhone,
        workerName,
        patientName,
        riskLevel,
        redFlags,
    });
}

/**
 * buildEscalationRecord — structures the escalation event for audit purposes.
 * @param {object} params
 * @returns {object}
 */
export function buildEscalationRecord({
    patient_id,
    triage_id,
    confirmed_by_user_id,
    escalation_evaluation,
    notification_result,
}) {
    return {
        patient_id,
        triage_id,
        confirmed_by: confirmed_by_user_id,
        escalation_recommended: escalation_evaluation.escalation_recommended,
        recommended_care_level: escalation_evaluation.recommended_care_level,
        red_flags: escalation_evaluation.red_flags,
        notification_status: notification_result?.status || "not_sent",
        escalated_at: new Date().toISOString(),
        ai_safety_notice: escalation_evaluation.ai_safety_notice,
    };
}
