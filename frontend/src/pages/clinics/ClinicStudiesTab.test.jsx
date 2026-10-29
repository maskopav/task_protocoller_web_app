// @vitest-environment jsdom
// F-096: a received study (can_edit false) has no switch at all; an owned one keeps its switch.
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import i18n from "../../i18n";
import ClinicStudiesTab from "./ClinicStudiesTab";
import { ConfirmDialogProvider, ToastProvider } from "../../components/ui";

vi.mock("../../api/projects", () => ({ setRunsAt: vi.fn(), removeRunsAt: vi.fn() }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let host, root;
beforeEach(async () => {
  await i18n.changeLanguage("en");
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe("ClinicStudiesTab", () => {
  it("shows no switch on a received study, and keeps the Received subtitle", async () => {
    const site = {
      id: 4, name: "Clinic A", receives: [],
      projects: [
        { id: 1, name: "Mine", can_edit: true, is_active: 1 },
        { id: 2, name: "Theirs", can_edit: false, is_active: 1 },
      ],
    };
    await act(async () => {
      root.render(
        <MemoryRouter><ToastProvider><ConfirmDialogProvider>
          <ClinicStudiesTab site={site} canAddAny={false} onChanged={vi.fn()} addOpen={false} onAddClose={vi.fn()} addable={[]} />
        </ConfirmDialogProvider></ToastProvider></MemoryRouter>,
      );
    });
    const mine = host.querySelector('[data-testid="clinic-studies-row-1"]');
    const theirs = host.querySelector('[data-testid="clinic-studies-row-2"]');
    expect(mine.querySelector('input[role="switch"]')).not.toBeNull();
    expect(theirs.querySelector("input, [role='switch'], [role='checkbox']")).toBeNull();
    expect(theirs.textContent).toContain("Received");
  });
});
