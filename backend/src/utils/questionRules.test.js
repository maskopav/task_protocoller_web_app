import { describe, it, expect } from 'vitest';
import { emittableRule, findInvalidQuestionRule } from './questionRules.js';

const src = { id: 1, type: 'single', options: ['a', 'b', 'c'] };
const withRule = (showIf) => [src, { id: 2, type: 'open', options: [], showIf }];

describe('findInvalidQuestionRule', () => {
  it('accepts no rules, null rules and well-formed rules', () => {
    expect(findInvalidQuestionRule(undefined)).toBe(-1);
    expect(findInvalidQuestionRule([src])).toBe(-1);
    expect(findInvalidQuestionRule(withRule(null))).toBe(-1);
    expect(findInvalidQuestionRule(withRule(false))).toBe(-1);
    expect(findInvalidQuestionRule(withRule({ questionId: 1, optionIndexes: [2, 0] }))).toBe(-1);
  });
  it('flags missing, later, ineligible sources and bad indexes', () => {
    expect(findInvalidQuestionRule(withRule({ questionId: 9, optionIndexes: [0] }))).toBe(1);
    expect(findInvalidQuestionRule(withRule({ questionId: 1, optionIndexes: [] }))).toBe(1);
    expect(findInvalidQuestionRule(withRule({ questionId: 1, optionIndexes: [3] }))).toBe(1);
    expect(findInvalidQuestionRule(withRule({ questionId: 1, optionIndexes: ['0'] }))).toBe(1);
    expect(findInvalidQuestionRule(withRule({ questionId: 1 }))).toBe(1);
    expect(findInvalidQuestionRule(withRule('yes'))).toBe(1);
    expect(findInvalidQuestionRule([{ ...src, showIf: { questionId: 1, optionIndexes: [0] } }])).toBe(0);
    const later = [{ id: 2, type: 'open', options: [], showIf: { questionId: 1, optionIndexes: [0] } }, src];
    expect(findInvalidQuestionRule(later)).toBe(0);
    const rating = [{ id: 1, type: 'rating', options: [] }, { id: 2, type: 'open', options: [], showIf: { questionId: 1, optionIndexes: [0] } }];
    expect(findInvalidQuestionRule(rating)).toBe(1);
  });
});

describe('emittableRule', () => {
  it('resolves a valid rule to sorted unique indexes and skips invalid ones', () => {
    expect(emittableRule(withRule({ questionId: 1, optionIndexes: [2, 0, 2] }), 1)).toEqual({ sourceIndex: 0, optionIndexes: [0, 2] });
    expect(emittableRule(withRule({ questionId: 1, optionIndexes: [5] }), 1)).toBeNull();
    expect(emittableRule([src], 0)).toBeNull();
  });
});
