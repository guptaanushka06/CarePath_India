import { Router } from "express";
import {
    listDoctors,
    getDoctor,
    createDoctor,
    updateDoctor,
} from "../controllers/doctorController.js";
import { authenticate } from "../middleware/authMiddleware.js";
import { authorize } from "../middleware/roleMiddleware.js";
import { validate, validateDoctorInput } from "../middleware/validationMiddleware.js";

const router = Router();

// All doctor routes require authentication
router.use(authenticate);

// GET /api/doctors — List doctors (any authenticated user)
router.get("/", listDoctors);

// GET /api/doctors/:id — Get doctor detail (any authenticated user)
router.get("/:id", getDoctor);

// POST /api/doctors — Create doctor profile (admin only)
router.post(
    "/",
    authorize("facility_admin", "district_admin"),
    validate(validateDoctorInput),
    createDoctor
);

// PATCH /api/doctors/:id — Update doctor profile (doctor/admin)
router.patch(
    "/:id",
    authorize("doctor", "facility_admin", "district_admin"),
    updateDoctor
);

export default router;
