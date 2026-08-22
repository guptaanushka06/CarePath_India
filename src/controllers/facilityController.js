import { sql } from "../db.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ─── GET /api/facilities ──────────────────────────────────────
export const listFacilities = async (req, res, next) => {
    try {
        const { district, facility_type, emergency, search } = req.query;

        // Build dynamic query with optional filters
        let query;

        if (search) {
            query = sql`
                SELECT * FROM facilities
                WHERE is_active = TRUE
                  AND (
                      name ILIKE ${"%" + search + "%"}
                      OR district ILIKE ${"%" + search + "%"}
                      OR address ILIKE ${"%" + search + "%"}
                  )
                ORDER BY name
            `;
        } else if (district && facility_type) {
            query = sql`
                SELECT * FROM facilities
                WHERE is_active = TRUE
                  AND district ILIKE ${district}
                  AND facility_type = ${facility_type}
                ORDER BY name
            `;
        } else if (district) {
            query = sql`
                SELECT * FROM facilities
                WHERE is_active = TRUE
                  AND district ILIKE ${district}
                ORDER BY name
            `;
        } else if (facility_type) {
            query = sql`
                SELECT * FROM facilities
                WHERE is_active = TRUE
                  AND facility_type = ${facility_type}
                ORDER BY name
            `;
        } else if (emergency === "true") {
            query = sql`
                SELECT * FROM facilities
                WHERE is_active = TRUE
                  AND emergency_available = TRUE
                ORDER BY name
            `;
        } else {
            query = sql`
                SELECT * FROM facilities
                WHERE is_active = TRUE
                ORDER BY name
            `;
        }

        const facilities = await query;

        return sendSuccess(res, 200, "Facilities retrieved.", {
            count: facilities.length,
            facilities,
        });
    } catch (error) {
        next(error);
    }
};

// ─── GET /api/facilities/:id ─────────────────────────────────
export const getFacility = async (req, res, next) => {
    try {
        const { id } = req.params;

        const result = await sql`
            SELECT * FROM facilities WHERE id = ${id}
        `;

        if (result.length === 0) {
            return sendError(res, 404, "Facility not found.", "FACILITY_NOT_FOUND");
        }

        // Also fetch doctors at this facility
        const doctors = await sql`
            SELECT d.id, d.specialization, d.availability,
                   u.full_name, u.email, u.phone
            FROM doctors d
            JOIN users u ON u.id = d.user_id
            WHERE d.facility_id = ${id}
        `;

        // Fetch diagnostics
        const diagnostics = await sql`
            SELECT id, test_name, available, updated_at
            FROM diagnostics
            WHERE facility_id = ${id}
        `;

        // Fetch medicines
        const medicines = await sql`
            SELECT id, medicine_name, quantity, available, updated_at
            FROM medicines
            WHERE facility_id = ${id}
        `;

        return sendSuccess(res, 200, "Facility retrieved.", {
            facility: result[0],
            doctors,
            diagnostics,
            medicines,
        });
    } catch (error) {
        next(error);
    }
};

// ─── POST /api/facilities ─────────────────────────────────────
export const createFacility = async (req, res, next) => {
    try {
        const {
            name,
            facility_type,
            address,
            district,
            state,
            phone,
            latitude,
            longitude,
            emergency_available,
        } = req.body;

        const result = await sql`
            INSERT INTO facilities (
                name, facility_type, address, district, state,
                phone, latitude, longitude, emergency_available
            )
            VALUES (
                ${name},
                ${facility_type},
                ${address || null},
                ${district || null},
                ${state || "Maharashtra"},
                ${phone || null},
                ${latitude || null},
                ${longitude || null},
                ${emergency_available || false}
            )
            RETURNING *
        `;

        return sendSuccess(res, 201, "Facility created successfully.", {
            facility: result[0],
        });
    } catch (error) {
        next(error);
    }
};

// ─── PATCH /api/facilities/:id ────────────────────────────────
export const updateFacility = async (req, res, next) => {
    try {
        const { id } = req.params;
        const {
            name,
            facility_type,
            address,
            district,
            state,
            phone,
            latitude,
            longitude,
            emergency_available,
            is_active,
        } = req.body;

        const result = await sql`
            UPDATE facilities
            SET
                name                = COALESCE(${name || null}, name),
                facility_type       = COALESCE(${facility_type || null}, facility_type),
                address             = COALESCE(${address || null}, address),
                district            = COALESCE(${district || null}, district),
                state               = COALESCE(${state || null}, state),
                phone               = COALESCE(${phone || null}, phone),
                latitude            = COALESCE(${latitude || null}, latitude),
                longitude           = COALESCE(${longitude || null}, longitude),
                emergency_available = COALESCE(${typeof emergency_available === "boolean" ? emergency_available : null}, emergency_available),
                is_active           = COALESCE(${typeof is_active === "boolean" ? is_active : null}, is_active),
                updated_at          = CURRENT_TIMESTAMP
            WHERE id = ${id}
            RETURNING *
        `;

        if (result.length === 0) {
            return sendError(res, 404, "Facility not found.", "FACILITY_NOT_FOUND");
        }

        return sendSuccess(res, 200, "Facility updated successfully.", {
            facility: result[0],
        });
    } catch (error) {
        next(error);
    }
};
