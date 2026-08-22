/**
 * Emergency Routes — Rural CareLink Developer 2
 *
 * POST   /api/emergency/escalate       — Submit/confirm emergency escalation
 * GET    /api/emergency/:id            — Retrieve escalation record by ID
 * PATCH  /api/emergency/:id/status     — Update escalation status
 *
 * NOTE: POST /api/ai/escalate (aiRoutes.js) is preserved as the AI
 * evaluation endpoint (no persistence, returns recommendation only).
 * This route adds the full clinical persistence + workflow layer.
 */

import { Router } from "express";
import { authenticate } from "../middleware/authMiddleware.js";
import { authorize } from "../middleware/roleMiddleware.js";
import {
    createEscalation,
    getEscalation,
    updateEscalationStatus,
} from "../controllers/emergencyController.js";

const router = Router();

/**
 * POST /api/emergency/escalate
 * Confirm and persist an emergency escalation.
 * Requires: health_worker, doctor, facility_admin
 * Body: { triage_id, patient_id, confirm_escalation, worker_phone }
 */
router.post(
    "/escalate",
    authenticate,
    authorize("health_worker", "doctor", "facility_admin"),
    createEscalation
);

/**
 * GET /api/emergency/:id
 * Retrieve an escalation record.
 * Requires: health_worker, doctor, facility_admin, district_admin
 */
router.get(
    "/:id",
    authenticate,
    authorize("health_worker", "doctor", "facility_admin", "district_admin"),
    getEscalation
);

/**
 * PATCH /api/emergency/:id/status
 * Update escalation status (dispatched, resolved, cancelled).
 * Requires: doctor, facility_admin, district_admin
 */
router.patch(
    "/:id/status",
    authenticate,
    authorize("doctor", "facility_admin", "district_admin"),
    updateEscalationStatus
);

export default router;
