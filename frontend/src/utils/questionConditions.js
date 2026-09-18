// src/utils/questionConditions.js
//
// Pure helpers for a question's optional `showIf` field, the conditional-visibility
// mechanism used by both the questionnaire editor (QuestionnaireModal) and the
// questionnaire renderer (Questionnaire): { questionId: <id of an earlier question>,
// values: [...] }. A question with a showIf is only shown to the respondent when
// the answer to `questionId` matches one of `values`.

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

// Whether a question should be shown to the respondent, given the current
// answers map (as used by the Questionnaire renderer: keyed by question id,
// with a string value for single/dropdown or an array of strings for multiple).
export function isQuestionVisible(question, answers) {
  if (!question.showIf) return true;
  const { questionId, values } = question.showIf;
  const answer = answers[questionId];
  if (Array.isArray(answer)) return answer.some((v) => values.includes(v));
  return values.includes(answer);
}

// Removes answers (and any free-text follow-ups) belonging to questions that
// are no longer visible given the current answers — e.g. the respondent
// changed a gate answer so a previously-shown follow-up question is now
// hidden again. Returns a new answers object; repeats until stable so a
// change that hides a gate question also clears anything gated by *it*.
export function pruneHiddenAnswers(questions, answers) {
  let next = { ...answers };
  let mutated = true;
  while (mutated) {
    mutated = false;
    for (const q of questions) {
      if (!q.showIf || !(q.id in next)) continue;
      if (isQuestionVisible(q, next)) continue;
      delete next[q.id];
      (q.freeTextOptions || []).forEach((opt) => {
        delete next[`${q.id}__freeText__${opt}`];
      });
      mutated = true;
    }
  }
  return next;
}
