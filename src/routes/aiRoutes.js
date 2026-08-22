/**
 * AI Routes — Rural CareLink Developer 2
 *
 * POST /api/ai/summarize   — AI-assisted patient medical summary
 * POST /api/ai/translate   — Multilingual text processing
 * POST /api/ai/escalate    — Emergency escalation evaluation (AI recommendation only)
 * POST /api/ai/triage      — Compatibility alias for POST /api/triage (same handler)
 *
 * NOTE: /api/ai/triage is a thin adapter. All triage logic lives in
 * triageController.js — there is ONE source of truth. Both endpoints
 * call the identical handler. POST /api/triage continues to work.
 */

import { Router } from "express";
import { authenticate } from "../middleware/authMiddleware.js";
import { authorize } from "../middleware/roleMiddleware.js";
import {
    generatePatientSummary,
    translateClinicalText,
    evaluateEscalation,
} from "../controllers/aiController.js";
// Thin adapter: import createTriage to serve POST /api/ai/triage
import { createTriage } from "../controllers/triageController.js";

const router = Router();

// All AI routes require authentication

/**
 * POST /api/ai/summarize
 * Generate AI-assisted medical summary for a patient.
 * Roles: health_worker, doctor, facility_admin, district_admin
 */
router.post(
    "/summarize",
    authenticate,
    authorize("health_worker", "doctor", "facility_admin", "district_admin"),
    generatePatientSummary
);

/**
 * POST /api/ai/translate
 * Translate clinical text for multilingual support.
 * Roles: all authenticated users
 */
router.post(
    "/translate",
    authenticate,
    translateClinicalText
);

/**
 * POST /api/ai/escalate
 * Evaluate and optionally confirm emergency escalation from a triage record.
 * Roles: health_worker, doctor, facility_admin
 * Final escalation requires confirm_escalation: true in request body.
 */
router.post(
    "/escalate",
    authenticate,
    authorize("health_worker", "doctor", "facility_admin"),
    evaluateEscalation
);

/**
 * POST /api/ai/triage
 * Compatibility alias — delegates to the SAME createTriage handler.
 * Roles: health_worker, doctor, facility_admin, district_admin
 *
 * There is no triage logic here. The handler lives in triageController.js.
 * POST /api/triage continues to work and is the canonical endpoint.
 */
router.post(
    "/triage",
    authenticate,
    authorize("health_worker", "doctor", "facility_admin", "district_admin"),
    createTriage
);

export default router;
