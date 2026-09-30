// @vitest-environment jsdom
// End-to-end walk through the two back-to-back D-15 tasks as configured in the
// SWISS protocol: (1) saturated + demo trial, (2) desaturated, no trial.
// Uses the REAL ConfirmDialogProvider so the dialog chain is exercised too.
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key) => key, i18n: { language: "en" } }),
  Trans: ({ i18nKey, children }) => <>{children ?? i18nKey}</>,
}));

const { loadAndComputeD15Colors } = vi.hoisted(() => ({
  loadAndComputeD15Colors: vi.fn(),
}));
vi.mock("../../utils/munsellUtils", () => ({ loadAndComputeD15Colors }));

const { default: VisionTaskWrapper } = await import("./VisionTaskWrapper");
const { ConfirmDialogProvider } = await import("../ConfirmDialog/ConfirmDialogContext");

// 16 distinct colours, like the real saturated/desaturated sets.
const COLORS_16 = Array.from({ length: 16 }, (_, i) => `rgb(${i * 10}, 50, 50)`);

const SATURATED_TASK = { params: { version: "saturated", demoTrial: "yes" } };
const DESATURATED_TASK = { params: { version: "desaturated", demoTrial: "no" } };

function render(ui) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root;
  act(() => {
    root = createRoot(container);
    root.render(<ConfirmDialogProvider>{ui}</ConfirmDialogProvider>);
  });
  return {
    container,
    rerender(next) {
      act(() => root.render(<ConfirmDialogProvider>{next}</ConfirmDialogProvider>));
    },
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

const q = (c, sel) => c.querySelector(sel);

async function click(el) {
  await act(async () => { el.click(); });
}

// SafeButton debounces per instance for 500 ms; the dialog "OK" button is the
// same instance across consecutive dialogs, so wait past the debounce.
async function waitPastDebounce() {
  await act(async () => { await new Promise((r) => setTimeout(r, 550)); });
}

async function answerChecklist(c) {
  await click(q(c, 'input[name="brightness"][value="done"]'));
  await click(q(c, 'input[name="color_filters"][value="done"]'));
}

async function dismissDialog(c) {
  await vi.waitFor(() => expect(q(c, ".confirm-dialog .btn-confirm")).toBeTruthy());
  await click(q(c, ".confirm-dialog .btn-confirm"));
  await waitPastDebounce();
}

async function fillTrayAndSubmit(c) {
  await vi.waitFor(() => expect(q(c, ".selectable-cap")).toBeTruthy());
  let cap;
  while ((cap = q(c, ".selectable-cap"))) await click(cap);
  const next = q(c, ".d15-container .btn-next");
  // Next is held disabled for a 500 ms ghost-tap cooldown after the last cap.
  await vi.waitFor(() => expect(next.disabled).toBe(false), { timeout: 2000 });
  await click(next);
}

describe("D-15 two-task flow (saturated+demo → desaturated)", () => {
  beforeEach(() => {
    Element.prototype.scrollTo = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
    window.scrollTo = vi.fn();
    loadAndComputeD15Colors.mockReset().mockResolvedValue([...COLORS_16]);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("happy path: checklist → 2 dialogs → demo trial → trial-complete → saturated test → version-complete → desaturated test", async () => {
    const onNext1 = vi.fn();
    const onLog = vi.fn();
    const t = render(
      <VisionTaskWrapper key={16} task={SATURATED_TASK} onNextTask={onNext1} onLogEvent={onLog}
        audioGuideEnabled={false} isFirstVisionTask hasMoreVisionTasks />
    );

    // 1. Checklist
    expect(q(t.container, ".pretest-container")).toBeTruthy();
    await answerChecklist(t.container);
    const checklistNext = q(t.container, ".pretest-container .btn-next");
    expect(checklistNext.disabled).toBe(false);
    await click(checklistNext);

    // 2. "Add colour" + "Modify colour" dialogs
    await dismissDialog(t.container);
    await dismissDialog(t.container);

    // 3. Demo trial — 5 caps, loadAndCompute is NOT used for the demo
    await vi.waitFor(() => expect(q(t.container, ".d15-container")).toBeTruthy());
    expect(t.container.querySelectorAll(".d15-tray-slot:not(.option-slot)").length).toBe(5);
    await fillTrayAndSubmit(t.container);

    // 4. "Trial completed" dialog → real saturated test
    await dismissDialog(t.container);
    await vi.waitFor(() =>
      expect(t.container.querySelectorAll(".d15-tray-slot:not(.option-slot)").length).toBe(16)
    );
    expect(loadAndComputeD15Colors).toHaveBeenCalledWith(expect.any(String), 5, 4);
    await fillTrayAndSubmit(t.container);

    // 5. "Version complete" dialog → onNextTask
    await dismissDialog(t.container);
    await vi.waitFor(() => expect(onNext1).toHaveBeenCalledTimes(1));
    const saved1 = onNext1.mock.calls[0][0];
    expect(saved1.version).toBe("saturated");
    expect(saved1.environmentSettings).toEqual({ brightness: "done", color_filters: "done" });
    expect(saved1.resultIndices).toHaveLength(16);
    expect(saved1.resultIndices).not.toContain(-1);
    // Demo trial is saved alongside the real result
    expect(saved1.trial.completionStatus).toBe("completed");
    expect(saved1.trial.resultIndices).toHaveLength(5);
    expect(saved1.trial.events.filter((e) => e.action === "place")).toHaveLength(4);

    // Every screen transition is logged, in order
    const steps = onLog.mock.calls.filter(([a]) => a === "vision_step").map(([, d]) => d.step);
    expect(steps).toEqual(["instructions", "mechanics", "trial", "test"]);
    const actions = onLog.mock.calls.map(([a]) => a);
    expect(actions).toEqual(expect.arrayContaining([
      "vision_dialog_dismissed", "vision_trial_completed", "vision_test_completed",
    ]));
    expect(onLog.mock.calls[0][1]).toEqual(expect.objectContaining({
      version: "saturated", viewport: expect.any(String),
    }));

    // 6. Second vision task (key changes → fresh wrapper), skips checklist + trial
    const onNext2 = vi.fn();
    t.rerender(
      <VisionTaskWrapper key={17} task={DESATURATED_TASK} onNextTask={onNext2}
        audioGuideEnabled={false} isFirstVisionTask={false} hasMoreVisionTasks={false} />
    );
    expect(q(t.container, ".pretest-container")).toBeFalsy();
    await vi.waitFor(() =>
      expect(t.container.querySelectorAll(".d15-tray-slot:not(.option-slot)").length).toBe(16)
    );
    expect(loadAndComputeD15Colors).toHaveBeenLastCalledWith(expect.any(String), 8, 2);
    await fillTrayAndSubmit(t.container);
    await vi.waitFor(() => expect(onNext2).toHaveBeenCalledTimes(1));
    expect(onNext2.mock.calls[0][0].version).toBe("desaturated");
    expect(onNext2.mock.calls[0][0].trial).toBeNull(); // no trial on the 2nd task
    expect(q(t.container, ".confirm-dialog")).toBeFalsy(); // no "version complete" on the last one

    t.unmount();
  }, 20000);

  it("checklist: tapping the grey Next without answering shows the hint and logs it (reported bug)", async () => {
    const onLog = vi.fn();
    const t = render(
      <VisionTaskWrapper task={SATURATED_TASK} onNextTask={vi.fn()} onLogEvent={onLog}
        audioGuideEnabled={false} isFirstVisionTask hasMoreVisionTasks />
    );
    const next = q(t.container, ".pretest-container .btn-next");
    expect(next.classList.contains("is-disabled")).toBe(true);
    await click(next);
    expect(q(t.container, ".checklist-hint")).toBeTruthy();
    expect(onLog).toHaveBeenCalledWith("vision_checklist_next_blocked", expect.objectContaining({ answers: {} }));
    t.unmount();
  });

  it("test: tapping Next before the top row is full shows a hint and logs it", async () => {
    const onLog = vi.fn();
    const onNext = vi.fn();
    const t = render(
      <VisionTaskWrapper task={DESATURATED_TASK} onNextTask={onNext} onLogEvent={onLog}
        audioGuideEnabled={false} isFirstVisionTask={false} hasMoreVisionTasks={false} />
    );
    await vi.waitFor(() => expect(q(t.container, ".selectable-cap")).toBeTruthy());
    await click(q(t.container, ".selectable-cap"));
    const next = q(t.container, ".d15-container .btn-next");
    expect(next.classList.contains("is-disabled")).toBe(true);
    await click(next);
    expect(onNext).not.toHaveBeenCalled();
    expect(q(t.container, ".d15-hint")).toBeTruthy();
    expect(onLog).toHaveBeenCalledWith("d15_next_blocked",
      expect.objectContaining({ filledSlots: 2, totalSlots: 16 }));
    t.unmount();
  });

  it("checklist: answering only one of the two items keeps Next blocked", async () => {
    const t = render(
      <VisionTaskWrapper task={SATURATED_TASK} onNextTask={vi.fn()}
        audioGuideEnabled={false} isFirstVisionTask hasMoreVisionTasks />
    );
    await click(q(t.container, 'input[name="brightness"][value="done"]'));
    await click(q(t.container, ".pretest-container .btn-next"));
    expect(q(t.container, ".pretest-container")).toBeTruthy();
    expect(q(t.container, ".confirm-dialog")).toBeFalsy();
    t.unmount();
  });

  it("test: Next must not be pressable while colours are still loading", async () => {
    let resolveColors;
    loadAndComputeD15Colors.mockReturnValue(new Promise((r) => { resolveColors = r; }));
    const onNext = vi.fn();
    const t = render(
      <VisionTaskWrapper task={DESATURATED_TASK} onNextTask={onNext}
        audioGuideEnabled={false} isFirstVisionTask={false} hasMoreVisionTasks={false} />
    );
    await vi.waitFor(() => expect(q(t.container, ".d15-container .btn-next")).toBeTruthy());
    const next = q(t.container, ".d15-container .btn-next");
    await waitPastDebounce();
    await click(next);
    expect(onNext).not.toHaveBeenCalled();
    await act(async () => resolveColors([...COLORS_16]));
    t.unmount();
  });

  it("test: a failed colour load shows an error + retry, logs it, and Next submits an explicit load_failed", async () => {
    loadAndComputeD15Colors.mockResolvedValue([]); // what munsellUtils returns on fetch/parse error
    const onNext = vi.fn();
    const onLog = vi.fn();
    const t = render(
      <VisionTaskWrapper task={DESATURATED_TASK} onNextTask={onNext} onLogEvent={onLog}
        audioGuideEnabled={false} isFirstVisionTask={false} hasMoreVisionTasks={false} />
    );
    await vi.waitFor(() => expect(q(t.container, ".d15-load-error")).toBeTruthy());
    expect(onLog).toHaveBeenCalledWith("d15_colors_load_failed", expect.objectContaining({ attempt: 1 }));

    // Retry succeeds → board appears
    loadAndComputeD15Colors.mockResolvedValue([...COLORS_16]);
    await click(q(t.container, ".d15-load-error .btn-secondary"));
    await vi.waitFor(() =>
      expect(t.container.querySelectorAll(".d15-tray-slot:not(.option-slot)").length).toBe(16)
    );
    t.unmount();
  });

  it("test: if colours still fail, Next moves on with completionStatus load_failed (never a fake 'completed')", async () => {
    loadAndComputeD15Colors.mockResolvedValue([]);
    const onNext = vi.fn();
    const t = render(
      <VisionTaskWrapper task={DESATURATED_TASK} onNextTask={onNext}
        audioGuideEnabled={false} isFirstVisionTask={false} hasMoreVisionTasks={false} />
    );
    await vi.waitFor(() => expect(q(t.container, ".d15-load-error")).toBeTruthy());
    await waitPastDebounce();
    await click(q(t.container, ".d15-container .btn-next"));
    await vi.waitFor(() => expect(onNext).toHaveBeenCalledTimes(1));
    expect(onNext.mock.calls[0][0]).toEqual(expect.objectContaining({
      completionStatus: "load_failed", resultIndices: [],
    }));
    t.unmount();
  });
});
