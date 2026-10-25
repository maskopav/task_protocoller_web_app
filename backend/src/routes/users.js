// src/routes/users.js — user management, master only.
import express from "express";
import {
  getAllUsers,
  getUserById,
  createAdmin,
  updateUser,
} from "../controllers/userController.js";
import { setUserSites } from "../controllers/userSiteController.js";
import { requireRole } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(requireRole("master"));

router.get("/", getAllUsers);
router.post("/", createAdmin);
router.get("/:id", getUserById);
router.patch("/:id", updateUser);
router.put("/:id/sites", setUserSites);

export default router;
