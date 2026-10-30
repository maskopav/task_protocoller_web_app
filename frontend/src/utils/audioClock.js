// Puts a recording's audio on the same clock as the face-landmark timestamps
// (performance.now(), see useVideoRecorder.js).
//
// The recorder worklet reports, for every recorded segment (one per start or
// resume), the file position of the segment's first sample (sampleIndex) and
// the AudioContext frame at which that sample went through the audio graph
// (contextFrame, the worklet's `currentFrame`). This module converts that
// frame to performance.now() from a reading of the context clock taken right
// after, so it does not depend on how late the message reached the main
// thread. Within a segment, sample n of the file then sits at
//     perfMs + (n - sampleIndex) / sampleRate * 1000.
//
// Two independent conversions are logged, because each has its own error:
//   perfMs           - from AudioContext.currentTime, which the main thread
//                      sees updated once per hardware audio buffer (typically
//                      ~10-40 ms on phones), so it can lag by up to one buffer.
//   perfMsFromOutput - from getOutputTimestamp() minus the reported base and
//                      output latency; only as good as those latency reports,
//                      null where the browser reports neither.
// Safari's getOutputTimestamp() returns currentTime itself, so there
// perfMsFromOutput comes out early by base + output latency; use perfMs.
//
// Safari sometimes reports currentFrame 0 although the context has been
// running for a while (seen on iOS 18.7: frame 0 at currentTime 1.04 s and
// 2.28 s), which would put the segment before its start command. The anchor
// is therefore checked against the time the start/resume command was posted
// (startSent): the first sample is processed after that, typically 10-20 ms
// later. An implausible or missing frame is logged as contextFrameRaw and the
// segment falls back to perfMs = startSent (perfMsSource 'startSent'), which
// is early by that 10-20 ms.
// Both are the time the sample was processed by the audio graph. The
// microphone captured it earlier, by the input latency
// (recording_finalized micSettings.latency, where the browser reports it).
// The landmark timestamps likewise trail the camera capture by the camera
// pipeline latency, which the browser does not report.

const round = (v, digits = 3) => (Number.isFinite(v) ? Math.round(v * 10 ** digits) / 10 ** digits : null);

// How far an anchor may fall before its start command and how far its frame
// may lie past the context's currentTime. Generous, so a pause and resume
// a few ms apart (the next start command already sent when the previous
// anchor arrives) or rounding never rejects a valid frame; the Safari frames
// it catches were off by ~1 s.
const START_TOLERANCE_MS = 50;
const FUTURE_TOLERANCE_SEC = 0.01;

// One simultaneous reading of the AudioContext clock and performance.now().
export function readContextClock(ctx) {
    const out = typeof ctx.getOutputTimestamp === 'function' ? ctx.getOutputTimestamp() : null;
    return {
        performanceNow: performance.now(),
        currentTime: ctx.currentTime,
        // Some browsers report zeros until the output device has started.
        output: out && out.contextTime > 0 && out.performanceTime > 0
            ? { contextTime: out.contextTime, performanceTime: out.performanceTime }
            : null,
    };
}

// performance.now() time at which context frame `frame` was processed.
export function frameToPerformanceTime(reading, frame, sampleRate, latency) {
    const frameSec = frame / sampleRate;
    const fromCurrentTime = reading.performanceNow - (reading.currentTime - frameSec) * 1000;
    const outputDelaySec = (latency?.base ?? NaN) + (latency?.output ?? NaN);
    const fromOutput = reading.output && Number.isFinite(outputDelaySec)
        ? reading.output.performanceTime + (frameSec - reading.output.contextTime) * 1000 - outputDelaySec * 1000
        : null;
    return { fromCurrentTime, fromOutput };
}

const roundReading = (r) => ({
    performanceNow: round(r.performanceNow),
    currentTime: round(r.currentTime, 6),
    output: r.output && {
        contextTime: round(r.output.contextTime, 6),
        performanceTime: round(r.output.performanceTime),
    },
});

// Collects the segment anchors of one recording.
export function createAudioClock() {
    const segments = [];
    let startSentMs = null;
    return {
        // Call right after posting the worklet's 'start' command (start and resume).
        startSent() {
            startSentMs = performance.now();
        },
        // Returns the stored anchor, or null when the context is gone.
        segmentStart(ctx, { sampleIndex, contextFrame }) {
            if (!ctx || ctx.state === 'closed') return null;
            const reading = readContextClock(ctx);
            let frameOk = Number.isFinite(contextFrame);
            let est = frameOk
                ? frameToPerformanceTime(reading, contextFrame, ctx.sampleRate,
                    { base: ctx.baseLatency, output: ctx.outputLatency })
                : null;
            if (frameOk && (contextFrame / ctx.sampleRate > reading.currentTime + FUTURE_TOLERANCE_SEC ||
                    (startSentMs != null && est.fromCurrentTime < startSentMs - START_TOLERANCE_MS))) {
                frameOk = false;
            }
            if (!frameOk) est = { fromCurrentTime: startSentMs, fromOutput: null };
            const anchor = {
                sampleIndex,
                contextFrame: frameOk ? contextFrame : null,
                ...(!frameOk && Number.isFinite(contextFrame) && { contextFrameRaw: contextFrame }),
                perfMs: round(est.fromCurrentTime),
                perfMsFromOutput: round(est.fromOutput),
                perfMsSource: frameOk ? 'contextFrame' : (startSentMs != null ? 'startSent' : null),
                startSentMs: round(startSentMs),
                reading: roundReading(reading),
            };
            segments.push(anchor);
            return anchor;
        },
        // workletSamples: samples the worklet saved; receivedSamples: samples
        // that reached the file. If they differ, sampleIndex values past the
        // missing audio no longer match file positions.
        summary(ctx, { workletSamples, receivedSamples }) {
            return {
                sampleRate: ctx?.sampleRate ?? null,
                segments,
                // Second reading, so drift between the two clocks can be checked.
                atStop: ctx && ctx.state !== 'closed' ? roundReading(readContextClock(ctx)) : null,
                workletSamples: workletSamples ?? null,
                receivedSamples,
            };
        },
    };
}
