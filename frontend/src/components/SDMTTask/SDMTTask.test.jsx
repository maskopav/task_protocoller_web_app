// @vitest-environment jsdom
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key) => key, i18n: { language: "en" } }),
  Trans: ({ children }) => <>{children}</>,
}));

const { default: SDMTTask } = await import("./SDMTTask");
const { ConfirmDialogContext } = await import("../ConfirmDialog/ConfirmDialogContext");

const confirm = vi.fn().mockResolvedValue(true);

function renderTask(props = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root;
  return {
    container,
    async mount() {
      await act(async () => {
        root = createRoot(container);
        root.render(
          <ConfirmDialogContext.Provider value={{ confirm }}>
            <SDMTTask taskParams={{ duration: 90 }} onComplete={vi.fn()} audioGuideEnabled={false} {...props} />
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

// jsdom has no AudioContext; SDMTTask constructs one on Start to unlock
// audio playback on iOS/Safari.
class FakeAudioContext {
  constructor() {
    this.state = "running";
  }
  resume() {}
}

describe("SDMTTask — reload/resume behavior", () => {
  beforeEach(() => {
    window.AudioContext = FakeAudioContext;
    confirm.mockClear().mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the one-time demo dialog and the instructions/Start screen on mount", async () => {
    const t = await (async () => {
      const r = renderTask();
      await r.mount();
      return r;
    })();

    expect(confirm).toHaveBeenCalledTimes(1); // the demo dialog
    expect(t.container.querySelector(".btn-start")).toBeTruthy();

    t.unmount();
  });

  it("a reload during an active run drops the participant back to the instructions screen and re-shows the demo dialog", async () => {
    const t1 = renderTask();
    await t1.mount();
    expect(confirm).toHaveBeenCalledTimes(1);

    act(() => t1.container.querySelector(".btn-start").click());
    // Now mid-run: the timer is ticking and taps would be getting recorded,
    // none of which is persisted anywhere (see useSDMTLogic.test.jsx).
    expect(t1.container.querySelector(".sdmt-timer")).toBeTruthy();
    t1.unmount();

    // Simulate a reload: onComplete never fired, so taskIndex never
    // advanced. SDMTTask/useSDMTLogic remount fresh via key={taskIndex};
    // `demoShownRef` is a plain ref, reset to false on the new instance.
    confirm.mockClear();
    const t2 = renderTask();
    await t2.mount();

    expect(confirm).toHaveBeenCalledTimes(1); // demo dialog shown again, not skipped
    expect(t2.container.querySelector(".btn-start")).toBeTruthy(); // back at instructions, not mid-run
    expect(t2.container.querySelector(".sdmt-timer")).toBeFalsy();

    t2.unmount();
  });
});
