/**
 * Dashboard Routes — Rural CareLink Developer 2
 *
 * GET /api/dashboard/metrics       — Full dashboard (all metrics)
 * GET /api/dashboard/referrals     — Referral metrics
 * GET /api/dashboard/followups     — Follow-up metrics
 * GET /api/dashboard/facilities    — Facility metrics
 * GET /api/dashboard/availability  — Medicine/diagnostic availability
 * GET /api/dashboard/emergency     — Emergency/triage metrics
 *
 * Compatibility aliases (thin wrappers, same service calls):
 * GET /api/dashboard/facility      — alias for /facilities (facility_admin scope)
 * GET /api/dashboard/district      — alias for /metrics (district_admin scope)
 * GET /api/dashboard/quality       — alias for /metrics (full quality view)
 *
 * Access: district_admin, facility_admin only.
 * All responses are aggregate — no patient-level PII exposed.
 */

import { Router } from "express";
import { authenticate } from "../middleware/authMiddleware.js";
import { authorize } from "../middleware/roleMiddleware.js";
import {
    getDashboardMetrics,
    getReferralDashboard,
    getFollowupDashboard,
    getFacilityDashboard,
    getAvailabilityDashboard,
    getEmergencyDashboard,
} from "../controllers/dashboardController.js";

const router = Router();

const adminRoles = ["district_admin", "facility_admin"];

router.get("/metrics",      authenticate, authorize(...adminRoles), getDashboardMetrics);
router.get("/referrals",    authenticate, authorize(...adminRoles), getReferralDashboard);
router.get("/followups",    authenticate, authorize(...adminRoles), getFollowupDashboard);
router.get("/facilities",   authenticate, authorize(...adminRoles), getFacilityDashboard);
router.get("/availability", authenticate, authorize(...adminRoles), getAvailabilityDashboard);
router.get("/emergency",    authenticate, authorize(...adminRoles), getEmergencyDashboard);

// ─── Compatibility aliases (specification compliance) ─────────────────────
// These call the SAME handlers as the primary routes above.
// No metric calculation is duplicated — one source of truth in the service.

/** GET /api/dashboard/facility — facility-scoped alias for /facilities */
router.get("/facility",  authenticate, authorize(...adminRoles), getFacilityDashboard);

/** GET /api/dashboard/district — district-level alias for /metrics */
router.get("/district",  authenticate, authorize("district_admin"), getDashboardMetrics);

/** GET /api/dashboard/quality  — quality-view alias for /metrics */
router.get("/quality",   authenticate, authorize(...adminRoles), getDashboardMetrics);

export default router;
