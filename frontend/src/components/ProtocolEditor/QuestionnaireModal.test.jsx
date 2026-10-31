// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import i18n from "../../i18n";
import QuestionnaireModal from "./QuestionnaireModal";
import { readFileSync } from "node:fs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let host, root;
beforeEach(() => { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

const initialData = {
  title: "Q", description: "",
  questions: [{ id: 1, text: "x", type: "multiple", options: ["a", "b"], optional: false }],
};
const EN = ["Allow write-in", "Remove option", "Exclusive option (clears other selections)", "-- None --"];

async function mount(lng) {
  await i18n.changeLanguage(lng);
  await act(async () => { root.render(<QuestionnaireModal open onClose={vi.fn()} onSave={vi.fn()} initialData={initialData} />); });
  return document.body.innerHTML;
}

describe("QuestionnaireModal i18n (F-070)", () => {
  it("F-070 english shows the four strings", async () => {
    const html = await mount("en");
    for (const s of EN) expect(html).toContain(s);
  });
  for (const lng of ["cs", "de"]) {
    it(`F-070 ${lng} shows none of the English strings`, async () => {
      const html = await mount(lng);
      for (const s of EN) expect(html).not.toContain(s);
      expect(html).toContain(i18n.t("protocolEditor.questionnaire.allowWriteIn", { ns: "admin" }));
      expect(i18n.t("protocolEditor.questionnaire.noneOption", { ns: "admin" })).not.toBe("protocolEditor.questionnaire.noneOption");
    });
  }
});

describe("QuestionnaireModal restyle (F-071)", () => {
  it("F-071 Add question is a UI-kit button, not the full-width purple pill", async () => {
    await mount("en");
    const btn = document.querySelector('[data-testid="qm-add-question"]');
    expect(btn.className).toContain("ui-btn");
    expect(btn.className).not.toContain("ui-btn-primary");
    expect(btn.textContent).toContain("Add question");
  });
  it("F-071 the modal stylesheet has no uppercase labels and no purple pill", async () => {
    const css = readFileSync("src/components/ProtocolEditor/QuestionnaireModal.css", "utf8");
    expect(css).toMatch(/\.qm-btn-add-question/);
    expect(css).not.toMatch(/text-transform:\s*uppercase/);
    expect(css).not.toMatch(/var\(--purple\)/);
  });
});

describe("QuestionnaireModal conditional rules", () => {
  const ruleData = {
    title: "Q", description: "",
    questions: [
      { id: 1, text: "Smoker?", type: "single", options: ["Yes", "No"], optional: false },
      { id: 2, text: "Which?", type: "multiple", options: ["Cigarettes", "Pipe", "Cigars"], optional: false },
      { id: 3, text: "Since when?", type: "open", options: [], optional: false },
    ],
  };
  const click = (el) => act(() => { el.click(); });
  const cards = () => [...document.querySelectorAll(".qm-question-card")];
  const ruleBox = (card) => card.querySelector('[data-testid="qm-condition"] input[type="checkbox"]');
  const answerBoxes = (card) => [...card.querySelectorAll(".qm-condition-values input")];

  async function mountRules(onSave) {
    await i18n.changeLanguage("en");
    await act(async () => { root.render(<QuestionnaireModal open onClose={vi.fn()} onSave={onSave} initialData={ruleData} />); });
  }

  it("offers the rule only where an earlier choice question exists, with earlier sources listed", async () => {
    await mountRules(vi.fn());
    const [c1, c2, c3] = cards();
    expect(c1.querySelector('[data-testid="qm-condition"]')).toBeNull();
    expect(c2.textContent).toContain("Only show this question if a previous answer matches");
    click(ruleBox(c3));
    const opts = [...cards()[2].querySelectorAll(".qm-condition-detail select option")].map((o) => o.textContent);
    expect(opts).toEqual(["Q1: Smoker?", "Q2: Which?"]);
    expect(answerBoxes(cards()[2]).map((b) => b.parentElement.textContent)).toEqual(["Yes", "No"]);
    expect(cards()[2].textContent).toContain("the rule is ignored");
  });

  it("saves { questionId, optionIndexes }, resets answers on source change and drops empty rules", async () => {
    const onSave = vi.fn();
    await mountRules(onSave);
    click(ruleBox(cards()[1]));
    click(answerBoxes(cards()[1])[0]);
    click(ruleBox(cards()[2]));
    const select = cards()[2].querySelector(".qm-condition-detail select");
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
      setter.call(select, "2");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(answerBoxes(cards()[2]).every((b) => !b.checked)).toBe(true);
    click(document.querySelector('[data-testid="modal-save"]'));
    const saved = onSave.mock.calls[0][0].questions;
    expect(saved[1].showIf).toEqual({ questionId: 1, optionIndexes: [0] });
    expect(saved[2].showIf).toBeNull();
  });

  it("removing an option remaps indexes; removing the source clears the rule; unticking removes it", async () => {
    await mountRules(vi.fn());
    click(ruleBox(cards()[2]));
    const select = cards()[2].querySelector(".qm-condition-detail select");
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(select, "2");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    click(answerBoxes(cards()[2])[2]); // Cigars
    click(cards()[1].querySelectorAll(".qm-btn-remove-option")[0]); // remove Cigarettes
    const boxes = answerBoxes(cards()[2]);
    expect(boxes.map((b) => b.parentElement.textContent)).toEqual(["Pipe", "Cigars"]);
    expect(boxes.map((b) => b.checked)).toEqual([false, true]);
    click(cards()[1].querySelector(".qm-btn-remove-question")); // remove Q2
    expect(ruleBox(cards()[1]).checked).toBe(false);
    click(ruleBox(cards()[1]));
    click(ruleBox(cards()[1]));
    expect(cards()[1].querySelector(".qm-condition-detail")).toBeNull();
  });
});
