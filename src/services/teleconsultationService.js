/**
 * Teleconsultation Service — Rural CareLink
 *
 * Manages consultation state and integration logic.
 * Does NOT implement WebRTC or video streaming.
 *
 * IMPORTANT: The teleconsultations table does NOT exist in the current
 * initDB.js schema. This service will fail gracefully if the table
 * is absent. Developer 1 must add the following table to initDB.js:
 *
 *   CREATE TABLE IF NOT EXISTS teleconsultations (
 *     id SERIAL PRIMARY KEY,
 *     patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
 *     doctor_id INTEGER REFERENCES doctors(id) ON DELETE SET NULL,
 *     created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
 *     status VARCHAR(30) DEFAULT 'requested',
 *     consultation_type VARCHAR(50) DEFAULT 'video',
 *     triage_id INTEGER REFERENCES triage_records(id) ON DELETE SET NULL,
 *     scheduled_at TIMESTAMP,
 *     started_at TIMESTAMP,
 *     ended_at TIMESTAMP,
 *     duration_minutes INTEGER,
 *     doctor_notes TEXT,
 *     provider_session_id VARCHAR(255),
 *     join_url TEXT,
 *     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 *     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
 *   );
 *
 * Valid status transitions:
 *   requested → scheduled → active → completed | cancelled
 *   scheduled → cancelled
 *
 * Provider abstraction:
 *   Real video provider details go in providerService.
 *   For demo mode, a mock join URL is returned.
 */

const VALID_STATUSES = ["requested", "scheduled", "active", "completed", "cancelled"];

const STATUS_TRANSITIONS = {
    requested: ["scheduled", "cancelled"],
    scheduled: ["active", "cancelled"],
    active: ["completed", "cancelled"],
    completed: [],
    cancelled: [],
};

// ─── Mock Provider (no real video platform configured) ────────────────────

function generateMockJoinUrl(consultationId) {
    const base = process.env.APP_BASE_URL || "https://rural-carelink.example.com";
    return `${base}/teleconsult/join/${consultationId}?mode=demo`;
}

// ─── Service Functions ─────────────────────────────────────────────────────

/**
 * Validate that a status transition is allowed.
 * @param {string} from
 * @param {string} to
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateStatusTransition(from, to) {
    if (!VALID_STATUSES.includes(to)) {
        return { valid: false, reason: `Invalid status: ${to}. Must be one of: ${VALID_STATUSES.join(", ")}.` };
    }
    const allowed = STATUS_TRANSITIONS[from] || [];
    if (!allowed.includes(to)) {
        return { valid: false, reason: `Cannot transition from '${from}' to '${to}'.` };
    }
    return { valid: true };
}

/**
 * Build the teleconsultation creation payload.
 * @param {object} params
 * @returns {object}
 */
export function buildConsultationPayload({
    patient_id,
    doctor_id,
    created_by,
    consultation_type,
    triage_id,
    scheduled_at,
}) {
    return {
        patient_id: parseInt(patient_id, 10),
        doctor_id: doctor_id ? parseInt(doctor_id, 10) : null,
        created_by: parseInt(created_by, 10),
        consultation_type: consultation_type || "video",
        triage_id: triage_id ? parseInt(triage_id, 10) : null,
        scheduled_at: scheduled_at || null,
        status: "requested",
    };
}

/**
 * generateJoinUrl — returns a provider join URL.
 * Real provider integration can be added here.
 * @param {number} consultationId
 * @returns {string}
 */
export function generateJoinUrl(consultationId) {
    const providerConfigured =
        process.env.VIDEO_PROVIDER &&
        process.env.VIDEO_PROVIDER !== "mock";

    if (providerConfigured) {
        // Future: integrate with Jitsi, Daily.co, Twilio Video, etc.
        console.warn("[TeleconsultationService] Real video provider not yet implemented. Using mock URL.");
    }

    return generateMockJoinUrl(consultationId);
}

/**
 * buildEndConsultationUpdate — computes fields to set when ending a consultation.
 * @param {object} existingConsultation
 * @param {string} doctor_notes
 * @returns {object}
 */
export function buildEndConsultationUpdate(existingConsultation, doctor_notes) {
    const endedAt = new Date().toISOString();
    let durationMinutes = null;

    if (existingConsultation.started_at) {
        const startMs = new Date(existingConsultation.started_at).getTime();
        const endMs = new Date(endedAt).getTime();
        durationMinutes = Math.round((endMs - startMs) / 60000);
    }

    return {
        status: "completed",
        ended_at: endedAt,
        duration_minutes: durationMinutes,
        doctor_notes: doctor_notes || existingConsultation.doctor_notes || null,
    };
}

export const VALID_CONSULTATION_STATUSES = VALID_STATUSES;
