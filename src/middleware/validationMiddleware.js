import { sendError } from "../utils/response.js";

/**
 * Validation middleware factory.
 *
 * Accepts a validation function that receives the request body
 * and returns an object: { valid: boolean, errors: string[] }
 *
 * Usage:
 *   validate(validateRegisterInput)
 */
export const validate = (validationFn) => {
    return (req, res, next) => {
        const { valid, errors } = validationFn(req.body);

        if (!valid) {
            return sendError(res, 400, errors.join(", "), "VALIDATION_ERROR");
        }

        next();
    };
};

// ─── Common Validators ────────────────────────────────────────

/**
 * Validates user registration input.
 */
export const validateRegisterInput = (body) => {
    const errors = [];

    if (!body.full_name || body.full_name.trim().length < 2) {
        errors.push("Full name is required (min 2 characters)");
    }

    if (!body.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
        errors.push("A valid email is required");
    }

    if (!body.password || body.password.length < 6) {
        errors.push("Password must be at least 6 characters");
    }

    const validRoles = ["patient", "health_worker", "doctor", "facility_admin", "district_admin"];
    if (body.role && !validRoles.includes(body.role)) {
        errors.push(`Role must be one of: ${validRoles.join(", ")}`);
    }

    return { valid: errors.length === 0, errors };
};

/**
 * Validates login input.
 */
export const validateLoginInput = (body) => {
    const errors = [];

    if (!body.email) {
        errors.push("Email is required");
    }

    if (!body.password) {
        errors.push("Password is required");
    }

    return { valid: errors.length === 0, errors };
};

/**
 * Validates facility creation/update input.
 */
export const validateFacilityInput = (body) => {
    const errors = [];

    if (!body.name || body.name.trim().length < 2) {
        errors.push("Facility name is required (min 2 characters)");
    }

    const validTypes = ["sub_centre", "phc", "chc", "district_hospital", "tertiary"];
    if (!body.facility_type || !validTypes.includes(body.facility_type)) {
        errors.push(`Facility type must be one of: ${validTypes.join(", ")}`);
    }

    return { valid: errors.length === 0, errors };
};

/**
 * Validates doctor profile creation input.
 */
export const validateDoctorInput = (body) => {
    const errors = [];

    if (!body.user_id) {
        errors.push("user_id is required");
    }

    return { valid: errors.length === 0, errors };
};
