import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { WORKLET_CODE } from "./useVoiceRecorder";

// Runs the inlined recorder worklet against fake AudioWorkletGlobalScope
// globals: the test drives process() quantum by quantum and sets the
// `currentFrame` global the real audio thread would provide.
function loadWorklet() {
  let Processor;
  class FakeProcessor {
    constructor() {
      this.port = { posted: [], postMessage(msg) { this.posted.push(msg); }, onmessage: null };
    }
  }
  new Function("AudioWorkletProcessor", "registerProcessor", WORKLET_CODE)(
    FakeProcessor,
    (_name, cls) => { Processor = cls; },
  );
  const node = new Processor();
  const send = (data) => node.port.onmessage({ data });
  const quantum = (frame, value = 0.1) => {
    globalThis.currentFrame = frame;
    node.process([[new Float32Array(128).fill(value)]]);
  };
  return { node, send, quantum, posted: node.port.posted };
}

describe("recorder worklet — segment anchors", () => {
  beforeEach(() => { delete globalThis.currentFrame; });
  afterEach(() => { delete globalThis.currentFrame; });

  it("anchors the first saved sample to its context frame, before that quantum's audio", () => {
    const { send, quantum, posted } = loadWorklet();
    quantum(0); // not recording yet: nothing saved
    send({ command: "start" });
    quantum(128 * 7);
    quantum(128 * 8);

    expect(posted).toEqual([{ segmentStart: { sampleIndex: 0, contextFrame: 896 } }]);
  });

  it("starts a new segment at the resumed file position after a pause", () => {
    const { send, quantum, posted } = loadWorklet();
    send({ command: "start" });
    for (let f = 1000; f < 1000 + 128 * 40; f += 128) quantum(f); // 5120 samples, one full 4096 batch posted
    send({ command: "stop" }); // pause: flushes the remaining 1024
    quantum(99999); // paused: ignored
    send({ command: "start" });
    quantum(200000);
    send({ command: "stop", final: true });

    const anchors = posted.filter((m) => m.segmentStart).map((m) => m.segmentStart);
    expect(anchors).toEqual([
      { sampleIndex: 0, contextFrame: 1000 },
      { sampleIndex: 5120, contextFrame: 200000 },
    ]);
    const buffers = posted.filter((m) => m.buffer);
    const total = buffers.reduce((n, m) => n + m.buffer.byteLength / 2, 0);
    expect(total).toBe(5248);
    expect(posted.at(-1)).toEqual({ done: true, savedSamples: 5248 });
  });

  it("defers the anchor while the input has no channels yet", () => {
    const { node, send, quantum, posted } = loadWorklet();
    send({ command: "start" });
    globalThis.currentFrame = 0;
    node.process([[]]);
    quantum(256);
    expect(posted[0]).toEqual({ segmentStart: { sampleIndex: 0, contextFrame: 256 } });
  });

  it("reports an unknown frame when the scope has no currentFrame", () => {
    const { node, send, posted } = loadWorklet();
    send({ command: "start" });
    node.process([[new Float32Array(128)]]);
    expect(posted[0]).toEqual({ segmentStart: { sampleIndex: 0, contextFrame: null } });
  });
});
