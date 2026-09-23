/* backend/src/routes/participants.js */
import express from "express";
import multer from "multer";
import {
    getParticipants,
    createParticipant,
    updateParticipant,
    searchParticipant,
    bulkImportParticipants
} from "../controllers/participantController.js";

const router = express.Router();

// The bulk-import CSV is a single column of external_ids -- far smaller than
// the 50MB media cap in recordings.js, but generous for a very large cohort
// (2MB is tens of thousands of rows).
const MAX_IMPORT_FILE_BYTES = 2 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMPORT_FILE_BYTES },
});

function handleUploadErrors(err, req, res, next) {
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "File too large" });
  }
  next(err);
}

router.get("/", getParticipants);
router.get("/search", searchParticipant);
router.post("/create", createParticipant);
router.post("/bulk-import", upload.single("file"), handleUploadErrors, bulkImportParticipants);
router.put("/:id", updateParticipant);

export default router;
