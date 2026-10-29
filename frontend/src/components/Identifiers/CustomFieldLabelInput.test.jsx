// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, afterEach, beforeAll } from "vitest";
import i18n from "../../i18n";
import { render } from "../ui/renderUtil.jsx";
import CustomFieldLabelInput from "./CustomFieldLabelInput";

afterEach(() => { document.body.innerHTML = ""; });

describe("custom field label hint (F-076)", () => {
  const hints = { en: "Shown as typed in every language.", cs: null, de: null };
  beforeAll(async () => { await i18n.changeLanguage("en"); });

  it("tells the admin the label is shown unchanged in every language", () => {
    const { container } = render(<CustomFieldLabelInput value="Code" invalid={false} onChange={() => {}} />);
    expect(container.querySelector("input").value).toBe("Code");
    expect(container.querySelector("small").textContent).toBe(hints.en);
  });

  it("is translated in cs and de", async () => {
    for (const lang of ["cs", "de"]) {
      await i18n.changeLanguage(lang);
      const { container, unmount } = render(<CustomFieldLabelInput value="" invalid onChange={() => {}} />);
      const text = container.querySelector("small").textContent;
      expect(text).not.toBe(hints.en);
      expect(text).not.toMatch(/identifiers\./);
      unmount();
    }
    await i18n.changeLanguage("en");
  });
});
