import { sql } from "../db.js";
import { sendSuccess, sendError } from "../utils/response.js";
import { generateReferralCode } from "../utils/generateReferralCode.js";

const VALID_STATUSES = [
    "created",
    "sent",
    "accepted",
    "appointment",
    "consulted",
    "treatment",
    "follow_up",
    "completed",
    "cancelled",
];

const VALID_PRIORITIES = ["low", "normal", "high", "emergency"];

// Define allowed forward transitions to prevent invalid status changes
const STATUS_TRANSITIONS = {
    created: ["sent", "completed", "cancelled"],
    sent: ["accepted", "created", "completed", "cancelled"],
    accepted: ["appointment", "sent", "completed", "cancelled"],
    appointment: ["consulted", "accepted", "completed"],
    consulted: ["treatment", "follow_up", "completed"],
    treatment: ["follow_up", "completed"],
    follow_up: ["completed", "treatment"],
    completed: [], // terminal state — no transitions out (can be overridden by admin)
    cancelled: [], // terminal state — no transitions out
};

// ─── POST /api/referrals ──────────────────────────────────────────────────
export const createReferral = async (req, res, next) => {
    try {
        const {
            patient_id,
            from_facility_id,
            to_facility_id,
            reason,
            priority,
        } = req.body;

        // Validate required fields
        if (!patient_id) {
            return sendError(res, 400, "patient_id is required.", "VALIDATION_ERROR");
        }
        if (!to_facility_id) {
            return sendError(res, 400, "to_facility_id is required.", "VALIDATION_ERROR");
        }

        const patientIdNum = parseInt(patient_id, 10);
        if (isNaN(patientIdNum)) {
            return sendError(res, 400, "patient_id must be a valid integer.", "VALIDATION_ERROR");
        }

        // Validate priority if provided
        if (priority && !VALID_PRIORITIES.includes(priority)) {
            return sendError(
                res,
                400,
                `priority must be one of: ${VALID_PRIORITIES.join(", ")}.`,
                "VALIDATION_ERROR"
            );
        }

        // Verify patient exists
        const patientCheck = await sql`
            SELECT id FROM patients WHERE id = ${patientIdNum}
        `;
        if (patientCheck.length === 0) {
            return sendError(res, 404, "Patient not found.", "PATIENT_NOT_FOUND");
        }

        // Verify from_facility if provided
        if (from_facility_id) {
            const fromIdNum = parseInt(from_facility_id, 10);
            if (isNaN(fromIdNum)) {
                return sendError(res, 400, "from_facility_id must be a valid integer.", "VALIDATION_ERROR");
            }
            const fromCheck = await sql`
                SELECT id FROM facilities WHERE id = ${fromIdNum}
            `;
            if (fromCheck.length === 0) {
                return sendError(res, 404, "Source facility not found.", "FACILITY_NOT_FOUND");
            }
        }

        // Verify to_facility
        const toIdNum = parseInt(to_facility_id, 10);
        if (isNaN(toIdNum)) {
            return sendError(res, 400, "to_facility_id must be a valid integer.", "VALIDATION_ERROR");
        }
        const toCheck = await sql`
            SELECT id FROM facilities WHERE id = ${toIdNum}
        `;
        if (toCheck.length === 0) {
            return sendError(res, 404, "Destination facility not found.", "FACILITY_NOT_FOUND");
        }

        // Generate unique referral code (retry once on collision)
        let referralCode = generateReferralCode();
        const codeCheck = await sql`
            SELECT id FROM referrals WHERE referral_code = ${referralCode}
        `;
        if (codeCheck.length > 0) {
            referralCode = generateReferralCode(); // regenerate on collision
        }

        const result = await sql`
            INSERT INTO referrals (
                referral_code, patient_id, from_facility_id, to_facility_id,
                created_by, reason, priority, status
            )
            VALUES (
                ${referralCode},
                ${patientIdNum},
                ${from_facility_id ? parseInt(from_facility_id, 10) : null},
                ${toIdNum},
                ${req.user.id},
                ${reason || null},
                ${priority || "normal"},
                'created'
            )
            RETURNING *
        `;

        return sendSuccess(res, 201, "Referral created successfully.", {
            referral: result[0],
        });
    } catch (error) {
        next(error);
    }
};

// ─── GET /api/referrals/:id ───────────────────────────────────────────────
export const getReferral = async (req, res, next) => {
    try {
        const { id } = req.params;

        const idNum = parseInt(id, 10);
        if (isNaN(idNum)) {
            return sendError(res, 400, "Referral ID must be a valid integer.", "VALIDATION_ERROR");
        }

        const result = await sql`
            SELECT
                r.*,
                p.user_id AS patient_user_id,
                ff.name AS from_facility_name,
                tf.name AS to_facility_name,
                u.full_name AS created_by_name
            FROM referrals r
            LEFT JOIN patients p ON p.id = r.patient_id
            LEFT JOIN facilities ff ON ff.id = r.from_facility_id
            LEFT JOIN facilities tf ON tf.id = r.to_facility_id
            LEFT JOIN users u ON u.id = r.created_by
            WHERE r.id = ${idNum}
        `;

        if (result.length === 0) {
            return sendError(res, 404, "Referral not found.", "REFERRAL_NOT_FOUND");
        }

        const referral = result[0];

        // Authorization: patients can only view their own referrals
        if (
            req.user.role === "patient" &&
            referral.patient_user_id !== req.user.id
        ) {
            return sendError(
                res,
                403,
                "You are not authorized to view this referral.",
                "FORBIDDEN"
            );
        }

        return sendSuccess(res, 200, "Referral retrieved.", { referral });
    } catch (error) {
        next(error);
    }
};

// ─── PATCH /api/referrals/:id/status ─────────────────────────────────────
export const updateReferralStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const idNum = parseInt(id, 10);
        if (isNaN(idNum)) {
            return sendError(res, 400, "Referral ID must be a valid integer.", "VALIDATION_ERROR");
        }

        if (!status) {
            return sendError(res, 400, "status is required.", "VALIDATION_ERROR");
        }

        if (!VALID_STATUSES.includes(status)) {
            return sendError(
                res,
                400,
                `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}.`,
                "INVALID_REFERRAL_STATUS"
            );
        }

        // Fetch current referral
        const existing = await sql`
            SELECT r.*, p.user_id AS patient_user_id
            FROM referrals r
            LEFT JOIN patients p ON p.id = r.patient_id
            WHERE r.id = ${idNum}
        `;
        if (existing.length === 0) {
            return sendError(res, 404, "Referral not found.", "REFERRAL_NOT_FOUND");
        }

        const referral = existing[0];
        const currentStatus = referral.status;

        // Patients cannot update status
        if (req.user.role === "patient") {
            return sendError(
                res,
                403,
                "Patients cannot update referral status.",
                "FORBIDDEN"
            );
        }

        // Validate status transition (admins bypass transition check)
        const isAdmin =
            req.user.role === "district_admin" || req.user.role === "facility_admin";

        if (!isAdmin) {
            const allowedNext = STATUS_TRANSITIONS[currentStatus] || [];
            if (!allowedNext.includes(status)) {
                return sendError(
                    res,
                    400,
                    `Invalid status transition from '${currentStatus}' to '${status}'.`,
                    "INVALID_REFERRAL_STATUS"
                );
            }
        }

        const result = await sql`
            UPDATE referrals
            SET status = ${status}, updated_at = CURRENT_TIMESTAMP
            WHERE id = ${idNum}
            RETURNING *
        `;

        return sendSuccess(res, 200, "Referral status updated.", {
            referral: result[0],
        });
    } catch (error) {
        next(error);
    }
};

// ─── GET /api/referrals/patient/:patientId ────────────────────────────────
export const getPatientReferrals = async (req, res, next) => {
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

        // Authorization: patients can only view their own referrals
        if (
            req.user.role === "patient" &&
            patientCheck[0].user_id !== req.user.id
        ) {
            return sendError(
                res,
                403,
                "You are not authorized to view this patient's referrals.",
                "FORBIDDEN"
            );
        }

        const referrals = await sql`
            SELECT
                r.*,
                ff.name AS from_facility_name,
                tf.name AS to_facility_name,
                u.full_name AS created_by_name
            FROM referrals r
            LEFT JOIN facilities ff ON ff.id = r.from_facility_id
            LEFT JOIN facilities tf ON tf.id = r.to_facility_id
            LEFT JOIN users u ON u.id = r.created_by
            WHERE r.patient_id = ${idNum}
            ORDER BY r.created_at DESC
        `;

        return sendSuccess(res, 200, "Patient referrals retrieved.", {
            patient_id: idNum,
            count: referrals.length,
            referrals,
        });
    } catch (error) {
        next(error);
    }
};

// ─── GET /api/referrals/facility/:facilityId ──────────────────────────────
export const getFacilityReferrals = async (req, res, next) => {
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

        // Patients cannot access facility-level data
        if (req.user.role === "patient") {
            return sendError(
                res,
                403,
                "Patients cannot access facility referral lists.",
                "FORBIDDEN"
            );
        }

        const referrals = await sql`
            SELECT
                r.*,
                ff.name AS from_facility_name,
                tf.name AS to_facility_name,
                u.full_name AS created_by_name
            FROM referrals r
            LEFT JOIN facilities ff ON ff.id = r.from_facility_id
            LEFT JOIN facilities tf ON tf.id = r.to_facility_id
            LEFT JOIN users u ON u.id = r.created_by
            WHERE r.from_facility_id = ${idNum} OR r.to_facility_id = ${idNum}
            ORDER BY r.created_at DESC
        `;

        return sendSuccess(res, 200, "Facility referrals retrieved.", {
            facility_id: idNum,
            count: referrals.length,
            referrals,
        });
    } catch (error) {
        next(error);
    }
};
