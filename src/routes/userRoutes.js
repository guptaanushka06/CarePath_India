import { Router } from "express";
import { getUser, updateUser } from "../controllers/userController.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = Router();

// All user routes require authentication
router.use(authenticate);

// GET /api/users/:id — Get user profile
router.get("/:id", getUser);

// PATCH /api/users/:id — Update user profile
router.patch("/:id", updateUser);

export default router;
