// utils/audioTiming.js
//
// Where a recording's file was cut (pauses for topic switches etc.) and how
// its samples map to the performance.now() clock of the face landmarks. The
// same information goes to two places so it never depends on the session log:
//   - the upload, saved by the backend next to the recording as
//     <recording>.segments.json (buildAudioTiming, full detail);
//   - Vorbis comments inside the FLAC itself (timingVorbisComments, compact),
//     readable with ffprobe, metaflac, soundfile/mutagen, ...
//
// Each segment is one stretch of continuous audio in the file. File sample n
// of a segment was processed by the audio graph at
//     startMs + (n - startSample) / sampleRate * 1000      (performance.now())
// The pause between two segments is cut out of the file: segment k ends at
// the same sample index segment k+1 starts at, and the time that passed is
// next.startMs - this.endMs. See audioClock.js for how the anchors are made
// and their accuracy.

export const AUDIO_TIMING_FORMAT = 'audio-timing-v1';

// recordingInfo as built in useVoiceRecorder's stopRecording (samples,
// durationSec, zeroGaps, clock = audioClock summary). Null without a clock.
export function buildAudioTiming(recordingInfo) {
    const clock = recordingInfo?.clock;
    if (!clock) return null;
    return {
        format: AUDIO_TIMING_FORMAT,
        sampleRate: clock.sampleRate,
        samples: recordingInfo.samples ?? null,
        durationSec: recordingInfo.durationSec ?? null,
        segments: clock.segments.map(compactSegment),
        zeroGaps: recordingInfo.zeroGaps ?? null,
        // Full anchors (clock readings, both conversions, command times).
        clock,
    };
}

function compactSegment(segment) {
    const end = segment.end;
    return {
        startSample: segment.sampleIndex,
        endSample: end?.sampleIndex ?? null,
        startMs: segment.perfMs,
        endMs: end?.perfMs ?? null,
        startReason: segment.reason ?? null,
        endReason: end?.reason ?? null,
        ...(Number.isInteger(segment.topicIndex) && { topicIndex: segment.topicIndex }),
        // Mic start-up silence skipped before startSample (not in the file)
        ...(Number.isFinite(segment.micWaitMs) && { micWaitMs: segment.micWaitMs }),
        // 'contextFrame' (exact) or 'commandSent' (fallback, early by 10-20 ms)
        startClock: segment.perfMsSource ?? null,
        endClock: end?.perfMsSource ?? null,
    };
}

// Vorbis comments (KEY=value) for the FLAC. One SEGMENT per segment, in file
// order, each a JSON object as in the sidecar's `segments`.
export function timingVorbisComments(timing) {
    if (!timing) return [];
    return [
        `NEUROSHARE_TIMING=${timing.format}`,
        'NEUROSHARE_CLOCK=performance.now() ms of the recording page',
        `SEGMENT_COUNT=${timing.segments.length}`,
        ...timing.segments.map((s) => `SEGMENT=${JSON.stringify(s)}`),
        ...(timing.zeroGaps ? [`ZERO_GAPS=${JSON.stringify({
            count: timing.zeroGaps.count,
            leadingMs: timing.zeroGaps.leadingMs,
            list: (timing.zeroGaps.list ?? []).map(({ atSec, ms }) => ({ atSec, ms })),
        })}`] : []),
    ];
}
