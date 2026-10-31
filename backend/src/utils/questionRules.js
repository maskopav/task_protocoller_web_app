// src/utils/questionRules.js
// Questionnaire conditional rules (`showIf`), stored on a question in
// protocol_tasks.params.questions[] as { questionId, optionIndexes: [0-based] }.
// The question is shown only if the earlier question `questionId` has one of
// the indexed options selected. Spec: docs/questionnaire_rules/01_spec.md; the
// frontend twin is frontend/src/utils/questionConditions.js.

const SOURCE_TYPES = ['single', 'multiple', 'dropdown'];

export const isConditionSource = (q) =>
  !!q && SOURCE_TYPES.includes(q.type) && Array.isArray(q.options) && q.options.length > 0;

// The rule of questions[index] resolved to { sourceIndex, optionIndexes }, or
// null when the question has no rule. `valid: false` marks a
// rule that points at a missing / later / ineligible source or bad indexes.
const resolve = (questions, index) => {
  const showIf = questions[index]?.showIf;
  if (!showIf) return null; // null / absent / any falsy value = no rule, as in the editor
  const sourceIndex = questions.findIndex((q) => q?.id === showIf?.questionId);
  const idx = showIf?.optionIndexes;
  const valid =
    typeof showIf === 'object' &&
    sourceIndex !== -1 && sourceIndex < index &&
    isConditionSource(questions[sourceIndex]) &&
    Array.isArray(idx) && idx.length > 0 &&
    idx.every((i) => Number.isInteger(i) && i >= 0 && i < questions[sourceIndex].options.length);
  return { valid, sourceIndex, optionIndexes: valid ? [...new Set(idx)].sort((a, b) => a - b) : [] };
};

// Save-time check: index of the first question with a malformed rule, or -1.
export const findInvalidQuestionRule = (questions) => {
  if (!Array.isArray(questions)) return -1;
  return questions.findIndex((_, i) => resolve(questions, i)?.valid === false);
};

// Emission: { sourceIndex, optionIndexes } for a valid rule, else null (an
// invalid stored rule is skipped rather than failing the whole config).
export const emittableRule = (questions, index) => {
  const r = resolve(questions, index);
  return r?.valid ? { sourceIndex: r.sourceIndex, optionIndexes: r.optionIndexes } : null;
};
