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
import { logFrontendToFile } from "./src/utils/logger.js";
import { requireAuth } from "./src/middleware/authMiddleware.js";

import cors from "cors";

const app = express();
app.use(cors());
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Backend running on http://localhost:${PORT}`);
});
