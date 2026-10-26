// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, afterEach, beforeAll } from "vitest";
import i18n from "../../i18n";
import { render, click } from "../ui/renderUtil.jsx";
import TaskList from "./TaskList";
import { defaultLabel, paramText } from "./paramText";
import { protocolSnapshot } from "./snapshot";
import { catalogueField } from "../Identifiers/IdentifierFields";
import { ConfirmDialogProvider } from "../ConfirmDialog/ConfirmDialogContext";

beforeAll(async () => { await i18n.changeLanguage("en"); });
afterEach(() => { document.body.innerHTML = ""; });

const yn = (k) => ({ yes: "Yes", no: "No" }[k]);

describe("boolean defaults read Yes/No (F-007)", () => {
  it("defaultLabel and paramText turn booleans into words", () => {
    expect(defaultLabel({}, true, yn)).toBe("Yes");
    expect(defaultLabel({}, false, yn)).toBe("No");
    expect(defaultLabel({ values: [{ key: "a", label: "Alpha" }] }, "a", yn)).toBe("Alpha");
    expect(defaultLabel({}, ["x", "y"], yn)).toBe("x; y");
    expect(paramText(false, yn)).toBe("No");
    expect(paramText("true", yn)).toBe("Yes");
    expect(paramText(undefined, yn)).toBe("");
    expect(paramText(7, yn)).toBe("7");
  });

  it("the task catalogue never prints a raw true/false", () => {
    const { container } = render(<ConfirmDialogProvider><TaskList onCreate={() => {}} /></ConfirmDialogProvider>);
    const text = container.querySelector(".pe-groups").textContent;
    expect(text).not.toMatch(/\b(true|false)\b/i);
    expect(text).toMatch(/\b(Yes|No)\b/);
  });

  it("adding a task calls onCreate with its category, and the search filters", () => {
    const calls = [];
    const { container } = render(<ConfirmDialogProvider><TaskList onCreate={(c) => calls.push(c)} /></ConfirmDialogProvider>);
    const options = container.querySelectorAll(".pe-option");
    expect(options.length).toBeGreaterThan(3);
    click(options[0].querySelector(".ui-icon-btn"));
    expect(calls).toHaveLength(1);

    const search = container.querySelector('[data-testid="task-search"]');
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(search, "zzzz-no-such-task");
    search.dispatchEvent(new Event("input", { bubbles: true }));
    return Promise.resolve().then(() => {
      expect(container.querySelectorAll(".pe-option").length).toBe(0);
    });
  });
});

describe("protocolSnapshot", () => {
  const base = { name: "A", description: "d", language: "en", required_identifiers: [catalogueField("patient_code")], recordings_file_name: "x", info_text: "", instructions_text: "" };
  it("is stable for equal content and changes with the tasks or a field", () => {
    expect(protocolSnapshot(base, [])).toBe(protocolSnapshot({ ...base }, []));
    expect(protocolSnapshot(base, [{ category: "a" }])).not.toBe(protocolSnapshot(base, []));
    expect(protocolSnapshot({ ...base, description: "e" }, [])).not.toBe(protocolSnapshot(base, []));
  });
  it("treats null and empty text alike, so loading is not 'dirty'", () => {
    expect(protocolSnapshot({ ...base, info_text: null, instructions_pdf_url: null }, [])).toBe(protocolSnapshot(base, []));
  });
});
