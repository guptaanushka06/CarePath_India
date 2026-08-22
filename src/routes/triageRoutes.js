import { Router } from "express";
import {
    createTriage,
    getTriageHistory,
} from "../controllers/triageController.js";
import { authenticate } from "../middleware/authMiddleware.js";
import { authorize } from "../middleware/roleMiddleware.js";

const router = Router();

// All triage routes require authentication
router.use(authenticate);

// POST /api/triage — Run AI-assisted preliminary triage
// Health workers and doctors can initiate triage; not patients directly
router.post(
    "/",
    authorize("health_worker", "doctor", "facility_admin", "district_admin"),
    createTriage
);

// GET /api/triage/:patientId — Get triage history for a patient
// Any authenticated user can attempt; controller enforces authorization
router.get("/:patientId", getTriageHistory);

export default router;
