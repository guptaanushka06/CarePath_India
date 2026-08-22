/**
 * Interoperability Controller — Rural CareLink
 *
 * Handles FHIR-compatible data exchange.
 *
 * IMPORTANT:
 *   - Does NOT claim full ABDM integration unless explicitly configured.
 *   - All operations are access-controlled and audited.
 *   - Mapping is modular and extensible.
 *
 * Endpoints:
 *   POST /api/interoperability/export — Export patient records in FHIR format
 *   POST /api/interoperability/import — Import FHIR-compatible patient record
 */

import { sql } from "../db.js";
import { sendSuccess, sendError } from "../utils/response.js";
import {
    mapPatientToFhir,
    mapMedicalRecordToFhir,
    mapReferralToFhir,
    buildFhirBundle,
    validateFhirPatient,
    mapFhirPatientToInternal,
} from "../services/interoperabilityService.js";
import { writeAuditLog } from "../middleware/auditMiddleware.js";

// ─── POST /api/interoperability/export ───────────────────────────────────

/**
 * Exports a patient's records as a FHIR-compatible Bundle.
 * Access: health_worker, doctor, facility_admin, district_admin.
 */
export const exportPatientRecord = async (req, res, next) => {
    try {
        const { patient_id, include_records, include_referrals } = req.body;

        if (!patient_id) {
            return sendError(res, 400, "patient_id is required.", "VALIDATION_ERROR");
        }

        const patientIdNum = parseInt(patient_id, 10);
        if (isNaN(patientIdNum)) {
            return sendError(res, 400, "patient_id must be a valid integer.", "VALIDATION_ERROR");
        }

        // Fetch patient
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
        const fhirResources = [mapPatientToFhir(patient)];

        // Optionally include medical records
        if (include_records !== false) {
            const records = await sql`
                SELECT
                    mr.*,
                    u.full_name AS doctor_name,
                    f.name AS facility_name
                FROM medical_records mr
                LEFT JOIN doctors d ON d.id = mr.doctor_id
                LEFT JOIN users u ON u.id = d.user_id
                LEFT JOIN facilities f ON f.id = mr.facility_id
                WHERE mr.patient_id = ${patientIdNum}
                ORDER BY mr.visit_date DESC
                LIMIT 50
            `;
            for (const record of records) {
                fhirResources.push(mapMedicalRecordToFhir(record));
            }
        }

        // Optionally include referrals
        if (include_referrals !== false) {
            const referrals = await sql`
                SELECT
                    r.*,
                    ff.name AS from_facility_name,
                    tf.name AS to_facility_name
                FROM referrals r
                LEFT JOIN facilities ff ON ff.id = r.from_facility_id
                LEFT JOIN facilities tf ON tf.id = r.to_facility_id
                WHERE r.patient_id = ${patientIdNum}
                ORDER BY r.created_at DESC
                LIMIT 20
            `;
            for (const referral of referrals) {
                fhirResources.push(mapReferralToFhir(referral));
            }
        }

        const bundle = buildFhirBundle(fhirResources);

        await writeAuditLog({
            user_id: req.user.id,
            action: "INTEROPERABILITY_EXPORT",
            resource_type: "patient",
            resource_id: patientIdNum,
            metadata: {
                format: "FHIR-R4-compatible",
                resources_exported: fhirResources.length,
                include_records: include_records !== false,
                include_referrals: include_referrals !== false,
            },
            ip_address: req.ip,
        });

        return sendSuccess(res, 200, "Patient records exported in FHIR-compatible format.", {
            bundle,
            export_metadata: {
                format: "FHIR R4 (compatible)",
                patient_id: patientIdNum,
                total_resources: fhirResources.length,
                disclaimer:
                    "This export uses FHIR R4 as a structural model. " +
                    "It is NOT a certified ABDM or HL7 FHIR endpoint unless explicitly configured.",
            },
        });
    } catch (error) {
        next(error);
    }
};

// ─── POST /api/interoperability/import ───────────────────────────────────

/**
 * Imports a FHIR Patient resource and creates or maps an internal patient record.
 * Access: health_worker, facility_admin, district_admin.
 */
export const importPatientRecord = async (req, res, next) => {
    try {
        const { fhir_resource } = req.body;

        if (!fhir_resource || typeof fhir_resource !== "object") {
            return sendError(res, 400, "fhir_resource is required and must be a JSON object.", "VALIDATION_ERROR");
        }

        // Validate FHIR payload
        const validation = validateFhirPatient(fhir_resource);
        if (!validation.valid) {
            return sendError(
                res,
                400,
                `Invalid FHIR payload: ${validation.errors.join("; ")}`,
                "FHIR_VALIDATION_ERROR"
            );
        }

        // Map to internal format
        const internalPayload = mapFhirPatientToInternal(fhir_resource);

        // Check for existing patient via FHIR identifier
        let existingPatientId = null;
        const fhirId = fhir_resource.id;
        if (fhirId) {
            // Check if this FHIR id maps to an existing internal patient
            const idNum = parseInt(fhirId, 10);
            if (!isNaN(idNum)) {
                const check = await sql`SELECT id FROM patients WHERE id = ${idNum}`;
                if (check.length > 0) existingPatientId = idNum;
            }
        }

        let result;
        let action;

        if (existingPatientId) {
            // Update existing patient
            result = await sql`
                UPDATE patients SET
                    date_of_birth = COALESCE(${internalPayload.date_of_birth || null}, date_of_birth),
                    gender = COALESCE(${internalPayload.gender || null}, gender),
                    blood_group = COALESCE(${internalPayload.blood_group || null}, blood_group),
                    address = COALESCE(${internalPayload.address || null}, address),
                    district = COALESCE(${internalPayload.district || null}, district),
                    known_conditions = COALESCE(${internalPayload.known_conditions || null}, known_conditions),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ${existingPatientId}
                RETURNING *
            `;
            action = "updated";
        } else {
            // Create new patient
            result = await sql`
                INSERT INTO patients (date_of_birth, gender, blood_group, address, district, known_conditions)
                VALUES (
                    ${internalPayload.date_of_birth || null},
                    ${internalPayload.gender || null},
                    ${internalPayload.blood_group || null},
                    ${internalPayload.address || null},
                    ${internalPayload.district || null},
                    ${internalPayload.known_conditions || null}
                )
                RETURNING *
            `;
            action = "created";
        }

        await writeAuditLog({
            user_id: req.user.id,
            action: "INTEROPERABILITY_IMPORT",
            resource_type: "patient",
            resource_id: result[0].id,
            metadata: {
                format: "FHIR-R4-compatible",
                action,
                fhir_resource_type: fhir_resource.resourceType,
            },
            ip_address: req.ip,
        });

        return sendSuccess(
            res,
            action === "created" ? 201 : 200,
            `Patient record ${action} successfully from FHIR import.`,
            {
                patient: result[0],
                action,
                import_metadata: {
                    format: "FHIR R4 (compatible)",
                    fhir_id: fhirId || null,
                    internal_id: result[0].id,
                },
            }
        );
    } catch (error) {
        next(error);
    }
};
