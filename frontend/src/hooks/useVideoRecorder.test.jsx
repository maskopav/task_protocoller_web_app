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
    expect(stats.camera).toEqual({ width: 640, height: 480, frameRate: 30 });
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
});
