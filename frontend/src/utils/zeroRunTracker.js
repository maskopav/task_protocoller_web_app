// frontend/src/utils/zeroRunTracker.js
// Finds runs of exact digital silence (sample value 0) in a recording as its
// PCM chunks arrive, for logging only.
//
// A real microphone never delivers hundreds of consecutive exact zeros once
// audio is flowing -- even a quiet room sits a few LSB above zero. Such a run
// mid-recording means the browser had no audio from the device for that
// stretch and filled it with silence (seen on an Android phone as 40 ms gaps,
// see data_qc analysis of session 559). The leading run before the first
// non-zero sample is normal capture start-up and is reported separately, as is
// a run still open when recording stops.
//
// Only the position of the last non-zero sample is tracked: a gap is the
// distance between two consecutive non-zero samples, so the common case costs
// one comparison per sample. Positions are sample indices into the recorded
// (saved) audio, so they map 1:1 onto the uploaded file.

const MIN_GAP_SAMPLES = 128; // one Web Audio render quantum
const MAX_LISTED_GAPS = 20;  // keep log entries small

export function createZeroRunTracker() {
  let position = 0;      // samples seen so far
  let lastNonZero = -1;  // index of the last non-zero sample, -1 before any
  let leading = 0;       // zeros before the first non-zero sample
  let gapCount = 0;
  let gapSamples = 0;
  const gaps = [];

  return {
    push(chunk) {
      for (let i = 0; i < chunk.length; i++) {
        if (chunk[i] === 0) continue;
        const p = position + i;
        const run = p - lastNonZero - 1;
        if (lastNonZero < 0) {
          leading = p;
        } else if (run >= MIN_GAP_SAMPLES) {
          gapCount++;
          gapSamples += run;
          if (gaps.length < MAX_LISTED_GAPS) gaps.push({ startSample: lastNonZero + 1, samples: run });
        }
        lastNonZero = p;
      }
      position += chunk.length;
    },

    summary(sampleRate) {
      const ms = (n) => Math.round((n / sampleRate) * 10000) / 10;
      return {
        count: gapCount,
        totalMs: ms(gapSamples),
        leadingMs: ms(lastNonZero < 0 ? position : leading),
        trailingMs: ms(lastNonZero < 0 ? 0 : position - lastNonZero - 1),
        list: gaps.map((g) => ({
          atSec: Math.round((g.startSample / sampleRate) * 1000) / 1000,
          ms: ms(g.samples),
          ...g,
        })),
      };
    },
  };
}
