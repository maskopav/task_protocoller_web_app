// src/routes/protocols.js
import express from 'express';
import { saveProtocol, getProtocolById, getProtocolsByProjectId, getArchivedProtocols, archiveProtocol } from '../controllers/protocolController.js';

const router = express.Router();

// Save new protocol
router.post('/save', saveProtocol);

// Archived protocols (must come before the /:id catch-all route)
router.get('/archived', getArchivedProtocols);

// Archive a protocol (removes it from every project using it)
router.post('/:id/archive', archiveProtocol);

// View protocol (GET /api/protocols/:id)
router.get('/:id', getProtocolById);

// Handles /api/protocols?project_id=1
router.get('/', getProtocolsByProjectId);

export default router;
