import { describe, it, expect } from 'vitest';
import { buildAudioTiming, timingVorbisComments } from './audioTiming';

// Shaped like recording_finalized of session 581's monologue (two topic switches).
const anchor = (sampleIndex, perfMs, extra = {}) => ({
  sampleIndex, contextFrame: sampleIndex + 1000, perfMs, perfMsFromOutput: perfMs - 7,
  perfMsSource: 'contextFrame', commandSentMs: perfMs - 3, reading: {}, ...extra,
});
const recordingInfo = {
  samples: 3313792,
  durationSec: 69.04,
  zeroGaps: { count: 1, totalMs: 48, leadingMs: 40, trailingMs: 0, list: [{ atSec: 61.36, ms: 48, startSample: 2945280, samples: 2304 }] },
  clock: {
    sampleRate: 48000,
    segments: [
      { ...anchor(0, 245086.667), reason: 'start', end: anchor(1395072, 274149.333, { reason: 'topic_switch_manual', topicIndex: 0 }) },
      { ...anchor(1395072, 283415.333), reason: 'next_topic', topicIndex: 1, micWaitMs: 13.3, end: anchor(2945280, 315714, { reason: 'topic_switch_manual', topicIndex: 1 }) },
      { ...anchor(2945280, 317800), reason: 'next_topic', topicIndex: 2, end: null },
    ],
    atStop: null, workletSamples: 3313792, receivedSamples: 3313792,
  },
};

describe('buildAudioTiming', () => {
  it('lists each segment with its file position, clock anchor and cause', () => {
    const timing = buildAudioTiming(recordingInfo);
    expect(timing).toMatchObject({ format: 'audio-timing-v1', sampleRate: 48000, samples: 3313792, durationSec: 69.04 });
    expect(timing.segments[1]).toEqual({
      startSample: 1395072, endSample: 2945280, startMs: 283415.333, endMs: 315714,
      startReason: 'next_topic', endReason: 'topic_switch_manual', topicIndex: 1, micWaitMs: 13.3,
      startClock: 'contextFrame', endClock: 'contextFrame',
    });
    // Pause length between segments 1 and 2: 283415.333 - 274149.333 ms.
    expect(timing.segments[1].startMs - timing.segments[0].endMs).toBeCloseTo(9266, 0);
    // A segment whose end anchor is missing keeps nulls instead of guessing.
    expect(timing.segments[2]).toMatchObject({ endSample: null, endMs: null, endReason: null });
    // Full anchors ride along for the sidecar.
    expect(timing.clock).toBe(recordingInfo.clock);
  });

  it('returns null without clock data', () => {
    expect(buildAudioTiming({ samples: 10 })).toBeNull();
    expect(buildAudioTiming(null)).toBeNull();
  });
});

describe('timingVorbisComments', () => {
  it('writes one SEGMENT tag per segment plus the zero gaps', () => {
    const comments = timingVorbisComments(buildAudioTiming(recordingInfo));
    expect(comments.slice(0, 3)).toEqual([
      'NEUROSHARE_TIMING=audio-timing-v1',
      'NEUROSHARE_CLOCK=performance.now() ms of the recording page',
      'SEGMENT_COUNT=3',
    ]);
    const segments = comments.filter((c) => c.startsWith('SEGMENT=')).map((c) => JSON.parse(c.slice(8)));
    expect(segments.map((s) => s.startSample)).toEqual([0, 1395072, 2945280]);
    const gaps = JSON.parse(comments.find((c) => c.startsWith('ZERO_GAPS=')).slice(10));
    expect(gaps).toEqual({ count: 1, leadingMs: 40, list: [{ atSec: 61.36, ms: 48 }] });
  });

  it('writes nothing without timing', () => {
    expect(timingVorbisComments(null)).toEqual([]);
  });
});
