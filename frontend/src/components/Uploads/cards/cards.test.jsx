// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import i18n from "../../../i18n";
import UploadsSummaryCard from "./UploadsSummaryCard";
import DevicesSummaryCard from "./DevicesSummaryCard";
import UploadLine from "./UploadLine";
import UploadStats from "./UploadStats";
import UploadsSection from "./UploadsSection";

vi.mock("../../../api/uploads", () => ({
  fetchUploadSummary: vi.fn(),
  fetchUploads: vi.fn(),
  fetchDevices: vi.fn(),
}));
import { fetchUploadSummary, fetchUploads, fetchDevices } from "../../../api/uploads";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const summary = (o = {}) => ({
  week: 4, last30: 9, total: 12, invalid: 2, needsReview: 1, attention: 3, unreviewed: 5,
  lastUpload: new Date(Date.now() - 3 * 3600e3).toISOString(), days: 30,
  perDay: [{ date: "2026-10-20", count: 2, invalid: 1 }, { date: "2026-10-21", count: 0, invalid: 0 }],
  byProtocol: [{ protocol: "P1", count: 2 }], bySite: [{ id: 1, name: "Paris", count: 2 }], ...o,
});
const row = (id, o = {}) => ({
  id, site: "Paris", project: "Proj", protocol: "P1", deviceId: "dev-1", deviceLabel: "Clinic PC", receivedAt: new Date().toISOString(),
  status: "valid", qc: "unreviewed", issues: [], needsAttention: false, canEdit: false, participant: { patient_code: "PX" }, ...o,
});
const devices = (list, stats) => ({ devices: list, stats: { devices: list.length, healthy: 0, waiting: 0, failed: 0, silent: 0, ...stats } });

let host, root;
const render = async (ui) => { await act(async () => root.render(<MemoryRouter>{ui}</MemoryRouter>)); };

beforeEach(async () => {
  await i18n.changeLanguage("en");
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  vi.resetAllMocks();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("UploadsSummaryCard", () => {
  it("shows a loading placeholder first, then the counts", async () => {
    let resolve;
    fetchUploadSummary.mockReturnValue(new Promise((r) => { resolve = r; }));
    await render(<UploadsSummaryCard sitesCount={2} />);
    expect(host.querySelector("[aria-busy='true']")).not.toBeNull();
    await act(async () => resolve(summary()));
    expect(host.textContent).toContain("4 this week");
    expect(host.textContent).toContain("3 need attention");
    expect(host.querySelector("a").getAttribute("href")).toBe("/admin/uploads");
  });

  it("shows an empty state when nothing has been uploaded", async () => {
    fetchUploadSummary.mockResolvedValue(summary({ total: 0, week: 0, attention: 0 }));
    await render(<UploadsSummaryCard sitesCount={1} />);
    expect(host.textContent).toContain("No uploads yet");
  });

  it("shows a quiet error and keeps the card", async () => {
    fetchUploadSummary.mockRejectedValue(new Error("boom"));
    await render(<UploadsSummaryCard sitesCount={1} />);
    expect(host.querySelector("[role='status']").textContent).toContain("unavailable");
    expect(host.querySelector("a")).not.toBeNull();
  });
});

describe("DevicesSummaryCard", () => {
  it("shows waiting and silent counts", async () => {
    fetchDevices.mockResolvedValue(devices([{ id: 1, backlogHidden: false }], { waiting: 7, silent: 1 }));
    await render(<DevicesSummaryCard />);
    expect(host.textContent).toContain("7 waiting");
    expect(host.textContent).toContain("1 silent");
    expect(host.querySelector("a").getAttribute("href")).toBe("/admin/uploads/devices");
  });

  it("leaves out the backlog number when the server hid it", async () => {
    fetchDevices.mockResolvedValue(devices([{ id: 1, backlogHidden: true }], { waiting: 0, silent: 2 }));
    await render(<DevicesSummaryCard />);
    expect(host.textContent).not.toMatch(/\d+ waiting/);
    expect(host.textContent).toContain("2 silent");
  });

  it("handles no devices and errors", async () => {
    fetchDevices.mockResolvedValue(devices([]));
    await render(<DevicesSummaryCard />);
    expect(host.textContent).toContain("No devices yet");
    fetchDevices.mockRejectedValue(new Error("x"));
    await render(<DevicesSummaryCard key="again" />);
    expect(host.querySelector("[role='status']")).not.toBeNull();
  });
});

describe("UploadLine and UploadStats", () => {
  it("renders last upload with the attention pill, all clear, empty, and nothing on error", async () => {
    fetchUploadSummary.mockResolvedValue(summary());
    await render(<UploadLine siteId={1} />);
    expect(host.textContent).toContain("Last upload 3 h ago");
    expect(host.textContent).toContain("3 need attention");
    expect(fetchUploadSummary).toHaveBeenCalledWith({ siteId: 1, projectId: undefined, days: undefined });

    fetchUploadSummary.mockResolvedValue(summary({ attention: 0 }));
    await render(<UploadLine key="a" siteId={1} />);
    expect(host.textContent).toContain("All clear");

    fetchUploadSummary.mockResolvedValue(summary({ total: 0 }));
    await render(<UploadLine key="b" siteId={1} />);
    expect(host.textContent).toContain("No uploads yet");

    fetchUploadSummary.mockRejectedValue(new Error("x"));
    await render(<UploadLine key="c" siteId={1} />);
    expect(host.querySelector("[data-testid='upload-line']")).toBeNull();
  });

  it("shows the three stats, placeholders while loading and dashes on error", async () => {
    await render(<UploadStats summary={{ status: "loading", data: null }} />);
    expect(host.querySelector("[data-testid='upload-stat-last30']").textContent).toContain("…");
    await render(<UploadStats summary={{ status: "error", data: null }} />);
    expect(host.querySelector("[data-testid='upload-stat-invalid']").textContent).toContain("—");
    await render(<UploadStats summary={{ status: "ready", data: summary() }} />);
    expect(host.querySelector("[data-testid='upload-stat-last30']").textContent).toContain("9");
    expect(host.querySelector("[data-testid='upload-stat-invalid']").textContent).toContain("2");
    expect(host.querySelector("[data-testid='upload-stat-needsReview']").textContent).toContain("1");
  });
});

describe("UploadsSection", () => {
  const props = { siteId: "1", days: 30, onDaysChange: () => {} };

  it("renders latest uploads, chart with a red bar for an invalid day, and devices", async () => {
    fetchUploads.mockResolvedValue({ total: 12, rows: Array.from({ length: 10 }, (_, i) => row(`s${i}`, i === 0 ? { status: "invalid", invalidReason: "checksum", needsAttention: true } : {})) });
    fetchDevices.mockResolvedValue(devices([{ id: 1, label: "Clinic PC", health: { key: "warn" }, pending: 3, backlogHidden: false, lastSeenAt: new Date().toISOString() }]));
    await render(<UploadsSection kind="site" {...props} summary={{ status: "ready", data: summary() }} />);
    expect(fetchUploads).toHaveBeenCalledWith({ site: "1", project: undefined, pageSize: 10, sort: "receivedAt", dir: "desc" });
    expect(host.querySelectorAll("[data-testid='latest-uploads'] tbody tr")).toHaveLength(8);
    expect(host.querySelectorAll("[data-testid='bar'][data-invalid='1']")).toHaveLength(1);
    expect(host.querySelectorAll("[data-testid='bar']")).toHaveLength(2);
    expect(host.textContent).toContain("View all 12 →");
    expect(host.textContent).toContain("3 waiting");
    expect(host.querySelector("a[href='/admin/uploads?site=1']")).not.toBeNull();
    expect(host.textContent).not.toContain("Go to Downloads");
  });

  it("offers Go to Downloads only when some session is editable", async () => {
    fetchUploads.mockResolvedValue({ total: 1, rows: [row("a", { canEdit: true })] });
    fetchDevices.mockResolvedValue(devices([]));
    await render(<UploadsSection kind="site" {...props} summary={{ status: "ready", data: summary() }} />);
    const link = [...host.querySelectorAll("a")].find((a) => a.textContent.includes("Go to Downloads"));
    expect(link.getAttribute("href")).toBe("/admin/uploads/downloads");
  });

  it("hides the device backlog when the server did", async () => {
    fetchUploads.mockResolvedValue({ total: 1, rows: [row("a")] });
    fetchDevices.mockResolvedValue(devices([{ id: 1, label: "Clinic PC", health: { key: "ok" }, pending: 0, backlogHidden: true }]));
    await render(<UploadsSection kind="site" {...props} summary={{ status: "ready", data: summary() }} />);
    expect(host.textContent).not.toMatch(/\d+ waiting/);
  });

  it("project variant shows counts by protocol and by site", async () => {
    fetchUploads.mockResolvedValue({ total: 1, rows: [row("a")] });
    await render(<UploadsSection kind="project" projectId="4" days={30} onDaysChange={() => {}} summary={{ status: "ready", data: summary() }} />);
    expect(fetchUploads).toHaveBeenCalledWith(expect.objectContaining({ project: "4" }));
    expect(host.textContent).toContain("By protocol");
    expect(host.textContent).toContain("Paris");
    expect(host.querySelector("a[href='/admin/uploads?project=4']")).not.toBeNull();
  });

  it("shows the empty state", async () => {
    fetchUploads.mockResolvedValue({ total: 0, rows: [] });
    fetchDevices.mockResolvedValue(devices([]));
    await render(<UploadsSection kind="site" {...props} summary={{ status: "ready", data: summary({ perDay: [] }) }} />);
    expect(host.querySelector("[data-testid='latest-empty']")).not.toBeNull();
  });

  it("degrades quietly when every call fails", async () => {
    fetchUploads.mockRejectedValue(new Error("x"));
    fetchDevices.mockRejectedValue(new Error("x"));
    await render(<UploadsSection kind="site" {...props} summary={{ status: "error", data: null }} />);
    expect(host.querySelectorAll("[role='status']").length).toBeGreaterThanOrEqual(3);
    expect(host.querySelector("[data-testid='uploads-section']")).not.toBeNull();
  });
});
