import { Router } from "express";
import {
    createPatient,
    getPatient,
    updatePatient,
    searchPatients,
} from "../controllers/patientController.js";
import { authenticate } from "../middleware/authMiddleware.js";
import { authorize } from "../middleware/roleMiddleware.js";

const router = Router();

// All patient routes require authentication
router.use(authenticate);

// GET /api/patients/search — Search patients (MUST be before /:id)
// Health workers, doctors, and admins can search; patients cannot list others
router.get(
    "/search",
    authorize("health_worker", "doctor", "facility_admin", "district_admin"),
    searchPatients
);

// POST /api/patients — Register a new patient
// Health workers and admins create patient records; patients can also self-register
router.post(
    "/",
    authorize("health_worker", "doctor", "facility_admin", "district_admin", "patient"),
    createPatient
);

// GET /api/patients/:id — Get patient by ID
// Any authenticated user can attempt; controller enforces patient-owns-own-data
router.get("/:id", getPatient);

// PATCH /api/patients/:id — Update patient record
// Any authenticated user can attempt; controller enforces patient-owns-own-data
router.patch("/:id", updatePatient);

export default router;
