import { Router } from "express";
import {
    listFacilities,
    getFacility,
    createFacility,
    updateFacility,
} from "../controllers/facilityController.js";
import { authenticate } from "../middleware/authMiddleware.js";
import { authorize } from "../middleware/roleMiddleware.js";
import { validate, validateFacilityInput } from "../middleware/validationMiddleware.js";

const router = Router();

// All facility routes require authentication
router.use(authenticate);

// GET /api/facilities — List/search facilities (any authenticated user)
router.get("/", listFacilities);

// GET /api/facilities/:id — Get facility detail (any authenticated user)
router.get("/:id", getFacility);

// POST /api/facilities — Create facility (admin only)
router.post(
    "/",
    authorize("facility_admin", "district_admin"),
    validate(validateFacilityInput),
    createFacility
);

// PATCH /api/facilities/:id — Update facility (admin only)
router.patch(
    "/:id",
    authorize("facility_admin", "district_admin"),
    updateFacility
);

export default router;
