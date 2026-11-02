import { describe, it, expect } from "vitest";
import { savedSmellAnswers } from "./savedSmellAnswers";

const ev = (questionId, value, taskIndex = 5, protocolTaskId = 12) =>
  ({ action: "answer_clicked", taskName: "smell", taskIndex, protocolTaskId, questionId, value });

describe("savedSmellAnswers", () => {
  it("keeps this task's answers, the latest per question", () => {
    const events = [
      ev("s1", { scent: "mint" }),
      ev("s2", { scent: "rose" }),
      ev("s1", { scent: "no_scent" }),
      ev("s3", { scent: "fish" }, 9), // same task id, other position
      ev("s4", { scent: "lemon" }, 5, 13), // other task
    ];
    expect(savedSmellAnswers(events, 5, "12")).toEqual({ s1: { scent: "no_scent" }, s2: { scent: "rose" } });
  });

  it("returns nothing for a fresh session", () => {
    expect(savedSmellAnswers(undefined, 5, 12)).toEqual({});
  });
});
