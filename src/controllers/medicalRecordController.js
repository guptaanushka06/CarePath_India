import { sql } from "../db.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ─── POST /api/records ────────────────────────────────────────────────────
export const createMedicalRecord = async (req, res, next) => {
    try {
        const {
            patient_id,
            doctor_id,
            facility_id,
            symptoms,
            vitals,
            clinical_notes,
            assessment,
            prescription,
            visit_date,
        } = req.body;

        // patient_id is required
        if (!patient_id) {
            return sendError(res, 400, "patient_id is required.", "VALIDATION_ERROR");
        }

        const patientIdNum = parseInt(patient_id, 10);
        if (isNaN(patientIdNum)) {
            return sendError(res, 400, "patient_id must be a valid integer.", "VALIDATION_ERROR");
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

        // Validate vitals as JSON object if provided
        if (vitals !== undefined && vitals !== null && typeof vitals !== "object") {
            return sendError(res, 400, "vitals must be a JSON object.", "VALIDATION_ERROR");
        }

        const vitalsJson = vitals ? JSON.stringify(vitals) : null;
        const visitDateValue = visit_date || null;

        // Use separate queries for with/without vitals to avoid nested sql tag issues
        let result;
        if (vitalsJson) {
            result = await sql`
                INSERT INTO medical_records (
                    patient_id, doctor_id, facility_id,
                    symptoms, vitals, clinical_notes, assessment, prescription, visit_date
                )
                VALUES (
                    ${patientIdNum},
                    ${doctor_id ? parseInt(doctor_id, 10) : null},
                    ${facility_id ? parseInt(facility_id, 10) : null},
                    ${symptoms || null},
                    ${vitalsJson}::jsonb,
                    ${clinical_notes || null},
                    ${assessment || null},
                    ${prescription || null},
                    COALESCE(${visitDateValue}::timestamp, CURRENT_TIMESTAMP)
                )
                RETURNING *
            `;
        } else {
            result = await sql`
                INSERT INTO medical_records (
                    patient_id, doctor_id, facility_id,
                    symptoms, vitals, clinical_notes, assessment, prescription, visit_date
                )
                VALUES (
                    ${patientIdNum},
                    ${doctor_id ? parseInt(doctor_id, 10) : null},
                    ${facility_id ? parseInt(facility_id, 10) : null},
                    ${symptoms || null},
                    NULL,
                    ${clinical_notes || null},
                    ${assessment || null},
                    ${prescription || null},
                    COALESCE(${visitDateValue}::timestamp, CURRENT_TIMESTAMP)
                )
                RETURNING *
            `;
        }

        return sendSuccess(res, 201, "Medical record created successfully.", {
            record: result[0],
        });
    } catch (error) {
        next(error);
    }
};

// ─── GET /api/records/:patientId ──────────────────────────────────────────
export const getMedicalHistory = async (req, res, next) => {
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

        // Authorization: patients can only view their own history
        if (
            req.user.role === "patient" &&
            patientCheck[0].user_id !== req.user.id
        ) {
            return sendError(
                res,
                403,
                "You are not authorized to view this patient's medical history.",
                "FORBIDDEN"
            );
        }

        const records = await sql`
            SELECT
                mr.id, mr.patient_id, mr.doctor_id, mr.facility_id,
                mr.symptoms, mr.vitals, mr.clinical_notes, mr.assessment,
                mr.prescription, mr.visit_date, mr.created_at,
                d.specialization AS doctor_specialization,
                u.full_name AS doctor_name,
                f.name AS facility_name, f.facility_type
            FROM medical_records mr
            LEFT JOIN doctors d ON d.id = mr.doctor_id
            LEFT JOIN users u ON u.id = d.user_id
            LEFT JOIN facilities f ON f.id = mr.facility_id
            WHERE mr.patient_id = ${idNum}
            ORDER BY mr.visit_date DESC
        `;

        return sendSuccess(res, 200, "Medical history retrieved.", {
            patient_id: idNum,
            count: records.length,
            records,
        });
    } catch (error) {
        next(error);
    }
};

// ─── GET /api/records/:patientId/latest ───────────────────────────────────
export const getLatestRecord = async (req, res, next) => {
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

        // Authorization: patients can only view their own records
        if (
            req.user.role === "patient" &&
            patientCheck[0].user_id !== req.user.id
        ) {
            return sendError(
                res,
                403,
                "You are not authorized to view this patient's medical records.",
                "FORBIDDEN"
            );
        }

        const result = await sql`
            SELECT
                mr.id, mr.patient_id, mr.doctor_id, mr.facility_id,
                mr.symptoms, mr.vitals, mr.clinical_notes, mr.assessment,
                mr.prescription, mr.visit_date, mr.created_at,
                d.specialization AS doctor_specialization,
                u.full_name AS doctor_name,
                f.name AS facility_name, f.facility_type
            FROM medical_records mr
            LEFT JOIN doctors d ON d.id = mr.doctor_id
            LEFT JOIN users u ON u.id = d.user_id
            LEFT JOIN facilities f ON f.id = mr.facility_id
            WHERE mr.patient_id = ${idNum}
            ORDER BY mr.visit_date DESC
            LIMIT 1
        `;

        if (result.length === 0) {
            return sendError(
                res,
                404,
                "No medical records found for this patient.",
                "RECORD_NOT_FOUND"
            );
        }

        return sendSuccess(res, 200, "Latest medical record retrieved.", {
            record: result[0],
        });
    } catch (error) {
        next(error);
    }
};

// ─── PATCH /api/records/:id ───────────────────────────────────────────────
export const updateMedicalRecord = async (req, res, next) => {
    try {
        const { id } = req.params;
        const idNum = parseInt(id, 10);
        if (isNaN(idNum)) {
            return sendError(res, 400, "Record ID must be a valid integer.", "VALIDATION_ERROR");
        }

        const {
            symptoms,
            vitals,
            clinical_notes,
            assessment,
            prescription,
        } = req.body;

        // Fetch existing record (and patient for auth)
        const existing = await sql`
            SELECT mr.*, p.user_id AS patient_user_id
            FROM medical_records mr
            LEFT JOIN patients p ON p.id = mr.patient_id
            WHERE mr.id = ${idNum}
        `;
        if (existing.length === 0) {
            return sendError(res, 404, "Medical record not found.", "RECORD_NOT_FOUND");
        }

        const record = existing[0];

        // Only doctors, health workers, admins can update records
        // Patients have read-only access
        if (req.user.role === "patient") {
            return sendError(res, 403, "Patients cannot update medical records.", "FORBIDDEN");
        }

        // Validate vitals if provided
        if (vitals !== undefined && vitals !== null && typeof vitals !== "object") {
            return sendError(res, 400, "vitals must be a JSON object.", "VALIDATION_ERROR");
        }

        const vitalsJson = vitals !== undefined && vitals !== null
            ? JSON.stringify(vitals)
            : null;

        let result;
        if (vitalsJson !== null) {
            result = await sql`
                UPDATE medical_records
                SET
                    symptoms      = COALESCE(${symptoms || null}, symptoms),
                    vitals        = ${vitalsJson}::jsonb,
                    clinical_notes = COALESCE(${clinical_notes || null}, clinical_notes),
                    assessment    = COALESCE(${assessment || null}, assessment),
                    prescription  = COALESCE(${prescription || null}, prescription)
                WHERE id = ${idNum}
                RETURNING *
            `;
        } else {
            result = await sql`
                UPDATE medical_records
                SET
                    symptoms      = COALESCE(${symptoms || null}, symptoms),
                    clinical_notes = COALESCE(${clinical_notes || null}, clinical_notes),
                    assessment    = COALESCE(${assessment || null}, assessment),
                    prescription  = COALESCE(${prescription || null}, prescription)
                WHERE id = ${idNum}
                RETURNING *
            `;
        }

        return sendSuccess(res, 200, "Medical record updated successfully.", {
            record: result[0],
        });
    } catch (error) {
        next(error);
    }
};

