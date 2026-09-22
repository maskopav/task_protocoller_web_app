// @vitest-environment jsdom
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key) => key }),
}));

const { default: Questionnaire } = await import("./Questionnaire");

// Two questions is enough to cover: a required single-choice question (blocks
// submit while unanswered) and an optional open-text question (doesn't).
const QUESTIONNAIRE_DATA = {
  title: "Test Questionnaire",
  questions: [
    { id: "q1", type: "single", text: "Pick one", options: ["A", "B"] },
    { id: "q2", type: "open", text: "Describe", optional: true },
  ],
};

// Textareas/inputs don't reflect `value` back as a DOM attribute, so a plain
// `el.value = x` + dispatchEvent isn't seen by React's change tracking. This
// goes through the native setter the same way a real keystroke would.
function setNativeValue(el, value) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value").set;
  setter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("Questionnaire — reload/resume behavior", () => {
  let container;
  let root;

  beforeEach(() => {
    // jsdom doesn't implement scrollIntoView; Questionnaire's auto-scroll
    // effect calls it on every answer change.
    Element.prototype.scrollIntoView = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function renderQuestionnaire(props = {}) {
    act(() => {
      root = createRoot(container);
      root.render(<Questionnaire data={QUESTIONNAIRE_DATA} onNextTask={vi.fn()} {...props} />);
    });
  }

  it("starts with no answers selected and the submit button disabled", () => {
    renderQuestionnaire();
    const radios = container.querySelectorAll('input[type="radio"]');
    expect([...radios].some((r) => r.checked)).toBe(false);
    expect(container.querySelector(".btn-submit-questionnaire").disabled).toBe(true);
  });

  it("loses in-progress answers on a simulated reload (fresh mount discards prior state)", () => {
    renderQuestionnaire();

    const radioA = container.querySelector('input[type="radio"][value="A"]');
    act(() => radioA.click());
    expect(radioA.checked).toBe(true);

    // Simulate a reload: unmount everything and mount a fresh instance. This
    // is exactly what happens when ParticipantInterfacePage remounts
    // Questionnaire via key={taskIndex} on the next load — there is no
    // localStorage/sessionStorage/IndexedDB read that restores `answers`.
    act(() => root.unmount());
    container.remove();
    container = document.createElement("div");
    document.body.appendChild(container);
    renderQuestionnaire();

    const freshRadioA = container.querySelector('input[type="radio"][value="A"]');
    expect(freshRadioA.checked).toBe(false);
    expect(container.querySelector(".btn-submit-questionnaire").disabled).toBe(true);
  });

  it("never touches localStorage or sessionStorage while answering (no autosave path exists)", () => {
    const lsSetSpy = vi.spyOn(Storage.prototype, "setItem");

    renderQuestionnaire();
    const radioA = container.querySelector('input[type="radio"][value="A"]');
    act(() => radioA.click());

    const textarea = container.querySelector("textarea");
    act(() => setNativeValue(textarea, "some notes"));

    expect(lsSetSpy).not.toHaveBeenCalled();

    lsSetSpy.mockRestore();
  });

  it("submits the full answer set exactly once, only via explicit submit (not per-question)", () => {
    const onNextTask = vi.fn();
    renderQuestionnaire({ onNextTask });

    const radioA = container.querySelector('input[type="radio"][value="A"]');
    act(() => radioA.click());
    expect(onNextTask).not.toHaveBeenCalled();

    const submitBtn = container.querySelector(".btn-submit-questionnaire");
    expect(submitBtn.disabled).toBe(false); // q2 is optional, so q1 alone satisfies validity

    act(() => submitBtn.click());
    expect(onNextTask).toHaveBeenCalledTimes(1);
    expect(onNextTask.mock.calls[0][0].answers).toEqual({ q1: "A" });
  });
});
