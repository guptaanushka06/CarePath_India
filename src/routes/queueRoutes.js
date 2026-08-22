/**
 * Queue Routes — Rural CareLink Developer 1
 *
 * POST   /api/queue/token                — Generate queue token
 * GET    /api/queue/facility/:facilityId — Get facility's current queue
 * GET    /api/queue/:id                  — Get queue entry by ID
 * PATCH  /api/queue/:id/status           — Update queue status
 *
 * NOTE: /token and /facility/:facilityId MUST come before /:id
 */

import { Router } from "express";
import { authenticate } from "../middleware/authMiddleware.js";
import { authorize } from "../middleware/roleMiddleware.js";
import {
    generateToken,
    getFacilityQueue,
    getQueueEntry,
    updateQueueStatus,
} from "../controllers/queueController.js";

const router = Router();

// All queue routes require authentication
router.use(authenticate);

// ── Sub-path routes FIRST (before /:id) ───────────────────────────────────

// POST /api/queue/token — Generate a queue token for a patient
router.post(
    "/token",
    authorize("health_worker", "doctor", "facility_admin", "district_admin"),
    generateToken
);

// GET /api/queue/facility/:facilityId — Get current day's facility queue
router.get(
    "/facility/:facilityId",
    authorize("health_worker", "doctor", "facility_admin", "district_admin"),
    getFacilityQueue
);

// ── Param routes AFTER sub-paths ──────────────────────────────────────────

// GET /api/queue/:id — Get a single queue entry
router.get("/:id", getQueueEntry);

// PATCH /api/queue/:id/status — Update queue entry status
router.patch(
    "/:id/status",
    authorize("health_worker", "doctor", "facility_admin", "district_admin"),
    updateQueueStatus
);

export default router;
