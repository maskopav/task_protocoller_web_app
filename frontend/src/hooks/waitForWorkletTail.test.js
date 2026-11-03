import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { waitForWorkletTail } from "./useVoiceRecorder";

// A worklet port whose messages the test delivers by hand.
function fakeNode() {
  const listeners = new Set();
  return {
    port: {
      addEventListener: (_type, fn) => listeners.add(fn),
      removeEventListener: (_type, fn) => listeners.delete(fn),
    },
    send: (data) => listeners.forEach((fn) => fn({ data })),
    get listening() { return listeners.size > 0; },
  };
}

describe("waitForWorkletTail", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("keeps waiting while a backlog of chunks drains, however long it takes", async () => {
    // Session 584: the main thread was so busy that the worklet's messages
    // arrived long after the stop; a fixed 300 ms wait lost 61 s of audio.
    const node = fakeNode();
    let result = "pending";
    waitForWorkletTail(node).then((r) => { result = r; });

    for (let i = 0; i < 20; i++) { // 20 chunks, 400 ms apart = 8 s
      await vi.advanceTimersByTimeAsync(400);
      node.send({ buffer: new ArrayBuffer(8) });
    }
    expect(result).toBe("pending");
    node.send({ done: true, savedSamples: 81920 });
    await vi.advanceTimersByTimeAsync(0);
    expect(result).toBe(81920);
    expect(node.listening).toBe(false);
  });

  it("gives up after a second without any message (a lost message)", async () => {
    const node = fakeNode();
    let result = "pending";
    waitForWorkletTail(node).then((r) => { result = r; });
    await vi.advanceTimersByTimeAsync(999);
    expect(result).toBe("pending");
    await vi.advanceTimersByTimeAsync(1);
    expect(result).toBeNull();
  });

  it("gives up after 15 s in total even if chunks keep coming", async () => {
    const node = fakeNode();
    let result = "pending";
    waitForWorkletTail(node).then((r) => { result = r; });
    for (let i = 0; i < 40; i++) {
      await vi.advanceTimersByTimeAsync(500);
      node.send({ buffer: new ArrayBuffer(8) });
    }
    expect(result).toBeNull();
  });
});
