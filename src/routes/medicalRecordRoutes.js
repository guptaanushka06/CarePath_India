import { Router } from "express";
import {
    createMedicalRecord,
    getMedicalHistory,
    getLatestRecord,
    updateMedicalRecord,
} from "../controllers/medicalRecordController.js";
import { authenticate } from "../middleware/authMiddleware.js";
import { authorize } from "../middleware/roleMiddleware.js";

const router = Router();

// All medical record routes require authentication
router.use(authenticate);

// POST /api/records — Create a medical record
// Doctors, health workers, and admins can create records
router.post(
    "/",
    authorize("health_worker", "doctor", "facility_admin", "district_admin"),
    createMedicalRecord
);

// GET /api/records/:patientId/latest — Get latest record (MUST be before /:patientId)
// Any authenticated user can attempt; controller enforces authorization
router.get("/:patientId/latest", getLatestRecord);

// GET /api/records/:patientId — Get full medical history
// Any authenticated user can attempt; controller enforces authorization
router.get("/:patientId", getMedicalHistory);

// PATCH /api/records/:id — Update a medical record (doctor/health_worker/admin only)
router.patch(
    "/:id",
    authorize("health_worker", "doctor", "facility_admin", "district_admin"),
    updateMedicalRecord
);

export default router;

