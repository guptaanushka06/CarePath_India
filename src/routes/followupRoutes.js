import { Router } from "express";
import {
    createFollowup,
    getPatientFollowups,
    getOverdueFollowups,
    updateFollowup,
    getFollowupById,
    getHighRiskFollowups,
} from "../controllers/followupController.js";
import { authenticate } from "../middleware/authMiddleware.js";
import { authorize } from "../middleware/roleMiddleware.js";

const router = Router();

// All follow-up routes require authentication
router.use(authenticate);

// IMPORTANT: Specific sub-path routes MUST come before /:id

// GET /api/followups/overdue — Get all overdue follow-ups
// Must be registered BEFORE /:id and /patient/:patientId to avoid conflicts
router.get(
    "/overdue",
    authorize("health_worker", "doctor", "facility_admin", "district_admin"),
    getOverdueFollowups
);

// GET /api/followups/high-risk — Get follow-ups for high-risk triage patients
// Must be registered BEFORE /:id
router.get(
    "/high-risk",
    authorize("health_worker", "doctor", "facility_admin", "district_admin"),
    getHighRiskFollowups
);

// GET /api/followups/patient/:patientId — Get follow-ups for a patient
router.get("/patient/:patientId", getPatientFollowups);

// POST /api/followups — Schedule a new follow-up
router.post(
    "/",
    authorize("health_worker", "doctor", "facility_admin", "district_admin"),
    createFollowup
);

// GET /api/followups/:id — Get a single follow-up by ID
router.get("/:id", getFollowupById);

// PATCH /api/followups/:id — Update a follow-up (status, notes, date, etc.)
router.patch("/:id", updateFollowup);

export default router;

