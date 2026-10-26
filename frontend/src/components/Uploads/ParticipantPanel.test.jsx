// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import i18n from "../../i18n";
import ParticipantPanel from "./ParticipantPanel";
import StatusPill from "./StatusPill";
import FlagTags from "./FlagTags";

vi.mock("../../api/uploads", () => ({
  revealParticipant: vi.fn(),
  updateParticipant: vi.fn(),
}));
import { revealParticipant, updateParticipant } from "../../api/uploads";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const participant = {
  patient_code: "P-001",
  visit_number: "2",
  fields: { patient_code: "P-001", visit_number: "2", sex: null, year_of_birth: null },
  maskedKeys: ["sex", "year_of_birth"],
  editedAt: null,
};

let host, root;
const render = (ui) => act(() => root.render(ui));
const click = (el) => act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
const button = (text) => [...host.querySelectorAll("button")].find((b) => b.textContent.includes(text));

beforeEach(async () => {
  await i18n.changeLanguage("en");
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  vi.clearAllMocks();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("ParticipantPanel", () => {
  it("shows patient code and visit but masks everything else", () => {
    render(<ParticipantPanel sessionId="s1" participant={participant} canEdit onUpdated={() => {}} />);
    expect(host.textContent).toContain("P-001");
    expect(host.querySelector('[data-testid="masked-sex"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="masked-year_of_birth"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="masked-patient_code"]')).toBeNull();
    expect(revealParticipant).not.toHaveBeenCalled();
  });

  it("reveals only after the explicit Show values action", async () => {
    revealParticipant.mockResolvedValue({ fields: { ...participant.fields, sex: "female", year_of_birth: "1980" } });
    render(<ParticipantPanel sessionId="s1" participant={participant} canEdit onUpdated={() => {}} />);
    await click(button("Show values"));
    expect(revealParticipant).toHaveBeenCalledWith("s1");
    expect(host.textContent).toContain("female");
    expect(host.textContent).toContain("1980");
  });

  it("has no editing controls without edit rights", () => {
    render(<ParticipantPanel sessionId="s1" participant={participant} canEdit={false} onUpdated={() => {}} />);
    expect(button("Show values")).toBeUndefined();
    expect(button("Edit")).toBeUndefined();
    expect(host.querySelector('[data-testid="masked-sex"]')).not.toBeNull();
  });

  it("will not blank the patient code and shows server errors", async () => {
    revealParticipant.mockResolvedValue({ fields: { ...participant.fields, sex: "female", year_of_birth: "1980" } });
    render(<ParticipantPanel sessionId="s1" participant={participant} canEdit onUpdated={() => {}} />);
    await click(button("Edit"));
    const input = host.querySelector('input[aria-label="patient code"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    await act(async () => { setter.call(input, "  "); input.dispatchEvent(new Event("input", { bubbles: true })); });
    await click(button("Save"));
    expect(updateParticipant).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]').textContent).toContain("cannot be empty");

    // a server-side refusal is shown too
    await act(async () => { setter.call(input, "P-002"); input.dispatchEvent(new Event("input", { bubbles: true })); });
    updateParticipant.mockRejectedValue(Object.assign(new Error("invalid_value"), { status: 400 }));
    await click(button("Save"));
    expect(updateParticipant).toHaveBeenCalledWith("s1", { patient_code: "P-002" });
    expect(host.querySelector('[role="alert"]').textContent).toContain("invalid");
  });
});

describe("pills", () => {
  it("renders translated status and flags", async () => {
    render(<><StatusPill status="invalid" invalidReason="checksum" /><FlagTags issues={["late", "nonstdMic"]} /></>);
    expect(host.textContent).toContain("Invalid");
    expect(host.querySelector(".ui-status").title).toBe("ZIP checksum mismatch");
    expect(host.querySelector(".ui-dot-bad")).not.toBeNull();
    expect(host.textContent).toContain("Late upload");
    expect(host.querySelectorAll(".ui-badge-bad")).toHaveLength(1);
    await act(() => i18n.changeLanguage("de"));
    expect(host.textContent).toContain("Ungültig");
    await act(() => i18n.changeLanguage("en"));
  });

  it("folds flags beyond max into a +n badge", () => {
    render(<FlagTags issues={["late", "nonstdMic", "recovered", "skipped"]} max={2} />);
    expect(host.textContent).toContain("Late upload");
    expect(host.textContent).not.toContain("Recovered");
    expect(host.textContent).toContain("+2");
  });
});
