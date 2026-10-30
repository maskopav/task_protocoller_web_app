// @vitest-environment jsdom
// F-100: re-adding an existing editor must not look like a new addition.
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import i18n from "../../../i18n";
import EditorsTab from "./EditorsTab";
import { ConfirmDialogProvider, ToastProvider } from "../../../components/ui";

vi.mock("../../../api/projects", () => ({ fetchEditors: vi.fn(), addEditor: vi.fn(), removeEditor: vi.fn() }));
import { fetchEditors, addEditor } from "../../../api/projects";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let host, root;
beforeEach(async () => {
  await i18n.changeLanguage("en");
  vi.clearAllMocks();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

const ed = (user_id, email) => ({ user_id, name: null, email, is_creator: false, added_at: "2026-10-01T10:00:00Z" });

async function submit(email) {
  await act(async () => {
    root.render(
      <MemoryRouter><ToastProvider><ConfirmDialogProvider>
        <EditorsTab study={{ project_id: 3 }} adding onCloseAdd={vi.fn()} />
      </ConfirmDialogProvider></ToastProvider></MemoryRouter>,
    );
  });
  await act(async () => {});
  const input = document.querySelector('[data-testid="add-editor-email"]');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, email);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => { document.querySelector("#add-editor-form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  await act(async () => {});
}

describe("EditorsTab add editor", () => {
  it("F-100: re-adding an existing editor says 'already an editor', not 'added'", async () => {
    fetchEditors.mockResolvedValue([ed(8, "bob@x.cz")]);
    addEditor.mockResolvedValue(ed(8, "bob@x.cz"));
    await submit("BOB@x.cz");
    const text = document.body.textContent;
    expect(text).toContain("bob@x.cz is already an editor");
    expect(text).not.toContain("added as an editor");
  });

  it("F-100: a new editor still gets the 'added' toast", async () => {
    fetchEditors.mockResolvedValueOnce([ed(8, "bob@x.cz")]).mockResolvedValue([ed(8, "bob@x.cz"), ed(9, "eve@x.cz")]);
    addEditor.mockResolvedValue(ed(9, "eve@x.cz"));
    await submit("eve@x.cz");
    expect(document.body.textContent).toContain("eve@x.cz added as an editor");
    expect(document.body.textContent).not.toContain("already an editor");
  });
});
