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
  // unlessLanguage conditions aren't editable in the modal — keep them as-is
  if (showIf.unlessLanguage) return showIf;
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
// `showIf.unlessLanguage` ({ <lang code>: <option text> }) flips the check: the
// question shows once the source is answered, unless the answer includes the
// option naming the current study language `lang` (e.g. skip "at what age did
// you learn <language>?" for people who grew up speaking it).
export function isQuestionVisible(question, answers, lang) {
  if (!question.showIf) return true;
  const { questionId, values = [], unlessLanguage } = question.showIf;
  const answer = answers[questionId];
  const selected = Array.isArray(answer) ? answer : answer ? [answer] : [];
  if (unlessLanguage) {
    return selected.length > 0 && !selected.includes(unlessLanguage[lang]);
  }
  return selected.some((v) => values.includes(v));
}

// Replaces each question with `repeatFor: [sourceIds]` by one copy per distinct
// value chosen across those source questions (free-text options such as "Other"
// contribute the typed text instead). Copies get id `${q.id}__${item}` and have
// "<language>" in their text replaced by the item.
export function expandRepeatedQuestions(questions, answers) {
  return questions.flatMap((q) => {
    if (!q.repeatFor) return [q];
    const items = new Set();
    for (const srcId of q.repeatFor) {
      const src = questions.find((s) => s.id === srcId);
      const answer = answers[srcId];
      for (const opt of Array.isArray(answer) ? answer : answer ? [answer] : []) {
        const item = src?.freeTextOptions?.includes(opt)
          ? (answers[`${srcId}__freeText__${opt}`] || "").trim()
          : opt;
        if (item) items.add(item);
      }
    }
    return [...items].map((item) => {
      const { repeatFor: _repeatFor, ...rest } = q;
      return { ...rest, id: `${q.id}__${item}`, text: q.text.replaceAll("<language>", item) };
    });
  });
}

// Removes answers (and any free-text follow-ups) belonging to questions that
// are no longer visible given the current answers — e.g. the respondent
// changed a gate answer so a previously-shown follow-up question is now
// hidden again. Returns a new answers object; repeats until stable so a
// change that hides a gate question also clears anything gated by *it*.
export function pruneHiddenAnswers(questions, answers, lang) {
  let next = { ...answers };
  let mutated = true;
  while (mutated) {
    mutated = false;
    for (const q of questions) {
      if (!q.showIf || !(q.id in next)) continue;
      if (isQuestionVisible(q, next, lang)) continue;
      delete next[q.id];
      (q.freeTextOptions || []).forEach((opt) => {
        delete next[`${q.id}__freeText__${opt}`];
      });
      mutated = true;
    }
  }
  return next;
}
