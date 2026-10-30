// @vitest-environment jsdom
// F-098 (empty Clinics page wording by permission), F-101 (unknown clinic message), F-084 (not-available text).
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import i18n from "../../i18n";
import ClinicsListPage from "./ClinicsListPage";
import ClinicPage from "./ClinicPage";
import NotAvailablePage from "../NotAvailablePage";
import { ConfirmDialogProvider, ToastProvider } from "../../components/ui";

vi.mock("../../api/sites", () => ({ fetchSites: vi.fn(), fetchSiteById: vi.fn() }));
vi.mock("../../api/devices", () => ({ fetchDevices: vi.fn().mockResolvedValue({ devices: [] }) }));
vi.mock("../../api/uploads", () => ({ fetchUploadSummary: vi.fn().mockResolvedValue(null) }));
vi.mock("../../api/projects", () => ({ fetchProjectsList: vi.fn().mockResolvedValue([]) }));
let mockUser = {};
vi.mock("../../context/UserContext", () => ({ useUser: () => ({ user: mockUser }) }));
import { fetchSites, fetchSiteById } from "../../api/sites";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let host, root;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
beforeEach(async () => {
  await i18n.changeLanguage("en");
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  fetchSites.mockResolvedValue([]);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

const wrap = (ui, path = "/") => (
  <MemoryRouter initialEntries={[path]}><ToastProvider><ConfirmDialogProvider>{ui}</ConfirmDialogProvider></ToastProvider></MemoryRouter>
);
const clinicRoute = (
  <Routes><Route path="/clinics/:siteId/:tab?" element={<ClinicPage />} /></Routes>
);

describe("empty Clinics page (F-098)", () => {
  it("F-098 a user who cannot create clinics is told to ask an administrator", async () => {
    mockUser = { role_id: 2, can_create_sites: 0 };
    await act(async () => { root.render(wrap(<ClinicsListPage />)); });
    await flush();
    const empty = host.querySelector('[data-testid="clinics-empty"]');
    expect(empty.textContent).toContain("Ask an administrator to give you access to a clinic");
    expect(empty.textContent).not.toContain("Create one");
    expect(host.querySelector('[data-testid="new-clinic"]')).toBeNull();
  });
  it("F-098 a user who can create clinics keeps the current text", async () => {
    mockUser = { role_id: 2, can_create_sites: 1 };
    await act(async () => { root.render(wrap(<ClinicsListPage />)); });
    await flush();
    expect(host.querySelector('[data-testid="clinics-empty"]').textContent).toContain("Create one to get an access token");
  });
});

describe("unknown clinic (F-101)", () => {
  for (const [lng, text] of [["en", "Clinic not found"], ["cs", "Klinika nenalezena"], ["de", "Klinik nicht gefunden"]]) {
    it(`F-101 shows the clinic-specific not-found message in ${lng}`, async () => {
      await i18n.changeLanguage(lng);
      mockUser = { role_id: 2 };
      fetchSiteById.mockRejectedValue({ status: 404, code: "not_found" });
      await act(async () => { root.render(wrap(clinicRoute, "/clinics/99/studies")); });
      await flush();
      expect(host.querySelector('[data-testid="clinic-not-found"]').textContent).toContain(text);
      expect(host.querySelector('[data-testid="not-found-page"]')).toBeNull();
    });
  }
  it("F-101 english wording mirrors the study page", async () => {
    mockUser = { role_id: 2 };
    fetchSiteById.mockRejectedValue({ status: 404 });
    await act(async () => { root.render(wrap(clinicRoute, "/clinics/99/studies")); });
    await flush();
    expect(host.querySelector('[data-testid="clinic-not-found"]').textContent).toContain("It does not exist, or you do not have access to it.");
  });
});

describe("not-available page (F-084)", () => {
  const cases = { en: "You don't have access to this page", cs: "K této stránce nemáte přístup", de: "Sie haben keinen Zugriff auf diese Seite" };
  for (const [lng, text] of Object.entries(cases)) {
    it(`F-084 neutral text in ${lng}, not administrators-only`, async () => {
      await i18n.changeLanguage(lng);
      mockUser = {};
      await act(async () => { root.render(wrap(<NotAvailablePage />)); });
      const msg = host.querySelector(".notice-message").textContent;
      expect(msg).toContain(text);
      expect(msg).not.toMatch(/only available to administrators|jen správcům|nur Administratoren/);
    });
  }
});

describe("clinic name length (F-082)", () => {
  it("F-082 the name field shows a counter near the limit and says so at 64", async () => {
    const ClinicNameField = (await import("./ClinicNameField")).default;
    const render = async (value) => { await act(async () => { root.render(<ClinicNameField value={value} onChange={() => {}} />); }); return host.querySelector('[data-testid="clinic-name-counter"]'); };
    expect(await render("short")).toBeNull();
    expect((await render("a".repeat(60))).textContent).toContain("60/64");
    const atMax = await render("a".repeat(64));
    expect(atMax.textContent).toContain("64/64");
    expect(atMax.textContent).toContain("Maximum length reached");
  });
  it("F-082 the counter strings exist in cs and de", async () => {
    for (const lng of ["cs", "de"]) {
      await i18n.changeLanguage(lng);
      expect(i18n.t("name.atMax", { ns: "clinics" })).not.toBe("name.atMax");
    }
  });
});
