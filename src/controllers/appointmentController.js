/**
 * Appointment Controller — Rural CareLink Developer 1
 *
 * POST   /api/appointments              — Create appointment
 * GET    /api/appointments/:id          — Get appointment by ID
 * PATCH  /api/appointments/:id          — Update appointment
 * DELETE /api/appointments/:id          — Cancel appointment
 * GET    /api/appointments/patient/:patientId — Patient's appointments
 * GET    /api/appointments/doctor/:doctorId   — Doctor's appointments
 */

import { sql } from "../db.js";
import { sendSuccess, sendError } from "../utils/response.js";

const VALID_STATUSES = ["scheduled", "confirmed", "in_progress", "completed", "cancelled", "no_show"];

// ─── POST /api/appointments ────────────────────────────────────────────────
export const createAppointment = async (req, res, next) => {
    try {
        const {
            patient_id,
            doctor_id,
            facility_id,
            appointment_date,
            reason,
            notes,
        } = req.body;

        if (!patient_id) {
            return sendError(res, 400, "patient_id is required.", "VALIDATION_ERROR");
        }
        if (!appointment_date) {
            return sendError(res, 400, "appointment_date is required.", "VALIDATION_ERROR");
        }

        const patientIdNum = parseInt(patient_id, 10);
        if (isNaN(patientIdNum)) {
            return sendError(res, 400, "patient_id must be a valid integer.", "VALIDATION_ERROR");
        }

        // Appointment must not be in the past
        const apptDate = new Date(appointment_date);
        if (isNaN(apptDate.getTime())) {
            return sendError(res, 400, "appointment_date is not a valid date/time.", "VALIDATION_ERROR");
        }
        if (apptDate < new Date()) {
            return sendError(res, 400, "appointment_date must be in the future.", "VALIDATION_ERROR");
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

        const result = await sql`
            INSERT INTO appointments (
                patient_id, doctor_id, facility_id,
                appointment_date, reason, notes, status, created_by
            )
            VALUES (
                ${patientIdNum},
                ${doctorIdNum},
                ${facilityIdNum},
                ${appointment_date},
                ${reason || null},
                ${notes || null},
                'scheduled',
                ${req.user.id}
            )
            RETURNING *
        `;

        return sendSuccess(res, 201, "Appointment created successfully.", {
            appointment: result[0],
        });
    } catch (error) {
        next(error);
    }
};

// ─── GET /api/appointments/patient/:patientId ─────────────────────────────
// IMPORTANT: Must be registered BEFORE /:id in router
export const getPatientAppointments = async (req, res, next) => {
    try {
        const { patientId } = req.params;
        const idNum = parseInt(patientId, 10);
        if (isNaN(idNum)) {
            return sendError(res, 400, "patientId must be a valid integer.", "VALIDATION_ERROR");
        }

        const patientCheck = await sql`SELECT id, user_id FROM patients WHERE id = ${idNum}`;
        if (patientCheck.length === 0) {
            return sendError(res, 404, "Patient not found.", "PATIENT_NOT_FOUND");
        }

        // Patients can only view their own appointments
        if (req.user.role === "patient" && patientCheck[0].user_id !== req.user.id) {
            return sendError(res, 403, "You are not authorized to view this patient's appointments.", "FORBIDDEN");
        }

        const appointments = await sql`
            SELECT
                a.*,
                u.full_name AS doctor_name,
                d.specialization,
                f.name AS facility_name
            FROM appointments a
            LEFT JOIN doctors d ON d.id = a.doctor_id
            LEFT JOIN users u ON u.id = d.user_id
            LEFT JOIN facilities f ON f.id = a.facility_id
            WHERE a.patient_id = ${idNum}
            ORDER BY a.appointment_date DESC
        `;

        return sendSuccess(res, 200, "Patient appointments retrieved.", {
            patient_id: idNum,
            count: appointments.length,
            appointments,
        });
    } catch (error) {
        next(error);
    }
};

// ─── GET /api/appointments/doctor/:doctorId ───────────────────────────────
// IMPORTANT: Must be registered BEFORE /:id in router
export const getDoctorAppointments = async (req, res, next) => {
    try {
        const { doctorId } = req.params;
        const idNum = parseInt(doctorId, 10);
        if (isNaN(idNum)) {
            return sendError(res, 400, "doctorId must be a valid integer.", "VALIDATION_ERROR");
        }

        // Patients cannot access doctor appointment lists
        if (req.user.role === "patient") {
            return sendError(res, 403, "Patients cannot access doctor appointment lists.", "FORBIDDEN");
        }

        const doctorCheck = await sql`SELECT id FROM doctors WHERE id = ${idNum}`;
        if (doctorCheck.length === 0) {
            return sendError(res, 404, "Doctor not found.", "DOCTOR_NOT_FOUND");
        }

        const appointments = await sql`
            SELECT
                a.*,
                pu.full_name AS patient_name,
                f.name AS facility_name
            FROM appointments a
            LEFT JOIN patients p ON p.id = a.patient_id
            LEFT JOIN users pu ON pu.id = p.user_id
            LEFT JOIN facilities f ON f.id = a.facility_id
            WHERE a.doctor_id = ${idNum}
            ORDER BY a.appointment_date ASC
        `;

        return sendSuccess(res, 200, "Doctor appointments retrieved.", {
            doctor_id: idNum,
            count: appointments.length,
            appointments,
        });
    } catch (error) {
        next(error);
    }
};

// ─── GET /api/appointments/:id ────────────────────────────────────────────
export const getAppointment = async (req, res, next) => {
    try {
        const idNum = parseInt(req.params.id, 10);
        if (isNaN(idNum)) {
            return sendError(res, 400, "Appointment ID must be a valid integer.", "VALIDATION_ERROR");
        }

        const result = await sql`
            SELECT
                a.*,
                pu.full_name AS patient_name,
                u.full_name AS doctor_name,
                d.specialization,
                f.name AS facility_name
            FROM appointments a
            LEFT JOIN patients p ON p.id = a.patient_id
            LEFT JOIN users pu ON pu.id = p.user_id
            LEFT JOIN doctors d ON d.id = a.doctor_id
            LEFT JOIN users u ON u.id = d.user_id
            LEFT JOIN facilities f ON f.id = a.facility_id
            WHERE a.id = ${idNum}
        `;

        if (result.length === 0) {
            return sendError(res, 404, "Appointment not found.", "NOT_FOUND");
        }

        const appt = result[0];

        // Authorization: patients can only view their own appointments
        if (req.user.role === "patient") {
            const patCheck = await sql`SELECT user_id FROM patients WHERE id = ${appt.patient_id}`;
            if (patCheck.length === 0 || patCheck[0].user_id !== req.user.id) {
                return sendError(res, 403, "You are not authorized to view this appointment.", "FORBIDDEN");
            }
        }

        return sendSuccess(res, 200, "Appointment retrieved.", { appointment: appt });
    } catch (error) {
        next(error);
    }
};

// ─── PATCH /api/appointments/:id ──────────────────────────────────────────
export const updateAppointment = async (req, res, next) => {
    try {
        const idNum = parseInt(req.params.id, 10);
        if (isNaN(idNum)) {
            return sendError(res, 400, "Appointment ID must be a valid integer.", "VALIDATION_ERROR");
        }

        const { status, appointment_date, reason, notes } = req.body;

        // Validate status if provided
        if (status && !VALID_STATUSES.includes(status)) {
            return sendError(
                res, 400,
                `status must be one of: ${VALID_STATUSES.join(", ")}.`,
                "VALIDATION_ERROR"
            );
        }

        // Validate appointment_date if provided
        if (appointment_date) {
            const apptDate = new Date(appointment_date);
            if (isNaN(apptDate.getTime())) {
                return sendError(res, 400, "appointment_date is not a valid date/time.", "VALIDATION_ERROR");
            }
        }

        // Fetch existing appointment
        const existing = await sql`SELECT * FROM appointments WHERE id = ${idNum}`;
        if (existing.length === 0) {
            return sendError(res, 404, "Appointment not found.", "NOT_FOUND");
        }

        const appt = existing[0];

        // Patients can only cancel their own appointments
        if (req.user.role === "patient") {
            const patCheck = await sql`SELECT user_id FROM patients WHERE id = ${appt.patient_id}`;
            if (patCheck.length === 0 || patCheck[0].user_id !== req.user.id) {
                return sendError(res, 403, "You are not authorized to update this appointment.", "FORBIDDEN");
            }
            // Patients can only cancel
            if (status && status !== "cancelled") {
                return sendError(res, 403, "Patients can only cancel appointments.", "FORBIDDEN");
            }
        }

        // Cannot update a completed or cancelled appointment
        if (appt.status === "completed" || appt.status === "cancelled") {
            return sendError(
                res, 409,
                `Cannot update a ${appt.status} appointment.`,
                "CONFLICT"
            );
        }

        const result = await sql`
            UPDATE appointments
            SET
                status           = COALESCE(${status || null}, status),
                appointment_date = COALESCE(${appointment_date || null}::timestamp, appointment_date),
                reason           = COALESCE(${reason || null}, reason),
                notes            = COALESCE(${notes || null}, notes),
                updated_at       = CURRENT_TIMESTAMP
            WHERE id = ${idNum}
            RETURNING *
        `;

        return sendSuccess(res, 200, "Appointment updated.", { appointment: result[0] });
    } catch (error) {
        next(error);
    }
};

// ─── DELETE /api/appointments/:id — Cancel appointment ────────────────────
export const cancelAppointment = async (req, res, next) => {
    try {
        const idNum = parseInt(req.params.id, 10);
        if (isNaN(idNum)) {
            return sendError(res, 400, "Appointment ID must be a valid integer.", "VALIDATION_ERROR");
        }

        const existing = await sql`SELECT * FROM appointments WHERE id = ${idNum}`;
        if (existing.length === 0) {
            return sendError(res, 404, "Appointment not found.", "NOT_FOUND");
        }

        const appt = existing[0];

        // Authorization: patients can only cancel their own
        if (req.user.role === "patient") {
            const patCheck = await sql`SELECT user_id FROM patients WHERE id = ${appt.patient_id}`;
            if (patCheck.length === 0 || patCheck[0].user_id !== req.user.id) {
                return sendError(res, 403, "You are not authorized to cancel this appointment.", "FORBIDDEN");
            }
        }

        if (appt.status === "completed" || appt.status === "cancelled") {
            return sendError(
                res, 409,
                `Appointment is already ${appt.status}.`,
                "CONFLICT"
            );
        }

        const result = await sql`
            UPDATE appointments
            SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
            WHERE id = ${idNum}
            RETURNING *
        `;

        return sendSuccess(res, 200, "Appointment cancelled.", { appointment: result[0] });
    } catch (error) {
        next(error);
    }
};
