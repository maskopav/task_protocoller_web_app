// server.js
import "dotenv/config";

import express from "express";
import mappingsRouter from "./src/routes/mappings.js";
import protocolsRouter from "./src/routes/protocols.js";
import authRouter from "./src/routes/auth.js";
import usersRouter from "./src/routes/users.js";
import projectsRouter from "./src/routes/projects.js";
import userProjectsRouter from "./src/routes/userProjects.js";
import userSitesRouter from "./src/routes/userSites.js";
import sitesRouter from "./src/routes/sites.js";
import { getSiteConfig } from "./src/controllers/siteController.js";
import { deviceCheckin } from "./src/controllers/deviceController.js";
import { createDevicesRouter } from "./src/routes/devices.js";
import uploadsRouter from "./src/routes/uploads.js";
import { createUploadDownloadsRouter } from "./src/routes/uploadDownloads.js";
import { createUploadRouter } from "./src/routes/upload.js";
import { loadUploadConfig, ensureDataPath } from "./src/config/uploads.js";
import { LocalFileStore } from "./src/storage/fileStore.js";
import { createValidationQueue } from "./src/upload/validationQueue.js";
import { logFrontendToFile, logToFile } from "./src/utils/logger.js";
import { requireAuth, requireAuthOrTicket } from "./src/middleware/authMiddleware.js";
import { signDownloadTicket } from "./src/utils/jwt.js";
import { createCheckinLimiter, logLimiter, siteConfigLimiter } from "./src/middleware/rateLimiter.js";

import cors from "cors";
import helmet from "helmet";

// Without this, admin login still reaches bcrypt even when JWT_SECRET is not set and then dies inside
// jwt.sign() as an opaque 500 — the frontend renders that as a generic
// "can't reach the server" message. Refuse to boot instead.
if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is not set — add it to backend/.env");
}
// Links in password-reset / welcome emails are built from this. It used to be
// taken from the request's Referer, which let a caller point a victim's genuine
// reset email at their own host.
if (!process.env.FRONTEND_BASE_URL) {
  throw new Error("FRONTEND_BASE_URL is not set — add it to backend/.env (e.g. https://example.org/app)");
}

// Uploaded sessions are the only copy on this server until the backup runs:
// a missing or read-only DATA_PATH stops the boot (spec §11).
const uploadConfig = loadUploadConfig();
ensureDataPath(uploadConfig.dataPath);
const fileStore = new LocalFileStore(uploadConfig.dataPath);
const validationQueue = createValidationQueue({ store: fileStore });

const app = express();

// Deployed behind exactly one reverse proxy. Trusting one hop makes req.ip the
// real client (taken from the proxy's X-Forwarded-For) so the rate limiters
// key per client — not one shared bucket for everyone, and not a header any
// client could spoof, which "trust everything" would allow.
app.set("trust proxy", 1);

// Security headers (nosniff, HSTS, frameguard, no X-Powered-By, ...). CORP is
// relaxed to cross-origin because the admin frontend is served from a
// different origin than this API.
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

// Restrict which browser origins may read API responses. This doesn't block
// direct clients (curl, server-to-server) — Origin is a browser-only header
// and CORS is enforced by the browser, not the server; that's what the admin
// JWT auth is for. What this closes is a different hole: with no origin
// restriction, any website's JavaScript could read responses from this API's
// public, unauthenticated endpoints (e.g. /auth/admin/login, or
// /site-config/:token if a site token ever leaked into a malicious page).
const allowedOrigins = (process.env.CORS_ORIGIN || "https://localhost:5173,https://localhost:5183")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsMiddleware = cors({
  origin(origin, callback) {
    // No Origin header at all means a same-origin browser request or a
    // non-browser client (curl, server-to-server) — neither is a CORS concern.
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Not allowed by CORS"));
  },
});
// The one exception: the bundle download, which the page submits as a plain
// HTML form so the browser streams a multi-GB archive to disk. That is a
// navigation. Page scripts can never read its response, so CORS protects
// nothing there, and it is authenticated by a short-lived download ticket in
// the body that another site cannot obtain. Browsers send `Origin: null` for
// such a POST from an https page to an http API (dev, e2e), which the list
// above would refuse. A scripted request (Authorization header) still goes
// through CORS.
const isNativeBundlePost = (req) =>
  req.method === "POST" && req.path === "/uploads/download" && !req.headers.authorization;
app.use((req, res, next) => (isNativeBundlePost(req) ? next() : corsMiddleware(req, res, next)));
app.use((err, req, res, next) => {
  if (err && err.message === "Not allowed by CORS") {
    return res.status(403).json({ error: "Not allowed by CORS" });
  }
  next(err);
});

// Public and disk-backed, so it gets its own small body limit (registered
// before the app-wide 5 MB parser, which would otherwise accept the body first)
// and a rate limit. The logger truncates and flattens the fields it writes.
app.post("/logs/frontend", logLimiter, express.json({ limit: '16kb' }), (req, res) => {
  if (req.body && typeof req.body.message === "string") {
    logFrontendToFile(req.body);
  }
  res.status(200).json({ success: true });
});

// Public, gated by the site token: the desktop app's session upload. Mounted
// before the body parsers below, which must never see this multi-GB stream.
app.use("/upload", createUploadRouter({ store: fileStore, queue: validationQueue, maxBytes: uploadConfig.maxBytes }));

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));


// Test routes
app.get('/test', (req, res) => res.json({ response: 'test' }));


// Public: admin login/reset flows (no JWT yet at that point).
app.use("/auth", authRouter);
// Public: gated by the site's unguessable access token — this is the endpoint
// the external desktop app calls (server-to-server, no Origin header).
app.get("/site-config/:token", siteConfigLimiter, getSiteConfig);

// Public, gated by the site token: the desktop app reports its local backlog.
app.post("/device-checkin", createCheckinLimiter(), deviceCheckin);

// Admin-only: require a valid admin JWT.
// /mappings used to be public because MappingProvider mounts above the auth
// boundary and fired on the login page. Nothing pre-login actually reads it —
// every useMappings() consumer sits inside ProtectedRoute — so it is gated
// here and MappingProvider now waits for a logged-in user instead.
app.use("/mappings", requireAuth, mappingsRouter);
app.use("/protocols", requireAuth, protocolsRouter);
app.use("/users", requireAuth, usersRouter)
app.use("/projects", requireAuth, projectsRouter)
app.use("/user-projects", requireAuth, userProjectsRouter)
app.use("/user-sites", requireAuth, userSitesRouter)
app.use("/sites", requireAuth, sitesRouter)
app.use("/devices", requireAuth, createDevicesRouter({ queue: validationQueue }))
// Download tickets (5 min, download routes only) for <audio>/<video> and
// native browser downloads, which cannot send the Authorization header. Only a
// real session can mint one, so a ticket cannot be used to renew itself.
app.post("/uploads/ticket", requireAuth, (req, res) => res.json({ ticket: signDownloadTicket(req.admin) }))
app.use("/uploads", requireAuthOrTicket, createUploadDownloadsRouter({ store: fileStore }))
app.use("/uploads", requireAuth, uploadsRouter)

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Backend running on http://localhost:${PORT}`);
  // Sessions still 'validating' were interrupted by a crash or restart.
  validationQueue.recover()
    .then((n) => { if (n > 0) logToFile("INFO", "Re-enqueued sessions for validation", { count: n }); })
    .catch((err) => logToFile("ERROR", "Validation recovery failed", { code: err?.code ?? err?.name ?? "Error" }));
});
