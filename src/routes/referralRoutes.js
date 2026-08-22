import { Router } from "express";
import {
    createReferral,
    getReferral,
    updateReferralStatus,
    getPatientReferrals,
    getFacilityReferrals,
} from "../controllers/referralController.js";
import { authenticate } from "../middleware/authMiddleware.js";
import { authorize } from "../middleware/roleMiddleware.js";

const router = Router();

// All referral routes require authentication
router.use(authenticate);

// IMPORTANT: Specific sub-path routes MUST come before /:id

// GET /api/referrals/patient/:patientId — Get referrals for a patient
router.get("/patient/:patientId", getPatientReferrals);

// GET /api/referrals/facility/:facilityId — Get referrals for a facility
router.get(
    "/facility/:facilityId",
    authorize("health_worker", "doctor", "facility_admin", "district_admin"),
    getFacilityReferrals
);

// POST /api/referrals — Create a referral
router.post(
    "/",
    authorize("health_worker", "doctor", "facility_admin", "district_admin"),
    createReferral
);

// GET /api/referrals/:id — Get a single referral
router.get("/:id", getReferral);

// PATCH /api/referrals/:id/status — Update referral status
router.patch(
    "/:id/status",
    authorize("health_worker", "doctor", "facility_admin", "district_admin"),
    updateReferralStatus
);

export default router;
