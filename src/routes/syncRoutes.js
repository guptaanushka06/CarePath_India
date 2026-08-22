/**
 * Sync Routes — Offline Synchronization — Rural CareLink Developer 2
 *
 * POST /api/sync       — Sync a single offline record
 * POST /api/sync/batch — Sync a batch of offline records (max 100)
 *
 * Access: health_worker (primary users working offline), doctor, facility_admin.
 * All sync operations are audited.
 */

import { Router } from "express";
import { authenticate } from "../middleware/authMiddleware.js";
import { authorize } from "../middleware/roleMiddleware.js";
import { syncRecord, syncBatch } from "../controllers/syncController.js";

const router = Router();

const syncRoles = ["health_worker", "doctor", "facility_admin"];

/**
 * POST /api/sync
 * Synchronize a single offline record.
 */
router.post(
    "/",
    authenticate,
    authorize(...syncRoles),
    syncRecord
);

/**
 * POST /api/sync/batch
 * Synchronize a batch of offline records.
 * NOTE: /batch must be registered before /:id if we add GET later.
 */
router.post(
    "/batch",
    authenticate,
    authorize(...syncRoles),
    syncBatch
);

export default router;
