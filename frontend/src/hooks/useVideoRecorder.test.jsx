// @vitest-environment jsdom
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The face model is fetched from a CDN at runtime; stub the wrapper so each
// test decides whether the load succeeds, fails or hangs.
const createFromOptions = vi.fn();
vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks: vi.fn(async () => ({})) },
  FaceLandmarker: { createFromOptions: (...args) => createFromOptions(...args) },
}));
vi.mock("../utils/frontendLogger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { useVideoRecorder } from "./useVideoRecorder";
import { logger } from "../utils/frontendLogger";

let latest = null;
function Harness() {
  latest = useVideoRecorder({});
  return null;
}

const fakeStream = () => ({ getTracks: () => [{ stop: vi.fn() }], getVideoTracks: () => [] });
const mediaError = (name) => Object.assign(new Error(name), { name });

describe("useVideoRecorder — camera setup and errors", () => {
  let container;
  let root;
  let getUserMedia;

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getUserMedia = vi.fn(async () => fakeStream());
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia },
      configurable: true,
    });
    createFromOptions.mockReset();
    createFromOptions.mockResolvedValue({ detectForVideo: vi.fn(), close: vi.fn() });

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
    vi.useRealTimers();
    vi.restoreAllMocks();
    latest = null;
  });

  async function requestCamera() {
    let result;
    await act(async () => {
      result = await latest.getMediaPermission();
    });
    return result;
  }

  it("grants the camera and loads the model when everything works", async () => {
    expect(await requestCamera()).toBe(true);
    expect(latest.cameraErrorType).toBeNull();
    expect(latest.modelLoadError).toBe(false);
    expect(latest.isLoadingModel).toBe(false);
  });

  it.each([
    ["NotAllowedError", "denied"],
    ["NotFoundError", "missing"],
    ["NotReadableError", "busy"],
    ["OverconstrainedError", "generic"],
  ])("classifies a %s camera failure as '%s'", async (errName, expected) => {
    getUserMedia.mockRejectedValueOnce(mediaError(errName));

    expect(await requestCamera()).toBe(false);
    expect(latest.cameraErrorType).toBe(expected);
    // The model is never touched when the camera itself failed.
    expect(createFromOptions).not.toHaveBeenCalled();
  });

  it("clears a previous camera error after a successful retry", async () => {
    getUserMedia.mockRejectedValueOnce(mediaError("NotReadableError"));
    await requestCamera();
    expect(latest.cameraErrorType).toBe("busy");

    expect(await requestCamera()).toBe(true);
    expect(latest.cameraErrorType).toBeNull();
  });

  it("does not report a face-model failure as a camera failure", async () => {
    createFromOptions.mockRejectedValue(new Error("CDN unreachable"));

    // Camera works → true, so the UI does NOT show "Camera Access Denied".
    expect(await requestCamera()).toBe(true);
    expect(latest.cameraErrorType).toBeNull();
    expect(latest.modelLoadError).toBe(true);
    expect(latest.isLoadingModel).toBe(false);
  });

  it("lets the model load be retried after a failure", async () => {
    // GPU attempt and its CPU fallback both fail (model unreachable)
    createFromOptions
      .mockRejectedValueOnce(new Error("CDN unreachable"))
      .mockRejectedValueOnce(new Error("CDN unreachable"));
    await requestCamera();
    expect(latest.modelLoadError).toBe(true);

    await act(async () => {
      await latest.preloadFaceModel();
    });
    expect(latest.modelLoadError).toBe(false);
    expect(createFromOptions).toHaveBeenCalledTimes(3);
  });

  it("creates the face model on the GPU first", async () => {
    await requestCamera();
    expect(createFromOptions).toHaveBeenCalledTimes(1);
    expect(createFromOptions.mock.calls[0][1].baseOptions.delegate).toBe("GPU");
    expect(logger.info).toHaveBeenCalledWith("face_model_delegate", { delegate: "GPU" });
  });

  it("falls back to the CPU when the GPU delegate cannot be created", async () => {
    createFromOptions.mockRejectedValueOnce(new Error("WebGL unavailable"));

    expect(await requestCamera()).toBe(true);
    expect(latest.modelLoadError).toBe(false);
    expect(createFromOptions.mock.calls.map((c) => c[1].baseOptions.delegate)).toEqual(["GPU", "CPU"]);
    expect(logger.warn).toHaveBeenCalledWith("face_model_delegate", expect.objectContaining({
      delegate: "CPU", requested: "GPU", fallbackReason: "WebGL unavailable",
    }));
  });

  it("turns a hanging model download into a retryable failure after the timeout", async () => {
    vi.useFakeTimers();
    createFromOptions.mockReturnValue(new Promise(() => {})); // never settles

    let pending;
    await act(async () => {
      pending = latest.preloadFaceModel().catch((e) => e);
    });
    expect(latest.isLoadingModel).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    expect((await pending).message).toMatch(/timed out/);
    expect(latest.modelLoadError).toBe(true);
    expect(latest.isLoadingModel).toBe(false);
  });

  it("reuses one in-flight model load instead of downloading twice", async () => {
    await act(async () => {
      await Promise.all([latest.preloadFaceModel(), latest.preloadFaceModel()]);
    });
    expect(createFromOptions).toHaveBeenCalledTimes(1);
  });
});

describe("useVideoRecorder — tracking during recording", () => {
  let container;
  let root;
  const face = { faceLandmarks: [[{ x: 0.5, y: 0.5, z: 0 }]] };
  const noFace = { faceLandmarks: [] };
  const finalizedLog = () =>
    logger.info.mock.calls.find(([msg]) => msg === "video_recording_finalized")?.[1];

  beforeEach(() => {
    vi.useFakeTimers();
    logger.info.mockClear();
    logger.warn.mockClear();
    const track = { stop: vi.fn(), getSettings: () => ({ width: 640, height: 480, frameRate: 30 }) };
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [track], getVideoTracks: () => [track] })) },
      configurable: true,
    });
    createFromOptions.mockReset();

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
    vi.useRealTimers();
    vi.restoreAllMocks();
    latest = null;
  });

  async function record(ms) {
    await act(async () => { await latest.getMediaPermission(); });
    act(() => {
      latest.attachVideoRef({});
      latest.startRecording();
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
    act(() => latest.stopRecording());
  }

  it("logs frames, delegate, detection time and camera settings when recording stops", async () => {
    const detectForVideo = vi.fn()
      .mockReturnValueOnce(noFace)
      .mockReturnValue(face);
    createFromOptions.mockResolvedValue({ detectForVideo, close: vi.fn() });

    await record(200);

    const stats = finalizedLog();
    expect(stats.delegate).toBe("GPU");
    expect(stats.framesWithoutFace).toBe(1);
    expect(stats.framesWithFace).toBe(detectForVideo.mock.calls.length - 1);
    expect(stats.framesWithFace).toBeGreaterThan(3);
    expect(stats.detectErrors).toBe(0);
    expect(stats.detectMs).toEqual(expect.objectContaining({ median: expect.any(Number) }));
    expect(stats.intervalMs).toEqual({
      median: expect.any(Number), sd: expect.any(Number), p5: expect.any(Number),
      p95: expect.any(Number), max: expect.any(Number),
    });
    expect(stats.camera).toEqual({ width: 640, height: 480, frameRate: 30 });
  });

  it("asks the camera for 30 fps", async () => {
    await record(0);
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(expect.objectContaining({
      video: expect.objectContaining({ frameRate: { ideal: 30 } }),
    }));
  });

  it("passes the model strictly increasing timestamps even when performance.now() repeats", async () => {
    const detectForVideo = vi.fn(() => face);
    createFromOptions.mockResolvedValue({ detectForVideo, close: vi.fn() });
    vi.spyOn(performance, "now").mockReturnValue(1000);

    await record(200);

    const ts = detectForVideo.mock.calls.map((c) => c[1]);
    expect(ts.length).toBeGreaterThan(3);
    expect(ts.every((t, i) => i === 0 || t > ts[i - 1])).toBe(true);
    expect(finalizedLog().detectErrors).toBe(0);
    // Saved landmark timestamps stay the real performance.now() values.
    expect(latest.videoData.every((f) => f.timestamp === 1000)).toBe(true);
  });

  it("switches to the CPU when the GPU model fails mid-recording and keeps tracking", async () => {
    const gpu = { detectForVideo: vi.fn(() => { throw new Error("WebGL context lost"); }), close: vi.fn() };
    const cpu = { detectForVideo: vi.fn(() => face), close: vi.fn() };
    createFromOptions.mockResolvedValueOnce(gpu).mockResolvedValueOnce(cpu);

    await record(300);

    expect(gpu.close).toHaveBeenCalled();
    expect(createFromOptions.mock.calls[1][1].baseOptions.delegate).toBe("CPU");
    expect(logger.warn).toHaveBeenCalledWith("face_model_gpu_runtime_error", expect.objectContaining({
      error: "WebGL context lost", switchingTo: "CPU",
    }));
    const stats = finalizedLog();
    expect(stats.delegate).toBe("CPU");
    expect(stats.detectErrors).toBe(1);
    expect(stats.framesWithFace).toBeGreaterThan(3);
    expect(latest.videoData.length).toBe(stats.framesWithFace);
  });

  describe("frame-driven loop (requestVideoFrameCallback)", () => {
    // A video whose frames the test delivers by hand.
    function frameVideo() {
      let pending = null;
      let presented = 0;
      return {
        requestVideoFrameCallback: vi.fn((cb) => { pending = cb; return presented + 1; }),
        cancelVideoFrameCallback: vi.fn(() => { pending = null; }),
        deliver(captureTime) {
          const cb = pending; pending = null;
          presented++;
          cb?.(performance.now(), { presentedFrames: presented, captureTime });
        },
        get pending() { return pending; },
      };
    }

    async function startWith(video) {
      await act(async () => { await latest.getMediaPermission(); });
      act(() => {
        latest.attachVideoRef(video);
        latest.startRecording();
      });
    }

    it("processes each delivered frame once, saves its capture time and logs camera fps", async () => {
      const detectForVideo = vi.fn(() => face);
      createFromOptions.mockResolvedValue({ detectForVideo, close: vi.fn() });
      const video = frameVideo();
      await startWith(video);

      for (let i = 0; i < 10; i++) {
        await act(async () => { await vi.advanceTimersByTimeAsync(33); });
        act(() => video.deliver(performance.now() - 20));
      }
      act(() => latest.stopRecording());

      expect(detectForVideo).toHaveBeenCalledTimes(10);
      expect(latest.videoData.every((f) => Math.abs(f.timestamp - f.captureTimestamp - 20) < 0.01)).toBe(true);
      const stats = finalizedLog();
      expect(stats.loop).toBe("rvfc");
      expect(stats.cameraFps).toBeCloseTo(30.3, 0);
      expect(stats.captureLagMs).toEqual({ median: 20, frames: 10 });
      expect(stats.skippedFrames).toBe(0);
      expect(video.cancelVideoFrameCallback).toHaveBeenCalled();
    });

    it("keeps every 30 fps frame even when callbacks snap to the display refresh", async () => {
      // iPhone pattern (sessions 579/580): frames captured 33 ms apart, but
      // the callbacks run on 16.7 ms refresh steps, so two of them can land
      // only ~17 ms apart.
      const detectForVideo = vi.fn(() => face);
      createFromOptions.mockResolvedValue({ detectForVideo, close: vi.fn() });
      const video = frameVideo();
      await startWith(video);

      const t0 = performance.now();
      const callbackSteps = [33, 50, 17, 33, 50, 17, 33, 33];
      let capture = t0;
      for (const step of callbackSteps) {
        await act(async () => { await vi.advanceTimersByTimeAsync(step); });
        capture += 33.3;
        act(() => video.deliver(capture));
      }
      act(() => latest.stopRecording());

      expect(detectForVideo).toHaveBeenCalledTimes(callbackSteps.length);
      expect(finalizedLog().skippedFrames).toBe(0);
    });

    it("skips frames arriving faster than the 30 fps target", async () => {
      const detectForVideo = vi.fn(() => face);
      createFromOptions.mockResolvedValue({ detectForVideo, close: vi.fn() });
      const video = frameVideo();
      await startWith(video);

      // 60 fps camera: every other frame is processed.
      for (let i = 0; i < 12; i++) {
        await act(async () => { await vi.advanceTimersByTimeAsync(16); });
        act(() => video.deliver(undefined));
      }
      act(() => latest.stopRecording());

      expect(detectForVideo.mock.calls.length).toBeGreaterThanOrEqual(5);
      expect(detectForVideo.mock.calls.length).toBeLessThanOrEqual(7);
      expect(finalizedLog().skippedFrames).toBe(12 - detectForVideo.mock.calls.length);
      // No captureTime from the browser -> none saved.
      expect(latest.videoData.every((f) => f.captureTimestamp === null)).toBe(true);
      expect(finalizedLog().captureLagMs).toBeNull();
    });

    it("falls back to the timer loop when frame callbacks stop arriving", async () => {
      const detectForVideo = vi.fn(() => face);
      createFromOptions.mockResolvedValue({ detectForVideo, close: vi.fn() });
      const video = frameVideo();
      await startWith(video);

      act(() => video.deliver(undefined));
      // Stall detected after ~500-750 ms, then ~1 s of timer-loop tracking.
      await act(async () => { await vi.advanceTimersByTimeAsync(1750); });
      act(() => latest.stopRecording());

      expect(logger.warn).toHaveBeenCalledWith("face_loop_fallback", expect.any(Object));
      expect(video.cancelVideoFrameCallback).toHaveBeenCalled();
      const stats = finalizedLog();
      expect(stats.loop).toBe("rvfc_then_timer");
      expect(stats.timerFallbacks).toBe(1);
      // The timer loop kept tracking after the stall (~1 frame per 33 ms).
      expect(detectForVideo.mock.calls.length).toBeGreaterThan(20);
      expect(stats.timerFrames).toBe(detectForVideo.mock.calls.length - 1);
      // The callback request stayed pending in case frames came back.
      expect(video.requestVideoFrameCallback).toHaveBeenCalledTimes(2);
    });

    it("hands tracking back to the frame callbacks when they return after a stall", async () => {
      // iPhone pattern (session 582): the camera pauses ~0.7 s while the mic
      // opens, then delivers frames normally again.
      const detectForVideo = vi.fn(() => face);
      createFromOptions.mockResolvedValue({ detectForVideo, close: vi.fn() });
      const video = frameVideo();
      await startWith(video);

      act(() => video.deliver(performance.now()));
      await act(async () => { await vi.advanceTimersByTimeAsync(800); }); // stall -> timer loop
      expect(logger.warn).toHaveBeenCalledWith("face_loop_fallback", expect.any(Object));
      const timerCalls = detectForVideo.mock.calls.length;
      expect(timerCalls).toBeGreaterThan(2);

      // Frames are back: 20 frames 33 ms apart, each processed exactly once,
      // and the timer no longer runs in between.
      for (let i = 0; i < 20; i++) {
        await act(async () => { await vi.advanceTimersByTimeAsync(33); });
        act(() => video.deliver(performance.now()));
      }
      const afterResume = detectForVideo.mock.calls.length - timerCalls;
      expect(afterResume).toBeGreaterThanOrEqual(19); // the first may be the frame the timer just did
      expect(afterResume).toBeLessThanOrEqual(20);
      expect(logger.info).toHaveBeenCalledWith("face_loop_resumed", {
        timerMs: expect.any(Number), timerFrames: expect.any(Number),
      });

      // A second stall falls back again.
      await act(async () => { await vi.advanceTimersByTimeAsync(800); });
      act(() => latest.stopRecording());
      const stats = finalizedLog();
      expect(stats.timerFallbacks).toBe(2);
      expect(stats.loop).toBe("rvfc_then_timer");
    });

    // A detection that takes `ms`: performance.now() moves on by that much
    // while it runs, as on a real device (timers do not fire meanwhile).
    function slowDetector(ms) {
      let extra = 0;
      const realNow = performance.now.bind(performance);
      vi.spyOn(performance, "now").mockImplementation(() => realNow() + extra);
      return vi.fn(() => { extra += ms; return face; });
    }

    it("leaves the main thread idle after a slow detection instead of chaining frames", async () => {
      // Session 584 (Firefox Android): ~425 ms per detection.
      const detectForVideo = slowDetector(425);
      createFromOptions.mockResolvedValue({ detectForVideo, close: vi.fn() });
      const video = frameVideo();
      await startWith(video);

      // Frames keep coming every 33 ms of idle time for 3 s.
      for (let i = 0; i < 90; i++) {
        await act(async () => { await vi.advanceTimersByTimeAsync(33); });
        act(() => video.deliver(performance.now()));
      }
      act(() => latest.stopRecording());

      // Each detection blocks ~425 ms and is followed by >= 425 ms without one.
      const ts = latest.videoData.map((f) => f.timestamp);
      const gaps = ts.slice(1).map((t, i) => t - ts[i]);
      expect(gaps.every((g) => g >= 850)).toBe(true);
      const stats = finalizedLog();
      expect(stats.slowFrames).toBe(detectForVideo.mock.calls.length);
      expect(stats.cooldownSkippedFrames).toBeGreaterThan(0);
      // A slow detection is not mistaken for stalled frame callbacks.
      expect(logger.warn).not.toHaveBeenCalledWith("face_loop_fallback", expect.anything());
    });

    it("does not hold back normal-speed detections", async () => {
      const detectForVideo = slowDetector(55); // slow Android with Chrome (session 577)
      createFromOptions.mockResolvedValue({ detectForVideo, close: vi.fn() });
      const video = frameVideo();
      await startWith(video);
      for (let i = 0; i < 10; i++) {
        await act(async () => { await vi.advanceTimersByTimeAsync(33); });
        act(() => video.deliver(performance.now()));
      }
      act(() => latest.stopRecording());
      expect(detectForVideo).toHaveBeenCalledTimes(10);
      expect(finalizedLog()).not.toHaveProperty("slowFrames");
    });

    it("does not process frames twice after the hand-back", async () => {
      const detectForVideo = vi.fn(() => face);
      createFromOptions.mockResolvedValue({ detectForVideo, close: vi.fn() });
      const video = frameVideo();
      await startWith(video);
      act(() => video.deliver(performance.now()));
      await act(async () => { await vi.advanceTimersByTimeAsync(800); });
      act(() => video.deliver(performance.now()));

      // Only frame callbacks from here: no timer ticks for 1 s without frames
      // until the watchdog (500 ms) notices the next stall.
      const calls = detectForVideo.mock.calls.length;
      await act(async () => { await vi.advanceTimersByTimeAsync(400); });
      expect(detectForVideo.mock.calls.length).toBe(calls);
    });

    it("stops processing frames after stopRecording", async () => {
      const detectForVideo = vi.fn(() => face);
      createFromOptions.mockResolvedValue({ detectForVideo, close: vi.fn() });
      const video = frameVideo();
      await startWith(video);
      await act(async () => { await vi.advanceTimersByTimeAsync(33); });
      act(() => video.deliver(undefined));
      act(() => latest.stopRecording());
      const calls = detectForVideo.mock.calls.length;

      await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
      expect(video.pending).toBeNull();
      expect(detectForVideo.mock.calls.length).toBe(calls);
      expect(logger.warn).not.toHaveBeenCalledWith("face_loop_fallback", expect.anything());
    });
  });

  // The calibration GPU/CPU benchmark was removed: on the slow Android
  // (session 613, GPU 530 ms) the CPU model never finished loading during
  // calibration, only loading the phone further, and a CPU model would reach
  // 2-3 fps at best. A slow GPU is simply used.
  it("calibrates on a slow GPU with that one model, without loading a second", async () => {
    let extra = 0;
    const realNow = performance.now.bind(performance);
    vi.spyOn(performance, "now").mockImplementation(() => realNow() + extra);
    const gpu = { detectForVideo: vi.fn(() => { extra += 530; return noFace; }), close: vi.fn() };
    createFromOptions.mockImplementation(async () => gpu);

    await act(async () => { await latest.getMediaPermission(); });
    act(() => {
      latest.attachVideoRef({ readyState: 4, videoWidth: 640, videoHeight: 480 });
      latest.canvasRef.current = { width: 640, height: 480, getContext: () => ({ clearRect: vi.fn() }) };
      latest.startFaceDetection();
    });
    for (let i = 0; i < 30; i++) {
      await act(async () => { await vi.advanceTimersToNextTimerAsync(); });
    }

    expect(gpu.detectForVideo.mock.calls.length).toBeGreaterThanOrEqual(20);
    expect(createFromOptions).toHaveBeenCalledTimes(1);
    expect(createFromOptions.mock.calls[0][1].baseOptions.delegate).toBe("GPU");
    expect(gpu.close).not.toHaveBeenCalled();
  });
});
