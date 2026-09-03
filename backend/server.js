// server.js
import "dotenv/config";

import express from "express";
import mappingsRouter from "./src/routes/mappings.js";
import protocolsRouter from "./src/routes/protocols.js";
import participantProtocolsRouter from "./src/routes/participantProtocols.js";
import participantsRouter from "./src/routes/participants.js";
import sessionsRouter from "./src/routes/sessions.js";
import recordingsRouter from "./src/routes/recordings.js";
import taskResultsRouter from "./src/routes/taskResults.js";
import authRouter from "./src/routes/auth.js";
import usersRouter from "./src/routes/users.js";
import projectsRouter from "./src/routes/projects.js";
import userProjectsRouter from "./src/routes/userProjects.js";
import { logFrontendToFile, readSystemLog } from "./src/utils/logger.js";
import { requireAuth, requireRole } from "./src/middleware/authMiddleware.js";

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


// Public: reference-table lookups consumed by both admin dashboards and
// participant sessions (MappingProvider wraps the whole app, see AppProvider.jsx).
app.use("/mappings", mappingsRouter);
// Public: participant-facing routes are individually gated by their own
// unguessable per-participant access token inside the router.
app.use("/participant-protocols", participantProtocolsRouter);
// Public: participant signup/login and session/recording/task-result writes
// during an active study session, gated by participant tokens, not admin auth.
app.use("/sessions", sessionsRouter);
app.use("/recordings", recordingsRouter);
app.use("/auth", authRouter);
app.use("/task-results", taskResultsRouter)

// Admin-only: require a valid admin JWT.
app.use("/protocols", requireAuth, protocolsRouter);
app.use("/participants", requireAuth, participantsRouter);
app.use("/users", requireAuth, usersRouter)
app.use("/projects", requireAuth, projectsRouter)
app.use("/user-projects", requireAuth, userProjectsRouter)
app.post("/logs/frontend", (req, res) => {
  // Pass the entire structured JSON payload to the upgraded logger
  if (req.body && req.body.message) {
    logFrontendToFile(req.body);
  }
  res.status(200).json({ success: true });
});

// Admin-only: reads system_log.txt (there's no server shell access for most
// admins, so this is the only way to inspect it). Gated to "master" like
// MasterTools' other diagnostic/management tools, since log entries can
// carry participant-identifying URLs/details.
// Query params: tail (max entries, default 200, capped 2000), search
// (case-insensitive substring), since/until (ISO timestamp bounds).
app.get("/logs/frontend", requireAuth, requireRole("master"), (req, res) => {
  const { tail, search, since, until } = req.query;
  const entries = readSystemLog({ tail, search, since, until });
  res.json({ entries });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Backend running on http://localhost:${PORT}`);
});
