// src/components/SmellTestTask/savedSmellAnswers.js

// Answers given in this smell task before the respondent dropped out, rebuilt
// from the session's answer_clicked progress events (handed over by the
// loader on resume). Matched on both the 1-based task position and the
// protocol task, as the step list is rebuilt identically on resume. Later
// events win — re-rating a scent logs it again.
export function savedSmellAnswers(events, taskNumber, protocolTaskId) {
  const answers = {};
  for (const e of events || []) {
    if (e.taskIndex === taskNumber && String(e.protocolTaskId) === String(protocolTaskId) && e.value) {
      answers[e.questionId] = e.value;
    }
  }
  return answers;
}
