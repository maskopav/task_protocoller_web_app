// src/routes/users.js — user management, master only.
import express from "express";
import {
  getAllUsers,
  getUserById,
  createAdmin,
  updateUser,
} from "../controllers/userController.js";
import { setUserSites } from "../controllers/userSiteController.js";
import { listUserTokens, revokeUserToken } from "../controllers/mcpTokenController.js";
import { requireRole } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(requireRole("master"));

router.get("/", getAllUsers);
router.post("/", createAdmin);
router.get("/:id", getUserById);
router.patch("/:id", updateUser);
router.put("/:id/sites", setUserSites);
router.get("/:id/mcp-tokens", listUserTokens);
router.delete("/:id/mcp-tokens/:tokenId", revokeUserToken);

export default router;
