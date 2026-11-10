// @vitest-environment jsdom
// Device logs (docs/device_logs/01_spec.md §6, §8): the Logs tab shows for a master only
// and lists the files grouped by computer.
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import i18n from "../../i18n";
import ClinicPage from "./ClinicPage";
import { ConfirmDialogProvider, ToastProvider } from "../../components/ui";
import { formatBytes, groupLogsByComputer } from "./clinicLogic";

vi.mock("../../api/sites", async (importOriginal) => ({ ...(await importOriginal()), fetchSites: vi.fn(), fetchSiteById: vi.fn() }));
vi.mock("../../api/devices", () => ({ fetchDevices: vi.fn().mockResolvedValue({ devices: [] }) }));
vi.mock("../../api/uploads", () => ({ fetchUploadSummary: vi.fn().mockResolvedValue(null) }));
vi.mock("../../api/projects", () => ({ fetchProjectsList: vi.fn().mockResolvedValue([]) }));
vi.mock("../../api/deviceLogs", () => ({
  fetchDeviceLogs: vi.fn(), viewDeviceLog: vi.fn(), downloadDeviceLog: vi.fn(),
}));
let mockUser = {};
vi.mock("../../context/UserContext", () => ({ useUser: () => ({ user: mockUser }) }));
import { fetchSiteById } from "../../api/sites";
import { fetchDeviceLogs, viewDeviceLog, downloadDeviceLog } from "../../api/deviceLogs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const log = (over) => ({
  id: 1, deviceId: 10, deviceLabel: "Lab PC", installationId: "aaaaaaaa-1111", fileName: "app.2026-11-09.0.log.gz",
  bytes: 2048, utcOffset: "+01:00", appVersion: "1.4.0", receivedAt: "2026-11-10T08:00:00.000Z", ...over,
});
const LOGS = [
  log({ id: 3, fileName: "app.2026-11-09.1.log.gz" }),
  log({ id: 4, deviceId: 11, deviceLabel: null, installationId: "bbbbbbbb-2222", fileName: "app.2026-11-09.0.log.gz" }),
  log({ id: 2, fileName: "app.2026-11-09.0.log.gz" }),
];

let host, root;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
beforeEach(async () => {
  await i18n.changeLanguage("en");
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  fetchSiteById.mockResolvedValue({ id: 4, name: "Clinic 4", is_active: 1, projects: [], can_edit: true });
  fetchDeviceLogs.mockResolvedValue({ logs: LOGS });
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.clearAllMocks(); });

const render = async (path) => {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}><ToastProvider><ConfirmDialogProvider>
        <Routes><Route path="/clinics/:siteId/:tab?" element={<ClinicPage />} /></Routes>
      </ConfirmDialogProvider></ToastProvider></MemoryRouter>,
    );
  });
  await flush();
};

describe("Logs tab visibility", () => {
  it("is shown to a master and lists the files grouped by computer", async () => {
    mockUser = { role_id: 1 };
    await render("/clinics/4/logs");
    expect(host.querySelector('[data-testid="clinic-tab-logs"]')).not.toBeNull();
    expect(fetchDeviceLogs).toHaveBeenCalledWith(4);

    const groups = [...host.querySelectorAll('[data-testid^="clinic-logs-computer-"]')];
    expect(groups.map((g) => g.getAttribute("data-testid"))).toEqual(["clinic-logs-computer-10", "clinic-logs-computer-11"]);
    // label, with the installation id as the fallback name
    expect(groups[0].querySelector("h2").textContent).toBe("Lab PC");
    expect(groups[1].querySelector("h2").textContent).toBe("bbbbbbbb-2222");
    // within a computer the API order (newest first) is kept
    const files = (g) => [...g.querySelectorAll("tbody tr")].map((r) => r.textContent);
    expect(files(groups[0])).toHaveLength(2);
    expect(files(groups[0])[0]).toContain("app.2026-11-09.1.log.gz");
    expect(files(groups[0])[0]).toContain("+01:00");
    expect(files(groups[0])[0]).toContain("1.4.0");
    expect(files(groups[0])[0]).toContain("2.0 KB");
    expect(files(groups[0])[1]).toContain("app.2026-11-09.0.log.gz");
    expect(files(groups[1])).toHaveLength(1);
  });

  it("View and Download act on the file's id", async () => {
    mockUser = { role_id: 1 };
    await render("/clinics/4/logs");
    await act(async () => { host.querySelector('[data-testid="log-view-3"]').click(); });
    await act(async () => { host.querySelector('[data-testid="log-download-3"]').click(); });
    expect(viewDeviceLog).toHaveBeenCalledWith(3);
    expect(downloadDeviceLog).toHaveBeenCalledWith(3);
  });

  it("says so when there are no logs", async () => {
    mockUser = { role_id: 1 };
    fetchDeviceLogs.mockResolvedValue({ logs: [] });
    await render("/clinics/4/logs");
    expect(host.querySelector('[data-testid="clinic-logs-empty"]').textContent).toContain("No logs yet");
  });

  it("is not shown to a non-master, and /logs redirects as for an unknown tab", async () => {
    mockUser = { role_id: 2 };
    await render("/clinics/4/logs");
    expect(host.querySelector('[data-testid="clinic-tab-logs"]')).toBeNull();
    expect(host.querySelector('[data-testid="clinic-logs"]')).toBeNull();
    expect(fetchDeviceLogs).not.toHaveBeenCalled();
    // redirected to the studies tab
    expect(host.querySelector('[data-testid="clinic-tab-studies"]').className).toContain("ui-tab-active");
  });

  it("has the tab label in en, cs and de", async () => {
    for (const lng of ["en", "cs", "de"]) {
      expect(i18n.t("tabs.logs", { ns: "clinics", lng })).not.toBe("tabs.logs");
      expect(i18n.t("logs.emptyTitle", { ns: "clinics", lng })).not.toBe("logs.emptyTitle");
    }
  });
});

describe("log helpers", () => {
  it("groups by computer in the order of each computer's newest file", () => {
    const g = groupLogsByComputer(LOGS);
    expect(g.map((x) => x.name)).toEqual(["Lab PC", "bbbbbbbb-2222"]);
    expect(g[0].logs.map((l) => l.id)).toEqual([3, 2]);
  });
  it("formats sizes", () => {
    expect([formatBytes(0), formatBytes(812), formatBytes(14541), formatBytes(1.5 * 1024 ** 2)]).toEqual(["0 B", "812 B", "14.2 KB", "1.5 MB"]);
  });
});
