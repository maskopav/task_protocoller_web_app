// src/routes/users.js
import express from "express";
import { getAllUsers,
    toggleUserStatus,
    createAdmin,
    updateUser
 } from "../controllers/userController.js";
import { requireRole } from "../middleware/authMiddleware.js";

const router = express.Router();

// The admin list (emails + permission flags) only feeds the master-only
// AdminManagementPage, so non-masters have no reason to read it.
router.get("/users", requireRole("master"), getAllUsers);

// Managing other admin accounts is restricted to the master role.
router.post("/toggle-status", requireRole("master"), toggleUserStatus);
router.post("/create", requireRole("master"), createAdmin);
router.put("/update", requireRole("master"), updateUser);

export default router;