// @vitest-environment jsdom
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { useWakeLock } from "./useWakeLock";

let latest = null;
function Harness() {
  latest = useWakeLock();
  return null;
}

// Minimal WakeLockSentinel stand-in: release() fires the 'release' event like
// the real one, and systemRelease() mimics the browser dropping the lock.
const makeSentinel = () => {
  const listeners = [];
  const sentinel = {
    released: false,
    addEventListener: (type, fn) => type === "release" && listeners.push(fn),
    release: vi.fn(async () => sentinel.systemRelease()),
    systemRelease: () => {
      sentinel.released = true;
      listeners.forEach((fn) => fn());
    },
  };
  return sentinel;
};

const UA = navigator.userAgent;
const setUserAgent = (ua) =>
  Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true });
const setVisibility = (state) =>
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
const keepAwakeVideo = () => document.querySelector("video");

describe("useWakeLock", () => {
  let container;
  let root;
  let sentinels;
  let play;

  beforeEach(async () => {
    sentinels = [];
    Object.defineProperty(navigator, "wakeLock", {
      value: {
        request: vi.fn(async () => {
          const s = makeSentinel();
          sentinels.push(s);
          return s;
        }),
      },
      configurable: true,
    });
    play = vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function () {
      Object.defineProperty(this, "paused", { value: false, configurable: true });
      return Promise.resolve();
    });
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function () {
      Object.defineProperty(this, "paused", { value: true, configurable: true });
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    setVisibility("visible");

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root.render(<Harness />));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    delete navigator.wakeLock;
    setUserAgent(UA);
    vi.restoreAllMocks();
  });

  it("acquires the native lock and releases it", async () => {
    await act(() => latest.requestWakeLock());
    expect(navigator.wakeLock.request).toHaveBeenCalledWith("screen");
    expect(play).not.toHaveBeenCalled();

    await act(() => latest.releaseWakeLock());
    expect(sentinels[0].release).toHaveBeenCalled();
  });

  it("re-acquires after the system drops the lock, on return or on the next tap", async () => {
    await act(() => latest.requestWakeLock());
    sentinels[0].systemRelease();

    setVisibility("hidden");
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(navigator.wakeLock.request).toHaveBeenCalledTimes(1);

    setVisibility("visible");
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(navigator.wakeLock.request).toHaveBeenCalledTimes(2);

    sentinels[1].systemRelease();
    await act(async () => document.dispatchEvent(new Event("pointerdown")));
    expect(navigator.wakeLock.request).toHaveBeenCalledTimes(3);
  });

  it("retries on the next tap after a refused request", async () => {
    navigator.wakeLock.request.mockRejectedValueOnce(
      Object.assign(new Error("denied"), { name: "NotAllowedError" })
    );
    await act(() => latest.requestWakeLock());
    expect(sentinels).toHaveLength(0);

    await act(async () => document.dispatchEvent(new Event("pointerdown")));
    expect(sentinels).toHaveLength(1);
  });

  it("does not re-acquire once released", async () => {
    await act(() => latest.requestWakeLock());
    await act(() => latest.releaseWakeLock());
    await act(async () => document.dispatchEvent(new Event("pointerdown")));
    expect(navigator.wakeLock.request).toHaveBeenCalledTimes(1);
  });

  it("falls back to a muted inline video when the API is missing", async () => {
    delete navigator.wakeLock;
    await act(() => latest.requestWakeLock());

    const video = keepAwakeVideo();
    expect(video).not.toBeNull();
    expect(video.muted).toBe(true);
    expect(video.loop).toBe(true);
    expect(video.hasAttribute("playsinline")).toBe(true);
    expect(play).toHaveBeenCalledTimes(1);

    await act(() => latest.releaseWakeLock());
    expect(video.paused).toBe(true);
  });

  it("uses both the native lock and the video on iOS", async () => {
    setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15");
    await act(() => latest.requestWakeLock());
    expect(navigator.wakeLock.request).toHaveBeenCalled();
    expect(play).toHaveBeenCalled();
  });

  it("removes the video on unmount", async () => {
    delete navigator.wakeLock;
    await act(() => latest.requestWakeLock());
    expect(keepAwakeVideo()).not.toBeNull();

    await act(async () => root.unmount());
    expect(keepAwakeVideo()).toBeNull();
    root = createRoot(container);
  });
});
