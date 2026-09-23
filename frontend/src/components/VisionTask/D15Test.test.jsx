// @vitest-environment jsdom
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key) => key }),
  Trans: ({ children }) => <>{children}</>,
}));

const { loadAndComputeD15Colors } = vi.hoisted(() => ({
  loadAndComputeD15Colors: vi.fn(),
}));
vi.mock("../../utils/munsellUtils", () => ({ loadAndComputeD15Colors }));

const { default: D15Test } = await import("./D15Test");
const { ConfirmDialogContext } = await import("../ConfirmDialog/ConfirmDialogContext");

// 5 colors -> 1 reference cap (slot 0, pre-filled) + 4 caps to sort.
const TEST_COLORS = ["#111111", "#222222", "#333333", "#444444", "#555555"];

function renderD15({ onNextTask = vi.fn(), task = { params: {} } } = {}) {
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
          <ConfirmDialogContext.Provider value={{ confirm: vi.fn().mockResolvedValue(true) }}>
            <D15Test task={task} onNextTask={onNextTask} audioPlayer={null} onStopAudio={vi.fn()} />
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

function filledTraySlots(container) {
  return container.querySelectorAll(".d15-tray-slot:not(.option-slot) .d15-cap");
}

describe("D15Test (vision task) — reload/resume behavior", () => {
  beforeEach(() => {
    // jsdom doesn't implement scrollTo/scrollIntoView; D15Test's
    // auto-scroll-to-first-empty-slot effect calls container.scrollTo.
    Element.prototype.scrollTo = vi.fn();
    loadAndComputeD15Colors.mockReset().mockResolvedValue([...TEST_COLORS]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts with only the reference cap placed (slot 0) and every other slot empty", async () => {
    const t = renderD15();
    await t.mount();

    const slots = t.container.querySelectorAll(".d15-tray-slot:not(.option-slot)");
    expect(slots.length).toBe(TEST_COLORS.length);
    expect(slots[0].querySelector(".d15-cap")).toBeTruthy();
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i].querySelector(".d15-cap")).toBeFalsy();
    }

    t.unmount();
  });

  it("loses every placed cap and the full interaction event log on a simulated reload", async () => {
    const onNextTask = vi.fn();
    const t = renderD15({ onNextTask });
    await t.mount();

    // Place one cap from the options tray into the tray.
    const firstSelectable = t.container.querySelector(".selectable-cap");
    expect(firstSelectable).toBeTruthy();
    await act(async () => firstSelectable.click());

    expect(filledTraySlots(t.container).length).toBe(2); // reference cap + the one just placed
    expect(onNextTask).not.toHaveBeenCalled(); // in-progress placement never reports to the parent

    // Simulate a reload: the task hasn't completed (onNextTask never fired),
    // so taskIndex hasn't advanced — on the next load, VisionTaskWrapper
    // mounts a brand-new D15Test via key={taskIndex}, with no code path that
    // reads back `tray`/`events` from anywhere.
    t.unmount();
    const t2 = renderD15({ onNextTask });
    await t2.mount();

    expect(filledTraySlots(t2.container).length).toBe(1); // back to just the reference cap
    t2.unmount();
  });

  it("never persists tray/event progress to localStorage or sessionStorage while sorting", async () => {
    const lsSetSpy = vi.spyOn(Storage.prototype, "setItem");

    const t = renderD15();
    await t.mount();
    const firstSelectable = t.container.querySelector(".selectable-cap");
    await act(async () => firstSelectable.click());

    expect(lsSetSpy).not.toHaveBeenCalled();

    lsSetSpy.mockRestore();
    t.unmount();
  });

  it("only reports to the parent once, via Next/timeout, with the complete tray+events — never incrementally per placement", async () => {
    const onNextTask = vi.fn();
    const t = renderD15({ onNextTask });
    await t.mount();

    const selectableCaps = () => t.container.querySelectorAll(".selectable-cap");

    // Place all 4 remaining caps one at a time.
    for (let i = 0; i < TEST_COLORS.length - 1; i++) {
      const cap = selectableCaps()[0];
      await act(async () => cap.click());
      expect(onNextTask).not.toHaveBeenCalled();
    }

    expect(t.container.querySelectorAll(".selectable-cap").length).toBe(0);
    expect(filledTraySlots(t.container).length).toBe(TEST_COLORS.length);

    // Next is briefly disabled by a 500ms cooldown the instant the tray
    // fills, to guard against the last placement tap also landing on Next.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 550));
    });

    const nextBtn = t.container.querySelector(".btn-next");
    expect(nextBtn.disabled).toBe(false);
    await act(async () => nextBtn.click());

    expect(onNextTask).toHaveBeenCalledTimes(1);
    const payload = onNextTask.mock.calls[0][0];
    expect(payload.completionStatus).toBe("completed");
    expect(payload.events.filter((e) => e.action === "place")).toHaveLength(4);

    t.unmount();
  });
});
