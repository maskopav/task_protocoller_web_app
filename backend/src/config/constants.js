// src/config/constants.js
// Central place for tunable business-rule parameters shared across the backend.

// How many hours a participant can leave an in-progress protocol and still
// resume exactly where they left off. After this window elapses, opening
// the link again starts the protocol over from the beginning.
//
// Used by:
//  - sessionController.initSession (the actual resume gate)
//  - the v_session_summary DB view, which drives the admin Fieldwork table's
//    "In Progress" vs "Incomplete" status (kept in sync automatically —
//    run `npm run db:views` after changing this value to push it into the DB)
export const SESSION_RESUME_WINDOW_HOURS = 72;

// Whether reopening the access link after a protocol was already completed
// starts a brand-new run instead of just showing the existing completed one.
// Off by default (production): a finished assignment is terminal, and
// sessionController.initSession always hands back the existing completed
// session rather than inserting a new one. Set ALLOW_PROTOCOL_RERUN=true in
// .env for environments (e.g. internal testing) where deliberately re-running
// an already-completed protocol needs to work.
export const ALLOW_PROTOCOL_RERUN = true;
//process.env.ALLOW_PROTOCOL_RERUN === "true";

// Upper bound on how many sessions a single admin "download session data"
// export (see sessionDataController.js) can bundle into one zip. Keeps a
// single request from streaming an unbounded number of audio files into
// memory/response at once -- an admin who needs more must narrow their
// date range/protocol filter or select sessions explicitly in smaller
// batches.
export const MAX_EXPORT_SESSIONS = 300;
