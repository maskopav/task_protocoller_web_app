// src/components/Fieldwork/statusMeta.js
// Participant lifecycle status, mirroring the `protocol_status` values
// computed by the `v_session_summary` DB view (backend/scripts/schema/create_views.sql).
// The "in_progress" <-> "incomplete" cutoff is the SESSION_RESUME_WINDOW_HOURS
// constant in backend/src/config/constants.js.
export const STATUS_META = {
  created: {
    label: "Not Started",
    hint: "Assigned, but the participant hasn't opened the protocol yet.",
    dot: "#9ca3af",
    bg: "#f3f4f6",
    text: "#4b5563",
  },
  in_progress: {
    label: "In Progress",
    hint: "Started — can still resume from where they left off.",
    dot: "#f59e0b",
    bg: "#fef3c7",
    text: "#92400e",
  },
  incomplete: {
    label: "Incomplete",
    hint: "Return window expired — reopening the link restarts the protocol from the beginning.",
    dot: "#ef4444",
    bg: "#fee2e2",
    text: "#991b1b",
  },
  completed: {
    label: "Completed",
    hint: "Completed successfully.",
    dot: "#22c55e",
    bg: "#dcfce7",
    text: "#166534",
  },
};

export const STATUS_ORDER = ["created", "in_progress", "incomplete", "completed"];
