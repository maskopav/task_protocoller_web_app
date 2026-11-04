// @vitest-environment jsdom
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../utils/frontendLogger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() },
}));

import { useVadLogic } from "./useVADLogic";

const STATES = { IDLE: "idle", RECORDING: "recording", PAUSED: "paused", RECORDED: "recorded" };

function Harness({ status, stream }) {
  useVadLogic({
    useVAD: true, stream, audioContext: { current: null }, recordingStatus: status,
    RECORDING_STATES: STATES, pauseRecording: () => {}, isDynamicTask: false, dynamicArray: [],
    dynamicIndex: 0, awaitingNextTopic: false, promptTopicSwitch: false, setPromptTopicSwitch: () => {},
  });
  return null;
}

// Session 610 (iPhone): the VAD's clone of the mic stayed live after Stop until
// the task unmounted, so the phone stayed in recording mode and playback after
// a VAD task's Stop ran at a different volume.
describe("useVadLogic — the VAD's copy of the mic", () => {
  let container, root, vadTrack, vad, stream;
  const render = (status) => act(() => root.render(<Harness status={status} stream={stream} />));

  beforeEach(async () => {
    vi.useFakeTimers();
    vadTrack = { stop: vi.fn() };
    stream = { clone: () => ({ getTracks: () => [vadTrack] }) };
    vad = { start: vi.fn(), pause: vi.fn() };
    window.vad = { MicVAD: { new: vi.fn(async (opts) => Object.assign(vad, { stream: opts.stream })) } };
    container = document.createElement("div");
    document.body.appendChild(container);
    act(() => { root = createRoot(container); });
    render(STATES.RECORDING);
    await act(async () => { await vi.advanceTimersByTimeAsync(500); }); // VAD init delay
    expect(vad.start).toHaveBeenCalled();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    delete window.vad;
    vi.useRealTimers();
  });

  it("keeps it through a pause and releases it at Stop", () => {
    render(STATES.PAUSED);
    expect(vad.pause).toHaveBeenCalled();
    expect(vadTrack.stop).not.toHaveBeenCalled();

    render(STATES.RECORDED);
    expect(vadTrack.stop).toHaveBeenCalled();
  });
});
