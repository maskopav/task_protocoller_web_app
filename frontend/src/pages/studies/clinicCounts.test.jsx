// @vitest-environment jsdom
// F-097: "Shared with N clinics" counts every clinic; an editor also sees how many of them they can see.
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import i18n from "../../i18n";
import StudyPage from "./StudyPage";
import StudiesPage from "./StudiesPage";
import { ConfirmDialogProvider, ToastProvider } from "../../components/ui";

vi.mock("../../api/projects", () => ({ fetchProject: vi.fn(), fetchProjectsList: vi.fn(), archiveProject: vi.fn() }));
vi.mock("../../api/protocols", () => ({ getProtocolsByProjectId: vi.fn(async () => []) }));
vi.mock("../../api/sites", () => ({ fetchSites: vi.fn(async () => []) }));
vi.mock("../../api/uploads", () => ({ fetchUploadSummary: vi.fn(async () => ({})) }));
vi.mock("./tabs/ProtocolsTab", () => ({ default: () => null }));
vi.mock("./tabs/ClinicsTab", () => ({ default: () => null }));
vi.mock("./tabs/RecordingsTab", () => ({ default: () => null }));
vi.mock("./tabs/EditorsTab", () => ({ default: () => null }));
vi.mock("./tabs/SettingsTab", () => ({ default: () => null }));
vi.mock("./NewStudyModal", () => ({ default: () => null }));
vi.mock("../../context/UserContext", () => ({ useUser: () => ({ user: { role_id: 2, can_create_projects: 0 } }) }));
import { fetchProject, fetchProjectsList } from "../../api/projects";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let host, root;
const render = async (ui) => { await act(async () => { root.render(ui); }); await act(async () => {}); };
beforeEach(async () => {
  await i18n.changeLanguage("en");
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  vi.clearAllMocks();
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

const study = (over = {}) => ({
  project_id: 7, project_name: "Voice", project_is_active: 1, can_edit: true, protocol_count: 1, unreviewed: 0,
  site_count: 3, visible_site_count: 1, ...over,
});
const page = (route = "/studies/7/protocols") => render(
  <ToastProvider><ConfirmDialogProvider>
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/studies/:projectId/:tab" element={<StudyPage />} />
        <Route path="/studies" element={<StudiesPage />} />
      </Routes>
    </MemoryRouter>
  </ConfirmDialogProvider></ToastProvider>,
);
const clinicsTab = () => host.querySelector('[data-testid="study-tab-clinics"]').textContent;
const badges = () => host.querySelector('[data-testid="study-page"]').textContent;

describe("StudyPage clinic counts", () => {
  it("shows total and visible when the caller sees fewer", async () => {
    fetchProject.mockResolvedValue(study());
    await page();
    expect(badges()).toContain("Shared with 3 clinics, 1 visible to you");
    expect(clinicsTab()).toContain("3 (1 visible)");
  });
  it("keeps the old text when everything is visible", async () => {
    fetchProject.mockResolvedValue(study({ visible_site_count: 3 }));
    await page();
    expect(badges()).toContain("Shared with 3 clinics");
    expect(badges()).not.toContain("visible to you");
    expect(clinicsTab()).not.toContain("visible");
  });
  it("falls back to the old text without visible_site_count", async () => {
    fetchProject.mockResolvedValue(study({ visible_site_count: undefined }));
    await page();
    expect(badges()).toContain("Shared with 3 clinics");
    expect(badges()).not.toContain("visible to you");
  });
});

describe("StudiesPage clinic column", () => {
  const cell = () => host.querySelector('[data-testid="studies-group-yours-table"]').textContent;
  it("shows the compact form when some clinics are hidden", async () => {
    fetchProjectsList.mockResolvedValue([study()]);
    await page("/studies");
    expect(cell()).toContain("3 clinics (1 visible)");
  });
  it("shows the plain count otherwise", async () => {
    fetchProjectsList.mockResolvedValue([study({ visible_site_count: 3 })]);
    await page("/studies");
    expect(cell()).toContain("3 clinics");
    expect(cell()).not.toContain("visible");
  });
});
