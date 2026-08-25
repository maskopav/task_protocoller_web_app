import express from "express";
import { participantSignup,
    participantLogin,
    forgotPassword,
    resetPassword,
    adminLogin,
    adminForgotPassword,
    adminResetPassword,
    setupAdminProfile
 } from "../controllers/authController.js";
import { loginLimiter, authLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

router.post("/signup", authLimiter, participantSignup);
router.post("/login", loginLimiter, participantLogin);
router.post("/forgot-password", authLimiter, forgotPassword);
router.post("/reset-password", authLimiter, resetPassword);
router.post("/admin/login", loginLimiter, adminLogin);
router.post("/admin/forgot-password", authLimiter, adminForgotPassword);
router.post("/admin/reset-password", authLimiter, adminResetPassword);
router.post("/setup-profile", authLimiter, setupAdminProfile);


export default router;