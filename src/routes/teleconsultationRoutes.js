/**
 * Teleconsultation Routes — Rural CareLink Developer 2
 *
 * POST   /api/teleconsultations              — Create consultation
 * GET    /api/teleconsultations/:id          — Get consultation
 * PATCH  /api/teleconsultations/:id/status   — Update status
 * POST   /api/teleconsultations/:id/end      — End consultation
 */

import { Router } from "express";
import { authenticate } from "../middleware/authMiddleware.js";
import { authorize } from "../middleware/roleMiddleware.js";
import {
    createTeleconsultation,
    getTeleconsultation,
    updateTeleconsultationStatus,
    endTeleconsultation,
} from "../controllers/teleconsultationController.js";

const router = Router();

/**
 * POST /api/teleconsultations
 * Create a new teleconsultation request.
 * Roles: health_worker, doctor, facility_admin
 */
router.post(
    "/",
    authenticate,
    authorize("health_worker", "doctor", "facility_admin"),
    createTeleconsultation
);

/**
 * GET /api/teleconsultations/:id
 * Retrieve a single teleconsultation.
 * Roles: all authenticated (authorization enforced in controller)
 */
router.get(
    "/:id",
    authenticate,
    getTeleconsultation
);

/**
 * PATCH /api/teleconsultations/:id/status
 * Update teleconsultation status (with transition validation).
 * Roles: health_worker, doctor, facility_admin
 */
router.patch(
    "/:id/status",
    authenticate,
    authorize("health_worker", "doctor", "facility_admin"),
    updateTeleconsultationStatus
);

/**
 * POST /api/teleconsultations/:id/end
 * End a teleconsultation and record doctor notes.
 * Roles: doctor, facility_admin
 */
router.post(
    "/:id/end",
    authenticate,
    authorize("doctor", "facility_admin"),
    endTeleconsultation
);

export default router;
