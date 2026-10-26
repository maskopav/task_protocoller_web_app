// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import i18n from "../../i18n";
import SessionPanel from "./SessionPanel";
import DeviceEvents from "./DeviceEvents";
import ActivitySection from "./ActivitySection";
import { answerRows } from "./recordingFormat";
import ClipPlayer from "../Uploads/ClipPlayer";
import TaskTable from "../Uploads/TaskTable";
import RecordingPage from "../../pages/RecordingPage";

vi.mock("../../api/uploads", () => ({
  fetchSession: vi.fn(),
  fetchAttempts: vi.fn(),
  fetchActivity: vi.fn(),
  downloadSessionZip: vi.fn(),
  getDownloadTicket: vi.fn(),
  clipUrl: (sid, file, ticket) => `/clip/${sid}/${file}?ticket=${ticket}`,
  revealParticipant: vi.fn(),
  updateParticipant: vi.fn(),
  setReview: vi.fn(),
  postComment: vi.fn(),
  fetchDevices: vi.fn(),
  assignDeviceSite: vi.fn(),
  renameDevice: vi.fn(),
}));
vi.mock("../../api/sites", () => ({ fetchSites: vi.fn().mockResolvedValue([{ id: 1, name: "Prague" }]) }));
let mockUser = { role_id: 1 };
vi.mock("../../context/UserContext", () => ({ useUser: () => ({ user: mockUser }) }));
import { fetchSession, fetchAttempts, fetchActivity, getDownloadTicket } from "../../api/uploads";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let host, root;
const render = (ui) => act(() => root.render(ui));
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

beforeEach(async () => {
  await i18n.changeLanguage("en");
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  vi.clearAllMocks();
  fetchAttempts.mockResolvedValue([]);
  fetchActivity.mockResolvedValue([]);
  getDownloadTicket.mockResolvedValue("tk");
  mockUser = { role_id: 1 };
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const router = (ui) => <MemoryRouter>{ui}</MemoryRouter>;

const baseSession = (over = {}) => ({
  id: "a".repeat(32), siteId: 3, site: "Prague", deviceId: "dev-uuid-0001-0002", deviceLabel: "Exam room 2",
  appVersion: "1.4.0", protocol: "Speech battery", project: "Voice study", status: "valid", invalidReason: null, qc: "unreviewed",
  issues: [], checks: [], tasks: [], timeline: [], hasAudio: false, canEdit: true, prevId: null, nextId: null,
  startedAt: "2026-10-13T07:54:51.000Z", endedAt: "2026-10-13T08:10:00.000Z", receivedAt: "2026-10-13T08:30:00.000Z",
  durationS: 900, bytes: 5_000_000, tasksTotal: 1, tasksDone: 1, comments: [], zipSha256: "f".repeat(64), configVersion: "2026-10-05.080231",
  participant: { patient_code: "PD-0142", visit_number: "2", fields: { patient_code: "PD-0142", visit_number: "2" }, maskedKeys: [] },
  hardware: {}, questionTexts: {},
  ...over,
});

describe("F-035: missing values are hidden", () => {
  it("prints no undefined, null or NaN and no empty input gain", () => {
    const s = baseSession({
      appVersion: undefined,
      deviceLabel: null,
      captureFormat: { sampleRate: 48000 },
      hardware: {
        micUses: [{ deviceName: "USB mic", inputGainPercent: undefined }],
        cameraUses: [{ deviceName: undefined, captureFormat: { width: 1280 } }],
      },
    });
    render(router(<SessionPanel s={s} />));
    const text = host.textContent;
    expect(text).not.toMatch(/undefined|null|NaN/);
    expect(text).not.toMatch(/input gain/i);
    expect(text).toContain("USB mic");
    expect(text).toContain("48 kHz");
    expect(text).not.toContain("App version");
  });

  it("shows the gain when the app reported it", () => {
    render(router(<SessionPanel s={baseSession({ hardware: { micUses: [{ deviceName: "USB mic", inputGainPercent: 80 }] } })} />));
    expect(host.textContent).toContain("input gain 80 %");
  });
});

describe("F-036: camera events", () => {
  const raw = "frame= 2539 fps= 30 q=-1.0 size=N/A\n[q] command received. Exiting.";

  it("shows a readable sentence and keeps the raw text only under Details", () => {
    render(<DeviceEvents kind="camera" events={[{ device: "camera", event: "interrupted", detail: `CaptureInterrupted(${raw})` }]} />);
    const ev = host.querySelector('[data-testid="device-event-camera"]');
    expect(ev.textContent).toContain("The camera stopped sending images during the recording.");
    const details = ev.querySelector("details");
    expect(details.hasAttribute("open")).toBe(false);
    expect(details.querySelector("summary").textContent).toBe("Details");
    expect(details.querySelector("pre").textContent).toContain("[q] command received");
    // Outside <details> the raw text is absent.
    const outside = [...ev.childNodes].filter((n) => n !== details).map((n) => n.textContent).join("");
    expect(outside).not.toContain("frame=");
  });

  it("shows no Details when the app sent no text", () => {
    render(<DeviceEvents kind="microphone" events={[{ device: "microphone", event: "capture_failed" }]} />);
    expect(host.textContent).toContain("The microphone could not record.");
    expect(host.querySelector("details")).toBeNull();
  });
});

describe("F-037: a clip the browser cannot play", () => {
  it("shows the download sentence instead of a broken player", async () => {
    const tickets = { getTicket: vi.fn().mockResolvedValue("tk"), refresh: vi.fn().mockResolvedValue("tk2") };
    render(<ClipPlayer sessionId="s1" file="clips/a_0.mp4" kind="video" tickets={tickets} />);
    await act(async () => { host.querySelector("button").click(); });
    const video = host.querySelector("video");
    expect(video).not.toBeNull();
    // First error: one retry with a fresh ticket. Second error: give up.
    await act(async () => { video.dispatchEvent(new Event("error")); });
    await act(async () => { host.querySelector("video").dispatchEvent(new Event("error")); });
    expect(host.querySelector("video")).toBeNull();
    const msg = host.querySelector('[data-testid="clip-cant-play"]');
    expect(msg.textContent).toContain("This clip can't play in the browser. Download to play.");
    expect(msg.querySelector("a[download]").getAttribute("href")).toContain("/clip/s1/");
  });
});

describe("F-040: questionnaire answers", () => {
  const texts = {
    p1_t5_q1: "Do you smoke?", p1_t5_q2: "Voice problems?", p1_t5_q2_o2: "Sometimes",
  };
  const answers = { p1_t5_q1: "No", p1_t5_q2: ["p1_t5_q2_o2"], p1_t5_q3: ["p1_t5_q3_o1"] };

  it("maps keys to question and answer text and falls back to the key only when text is missing", () => {
    expect(answerRows(answers, texts)).toEqual([
      { key: "p1_t5_q1", question: "Do you smoke?", answer: "No", resolved: true },
      { key: "p1_t5_q2", question: "Voice problems?", answer: "Sometimes", resolved: true },
      { key: "p1_t5_q3", question: "p1_t5_q3", answer: "p1_t5_q3_o1", resolved: false },
    ]);
  });

  it("opens the answers with the texts from the snapshot", async () => {
    const tasks = [{ taskIndex: 0, repetition: 1, type: "QUESTIONNAIRE", result: "Done", takes: 0, questionnaireAnswers: answers }];
    render(<TaskTable sessionId="s1" tasks={tasks} timeline={[]} tickets={{}} canPlay questionTexts={texts} />);
    const open = [...host.querySelectorAll("button")].find((b) => b.textContent.includes("Show answers (3)"));
    await act(async () => { open.click(); });
    const list = document.body.querySelector('[data-testid="answers-list"]');
    expect(list.textContent).toContain("Do you smoke?");
    expect(list.textContent).toContain("Sometimes");
    expect(list.textContent).not.toContain("p1_t5_q1");
    expect(list.textContent).toContain("p1_t5_q3_o1"); // text missing: key shown
  });
});

describe("F-043: quarantined header", () => {
  const renderPage = () => render(
    <MemoryRouter initialEntries={["/recordings/" + "a".repeat(32)]}>
      <Routes><Route path="/recordings/:sessionId" element={<RecordingPage />} /></Routes>
    </MemoryRouter>,
  );

  it("master: amber strip, Assign computer is the one primary action, Download is under the menu", async () => {
    fetchSession.mockResolvedValue(baseSession({ siteId: null, site: null }));
    renderPage();
    await flush();
    const strip = host.querySelector('[data-testid="recording-quarantine"]');
    expect(strip.textContent).toContain("Quarantined: this computer isn't assigned to a clinic");
    const primaries = [...host.querySelectorAll(".ui-btn-primary")];
    expect(primaries).toHaveLength(1);
    expect(primaries[0].textContent).toContain("Assign computer…");
    expect([...host.querySelectorAll("button")].some((b) => b.textContent.includes("Download ZIP"))).toBe(false);
    await act(async () => { host.querySelector('button[aria-label="More actions"]').click(); });
    expect([...host.querySelectorAll('[role="menuitem"]')].some((b) => b.textContent.includes("Download ZIP"))).toBe(true);
  });

  it("a normal recording has Download ZIP as its one primary action and no quarantine strip", async () => {
    fetchSession.mockResolvedValue(baseSession());
    renderPage();
    await flush();
    expect(host.querySelector('[data-testid="recording-quarantine"]')).toBeNull();
    const primaries = [...host.querySelectorAll(".ui-btn-primary")];
    expect(primaries).toHaveLength(1);
    expect(primaries[0].textContent).toContain("Download ZIP");
  });

  it("a non-master gets no Assign button", async () => {
    mockUser = { role_id: 2 };
    fetchSession.mockResolvedValue(baseSession({ siteId: null, site: null }));
    renderPage();
    await flush();
    expect(host.querySelector('[data-testid="recording-assign"]')).toBeNull();
  });
});

describe("F-044: Activity section", () => {
  it("is collapsed, counts the entries and words each action", async () => {
    fetchActivity.mockResolvedValue([
      { id: 2, action: "participant_edit", at: "2026-10-13T09:00:00.000Z", user: { id: 1, name: "Eva Horakova" }, detail: { fields: ["sex"] } },
      { id: 1, action: "reveal", at: "2026-10-13T08:55:00.000Z", user: { id: 1, name: "Eva Horakova" }, detail: null },
    ]);
    render(<ActivitySection sessionId="s1" />);
    await flush();
    const details = host.querySelector('[data-testid="recording-activity"]');
    expect(details.hasAttribute("open")).toBe(false);
    expect(details.querySelector("summary").textContent).toContain("2 events");
    const entries = [...details.querySelectorAll('[data-testid="activity-entry"]')].map((e) => e.textContent);
    expect(entries[0]).toContain("Eva Horakova edited participant fields: sex");
    expect(entries[1]).toContain("Eva Horakova revealed participant fields");
  });

  it("reloads when the page reports a new entry", async () => {
    render(<ActivitySection sessionId="s1" refreshKey={0} />);
    await flush();
    render(<ActivitySection sessionId="s1" refreshKey={1} />);
    await flush();
    expect(fetchActivity).toHaveBeenCalledTimes(2);
  });
});

describe("recording namespace", () => {
  it("has the same keys in en, cs and de (plural suffixes aside)", async () => {
    const flat = (o, p = "") => Object.entries(o).flatMap(([k, v]) => (typeof v === "object" ? flat(v, `${p}${k}.`) : [`${p}${k}`]));
    const base = (k) => k.replace(/_(zero|one|two|few|many|other)$/, "");
    const keys = async (l) => new Set(flat((await import(`../../i18n/${l}/recording.json`)).default).map(base));
    const en = await keys("en");
    for (const l of ["cs", "de"]) expect(await keys(l)).toEqual(en);
  });
});
