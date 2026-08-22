import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import initDB from "./initDB.js";

// ─── Developer 1 routes ───────────────────────────────────────────────────
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import facilityRoutes from "./routes/facilityRoutes.js";
import doctorRoutes from "./routes/doctorRoutes.js";
import appointmentRoutes from "./routes/appointmentRoutes.js";
import queueRoutes from "./routes/queueRoutes.js";

// ─── Developer 2 routes ───────────────────────────────────────────────────
import patientRoutes from "./routes/patientRoutes.js";
import medicalRecordRoutes from "./routes/medicalRecordRoutes.js";
import triageRoutes from "./routes/triageRoutes.js";
import referralRoutes from "./routes/referralRoutes.js";
import followupRoutes from "./routes/followupRoutes.js";
import diagnosticRoutes from "./routes/diagnosticRoutes.js";
import medicineRoutes from "./routes/medicineRoutes.js";

// ─── Developer 2 Service Routes ───────────────────────────────────────────
import aiRoutes from "./routes/aiRoutes.js";
import teleconsultationRoutes from "./routes/teleconsultationRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import interoperabilityRoutes from "./routes/interoperabilityRoutes.js";
import syncRoutes from "./routes/syncRoutes.js";
import emergencyRoutes from "./routes/emergencyRoutes.js";

// ─── Middleware ────────────────────────────────────────────────────────────
import { errorHandler, notFoundHandler } from "./middleware/errorMiddleware.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Middleware ────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Health check ─────────────────────────────────────────────────────────
app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "Rural CareLink API is running.",
        version: "1.0.0",
    });
});

// ─── Developer 1 Routes ───────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/facilities", facilityRoutes);
app.use("/api/doctors", doctorRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/queue", queueRoutes);

// ─── Developer 2 Routes ───────────────────────────────────────────────────
app.use("/api/patients", patientRoutes);
app.use("/api/records", medicalRecordRoutes);
app.use("/api/triage", triageRoutes);
app.use("/api/referrals", referralRoutes);
app.use("/api/followups", followupRoutes);
app.use("/api/diagnostics", diagnosticRoutes);
app.use("/api/medicines", medicineRoutes);

// ─── Developer 2 Service Routes ───────────────────────────────────────────
app.use("/api/ai", aiRoutes);
app.use("/api/teleconsultations", teleconsultationRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/interoperability", interoperabilityRoutes);
app.use("/api/sync", syncRoutes);
app.use("/api/emergency", emergencyRoutes);

// ─── Error handling (must be last) ────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ─── Start server ─────────────────────────────────────────────────────────
app.listen(PORT, async () => {
    console.log(`✅ Rural CareLink server running on port ${PORT}`);
    console.log(`   Environment: ${process.env.NODE_ENV || "development"}`);
    try {
        await initDB();
    } catch (err) {
        console.error("⚠️ Failed to auto-initialize tables:", err.message);
    }
});

export default app;
