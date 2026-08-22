/**
 * Interoperability Routes — Rural CareLink Developer 2
 *
 * POST /api/interoperability/export — Export patient data (FHIR-compatible)
 * POST /api/interoperability/import — Import FHIR Patient resource
 *
 * Access: health_worker, doctor, facility_admin, district_admin.
 * Patients cannot export/import their own records via this endpoint
 * (they use the standard patient APIs).
 *
 * All operations are audited.
 */

import { Router } from "express";
import { authenticate } from "../middleware/authMiddleware.js";
import { authorize } from "../middleware/roleMiddleware.js";
import {
    exportPatientRecord,
    importPatientRecord,
} from "../controllers/interoperabilityController.js";

const router = Router();

const authorizedRoles = ["health_worker", "doctor", "facility_admin", "district_admin"];

/**
 * POST /api/interoperability/export
 * Export patient records as a FHIR-compatible Bundle.
 */
router.post(
    "/export",
    authenticate,
    authorize(...authorizedRoles),
    exportPatientRecord
);

/**
 * POST /api/interoperability/import
 * Import a FHIR Patient resource into the system.
 */
router.post(
    "/import",
    authenticate,
    authorize(...authorizedRoles),
    importPatientRecord
);

export default router;
