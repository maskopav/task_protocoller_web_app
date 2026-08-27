// server.js
import "dotenv/config";

import express from "express";
import mappingsRouter from "./src/routes/mappings.js";
import protocolsRouter from "./src/routes/protocols.js";
import authRouter from "./src/routes/auth.js";
import usersRouter from "./src/routes/users.js";
import projectsRouter from "./src/routes/projects.js";
import userProjectsRouter from "./src/routes/userProjects.js";
import sitesRouter from "./src/routes/sites.js";
import { getSiteConfig } from "./src/controllers/siteController.js";
import { logFrontendToFile } from "./src/utils/logger.js";
import { requireAuth } from "./src/middleware/authMiddleware.js";

import cors from "cors";

// Without this, admin login still reaches bcrypt even when JWT_SECRET is not set and then dies inside
// jwt.sign() as an opaque 500 — the frontend renders that as a generic
// "can't reach the server" message. Refuse to boot instead.
if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is not set — add it to backend/.env");
}

const app = express();

// Restrict which browser origins may read API responses. This doesn't block
// direct clients (curl, server-to-server) — Origin is a browser-only header
// and CORS is enforced by the browser, not the server; that's what the admin
// JWT auth is for. What this closes is a different hole: with no origin
// restriction, any website's JavaScript could read responses from this API's
// public, unauthenticated endpoints (e.g. /mappings' full table dumps, or
// /participant-protocols/:token if a token ever leaked into a malicious page).
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

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));


// Test routes
app.get('/test', (req, res) => res.json({ response: 'test' }));


// Public: reference-table lookups consumed by the admin dashboards
// (MappingProvider wraps the whole app, see AppProvider.jsx).
app.use("/mappings", mappingsRouter);
// Public: admin login/reset flows (no JWT yet at that point).
app.use("/auth", authRouter);
// Public: gated by the site's unguessable access token — this is the endpoint
// the external desktop app calls (server-to-server, no Origin header).
app.get("/site-config/:token", getSiteConfig);

// Admin-only: require a valid admin JWT.
app.use("/protocols", requireAuth, protocolsRouter);
app.use("/users", requireAuth, usersRouter)
app.use("/projects", requireAuth, projectsRouter)
app.use("/user-projects", requireAuth, userProjectsRouter)
app.use("/sites", requireAuth, sitesRouter)
app.post("/logs/frontend", (req, res) => {
  // Pass the entire structured JSON payload to the upgraded logger
  if (req.body && req.body.message) {
    logFrontendToFile(req.body);
  }
  res.status(200).json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Backend running on http://localhost:${PORT}`);
});
