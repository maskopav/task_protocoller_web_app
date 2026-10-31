import { describe, expect, it } from "vitest";
import {
  clearDanglingShowIf,
  getConditionSourceQuestions,
  getVisibleQuestions,
  isConditionSource,
  pruneHiddenAnswers,
  remapShowIfOnOptionRemove,
  sanitizeShowIf,
} from "./questionConditions";

const q1 = { id: 1, type: "single", text: "Smoker?", options: ["Yes", "No"] };
const q2 = { id: 2, type: "multiple", text: "Which?", options: ["Cigarettes", "Pipe", "Cigars"], showIf: { questionId: 1, optionIndexes: [0] } };
const q3 = { id: 3, type: "open", text: "Since when?", options: [], showIf: { questionId: 2, optionIndexes: [1, 2] } };
const open = { id: 4, type: "open", text: "Notes", options: [] };
const chain = [q1, q2, q3, open];
const ids = (qs) => qs.map((q) => q.id);

describe("isConditionSource", () => {
  it("accepts choice questions with options only", () => {
    expect(isConditionSource(q1)).toBe(true);
    expect(isConditionSource(q2)).toBe(true);
    expect(isConditionSource({ id: 5, type: "dropdown", options: ["a"] })).toBe(true);
    expect(isConditionSource({ id: 5, type: "single", options: [] })).toBe(false);
    expect(isConditionSource({ id: 5, type: "rating", options: [] })).toBe(false);
    expect(isConditionSource(open)).toBe(false);
  });
});

describe("getConditionSourceQuestions", () => {
  it("lists earlier eligible questions only", () => {
    expect(ids(getConditionSourceQuestions(chain, 1))).toEqual([]);
    expect(ids(getConditionSourceQuestions(chain, 3))).toEqual([1, 2]);
    expect(ids(getConditionSourceQuestions(chain, 4))).toEqual([1, 2]);
  });
});

describe("getVisibleQuestions", () => {
  it("hides unmet questions and cascades through chains", () => {
    expect(ids(getVisibleQuestions(chain, {}))).toEqual([1, 4]);
    expect(ids(getVisibleQuestions(chain, { 1: "Yes" }))).toEqual([1, 2, 4]);
    expect(ids(getVisibleQuestions(chain, { 1: "Yes", 2: ["Cigarettes"] }))).toEqual([1, 2, 4]);
    expect(ids(getVisibleQuestions(chain, { 1: "Yes", 2: ["Cigarettes", "Pipe"] }))).toEqual([1, 2, 3, 4]);
    // the source of q3 is hidden, so q3 is hidden even though q2's stale answer matches
    expect(ids(getVisibleQuestions(chain, { 1: "No", 2: ["Pipe"] }))).toEqual([1, 4]);
  });
  it("shows a question whose rule is invalid", () => {
    const forward = { ...q1, showIf: { questionId: 2, optionIndexes: [0] } };
    const dangling = { ...open, showIf: { questionId: 99, optionIndexes: [0] } };
    expect(ids(getVisibleQuestions([forward, q2, dangling], {}))).toEqual([1, 4]);
  });
});

describe("pruneHiddenAnswers", () => {
  it("drops answers and free-text of hidden questions", () => {
    const qs = [q1, { ...q2, freeTextOptions: ["Pipe"] }, q3];
    const answers = { 1: "No", 2: ["Pipe"], "2__freeText__Pipe": "briar", 3: "2001" };
    expect(pruneHiddenAnswers(qs, answers)).toEqual({ 1: "No" });
  });
});

describe("editor maintenance", () => {
  it("clearDanglingShowIf clears rules pointing at the removed question", () => {
    const out = clearDanglingShowIf(chain.filter((q) => q.id !== 1), 1);
    expect(out[0].showIf).toBeNull();
    expect(out[1].showIf).toEqual(q3.showIf);
  });
  it("remapShowIfOnOptionRemove drops and shifts indexes", () => {
    const out = remapShowIfOnOptionRemove(chain, 2, 1);
    expect(out[2].showIf).toEqual({ questionId: 2, optionIndexes: [1] });
    expect(remapShowIfOnOptionRemove(chain, 1, 0)[1].showIf.optionIndexes).toEqual([]);
  });
  it("sanitizeShowIf drops empty, ineligible and forward rules and normalizes indexes", () => {
    const qs = [
      q1,
      { ...q2, showIf: { questionId: 1, optionIndexes: [1, 0, 1, 7] } },
      { ...q3, showIf: { questionId: 2, optionIndexes: [] } },
      { ...open, showIf: { questionId: 3, optionIndexes: [0] } },
      { id: 5, type: "open", options: [], showIf: { questionId: 6, optionIndexes: [0] } },
      { id: 6, type: "single", options: ["a"] },
    ];
    const out = sanitizeShowIf(qs);
    expect(out[1].showIf).toEqual({ questionId: 1, optionIndexes: [0, 1] });
    expect(out[2].showIf).toBeNull();
    expect(out[3].showIf).toBeNull();
    expect(out[4].showIf).toBeNull();
    expect(out[0].showIf).toBeUndefined();
  });
});
