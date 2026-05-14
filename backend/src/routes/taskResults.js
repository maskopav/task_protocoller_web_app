// src/routes/taskResults.js
import express from "express";
import { saveTaskResult } from "../controllers/taskResultController.js";

const router = express.Router();

router.post("/save", saveTaskResult);

export default router;