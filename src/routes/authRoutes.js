import { Router } from "express";
import { register, login, getMe } from "../controllers/authController.js";
import { authenticate } from "../middleware/authMiddleware.js";
import {
    validate,
    validateRegisterInput,
    validateLoginInput,
} from "../middleware/validationMiddleware.js";

const router = Router();

// POST /api/auth/register — Create account
router.post("/register", validate(validateRegisterInput), register);

// POST /api/auth/login — Authenticate user
router.post("/login", validate(validateLoginInput), login);

// GET /api/auth/me — Get logged-in user profile
router.get("/me", authenticate, getMe);

export default router;
