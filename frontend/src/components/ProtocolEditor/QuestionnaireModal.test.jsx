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
