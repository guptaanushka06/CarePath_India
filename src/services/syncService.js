/**
 * Sync Service — Offline Synchronization — Rural CareLink
 *
 * Handles offline-to-online data synchronization.
 *
 * IMPORTANT:
 *   The existing schema does NOT have a sync_records table for tracking
 *   idempotency and sync state. This service operates in two modes:
 *
 *   MODE 1 (current): Best-effort sync — validates and applies records,
 *     uses application-level checks to detect duplicates where possible.
 *     Full idempotency tracking requires Developer 1 to add sync_records.
 *
 *   MODE 2 (with sync_records table — requires Developer 1 schema work):
 *     Full idempotency guaranteed via client_record_id deduplication.
 *
 * Required schema for full idempotency (add to initDB.js):
 *
 *   CREATE TABLE IF NOT EXISTS sync_records (
 *     id SERIAL PRIMARY KEY,
 *     client_record_id VARCHAR(255) NOT NULL UNIQUE,
 *     entity_type VARCHAR(50) NOT NULL,
 *     operation VARCHAR(20) NOT NULL,
 *     status VARCHAR(30) DEFAULT 'applied',
 *     applied_server_id INTEGER,
 *     conflict_reason TEXT,
 *     synced_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
 *     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
 *   );
 *
 * Supported entity types: patient | medical_record | triage | followup
 * Supported operations: create | update
 */

import { sql } from "../db.js";

const SUPPORTED_ENTITY_TYPES = ["patient", "medical_record", "triage", "followup"];
const SUPPORTED_OPERATIONS = ["create", "update"];

// Track if sync table exists (lazy check)
let syncTableConfirmed = null;

async function syncTableExists() {
    if (syncTableConfirmed !== null) return syncTableConfirmed;
    try {
        await sql`SELECT 1 FROM sync_records LIMIT 1`;
        syncTableConfirmed = true;
    } catch {
        syncTableConfirmed = false;
    }
    return syncTableConfirmed;
}

/**
 * validateSyncPayload — validates the sync request structure.
 * @param {object} payload
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateSyncPayload(payload) {
    const errors = [];

    if (!payload || typeof payload !== "object") {
        errors.push("Payload must be a JSON object.");
        return { valid: false, errors };
    }

    if (!payload.client_record_id || typeof payload.client_record_id !== "string" || payload.client_record_id.trim() === "") {
        errors.push("client_record_id is required and must be a non-empty string.");
    }

    if (!payload.operation || !SUPPORTED_OPERATIONS.includes(payload.operation)) {
        errors.push(`operation must be one of: ${SUPPORTED_OPERATIONS.join(", ")}.`);
    }

    if (!payload.entity_type || !SUPPORTED_ENTITY_TYPES.includes(payload.entity_type)) {
        errors.push(`entity_type must be one of: ${SUPPORTED_ENTITY_TYPES.join(", ")}.`);
    }

    if (!payload.payload || typeof payload.payload !== "object") {
        errors.push("payload.payload must be a JSON object.");
    }

    return { valid: errors.length === 0, errors };
}

/**
 * checkDuplicate — checks if a client_record_id has already been processed.
 * Returns true if duplicate detected (should skip), false if new.
 * @param {string} clientRecordId
 * @returns {Promise<boolean>}
 */
async function checkDuplicate(clientRecordId) {
    const hasTable = await syncTableExists();
    if (!hasTable) return false; // Cannot check without table — proceed

    try {
        const result = await sql`
            SELECT id FROM sync_records WHERE client_record_id = ${clientRecordId} LIMIT 1
        `;
        return result.length > 0;
    } catch {
        return false;
    }
}

/**
 * recordSyncEvent — records a processed sync event for idempotency.
 * Silent fail if table is not available.
 */
async function recordSyncEvent({ client_record_id, entity_type, operation, status, applied_server_id, conflict_reason, synced_by }) {
    const hasTable = await syncTableExists();
    if (!hasTable) return;

    try {
        await sql`
            INSERT INTO sync_records (client_record_id, entity_type, operation, status, applied_server_id, conflict_reason, synced_by)
            VALUES (${client_record_id}, ${entity_type}, ${operation}, ${status}, ${applied_server_id || null}, ${conflict_reason || null}, ${synced_by || null})
            ON CONFLICT (client_record_id) DO NOTHING
        `;
    } catch (err) {
        console.warn("[SyncService] Failed to record sync event:", err.message);
    }
}

// ─── Entity-specific sync handlers ────────────────────────────────────────

async function syncPatient(operation, data, userId) {
    if (operation === "create") {
        // Check for duplicate by user_id if provided
        if (data.user_id) {
            const existing = await sql`SELECT id FROM patients WHERE user_id = ${data.user_id} LIMIT 1`;
            if (existing.length > 0) {
                return { action: "skipped", reason: "Patient with this user_id already exists.", server_id: existing[0].id };
            }
        }

        const result = await sql`
            INSERT INTO patients (user_id, date_of_birth, gender, blood_group, address, district, known_conditions)
            VALUES (${data.user_id || null}, ${data.date_of_birth || null}, ${data.gender || null}, ${data.blood_group || null}, ${data.address || null}, ${data.district || null}, ${data.known_conditions || null})
            RETURNING id
        `;
        return { action: "created", server_id: result[0].id };
    }

    if (operation === "update" && data.id) {
        const result = await sql`
            UPDATE patients SET
                date_of_birth = COALESCE(${data.date_of_birth || null}, date_of_birth),
                gender = COALESCE(${data.gender || null}, gender),
                blood_group = COALESCE(${data.blood_group || null}, blood_group),
                address = COALESCE(${data.address || null}, address),
                district = COALESCE(${data.district || null}, district),
                known_conditions = COALESCE(${data.known_conditions || null}, known_conditions),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ${parseInt(data.id, 10)}
            RETURNING id
        `;
        if (result.length === 0) return { action: "not_found", server_id: null };
        return { action: "updated", server_id: result[0].id };
    }

    return { action: "unsupported", reason: `Operation '${operation}' not supported for patient without id.` };
}

async function syncMedicalRecord(operation, data) {
    if (operation === "create") {
        if (!data.patient_id) return { action: "error", reason: "patient_id is required." };

        const vitalsJson = data.vitals ? JSON.stringify(data.vitals) : null;

        let result;
        if (vitalsJson) {
            result = await sql`
                INSERT INTO medical_records (patient_id, doctor_id, facility_id, symptoms, vitals, clinical_notes, assessment, prescription, visit_date)
                VALUES (${parseInt(data.patient_id, 10)}, ${data.doctor_id ? parseInt(data.doctor_id, 10) : null}, ${data.facility_id ? parseInt(data.facility_id, 10) : null}, ${data.symptoms || null}, ${vitalsJson}::jsonb, ${data.clinical_notes || null}, ${data.assessment || null}, ${data.prescription || null}, ${data.visit_date || null})
                RETURNING id
            `;
        } else {
            result = await sql`
                INSERT INTO medical_records (patient_id, doctor_id, facility_id, symptoms, vitals, clinical_notes, assessment, prescription, visit_date)
                VALUES (${parseInt(data.patient_id, 10)}, ${data.doctor_id ? parseInt(data.doctor_id, 10) : null}, ${data.facility_id ? parseInt(data.facility_id, 10) : null}, ${data.symptoms || null}, NULL, ${data.clinical_notes || null}, ${data.assessment || null}, ${data.prescription || null}, ${data.visit_date || null})
                RETURNING id
            `;
        }
        return { action: "created", server_id: result[0].id };
    }

    return { action: "unsupported", reason: "Only 'create' is supported for medical_record sync." };
}

async function syncFollowup(operation, data) {
    if (operation === "create") {
        if (!data.patient_id) return { action: "error", reason: "patient_id is required." };
        if (!data.followup_date) return { action: "error", reason: "followup_date is required." };

        const result = await sql`
            INSERT INTO followups (patient_id, doctor_id, facility_id, followup_date, reason, status, notes)
            VALUES (${parseInt(data.patient_id, 10)}, ${data.doctor_id ? parseInt(data.doctor_id, 10) : null}, ${data.facility_id ? parseInt(data.facility_id, 10) : null}, ${data.followup_date}, ${data.reason || null}, ${data.status || "pending"}, ${data.notes || null})
            RETURNING id
        `;
        return { action: "created", server_id: result[0].id };
    }

    return { action: "unsupported", reason: "Only 'create' is supported for followup sync." };
}

// ─── Main Sync Handler ────────────────────────────────────────────────────

/**
 * processSyncRecord — applies a single offline sync record.
 *
 * @param {object} syncItem - Validated sync payload
 * @param {number} userId - Authenticated user performing sync
 * @returns {Promise<object>} Sync result
 */
export async function processSyncRecord(syncItem, userId) {
    const { client_record_id, operation, entity_type, payload: data } = syncItem;

    // Check idempotency
    const isDuplicate = await checkDuplicate(client_record_id);
    if (isDuplicate) {
        return {
            client_record_id,
            entity_type,
            operation,
            result: "duplicate",
            message: "This record has already been synced (idempotency check).",
        };
    }

    let applyResult;
    try {
        switch (entity_type) {
            case "patient":
                applyResult = await syncPatient(operation, data, userId);
                break;
            case "medical_record":
                applyResult = await syncMedicalRecord(operation, data);
                break;
            case "followup":
                applyResult = await syncFollowup(operation, data);
                break;
            case "triage":
                // Triage sync is read-only from offline — cannot replay AI calls offline
                applyResult = { action: "unsupported", reason: "Triage records cannot be synced offline. Submit symptoms online for AI triage." };
                break;
            default:
                applyResult = { action: "unsupported", reason: `Entity type '${entity_type}' not supported.` };
        }
    } catch (err) {
        console.error("[SyncService] Apply error:", err.message);
        await recordSyncEvent({
            client_record_id, entity_type, operation,
            status: "error", conflict_reason: err.message, synced_by: userId,
        });
        return {
            client_record_id,
            entity_type,
            operation,
            result: "error",
            message: "Failed to apply sync record. See server logs.",
        };
    }

    // Record the sync event
    await recordSyncEvent({
        client_record_id, entity_type, operation,
        status: applyResult.action === "created" || applyResult.action === "updated" ? "applied" : applyResult.action,
        applied_server_id: applyResult.server_id || null,
        conflict_reason: applyResult.reason || null,
        synced_by: userId,
    });

    return {
        client_record_id,
        entity_type,
        operation,
        result: applyResult.action,
        server_id: applyResult.server_id || null,
        message: applyResult.reason || `Record ${applyResult.action} successfully.`,
        idempotency_note: (await syncTableExists())
            ? "Idempotency guaranteed via sync_records table."
            : "Idempotency table (sync_records) not yet created. Full idempotency requires Developer 1 schema update.",
    };
}
