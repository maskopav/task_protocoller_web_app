// src/mcp/router.js — POST /mcp (docs/mcp/01_spec.md section 2).
// Order: HTTPS check, failed-auth limiter, PAT auth, per-token limiter, the
// stateless Streamable HTTP transport with JSON responses (no SSE, no sessions).
import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { requireHttps } from "../middleware/requireHttps.js";
import { requirePat } from "../middleware/patAuth.js";
import { createMcpAuthLimiter, createMcpCallLimiter } from "../middleware/rateLimiter.js";
import { buildMcpServer } from "./server.js";
import { logToFile } from "../utils/logger.js";

export function createMcpRouter({ authLimiter = createMcpAuthLimiter(), callLimiter = createMcpCallLimiter() } = {}) {
  const router = express.Router();

  router.post("/", requireHttps, authLimiter, requirePat, callLimiter, express.json({ limit: "1mb" }), async (req, res) => {
    const server = buildMcpServer(req.admin);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      logToFile("ERROR", "mcp transport failed", { userId: req.admin?.id, code: err?.code ?? err?.name ?? "Error" });
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null });
      }
    }
  });

  // Stateless server: no SSE stream to open and no session to delete.
  router.all("/", (req, res) => res.set("Allow", "POST").status(405).json({ error: "method_not_allowed" }));

  return router;
}
