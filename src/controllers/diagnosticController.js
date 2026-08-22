import { sql } from "../db.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ─── GET /api/diagnostics/facility/:facilityId ────────────────────────────
export const getFacilityDiagnostics = async (req, res, next) => {
    try {
        const { facilityId } = req.params;

        const idNum = parseInt(facilityId, 10);
        if (isNaN(idNum)) {
            return sendError(res, 400, "facilityId must be a valid integer.", "VALIDATION_ERROR");
        }

        // Verify facility exists
        const facilityCheck = await sql`
            SELECT id FROM facilities WHERE id = ${idNum}
        `;
        if (facilityCheck.length === 0) {
            return sendError(res, 404, "Facility not found.", "FACILITY_NOT_FOUND");
        }

        const diagnostics = await sql`
            SELECT id, facility_id, test_name, available, updated_at
            FROM diagnostics
            WHERE facility_id = ${idNum}
            ORDER BY test_name ASC
        `;

        return sendSuccess(res, 200, "Facility diagnostics retrieved.", {
            facility_id: idNum,
            count: diagnostics.length,
            diagnostics,
        });
    } catch (error) {
        next(error);
    }
};

// ─── POST /api/diagnostics ────────────────────────────────────────────────
export const createDiagnostic = async (req, res, next) => {
    try {
        const { facility_id, test_name, available } = req.body;

        // Validate required fields
        if (!facility_id) {
            return sendError(res, 400, "facility_id is required.", "VALIDATION_ERROR");
        }
        if (!test_name || test_name.trim().length === 0) {
            return sendError(res, 400, "test_name is required.", "VALIDATION_ERROR");
        }

        const facilityIdNum = parseInt(facility_id, 10);
        if (isNaN(facilityIdNum)) {
            return sendError(res, 400, "facility_id must be a valid integer.", "VALIDATION_ERROR");
        }

        // Verify facility exists
        const facilityCheck = await sql`
            SELECT id FROM facilities WHERE id = ${facilityIdNum}
        `;
        if (facilityCheck.length === 0) {
            return sendError(res, 404, "Facility not found.", "FACILITY_NOT_FOUND");
        }

        // Check for duplicate (facility_id, test_name) — enforced by DB unique constraint
        const duplicateCheck = await sql`
            SELECT id FROM diagnostics
            WHERE facility_id = ${facilityIdNum}
              AND LOWER(test_name) = LOWER(${test_name.trim()})
        `;
        if (duplicateCheck.length > 0) {
            return sendError(
                res,
                409,
                "This test already exists for this facility.",
                "DIAGNOSTIC_NOT_FOUND"
            );
        }

        const availableValue = typeof available === "boolean" ? available : false;

        const result = await sql`
            INSERT INTO diagnostics (facility_id, test_name, available)
            VALUES (${facilityIdNum}, ${test_name.trim()}, ${availableValue})
            RETURNING *
        `;

        return sendSuccess(res, 201, "Diagnostic test created successfully.", {
            diagnostic: result[0],
        });
    } catch (error) {
        // Handle DB unique constraint violation gracefully
        if (error.code === "23505") {
            return sendError(
                res,
                409,
                "This test already exists for this facility.",
                "DIAGNOSTIC_NOT_FOUND"
            );
        }
        next(error);
    }
};

// ─── PATCH /api/diagnostics/:id ───────────────────────────────────────────
export const updateDiagnostic = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { available, test_name } = req.body;

        const idNum = parseInt(id, 10);
        if (isNaN(idNum)) {
            return sendError(res, 400, "Diagnostic ID must be a valid integer.", "VALIDATION_ERROR");
        }

        // Verify the diagnostic exists
        const existing = await sql`
            SELECT id FROM diagnostics WHERE id = ${idNum}
        `;
        if (existing.length === 0) {
            return sendError(res, 404, "Diagnostic not found.", "DIAGNOSTIC_NOT_FOUND");
        }

        // Validate available if provided
        if (available !== undefined && typeof available !== "boolean") {
            return sendError(
                res,
                400,
                "available must be a boolean (true or false).",
                "VALIDATION_ERROR"
            );
        }

        const result = await sql`
            UPDATE diagnostics
            SET
                test_name  = COALESCE(${test_name ? test_name.trim() : null}, test_name),
                available  = COALESCE(${typeof available === "boolean" ? available : null}, available),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ${idNum}
            RETURNING *
        `;

        return sendSuccess(res, 200, "Diagnostic updated successfully.", {
            diagnostic: result[0],
        });
    } catch (error) {
        next(error);
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// DIAGNOSTIC REQUESTS
// ═══════════════════════════════════════════════════════════════════════════

const VALID_REQUEST_STATUSES = ["pending", "in_progress", "completed", "cancelled"];
const VALID_URGENCY = ["routine", "urgent", "emergency"];

// ─── POST /api/diagnostics/requests ──────────────────────────────────────
export const createDiagnosticRequest = async (req, res, next) => {
    try {
        const {
            patient_id,
            doctor_id,
            facility_id,
            diagnostic_id,
            test_name,
            clinical_notes,
            urgency,
        } = req.body;

        if (!patient_id) {
            return sendError(res, 400, "patient_id is required.", "VALIDATION_ERROR");
        }
        if (!test_name || test_name.trim().length === 0) {
            return sendError(res, 400, "test_name is required.", "VALIDATION_ERROR");
        }

        const patientIdNum = parseInt(patient_id, 10);
        if (isNaN(patientIdNum)) {
            return sendError(res, 400, "patient_id must be a valid integer.", "VALIDATION_ERROR");
        }

        if (urgency && !VALID_URGENCY.includes(urgency)) {
            return sendError(
                res, 400,
                `urgency must be one of: ${VALID_URGENCY.join(", ")}.`,
                "VALIDATION_ERROR"
            );
        }

        // Verify patient exists
        const patientCheck = await sql`SELECT id FROM patients WHERE id = ${patientIdNum}`;
        if (patientCheck.length === 0) {
            return sendError(res, 404, "Patient not found.", "PATIENT_NOT_FOUND");
        }

        // Verify doctor if provided
        let doctorIdNum = null;
        if (doctor_id) {
            doctorIdNum = parseInt(doctor_id, 10);
            if (isNaN(doctorIdNum)) {
                return sendError(res, 400, "doctor_id must be a valid integer.", "VALIDATION_ERROR");
            }
            const doctorCheck = await sql`SELECT id FROM doctors WHERE id = ${doctorIdNum}`;
            if (doctorCheck.length === 0) {
                return sendError(res, 404, "Doctor not found.", "DOCTOR_NOT_FOUND");
            }
        }

        // Verify facility if provided
        let facilityIdNum = null;
        if (facility_id) {
            facilityIdNum = parseInt(facility_id, 10);
            if (isNaN(facilityIdNum)) {
                return sendError(res, 400, "facility_id must be a valid integer.", "VALIDATION_ERROR");
            }
            const facilityCheck = await sql`SELECT id FROM facilities WHERE id = ${facilityIdNum}`;
            if (facilityCheck.length === 0) {
                return sendError(res, 404, "Facility not found.", "FACILITY_NOT_FOUND");
            }
        }

        // Verify diagnostic catalog entry if provided
        let diagnosticIdNum = null;
        if (diagnostic_id) {
            diagnosticIdNum = parseInt(diagnostic_id, 10);
            if (isNaN(diagnosticIdNum)) {
                return sendError(res, 400, "diagnostic_id must be a valid integer.", "VALIDATION_ERROR");
            }
            const diagCheck = await sql`SELECT id FROM diagnostics WHERE id = ${diagnosticIdNum}`;
            if (diagCheck.length === 0) {
                return sendError(res, 404, "Diagnostic catalog entry not found.", "DIAGNOSTIC_NOT_FOUND");
            }
        }

        const result = await sql`
            INSERT INTO diagnostic_requests (
                patient_id, doctor_id, facility_id, diagnostic_id,
                test_name, clinical_notes, status, urgency
            )
            VALUES (
                ${patientIdNum},
                ${doctorIdNum},
                ${facilityIdNum},
                ${diagnosticIdNum},
                ${test_name.trim()},
                ${clinical_notes || null},
                'pending',
                ${urgency || "routine"}
            )
            RETURNING *
        `;

        return sendSuccess(res, 201, "Diagnostic request created successfully.", {
            diagnostic_request: result[0],
        });
    } catch (error) {
        next(error);
    }
};

// ─── GET /api/diagnostics/requests/:id ───────────────────────────────────
export const getDiagnosticRequest = async (req, res, next) => {
    try {
        const idNum = parseInt(req.params.id, 10);
        if (isNaN(idNum)) {
            return sendError(res, 400, "Request ID must be a valid integer.", "VALIDATION_ERROR");
        }

        const result = await sql`
            SELECT
                dr.*,
                pu.full_name AS patient_name,
                u.full_name AS doctor_name,
                f.name AS facility_name,
                d.test_name AS catalog_test_name
            FROM diagnostic_requests dr
            LEFT JOIN patients p ON p.id = dr.patient_id
            LEFT JOIN users pu ON pu.id = p.user_id
            LEFT JOIN doctors doc ON doc.id = dr.doctor_id
            LEFT JOIN users u ON u.id = doc.user_id
            LEFT JOIN facilities f ON f.id = dr.facility_id
            LEFT JOIN diagnostics d ON d.id = dr.diagnostic_id
            WHERE dr.id = ${idNum}
        `;

        if (result.length === 0) {
            return sendError(res, 404, "Diagnostic request not found.", "NOT_FOUND");
        }

        const request = result[0];

        // Patients can only view their own
        if (req.user.role === "patient") {
            const patCheck = await sql`SELECT user_id FROM patients WHERE id = ${request.patient_id}`;
            if (patCheck.length === 0 || patCheck[0].user_id !== req.user.id) {
                return sendError(res, 403, "You are not authorized to view this diagnostic request.", "FORBIDDEN");
            }
        }

        return sendSuccess(res, 200, "Diagnostic request retrieved.", { diagnostic_request: request });
    } catch (error) {
        next(error);
    }
};

// ─── PATCH /api/diagnostics/requests/:id/status ───────────────────────────
export const updateDiagnosticRequestStatus = async (req, res, next) => {
    try {
        const idNum = parseInt(req.params.id, 10);
        if (isNaN(idNum)) {
            return sendError(res, 400, "Request ID must be a valid integer.", "VALIDATION_ERROR");
        }

        const { status } = req.body;
        if (!status) {
            return sendError(res, 400, "status is required.", "VALIDATION_ERROR");
        }
        if (!VALID_REQUEST_STATUSES.includes(status)) {
            return sendError(
                res, 400,
                `status must be one of: ${VALID_REQUEST_STATUSES.join(", ")}.`,
                "VALIDATION_ERROR"
            );
        }

        const existing = await sql`SELECT id, status FROM diagnostic_requests WHERE id = ${idNum}`;
        if (existing.length === 0) {
            return sendError(res, 404, "Diagnostic request not found.", "NOT_FOUND");
        }

        const currentStatus = existing[0].status;
        if (currentStatus === "completed" || currentStatus === "cancelled") {
            return sendError(
                res, 409,
                `Cannot update a ${currentStatus} diagnostic request.`,
                "CONFLICT"
            );
        }

        const result = await sql`
            UPDATE diagnostic_requests
            SET status = ${status}, updated_at = CURRENT_TIMESTAMP
            WHERE id = ${idNum}
            RETURNING *
        `;

        return sendSuccess(res, 200, "Diagnostic request status updated.", {
            diagnostic_request: result[0],
        });
    } catch (error) {
        next(error);
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// DIAGNOSTIC REPORTS
// ═══════════════════════════════════════════════════════════════════════════

// ─── POST /api/diagnostics/reports ───────────────────────────────────────
export const createDiagnosticReport = async (req, res, next) => {
    try {
        const {
            patient_id,
            request_id,
            test_name,
            result: testResult,
            result_data,
            interpretation,
        } = req.body;

        if (!patient_id) {
            return sendError(res, 400, "patient_id is required.", "VALIDATION_ERROR");
        }
        if (!test_name || test_name.trim().length === 0) {
            return sendError(res, 400, "test_name is required.", "VALIDATION_ERROR");
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

        // Verify request if provided
        let requestIdNum = null;
        if (request_id) {
            requestIdNum = parseInt(request_id, 10);
            if (isNaN(requestIdNum)) {
                return sendError(res, 400, "request_id must be a valid integer.", "VALIDATION_ERROR");
            }
            const reqCheck = await sql`SELECT id FROM diagnostic_requests WHERE id = ${requestIdNum}`;
            if (reqCheck.length === 0) {
                return sendError(res, 404, "Diagnostic request not found.", "NOT_FOUND");
            }
        }

        // Validate result_data as object if provided
        if (result_data !== undefined && result_data !== null && typeof result_data !== "object") {
            return sendError(res, 400, "result_data must be a JSON object.", "VALIDATION_ERROR");
        }

        const resultDataJson = result_data ? JSON.stringify(result_data) : null;

        let inserted;
        if (resultDataJson) {
            inserted = await sql`
                INSERT INTO diagnostic_reports (
                    patient_id, request_id, test_name,
                    result, result_data, interpretation, reported_by
                )
                VALUES (
                    ${patientIdNum},
                    ${requestIdNum},
                    ${test_name.trim()},
                    ${testResult || null},
                    ${resultDataJson}::jsonb,
                    ${interpretation || null},
                    ${req.user.id}
                )
                RETURNING *
            `;
        } else {
            inserted = await sql`
                INSERT INTO diagnostic_reports (
                    patient_id, request_id, test_name,
                    result, result_data, interpretation, reported_by
                )
                VALUES (
                    ${patientIdNum},
                    ${requestIdNum},
                    ${test_name.trim()},
                    ${testResult || null},
                    NULL,
                    ${interpretation || null},
                    ${req.user.id}
                )
                RETURNING *
            `;
        }

        // If linked to a request, mark it completed
        if (requestIdNum) {
            await sql`
                UPDATE diagnostic_requests
                SET status = 'completed', updated_at = CURRENT_TIMESTAMP
                WHERE id = ${requestIdNum} AND status != 'cancelled'
            `;
        }

        return sendSuccess(res, 201, "Diagnostic report created successfully.", {
            diagnostic_report: inserted[0],
        });
    } catch (error) {
        next(error);
    }
};

// ─── GET /api/diagnostics/reports/:id ────────────────────────────────────
export const getDiagnosticReport = async (req, res, next) => {
    try {
        const idNum = parseInt(req.params.id, 10);
        if (isNaN(idNum)) {
            return sendError(res, 400, "Report ID must be a valid integer.", "VALIDATION_ERROR");
        }

        const result = await sql`
            SELECT
                rpt.*,
                pu.full_name AS patient_name,
                u.full_name AS reported_by_name
            FROM diagnostic_reports rpt
            LEFT JOIN patients p ON p.id = rpt.patient_id
            LEFT JOIN users pu ON pu.id = p.user_id
            LEFT JOIN users u ON u.id = rpt.reported_by
            WHERE rpt.id = ${idNum}
        `;

        if (result.length === 0) {
            return sendError(res, 404, "Diagnostic report not found.", "NOT_FOUND");
        }

        const report = result[0];

        // Patients can only view their own reports
        if (req.user.role === "patient") {
            const patCheck = await sql`SELECT user_id FROM patients WHERE id = ${report.patient_id}`;
            if (patCheck.length === 0 || patCheck[0].user_id !== req.user.id) {
                return sendError(res, 403, "You are not authorized to view this diagnostic report.", "FORBIDDEN");
            }
        }

        return sendSuccess(res, 200, "Diagnostic report retrieved.", { diagnostic_report: report });
    } catch (error) {
        next(error);
    }
};

