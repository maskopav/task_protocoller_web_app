// @vitest-environment jsdom
// F-087: the Computers table shows the config version each computer last received.
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import i18n from "../../i18n";
import ClinicComputersTab from "./ClinicComputersTab";
import { ConfirmDialogProvider, ToastProvider } from "../../components/ui";
import { formatDateTime } from "../../utils/formatDate";

vi.mock("../../api/sites", () => ({ updateSite: vi.fn() }));
vi.mock("./ComputerModals", () => ({ AssignComputerModal: () => null, RenameComputerModal: () => null }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let host, root;
beforeEach(async () => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

const device = (over) => ({
  id: 1, installationId: "aaaaaaaa-1111", label: "PC 1", appVersion: "1.2.0", pending: 0,
  lastSeenAt: "2026-10-28T10:00:00Z", lastConfigVersion: null, lastConfigAt: null, health: { key: "healthy", tone: "ok" }, ...over,
});

async function mount(devices) {
  await act(async () => {
    root.render(
      <MemoryRouter><ToastProvider><ConfirmDialogProvider>
        <ClinicComputersTab site={{ id: 4 }} devices={devices} isMaster={false} onChanged={vi.fn()} />
      </ConfirmDialogProvider></ToastProvider></MemoryRouter>,
    );
  });
}

describe("ClinicComputersTab config column", () => {
  for (const lng of ["en", "cs", "de"]) {
    it(`has a Config header in ${lng}`, async () => {
      await i18n.changeLanguage(lng);
      await mount([device()]);
      const heads = [...host.querySelectorAll("th")].map((h) => h.textContent);
      expect(heads).toContain(i18n.t("computers.columns.config", { ns: "clinics" }));
      expect(i18n.t("computers.columns.config", { ns: "clinics" })).not.toBe("computers.columns.config");
    });
  }

  it("shows the version with the received time as tooltip, and a dash when null", async () => {
    await i18n.changeLanguage("en");
    await mount([
      device({ id: 1, label: "PC 1", lastConfigVersion: "v17", lastConfigAt: "2026-10-27T08:30:00Z" }),
      device({ id: 2, installationId: "bbbbbbbb-2222", label: "PC 2" }),
    ]);
    const cell = (id) => host.querySelector(`.computer-row-${id} [data-testid="computer-config-${id}"]`);
    expect(cell(1).textContent).toBe("v17");
    expect(cell(1).getAttribute("title")).toBe(formatDateTime("2026-10-27T08:30:00Z"));
    expect(cell(2).textContent).toBe("—");
    expect(cell(2).getAttribute("title")).toBeNull();
  });
});
