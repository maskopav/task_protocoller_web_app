// src/routes/users.js
import express from "express";
import { getAllUsers,
    toggleUserStatus,
    createAdmin,
    updateUser
 } from "../controllers/userController.js";
import { requireRole } from "../middleware/authMiddleware.js";

const router = express.Router();

// Any authenticated admin can view the admin list (router already requires auth).
router.get("/users", getAllUsers);

// Managing other admin accounts is restricted to the master role.
router.post("/toggle-status", requireRole("master"), toggleUserStatus);
router.post("/create", requireRole("master"), createAdmin);
router.put("/update", requireRole("master"), updateUser);

export default router;