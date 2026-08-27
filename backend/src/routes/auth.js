import express from "express";
import { adminLogin,
    adminForgotPassword,
    adminResetPassword,
    setupAdminProfile
 } from "../controllers/authController.js";

const router = express.Router();

router.post("/admin/login", adminLogin);
router.post("/admin/forgot-password", adminForgotPassword);
router.post("/admin/reset-password", adminResetPassword);
router.post("/setup-profile", setupAdminProfile);


export default router;