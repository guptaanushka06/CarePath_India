import { Router } from "express";
import {
    getFacilityDiagnostics,
    createDiagnostic,
    updateDiagnostic,
    // Diagnostic requests
    createDiagnosticRequest,
    getDiagnosticRequest,
    updateDiagnosticRequestStatus,
    // Diagnostic reports
    createDiagnosticReport,
    getDiagnosticReport,
} from "../controllers/diagnosticController.js";
import { authenticate } from "../middleware/authMiddleware.js";
import { authorize } from "../middleware/roleMiddleware.js";

const router = Router();

// All diagnostic routes require authentication
router.use(authenticate);

// ── Catalog routes ─────────────────────────────────────────────────────────

// GET /api/diagnostics/facility/:facilityId — Get diagnostics for a facility
// MUST come before /:id
router.get("/facility/:facilityId", getFacilityDiagnostics);

// POST /api/diagnostics — Create a diagnostic catalog entry
router.post(
    "/",
    authorize("health_worker", "facility_admin", "district_admin"),
    createDiagnostic
);

// PATCH /api/diagnostics/:id — Update diagnostic availability
router.patch(
    "/:id",
    authorize("health_worker", "facility_admin", "district_admin"),
    updateDiagnostic
);

// ── Diagnostic Requests (sub-path routes BEFORE /:id) ─────────────────────

// POST /api/diagnostics/requests — Create a diagnostic request
router.post(
    "/requests",
    authorize("health_worker", "doctor", "facility_admin", "district_admin"),
    createDiagnosticRequest
);

// GET /api/diagnostics/requests/:id — Get a diagnostic request
router.get("/requests/:id", getDiagnosticRequest);

// PATCH /api/diagnostics/requests/:id/status — Update request status
router.patch(
    "/requests/:id/status",
    authorize("health_worker", "doctor", "facility_admin", "district_admin"),
    updateDiagnosticRequestStatus
);

// ── Diagnostic Reports ─────────────────────────────────────────────────────

// POST /api/diagnostics/reports — Submit a diagnostic report (lab tech / admin)
router.post(
    "/reports",
    authorize("health_worker", "doctor", "facility_admin", "district_admin"),
    createDiagnosticReport
);

// GET /api/diagnostics/reports/:id — Get a diagnostic report
router.get("/reports/:id", getDiagnosticReport);

export default router;

