import { sql } from "../db.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ─── GET /api/medicines/facility/:facilityId ──────────────────────────────
export const getFacilityMedicines = async (req, res, next) => {
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

        const medicines = await sql`
            SELECT id, facility_id, medicine_name, quantity, available, updated_at
            FROM medicines
            WHERE facility_id = ${idNum}
            ORDER BY medicine_name ASC
        `;

        return sendSuccess(res, 200, "Facility medicines retrieved.", {
            facility_id: idNum,
            count: medicines.length,
            medicines,
        });
    } catch (error) {
        next(error);
    }
};

// ─── POST /api/medicines ──────────────────────────────────────────────────
export const createMedicine = async (req, res, next) => {
    try {
        const { facility_id, medicine_name, quantity, available } = req.body;

        // Validate required fields
        if (!facility_id) {
            return sendError(res, 400, "facility_id is required.", "VALIDATION_ERROR");
        }
        if (!medicine_name || medicine_name.trim().length === 0) {
            return sendError(res, 400, "medicine_name is required.", "VALIDATION_ERROR");
        }

        const facilityIdNum = parseInt(facility_id, 10);
        if (isNaN(facilityIdNum)) {
            return sendError(res, 400, "facility_id must be a valid integer.", "VALIDATION_ERROR");
        }

        // Validate quantity
        const qty = quantity !== undefined ? parseInt(quantity, 10) : 0;
        if (isNaN(qty) || qty < 0) {
            return sendError(
                res,
                400,
                "quantity must be a non-negative integer.",
                "VALIDATION_ERROR"
            );
        }

        // Verify facility exists
        const facilityCheck = await sql`
            SELECT id FROM facilities WHERE id = ${facilityIdNum}
        `;
        if (facilityCheck.length === 0) {
            return sendError(res, 404, "Facility not found.", "FACILITY_NOT_FOUND");
        }

        // Check for duplicate (facility_id, medicine_name)
        const duplicateCheck = await sql`
            SELECT id FROM medicines
            WHERE facility_id = ${facilityIdNum}
              AND LOWER(medicine_name) = LOWER(${medicine_name.trim()})
        `;
        if (duplicateCheck.length > 0) {
            return sendError(
                res,
                409,
                "This medicine already exists for this facility.",
                "MEDICINE_NOT_FOUND"
            );
        }

        // Logical availability: if quantity > 0, available defaults to true unless explicitly set
        const availableValue =
            typeof available === "boolean" ? available : qty > 0;

        const result = await sql`
            INSERT INTO medicines (facility_id, medicine_name, quantity, available)
            VALUES (${facilityIdNum}, ${medicine_name.trim()}, ${qty}, ${availableValue})
            RETURNING *
        `;

        return sendSuccess(res, 201, "Medicine created successfully.", {
            medicine: result[0],
        });
    } catch (error) {
        // Handle DB unique constraint violation gracefully
        if (error.code === "23505") {
            return sendError(
                res,
                409,
                "This medicine already exists for this facility.",
                "MEDICINE_NOT_FOUND"
            );
        }
        next(error);
    }
};

// ─── PATCH /api/medicines/:id ─────────────────────────────────────────────
export const updateMedicine = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { quantity, available, medicine_name } = req.body;

        const idNum = parseInt(id, 10);
        if (isNaN(idNum)) {
            return sendError(res, 400, "Medicine ID must be a valid integer.", "VALIDATION_ERROR");
        }

        // Verify the medicine exists
        const existing = await sql`
            SELECT id, quantity, available FROM medicines WHERE id = ${idNum}
        `;
        if (existing.length === 0) {
            return sendError(res, 404, "Medicine not found.", "MEDICINE_NOT_FOUND");
        }

        // Validate quantity if provided
        let newQty = null;
        if (quantity !== undefined) {
            newQty = parseInt(quantity, 10);
            if (isNaN(newQty) || newQty < 0) {
                return sendError(
                    res,
                    400,
                    "quantity must be a non-negative integer.",
                    "VALIDATION_ERROR"
                );
            }
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

        // Maintain logical availability: if quantity dropped to 0, auto-set available=false
        // unless the caller explicitly provides available
        let resolvedAvailable = null;
        if (typeof available === "boolean") {
            resolvedAvailable = available;
        } else if (newQty !== null) {
            resolvedAvailable = newQty > 0;
        }

        const result = await sql`
            UPDATE medicines
            SET
                medicine_name = COALESCE(${medicine_name ? medicine_name.trim() : null}, medicine_name),
                quantity      = COALESCE(${newQty}, quantity),
                available     = COALESCE(${resolvedAvailable}, available),
                updated_at    = CURRENT_TIMESTAMP
            WHERE id = ${idNum}
            RETURNING *
        `;

        return sendSuccess(res, 200, "Medicine updated successfully.", {
            medicine: result[0],
        });
    } catch (error) {
        next(error);
    }
};
