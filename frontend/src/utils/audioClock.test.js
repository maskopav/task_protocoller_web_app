import { describe, it, expect, vi, afterEach } from "vitest";
import { readContextClock, frameToPerformanceTime, createAudioClock } from "./audioClock";

const ctxAt = ({ currentTime, output = null, base = 0.01, outputLatency = 0.03, state = "running" }) => ({
  sampleRate: 48000,
  currentTime,
  baseLatency: base,
  outputLatency,
  state,
  getOutputTimestamp: () => output ?? { contextTime: 0, performanceTime: 0 },
});

describe("audioClock", () => {
  afterEach(() => vi.restoreAllMocks());

  it("converts a context frame to performance.now() via currentTime", () => {
    // Context at 2.0 s when performance.now() reads 5000 ms -> frame at 1.5 s was 500 ms earlier.
    const reading = { performanceNow: 5000, currentTime: 2.0, output: null };
    const { fromCurrentTime, fromOutput } = frameToPerformanceTime(reading, 1.5 * 48000, 48000, { base: 0.01, output: 0.03 });
    expect(fromCurrentTime).toBeCloseTo(4500, 6);
    expect(fromOutput).toBeNull();
  });

  it("converts via getOutputTimestamp, removing base + output latency", () => {
    // Context time 1.9 s left the speaker at 4950 ms; frame at 1.5 s did so 400 ms earlier,
    // and was processed 40 ms (base 10 + output 30) before leaving the speaker.
    const reading = { performanceNow: 5000, currentTime: 2.0, output: { contextTime: 1.9, performanceTime: 4950 } };
    const { fromOutput } = frameToPerformanceTime(reading, 1.5 * 48000, 48000, { base: 0.01, output: 0.03 });
    expect(fromOutput).toBeCloseTo(4510, 6);
  });

  it("gives no output-based time when a latency is not reported", () => {
    const reading = { performanceNow: 5000, currentTime: 2.0, output: { contextTime: 1.9, performanceTime: 4950 } };
    expect(frameToPerformanceTime(reading, 0, 48000, { base: 0.01, output: undefined }).fromOutput).toBeNull();
  });

  it("treats an all-zero output timestamp (output not started) as unavailable", () => {
    vi.spyOn(performance, "now").mockReturnValue(1234);
    expect(readContextClock(ctxAt({ currentTime: 0.5 })).output).toBeNull();
    const noApi = { currentTime: 0.5 };
    expect(readContextClock(noApi)).toEqual({ performanceNow: 1234, currentTime: 0.5, output: null });
  });

  it("collects one anchor per segment and a stop reading for drift checks", () => {
    const now = vi.spyOn(performance, "now");
    const clock = createAudioClock();

    now.mockReturnValue(10100);
    const first = clock.segmentStart(ctxAt({ currentTime: 1.1, output: { contextTime: 1.06, performanceTime: 10100 } }),
      { sampleIndex: 0, contextFrame: 48000 });
    expect(first).toEqual(expect.objectContaining({ sampleIndex: 0, perfMs: 10000 }));
    now.mockReturnValue(20050);
    clock.segmentStart(ctxAt({ currentTime: 11.05 }), { sampleIndex: 432000, contextFrame: 528000 });

    now.mockReturnValue(30000);
    const summary = clock.summary(ctxAt({ currentTime: 21 }), { workletSamples: 912000, receivedSamples: 912000 });

    expect(summary.sampleRate).toBe(48000);
    expect(summary.segments).toHaveLength(2);
    expect(summary.segments[0]).toEqual(expect.objectContaining({
      sampleIndex: 0, contextFrame: 48000, perfMs: 10000, perfMsFromOutput: 10000,
    }));
    // Resumed segment: frame 528000 = 11.0 s, 50 ms before the reading.
    expect(summary.segments[1]).toEqual(expect.objectContaining({
      sampleIndex: 432000, perfMs: 20000, perfMsFromOutput: null,
    }));
    expect(summary.atStop).toEqual({ performanceNow: 30000, currentTime: 21, output: null });
    expect(summary).toEqual(expect.objectContaining({ workletSamples: 912000, receivedSamples: 912000 }));
  });

  it("ignores anchors once the context is closed and keeps a null frame as unknown", () => {
    const clock = createAudioClock();
    expect(clock.segmentStart(ctxAt({ currentTime: 1, state: "closed" }), { sampleIndex: 0, contextFrame: 48000 })).toBeNull();
    expect(clock.segmentStart(null, { sampleIndex: 0, contextFrame: 48000 })).toBeNull();
    const unknown = clock.segmentStart(ctxAt({ currentTime: 1 }), { sampleIndex: 0, contextFrame: null });
    expect(unknown.perfMs).toBeNull();

    const { segments, atStop } = clock.summary(ctxAt({ currentTime: 2, state: "closed" }), { receivedSamples: 0 });
    expect(segments).toHaveLength(1);
    expect(segments[0]).toEqual(expect.objectContaining({ contextFrame: null, perfMs: null, perfMsFromOutput: null }));
    expect(atStop).toBeNull();
  });
});
