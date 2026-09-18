// src/components/ProtocolEditor/questionConditions.js
//
// Pure helpers for a question's optional `showIf` field, the conditional-visibility
// mechanism used by both the questionnaire editor (QuestionnaireModal) and the
// questionnaire renderer: { questionId: <id of an earlier question>, values: [...] }.
// A question with a showIf is only shown to the respondent when the answer to
// `questionId` matches one of `values`.

// A question can only act as a condition "source" if a respondent's answer to it
// is a single known value we can match against (i.e. it has a fixed option list).
export function isConditionSource(question) {
  return (
    !!question &&
    ["single", "multiple", "dropdown"].includes(question.type) &&
    Array.isArray(question.options) &&
    question.options.length > 0
  );
}

// Questions eligible to gate the visibility of `questionId`: any earlier
// question in the list (by array order) that is a valid condition source.
// Restricting to earlier questions keeps the dependency graph acyclic.
export function getConditionSourceQuestions(questions, questionId) {
  const idx = questions.findIndex((q) => q.id === questionId);
  const priorQuestions = idx === -1 ? questions : questions.slice(0, idx);
  return priorQuestions.filter(isConditionSource);
}

// Drops a showIf condition that no longer points at a valid source question,
// and any selected trigger values that no longer exist among that source's options.
export function sanitizeShowIf(showIf, questions) {
  if (!showIf) return null;
  const source = questions.find((q) => q.id === showIf.questionId);
  if (!isConditionSource(source)) return null;
  const values = (showIf.values || []).filter((v) => source.options.includes(v));
  return values.length > 0 ? { questionId: showIf.questionId, values } : null;
}

// Clears any showIf that references a question id which is being removed.
export function clearDanglingShowIf(questions, removedId) {
  return questions.map((q) =>
    q.showIf && q.showIf.questionId === removedId ? { ...q, showIf: null } : q
  );
}
