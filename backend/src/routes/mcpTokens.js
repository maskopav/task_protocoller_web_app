// src/routes/mcpTokens.js — the caller's own MCP tokens. Mounted at
// /account/mcp-tokens behind requireAuth (a JWT session only).
import express from "express";
import { listOwnTokens, createOwnToken, revokeOwnToken } from "../controllers/mcpTokenController.js";

const router = express.Router();

router.get("/", listOwnTokens);
router.post("/", createOwnToken);
router.delete("/:id", revokeOwnToken);

export default router;
