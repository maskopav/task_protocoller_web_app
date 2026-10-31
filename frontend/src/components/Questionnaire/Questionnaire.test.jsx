// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import i18n from "../../i18n";
import Questionnaire from "./Questionnaire";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
Element.prototype.scrollIntoView = () => {};

let host, root;
beforeEach(async () => {
  await i18n.changeLanguage("en");
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

const data = {
  title: "Smoking",
  questions: [
    { id: 1, type: "single", text: "Smoker?", options: ["Yes", "No"] },
    { id: 2, type: "multiple", text: "Which?", options: ["Cigarettes", "Pipe"], showIf: { questionId: 1, optionIndexes: [0] } },
    { id: 3, type: "open", text: "Since when?", options: [], showIf: { questionId: 2, optionIndexes: [1] } },
  ],
};

const texts = () => [...host.querySelectorAll(".question-text")].map((h) => h.textContent);
const option = (label) => [...host.querySelectorAll(".option-label")].find((l) => l.textContent === label).querySelector("input");
const submit = () => host.querySelector(".btn-submit-questionnaire");

describe("Questionnaire conditional rules", () => {
  it("hides unmet questions, does not require them, and drops their answers", async () => {
    const onNextTask = vi.fn();
    await act(async () => { root.render(<Questionnaire data={data} onNextTask={onNextTask} />); });
    expect(texts()).toEqual(["Smoker?"]);

    act(() => option("Yes").click());
    expect(texts()).toEqual(["Smoker?", "Which?"]);
    expect(host.querySelectorAll(".question-card.is-conditional")).toHaveLength(1);
    expect(submit().disabled).toBe(true); // Q2 is shown and mandatory

    act(() => option("Pipe").click());
    expect(texts()).toEqual(["Smoker?", "Which?", "Since when?"]);
    expect(submit().disabled).toBe(true); // Q3 is shown and mandatory

    // Switching the gate answer hides Q2 and, through the chain, Q3
    act(() => option("No").click());
    expect(texts()).toEqual(["Smoker?"]);
    expect(submit().disabled).toBe(false);

    act(() => submit().click());
    expect(onNextTask.mock.calls[0][0].answers).toEqual({ 1: "No" });
  });
});
