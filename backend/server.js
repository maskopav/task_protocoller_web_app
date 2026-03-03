// server.js
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import mappingsRouter from "./src/routes/mappings.js";
import protocolsRouter from "./src/routes/protocols.js";
import participantProtocolsRouter from "./src/routes/participantProtocols.js";
import participantsRouter from "./src/routes/participants.js";
import sessionsRouter from "./src/routes/sessions.js";
import recordingsRouter from "./src/routes/recordings.js";
import authRouter from "./src/routes/auth.js";
import usersRouter from "./src/routes/users.js";
import projectsRouter from "./src/routes/projects.js";
import userProjectsRouter from "./src/routes/userProjects.js";

import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// Test routes
app.get('/test', (req, res) => res.json({ response: 'test' }));
app.get('/envtest', (req, res) => {
  res.json({
    DB_HOST: process.env.DB_HOST,
    DB_USER: process.env.DB_USER,
    DB_NAME: process.env.DB_NAME
  });
});


app.use("/mappings", mappingsRouter);
app.use("/protocols", protocolsRouter); 
app.use("/participant-protocols", participantProtocolsRouter);
app.use("/participants", participantsRouter);
app.use("/sessions", sessionsRouter);
app.use("/recordings", recordingsRouter);
app.use("/auth", authRouter);
app.use("/users", usersRouter)
app.use("/projects", projectsRouter)
app.use("/user-projects", userProjectsRouter)

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Backend running on http://localhost:${PORT}`);
});
