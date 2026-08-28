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
