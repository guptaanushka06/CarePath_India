import { Router } from "express";
import {
    getFacilityMedicines,
    createMedicine,
    updateMedicine,
} from "../controllers/medicineController.js";
import { authenticate } from "../middleware/authMiddleware.js";
import { authorize } from "../middleware/roleMiddleware.js";

const router = Router();

// All medicine routes require authentication
router.use(authenticate);

// GET /api/medicines/facility/:facilityId — Get medicines for a facility
// Any authenticated user can view medicine availability
router.get("/facility/:facilityId", getFacilityMedicines);

// POST /api/medicines — Add a medicine to a facility's stock
// Only facility/district admins and health workers can add medicines
router.post(
    "/",
    authorize("health_worker", "facility_admin", "district_admin"),
    createMedicine
);

// PATCH /api/medicines/:id — Update medicine stock or availability
// Only facility/district admins can update stock
router.patch(
    "/:id",
    authorize("health_worker", "facility_admin", "district_admin"),
    updateMedicine
);

export default router;
