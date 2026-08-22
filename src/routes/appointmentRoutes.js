/**
 * Appointment Routes — Rural CareLink Developer 1
 *
 * POST   /api/appointments                       — Create appointment
 * GET    /api/appointments/patient/:patientId    — Patient's appointments
 * GET    /api/appointments/doctor/:doctorId      — Doctor's appointments
 * GET    /api/appointments/:id                   — Get by ID
 * PATCH  /api/appointments/:id                   — Update
 * DELETE /api/appointments/:id                   — Cancel
 *
 * NOTE: Sub-path routes (/patient/:id, /doctor/:id) MUST come before /:id
 */

import { Router } from "express";
import { authenticate } from "../middleware/authMiddleware.js";
import { authorize } from "../middleware/roleMiddleware.js";
import {
    createAppointment,
    getPatientAppointments,
    getDoctorAppointments,
    getAppointment,
    updateAppointment,
    cancelAppointment,
} from "../controllers/appointmentController.js";

const router = Router();

// All appointment routes require authentication
router.use(authenticate);

// ── Sub-path routes FIRST (before /:id) ───────────────────────────────────

// GET /api/appointments/patient/:patientId
router.get("/patient/:patientId", getPatientAppointments);

// GET /api/appointments/doctor/:doctorId
router.get(
    "/doctor/:doctorId",
    authorize("health_worker", "doctor", "facility_admin", "district_admin"),
    getDoctorAppointments
);

// ── Primary CRUD ───────────────────────────────────────────────────────────

// POST /api/appointments — Create an appointment
router.post(
    "/",
    authorize("health_worker", "doctor", "patient", "facility_admin", "district_admin"),
    createAppointment
);

// GET /api/appointments/:id — Get appointment details
router.get("/:id", getAppointment);

// PATCH /api/appointments/:id — Update appointment
router.patch(
    "/:id",
    authorize("health_worker", "doctor", "patient", "facility_admin", "district_admin"),
    updateAppointment
);

// DELETE /api/appointments/:id — Cancel appointment
router.delete(
    "/:id",
    authorize("health_worker", "doctor", "patient", "facility_admin", "district_admin"),
    cancelAppointment
);

export default router;
