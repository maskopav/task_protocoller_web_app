// Pure helpers for a question's optional `showIf` rule, shared by the
// questionnaire editor (QuestionnaireModal) and the preview renderer
// (Questionnaire): { questionId: <id of an earlier question>, optionIndexes: [0-based] }.
// The question is shown only when the answer to `questionId` includes one of
// the indexed options. Spec: docs/questionnaire_rules/01_spec.md.

// A question can gate others only if its answer comes from a fixed option list.
export function isConditionSource(question) {
  return (
    !!question &&
    ["single", "multiple", "dropdown"].includes(question.type) &&
    Array.isArray(question.options) &&
    question.options.length > 0
  );
}

// Eligible sources for `questionId`: earlier questions (by array order) that
// are condition sources. Earlier-only keeps the dependency graph acyclic.
export function getConditionSourceQuestions(questions, questionId) {
  const idx = questions.findIndex((q) => q.id === questionId);
  const prior = idx === -1 ? questions : questions.slice(0, idx);
  return prior.filter(isConditionSource);
}

// Returns a valid rule for `questions[index]`, or null: the source must be an
// earlier condition source and the indexes in range, deduplicated and sorted.
function normalizeShowIf(questions, index) {
  const showIf = questions[index]?.showIf;
  if (!showIf) return null;
  const srcIdx = questions.findIndex((q) => q.id === showIf.questionId);
  if (srcIdx === -1 || srcIdx >= index || !isConditionSource(questions[srcIdx])) return null;
  const n = questions[srcIdx].options.length;
  const optionIndexes = [...new Set(showIf.optionIndexes || [])]
    .filter((i) => Number.isInteger(i) && i >= 0 && i < n)
    .sort((a, b) => a - b);
  return optionIndexes.length > 0 ? { questionId: showIf.questionId, optionIndexes } : null;
}

// Save-time cleanup: every rule is normalized or set to null.
export function sanitizeShowIf(questions) {
  return questions.map((q, i) => (q.showIf ? { ...q, showIf: normalizeShowIf(questions, i) } : q));
}

// Clears every rule that uses the removed question as its source.
export function clearDanglingShowIf(questions, removedId) {
  return questions.map((q) =>
    q.showIf && q.showIf.questionId === removedId ? { ...q, showIf: null } : q
  );
}

// Option `index` of `sourceId` was removed: drop it from dependent rules and
// shift the higher indexes down. A rule left without answers keeps an empty
// list (the editor shows a hint; sanitizeShowIf drops it on save).
export function remapShowIfOnOptionRemove(questions, sourceId, index) {
  return questions.map((q) => {
    if (!q.showIf || q.showIf.questionId !== sourceId) return q;
    const optionIndexes = (q.showIf.optionIndexes || [])
      .filter((i) => i !== index)
      .map((i) => (i > index ? i - 1 : i));
    return { ...q, showIf: { ...q.showIf, optionIndexes } };
  });
}

const selectedOf = (answer) => (Array.isArray(answer) ? answer : answer ? [answer] : []);

// Ids of the visible questions, in one forward pass: a question is visible if
// it has no (valid) rule, or its source is visible and the source's answer
// (an option label, or an array of labels for `multiple`) includes one of the
// rule's options. Invalid rules are ignored, i.e. the question is shown.
export function getVisibleIds(questions, answers) {
  const visible = new Set();
  questions.forEach((q, i) => {
    const rule = normalizeShowIf(questions, i);
    if (!rule) {
      visible.add(q.id);
      return;
    }
    if (!visible.has(rule.questionId)) return;
    const source = questions.find((s) => s.id === rule.questionId);
    const labels = rule.optionIndexes.map((oi) => source.options[oi]);
    if (selectedOf(answers[rule.questionId]).some((v) => labels.includes(v))) visible.add(q.id);
  });
  return visible;
}

export function getVisibleQuestions(questions, answers) {
  const visible = getVisibleIds(questions, answers);
  return questions.filter((q) => visible.has(q.id));
}

// Removes the answers (and free-text follow-ups) of hidden questions. One
// forward pass suffices: a hidden source hides its dependents.
export function pruneHiddenAnswers(questions, answers) {
  const visible = getVisibleIds(questions, answers);
  const next = { ...answers };
  for (const q of questions) {
    if (visible.has(q.id)) continue;
    delete next[q.id];
    (q.freeTextOptions || []).forEach((opt) => delete next[`${q.id}__freeText__${opt}`]);
  }
  return next;
}
