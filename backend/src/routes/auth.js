import express from "express";
import { adminLogin,
    adminForgotPassword,
    adminResetPassword,
    setupAdminProfile
 } from "../controllers/authController.js";
import { loginLimiter, authLimiter } from "../middleware/rateLimiter.js";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/admin/login", loginLimiter, adminLogin);
router.post("/admin/forgot-password", authLimiter, adminForgotPassword);
router.post("/admin/reset-password", authLimiter, adminResetPassword);
// First-login profile setup acts on the caller's own account, so it needs the
// JWT issued at login (see setupAdminProfile).
router.post("/setup-profile", authLimiter, requireAuth, setupAdminProfile);


export default router;