// src/components/SmellTestTask/smellHowToSeen.js

// Whether the respondent got past this smell task's instructions before
// dropping out, from the session's smell_scent_opened progress events (handed
// over by the loader on resume): a scent screen only opens after the how-to.
// Matched on both the 1-based task position and the protocol task, as the step
// list is rebuilt identically on resume.
export function smellHowToSeen(events, taskNumber, protocolTaskId) {
  return (events || []).some((e) =>
    e.action === "smell_scent_opened"
    && e.taskIndex === taskNumber
    && String(e.protocolTaskId) === String(protocolTaskId));
}
