// @vitest-environment jsdom
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key) => key, i18n: { language: "en" } }),
}));

const { default: Questionnaire } = await import("./Questionnaire");
const { isFreeTextValid } = await import("../../utils/questionConditions");

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

describe("isFreeTextValid", () => {
  const plain = { id: 1 };
  const age = { id: 2, numericFreeText: { min: 0, max: 120 } };

  it("accepts any non-blank text for a regular write-in", () => {
    expect(isFreeTextValid(plain, "about ten")).toBe(true);
    expect(isFreeTextValid(plain, "   ")).toBe(false);
  });

  it("accepts only whole numbers within range for a numeric write-in", () => {
    expect(isFreeTextValid(age, "0")).toBe(true);
    expect(isFreeTextValid(age, "35")).toBe(true);
    expect(isFreeTextValid(age, "120")).toBe(true);
    expect(isFreeTextValid(age, "121")).toBe(false);
    expect(isFreeTextValid(age, "3.5")).toBe(false);
    expect(isFreeTextValid(age, "ten")).toBe(false);
    expect(isFreeTextValid(age, "")).toBe(false);
  });
});

describe("Questionnaire — numeric write-in", () => {
  let container;
  let root;

  const DATA = {
    title: "Language",
    questions: [
      {
        id: "age", type: "single", text: "At what age?", options: ["Age (years)", "Don't know"],
        freeTextOptions: ["Age (years)"], numericFreeText: { min: 0, max: 120 },
      },
    ],
  };

  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    act(() => {
      root = createRoot(container);
      root.render(<Questionnaire data={DATA} onNextTask={vi.fn()} />);
    });
    act(() => container.querySelector('input[value="Age (years)"]').click());
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const input = () => container.querySelector(".answer-input-number");
  const submit = () => container.querySelector(".btn-submit-questionnaire");

  it("shows a numeric-keypad input and strips non-digits", () => {
    expect(input().getAttribute("inputmode")).toBe("numeric");
    act(() => setNativeValue(input(), "4a2"));
    expect(input().value).toBe("42");
    expect(submit().disabled).toBe(false);
  });

  it("blocks submit and shows an error when the number is out of range", () => {
    act(() => setNativeValue(input(), "150"));
    expect(submit().disabled).toBe(true);
    expect(container.querySelector(".answer-input-error")).not.toBeNull();
  });
});
