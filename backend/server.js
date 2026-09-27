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
import { logFrontendToFile } from "./src/utils/logger.js";
import { requireAuth } from "./src/middleware/authMiddleware.js";
import { logLimiter, siteConfigLimiter } from "./src/middleware/rateLimiter.js";

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

app.use(cors({
  origin(origin, callback) {
    // No Origin header at all means a same-origin browser request or a
    // non-browser client (curl, server-to-server) — neither is a CORS concern.
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Not allowed by CORS"));
  },
}));
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

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));


// Test routes
app.get('/test', (req, res) => res.json({ response: 'test' }));


// Public: admin login/reset flows (no JWT yet at that point).
app.use("/auth", authRouter);
// Public: gated by the site's unguessable access token — this is the endpoint
// the external desktop app calls (server-to-server, no Origin header).
app.get("/site-config/:token", siteConfigLimiter, getSiteConfig);

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Backend running on http://localhost:${PORT}`);
});
