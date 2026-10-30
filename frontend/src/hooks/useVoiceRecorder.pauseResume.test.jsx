// @vitest-environment jsdom
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../utils/frontendLogger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() },
}));
vi.mock("../utils/audioIDB", () => ({
  initSession: vi.fn(async () => {}), appendChunk: vi.fn(async () => {}), clearSession: vi.fn(async () => {}),
}));
vi.mock("../utils/finalizeRecording", () => ({ finalizeRecording: vi.fn(async () => ({})) }));

import { useVoiceRecorder } from "./useVoiceRecorder";
import { logger } from "../utils/frontendLogger";

let latest = null;
function Harness() {
  latest = useVoiceRecorder({});
  return null;
}

const fakeStream = () => {
  const track = { readyState: "live", stop: vi.fn(function () { this.readyState = "ended"; }), getSettings: () => ({ sampleRate: 48000 }) };
  return { track, getTracks: () => [track], getAudioTracks: () => [track] };
};
const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });

class FakeAudioContext {
  constructor() {
    this.state = "running";
    this.sampleRate = 48000;
    this.currentTime = 0;
    this.audioWorklet = { addModule: vi.fn(async () => {}) };
  }
  createMediaStreamSource() { return node(); }
  createGain() { return { ...node(), gain: { value: 1 } }; }
  createAnalyser() { return { ...node(), fftSize: 0, frequencyBinCount: 8, getByteFrequencyData: vi.fn() }; }
  close() { this.state = "closed"; return Promise.resolve(); }
}

let workletPosts;
class FakeWorkletNode {
  constructor() {
    this.port = { postMessage: (msg) => workletPosts.push(msg), onmessage: null, addEventListener: vi.fn() };
    this.connect = vi.fn();
    this.disconnect = vi.fn();
  }
}

describe("useVoiceRecorder — pause and resume", () => {
  let container;
  let root;
  let getUserMedia;

  beforeEach(() => {
    workletPosts = [];
    getUserMedia = vi.fn(async () => fakeStream());
    Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.stubGlobal("AudioWorkletNode", FakeWorkletNode);
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 0));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    URL.createObjectURL = vi.fn(() => "blob:worklet");
    URL.revokeObjectURL = vi.fn();
    logger.info.mockClear();

    container = document.createElement("div");
    document.body.appendChild(container);
    act(() => {
      root = createRoot(container);
      root.render(<Harness />);
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    latest = null;
  });

  async function startThenPause() {
    await act(async () => { await latest.startRecording(); });
    act(() => latest.pauseRecording({ reason: "topic_switch_manual", topicIndex: 0 }));
    expect(latest.recordingStatus).toBe("paused");
    getUserMedia.mockClear();
  }

  // A deferred getUserMedia, so a second call can arrive while the first waits.
  function deferMic() {
    let resolve;
    const stream = fakeStream();
    getUserMedia.mockImplementationOnce(() => new Promise((r) => { resolve = () => r(stream); }));
    return { stream, grant: () => resolve() };
  }

  it("opens the mic once when resume is called again while the first resume waits for it", async () => {
    await startThenPause();
    const mic = deferMic();

    let first, second;
    act(() => {
      first = latest.resumeRecording({ reason: "next_topic", topicIndex: 1 });
      second = latest.resumeRecording({ reason: "next_topic", topicIndex: 1 });
    });
    await act(async () => { mic.grant(); await Promise.all([first, second]); });

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(mic.stream.track.stop).not.toHaveBeenCalled();
    expect(latest.recordingStatus).toBe("recording");
    // initial start + one resume
    expect(workletPosts.filter((m) => m.command === "start")).toHaveLength(2);
    expect(logger.info).toHaveBeenCalledWith("recording_resumed", expect.objectContaining({
      reason: "next_topic", topicIndex: 1,
    }));
  });

  it("stays paused and releases the new mic when paused again before the mic arrived", async () => {
    await startThenPause();
    const mic = deferMic();

    let resume;
    act(() => { resume = latest.resumeRecording({ reason: "next_topic", topicIndex: 1 }); });
    act(() => latest.pauseRecording({ reason: "topic_prompt", topicIndex: 1 }));
    await act(async () => { mic.grant(); await resume; });

    expect(latest.recordingStatus).toBe("paused");
    expect(mic.stream.track.stop).toHaveBeenCalled();
    expect(workletPosts.filter((m) => m.command === "start")).toHaveLength(1);

    // A later resume works normally.
    await act(async () => { await latest.resumeRecording({ reason: "next_topic", topicIndex: 1 }); });
    expect(latest.recordingStatus).toBe("recording");
  });

  it("logs the pause with its reason and topic", async () => {
    await startThenPause();
    expect(logger.info).toHaveBeenCalledWith("recording_paused", expect.objectContaining({
      reason: "topic_switch_manual", topicIndex: 0, performanceNow: expect.any(Number),
    }));
    expect(workletPosts.at(-1)).toEqual({ command: "stop" });
  });
});
