// @vitest-environment jsdom
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useSDMTLogic } from "./useSDMTLogic";

// Minimal harness so the hook goes through a real mount/unmount lifecycle,
// the same way SDMTTask does, without pulling in SDMTTask's dialog/audio
// dependencies (which aren't part of what makes progress reload-safe).
let latest = null;
function Harness({ duration = 90, symbolOrdering = "fixed_by_run", repeatIndex = 1 }) {
  const state = useSDMTLogic(duration, symbolOrdering, repeatIndex);
  latest = state;
  return (
    <div>
      <button className="start" onClick={state.startGame}>start</button>
      <button className="tap-1" onClick={() => state.handleTap(1)}>1</button>
    </div>
  );
}

describe("useSDMTLogic (SDMT task) — reload/resume behavior", () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    vi.useFakeTimers();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    latest = null;
  });

  function mount(props) {
    act(() => {
      root = createRoot(container);
      root.render(<Harness {...props} />);
    });
  }

  function remount(props) {
    act(() => root.unmount());
    container.remove();
    container = document.createElement("div");
    document.body.appendChild(container);
    mount(props);
  }

  it("starts fresh on 'instructions' with a full, untouched timer and no results", () => {
    mount({ duration: 90 });
    expect(latest.gameState).toBe("instructions");
    expect(latest.timeLeft).toBe(90);
    expect(latest.results).toBeNull();
  });

  it("loses the running countdown on a simulated reload mid-test — it does not resume where it left off", () => {
    mount({ duration: 90 });
    act(() => container.querySelector(".start").click());
    expect(latest.gameState).toBe("playing");

    act(() => {
      vi.advanceTimersByTime(30_000); // let 30s of the 90s countdown elapse
    });
    expect(latest.timeLeft).toBe(60);
    expect(latest.gameState).toBe("playing");

    // Simulate a reload: SDMTTask remounts a fresh useSDMTLogic instance via
    // key={taskIndex} because the task hasn't completed (onComplete never
    // fired), and nothing in the hook persists gameState/timeLeft/taps.
    remount({ duration: 90 });

    expect(latest.gameState).toBe("instructions");
    expect(latest.timeLeft).toBe(90); // NOT 60 — the countdown restarts from scratch
    expect(latest.results).toBeNull();
  });

  it("loses every recorded tap on a simulated reload mid-test", () => {
    mount({ duration: 90 });
    act(() => container.querySelector(".start").click());
    act(() => vi.advanceTimersByTime(200)); // clear the symbol-reveal delay so a tap registers
    act(() => container.querySelector(".tap-1").click());

    // Finish this run normally to read out what got recorded, proving the
    // tap really was captured before we throw it away via a "reload".
    act(() => vi.advanceTimersByTime(90_000));
    expect(latest.gameState).toBe("stats");
    expect(latest.results.totalTaps).toBeGreaterThan(0);

    remount({ duration: 90 });
    expect(latest.gameState).toBe("instructions");
    expect(latest.results).toBeNull(); // the tap log from the previous mount is gone, not merged in
  });

  it("never persists gameplay progress to localStorage or sessionStorage", () => {
    const lsSetSpy = vi.spyOn(Storage.prototype, "setItem");

    mount({ duration: 90 });
    act(() => container.querySelector(".start").click());
    act(() => vi.advanceTimersByTime(5_000));

    expect(lsSetSpy).not.toHaveBeenCalled();
    lsSetSpy.mockRestore();
  });

  it("only produces a results payload once the timer naturally reaches zero, not incrementally while playing", () => {
    mount({ duration: 5 });
    act(() => container.querySelector(".start").click());
    expect(latest.results).toBeNull();

    act(() => vi.advanceTimersByTime(4_000));
    expect(latest.gameState).toBe("playing");
    expect(latest.results).toBeNull();

    act(() => vi.advanceTimersByTime(1_000));
    expect(latest.gameState).toBe("stats");
    expect(latest.results).not.toBeNull();
  });
});
