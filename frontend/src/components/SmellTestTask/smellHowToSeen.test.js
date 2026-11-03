import { describe, it, expect } from "vitest";
import { smellHowToSeen } from "./smellHowToSeen";

const ev = (taskIndex = 5, protocolTaskId = 12, action = "smell_scent_opened") =>
  ({ action, taskName: "smell", taskIndex, protocolTaskId, questionId: "s1", scentNumber: 1 });

describe("smellHowToSeen", () => {
  it("is true once a scent screen of this task was opened", () => {
    expect(smellHowToSeen([ev()], 5, "12")).toBe(true);
  });

  it("ignores other tasks, other positions and other events", () => {
    expect(smellHowToSeen([ev(9), ev(5, 13), ev(5, 12, "answer_clicked")], 5, 12)).toBe(false);
  });

  it("is false for a fresh session", () => {
    expect(smellHowToSeen(undefined, 5, 12)).toBe(false);
  });
});
