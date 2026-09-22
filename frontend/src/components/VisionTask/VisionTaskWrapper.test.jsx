// @vitest-environment jsdom
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key) => key, i18n: { language: "en" } }),
  Trans: ({ children }) => <>{children}</>,
}));

const { loadAndComputeD15Colors } = vi.hoisted(() => ({
  loadAndComputeD15Colors: vi.fn(),
}));
vi.mock("../../utils/munsellUtils", () => ({ loadAndComputeD15Colors }));

const { default: VisionTaskWrapper } = await import("./VisionTaskWrapper");
const { ConfirmDialogContext } = await import("../ConfirmDialog/ConfirmDialogContext");

const TEST_COLORS = ["#111111", "#222222", "#333333", "#444444", "#555555"];

// Confirm dialogs (PreTestInstructions -> "Add colour" / "Modify colour")
// are resolved instantly, exactly like a participant clicking through them.
const confirm = vi.fn().mockResolvedValue(true);

function renderWrapper({ onNextTask = vi.fn(), task = { params: {} } } = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root;
  return {
    container,
    onNextTask,
    async mount() {
      await act(async () => {
        root = createRoot(container);
        root.render(
          <ConfirmDialogContext.Provider value={{ confirm }}>
            <VisionTaskWrapper task={task} onNextTask={onNextTask} audioGuideEnabled={false} />
          </ConfirmDialogContext.Provider>
        );
      });
    },
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

// Answers both PreTestInstructions checklist items ("done") and clicks
// through to the real D-15 test screen (no demo trial by default).
async function completeChecklistAndReachTestStep(t) {
  const brightnessDone = t.container.querySelector('input[name="brightness"][value="done"]');
  const filtersDone = t.container.querySelector('input[name="color_filters"][value="done"]');
  expect(brightnessDone).toBeTruthy();
  expect(filtersDone).toBeTruthy();

  act(() => brightnessDone.click());
  act(() => filtersDone.click());

  const nextBtn = t.container.querySelector(".pretest-container .btn-next");
  expect(nextBtn.disabled).toBe(false);

  await act(async () => nextBtn.click());
  await vi.waitFor(() => {
    expect(t.container.querySelector(".d15-tray-slot")).toBeTruthy();
  });
}

describe("VisionTaskWrapper (D-15 vision task) — reload/resume behavior", () => {
  beforeEach(() => {
    Element.prototype.scrollTo = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
    window.scrollTo = vi.fn();
    confirm.mockClear().mockResolvedValue(true);
    loadAndComputeD15Colors.mockReset().mockResolvedValue([...TEST_COLORS]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts on the pre-test checklist, not the sorting test", async () => {
    const t = renderWrapper();
    await t.mount();

    expect(t.container.querySelector(".pretest-container")).toBeTruthy();
    expect(t.container.querySelector(".d15-tray-slot")).toBeFalsy();

    t.unmount();
  });

  it("a reload mid-sort sends the participant back through the checklist and both confirmation dialogs, losing the in-progress arrangement", async () => {
    const onNextTask = vi.fn();
    const t = renderWrapper({ onNextTask });
    await t.mount();
    await completeChecklistAndReachTestStep(t);

    expect(confirm).toHaveBeenCalledTimes(2); // "Add colour" + "Modify colour"

    // Place one cap — the participant is partway through sorting.
    const firstSelectable = t.container.querySelector(".selectable-cap");
    expect(firstSelectable).toBeTruthy();
    await act(async () => firstSelectable.click());
    expect(onNextTask).not.toHaveBeenCalled();

    // Simulate a reload: onNextTask never fired, so taskIndex never
    // advanced. On the next load, ParticipantInterfacePage mounts a brand
    // new VisionTaskWrapper via key={taskIndex} — `step` and
    // `environmentData` are plain useState, not persisted anywhere.
    t.unmount();
    const t2 = renderWrapper({ onNextTask });
    await t2.mount();

    expect(t2.container.querySelector(".pretest-container")).toBeTruthy();
    expect(t2.container.querySelector(".d15-tray-slot")).toBeFalsy();

    // Re-answering the checklist and going through Start replays both
    // confirm dialogs again from a clean slate.
    confirm.mockClear();
    await completeChecklistAndReachTestStep(t2);
    expect(confirm).toHaveBeenCalledTimes(2);

    const slots = t2.container.querySelectorAll(".d15-tray-slot:not(.option-slot) .d15-cap");
    expect(slots.length).toBe(1); // only the reference cap — the earlier placement is gone

    t2.unmount();
  });

  it("never persists checklist answers or test-step progress to localStorage/sessionStorage", async () => {
    const lsSetSpy = vi.spyOn(Storage.prototype, "setItem");

    const t = renderWrapper();
    await t.mount();
    await completeChecklistAndReachTestStep(t);

    expect(lsSetSpy).not.toHaveBeenCalled();

    lsSetSpy.mockRestore();
    t.unmount();
  });
});
