// src/app.js — the configured Express app, with no listen() call. Kept
// separate from server.js so booking-service can run two ways with the
// same code:
//   1. Standalone: server.js calls createBookingApp().listen(PORT) — its
//      own process/port, for local dev or a real separate deployment.
//   2. Mounted: a host app does app.use("/some-prefix", createBookingApp())
//      to run it inside an already-provisioned process (e.g. constrained
//      shared hosting with no way to register a second app/port). The
//      hosted pages detect their own mount prefix client-side (see
//      public/book.html /manage.html's inline bootstrap script), so no
//      prefix configuration is needed here — the same app works unmodified
//      at the root or under any subpath.
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";

import adminRouter from "./routes/admin.js";
import publicRouter from "./routes/public.js";
import { requireApiKey } from "./middleware/apiKeyAuth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");

export function createBookingApp() {
  const app = express();

  // The admin API is meant to be called server-to-server (no browser CORS
  // concern), and the hosted /public pages fetch same-origin, so CORS is
  // only relevant if a consuming app's own frontend ever calls this
  // service's admin API directly from a browser — not the default
  // integration path.
  const allowedOrigins = (process.env.CORS_ORIGIN || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  if (allowedOrigins.length > 0) {
    app.use(cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error("Not allowed by CORS"));
      },
    }));
  }

  app.use(express.json({ limit: "1mb" }));

  // Server-to-server admin API (API key required).
  app.use("/v1", requireApiKey, adminRouter);

  // Browser-facing API behind the hosted pages below (signed-link / manage-token auth per-route).
  app.use("/public", publicRouter);

  // Hosted booking + manage pages — plain static HTML/JS, no build step.
  app.use(express.static(publicDir));
  app.get("/book/:resourceSlug", (req, res) => {
    res.sendFile(path.join(publicDir, "book.html"));
  });
  app.get("/manage/:manageToken", (req, res) => {
    res.sendFile(path.join(publicDir, "manage.html"));
  });

  app.get("/health", (req, res) => res.json({ status: "ok" }));

  return app;
}
