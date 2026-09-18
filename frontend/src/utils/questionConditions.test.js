// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  isConditionSource,
  getConditionSourceQuestions,
  sanitizeShowIf,
  clearDanglingShowIf,
  isQuestionVisible,
  pruneHiddenAnswers,
} from './questionConditions';

const gateQuestion = {
  id: 1,
  text: 'How would you rate your hearing?',
  type: 'single',
  options: ['Good', 'Fair', 'Poor'],
};

const followUpQuestion = {
  id: 2,
  text: 'Does a hearing problem cause you to feel frustrated?',
  type: 'single',
  options: ['Yes', 'Sometimes', 'No'],
  showIf: { questionId: 1, values: ['Fair', 'Poor'] },
};

describe('isConditionSource', () => {
  it('accepts single/multiple/dropdown questions with at least one option', () => {
    expect(isConditionSource({ type: 'single', options: ['A'] })).toBe(true);
    expect(isConditionSource({ type: 'multiple', options: ['A'] })).toBe(true);
    expect(isConditionSource({ type: 'dropdown', options: ['A'] })).toBe(true);
  });

  it('rejects open and rating questions', () => {
    expect(isConditionSource({ type: 'open', options: [] })).toBe(false);
    expect(isConditionSource({ type: 'rating', options: [] })).toBe(false);
  });

  it('rejects choice questions with no options yet', () => {
    expect(isConditionSource({ type: 'single', options: [] })).toBe(false);
    expect(isConditionSource({ type: 'single' })).toBe(false);
  });

  it('rejects null/undefined', () => {
    expect(isConditionSource(null)).toBe(false);
    expect(isConditionSource(undefined)).toBe(false);
  });
});

describe('getConditionSourceQuestions', () => {
  it('returns only questions earlier in the list that are valid condition sources', () => {
    const questions = [
      gateQuestion,
      { id: 2, text: 'open one', type: 'open', options: [] },
      { id: 3, text: 'later choice', type: 'single', options: ['X', 'Y'] },
    ];
    // candidates for question 3 should include the gate (id 1) but not the open question
    expect(getConditionSourceQuestions(questions, 3)).toEqual([gateQuestion]);
  });

  it('excludes the question itself and anything after it', () => {
    const questions = [
      { id: 1, text: 'first', type: 'single', options: ['A', 'B'] },
      { id: 2, text: 'second', type: 'single', options: ['A', 'B'] },
      { id: 3, text: 'third', type: 'single', options: ['A', 'B'] },
    ];
    expect(getConditionSourceQuestions(questions, 2)).toEqual([questions[0]]);
  });

  it('returns an empty array for the first question', () => {
    const questions = [gateQuestion, followUpQuestion];
    expect(getConditionSourceQuestions(questions, 1)).toEqual([]);
  });

  it('treats an unknown questionId as "no prior questions" rather than throwing', () => {
    const questions = [gateQuestion, followUpQuestion];
    expect(getConditionSourceQuestions(questions, 999)).toEqual(questions);
  });
});

describe('sanitizeShowIf', () => {
  const questions = [gateQuestion, followUpQuestion];

  it('passes through a condition whose source and values are still valid', () => {
    expect(sanitizeShowIf({ questionId: 1, values: ['Fair', 'Poor'] }, questions)).toEqual({
      questionId: 1,
      values: ['Fair', 'Poor'],
    });
  });

  it('returns null when there is no condition', () => {
    expect(sanitizeShowIf(null, questions)).toBeNull();
    expect(sanitizeShowIf(undefined, questions)).toBeNull();
  });

  it('returns null when the source question no longer exists (e.g. it was deleted)', () => {
    expect(sanitizeShowIf({ questionId: 999, values: ['Fair'] }, questions)).toBeNull();
  });

  it('returns null when the source question is no longer a valid condition source (e.g. type changed to open)', () => {
    const changed = [{ ...gateQuestion, type: 'open', options: [] }, followUpQuestion];
    expect(sanitizeShowIf({ questionId: 1, values: ['Fair'] }, changed)).toBeNull();
  });

  it('drops trigger values that no longer exist among the source options', () => {
    const renamed = [{ ...gateQuestion, options: ['Good', 'Poor'] }, followUpQuestion];
    expect(sanitizeShowIf({ questionId: 1, values: ['Fair', 'Poor'] }, renamed)).toEqual({
      questionId: 1,
      values: ['Poor'],
    });
  });

  it('returns null once every trigger value has been removed', () => {
    const renamed = [{ ...gateQuestion, options: ['Good'] }, followUpQuestion];
    expect(sanitizeShowIf({ questionId: 1, values: ['Fair', 'Poor'] }, renamed)).toBeNull();
  });
});

describe('clearDanglingShowIf', () => {
  it('clears showIf on questions that referenced the removed question', () => {
    const questions = [gateQuestion, followUpQuestion];
    const result = clearDanglingShowIf(questions, 1);
    expect(result.find((q) => q.id === 2).showIf).toBeNull();
  });

  it('leaves unrelated conditions untouched', () => {
    const otherFollowUp = { id: 3, text: 'other', type: 'open', showIf: { questionId: 2, values: ['Yes'] } };
    const questions = [gateQuestion, followUpQuestion, otherFollowUp];
    const result = clearDanglingShowIf(questions, 1);
    expect(result.find((q) => q.id === 3).showIf).toEqual({ questionId: 2, values: ['Yes'] });
  });

  it('leaves questions without any showIf untouched', () => {
    const questions = [gateQuestion];
    expect(clearDanglingShowIf(questions, 1)).toEqual([gateQuestion]);
  });
});

describe('isQuestionVisible', () => {
  it('is always visible when there is no showIf', () => {
    expect(isQuestionVisible(gateQuestion, {})).toBe(true);
  });

  it('is hidden when the gate question has not been answered yet', () => {
    expect(isQuestionVisible(followUpQuestion, {})).toBe(false);
  });

  it('is hidden when the gate answer does not match any trigger value', () => {
    expect(isQuestionVisible(followUpQuestion, { 1: 'Good' })).toBe(false);
  });

  it('is shown when the gate answer matches a trigger value (single/dropdown source)', () => {
    expect(isQuestionVisible(followUpQuestion, { 1: 'Fair' })).toBe(true);
    expect(isQuestionVisible(followUpQuestion, { 1: 'Poor' })).toBe(true);
  });

  it('is shown when any selected option matches a trigger value (multiple source)', () => {
    const q = { id: 2, showIf: { questionId: 1, values: ['Yes'] } };
    expect(isQuestionVisible(q, { 1: ['Maybe', 'Yes'] })).toBe(true);
    expect(isQuestionVisible(q, { 1: ['No', 'Maybe'] })).toBe(false);
    expect(isQuestionVisible(q, { 1: [] })).toBe(false);
  });
});

describe('pruneHiddenAnswers', () => {
  it('removes a follow-up answer once its gate answer no longer matches', () => {
    const questions = [gateQuestion, followUpQuestion];
    const answers = { 1: 'Poor', 2: 'Sometimes' };
    expect(pruneHiddenAnswers(questions, { ...answers, 1: 'Good' })).toEqual({ 1: 'Good' });
  });

  it('also removes free-text follow-up answers for a hidden question', () => {
    const q = {
      id: 2,
      type: 'single',
      options: ['Yes', 'No'],
      freeTextOptions: ['Yes'],
      showIf: { questionId: 1, values: ['Fair', 'Poor'] },
    };
    const questions = [gateQuestion, q];
    const answers = { 1: 'Good', 2: 'Yes', '2__freeText__Yes': 'details here' };
    expect(pruneHiddenAnswers(questions, answers)).toEqual({ 1: 'Good' });
  });

  it('leaves answers untouched when the question is still visible', () => {
    const questions = [gateQuestion, followUpQuestion];
    const answers = { 1: 'Fair', 2: 'Sometimes' };
    expect(pruneHiddenAnswers(questions, answers)).toEqual(answers);
  });

  it('leaves answers untouched when nothing has a showIf', () => {
    const questions = [gateQuestion];
    const answers = { 1: 'Good' };
    expect(pruneHiddenAnswers(questions, answers)).toEqual(answers);
  });

  it('cascades: hiding a gate also clears answers gated by the question it gates', () => {
    // Q1 gates Q2, and Q2 in turn gates Q3.
    const q1 = { id: 1, type: 'single', options: ['Yes', 'No'] };
    const q2 = {
      id: 2,
      type: 'single',
      options: ['Yes', 'No'],
      showIf: { questionId: 1, values: ['Yes'] },
    };
    const q3 = { id: 3, showIf: { questionId: 2, values: ['Yes'] } };
    const questions = [q1, q2, q3];
    // Both Q2 and Q3 were answered while visible; then Q1 flips to "No".
    const answers = { 1: 'No', 2: 'Yes', 3: 'anything' };
    expect(pruneHiddenAnswers(questions, answers)).toEqual({ 1: 'No' });
  });

  it('does not mutate the input answers object', () => {
    const questions = [gateQuestion, followUpQuestion];
    const answers = { 1: 'Good', 2: 'Sometimes' };
    const snapshot = { ...answers };
    pruneHiddenAnswers(questions, answers);
    expect(answers).toEqual(snapshot);
  });
});
