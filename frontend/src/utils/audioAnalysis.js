// src/utils/audioAnalysis.js
//
// SNR of the mic check recording, computed from the per-frame rms that
// finalizeRecording() already measured (audioLevels.js's computeFrames) --
// no re-fetching or re-decoding of the recorded file.
//
// The mic check asks the participant to count aloud, then shows a "stay
// silent" prompt (MicCheck.jsx). So:
//   noise  = median frame rms of the silence phase (from the prompt plus a
//            reaction margin), excluding frames VAD marked as speech.
//   speech = 90th-percentile frame rms of the VAD speech segments -- or of
//            the counting phase (before the silence prompt) when VAD found
//            no speech, so the result doesn't depend on VAD working.
// Median/percentile instead of mean power: one knock, cough or screen tap
// can't dominate the noise, and pauses between counted numbers don't dilute
// the speech level.
import { logger } from "./frontendLogger";
import { percentile } from "./audioLevels";

const SILENCE_REACTION_MS = 500;      // the participant may still finish a word after the prompt
const FALLBACK_SPEECH_MS = 5000;      // no VAD speech and no silence prompt: assume the first 5 s are speech
const SPEECH_PERCENTILE = 0.9;
const NOISE_PERCENTILE = 0.5;         // median
const MUTED_PEAK_LSB = 0.001 * 32768; // peak below 0.001 of full scale (-60 dBFS) = muted mic

const sortedPercentile = (values, p) => percentile(Float32Array.from(values).sort(), p);

/**
 * Splits the frames into speech and noise by time (all times Date.now() ms).
 * @returns {{ speech: number[], noise: number[], usedVad: boolean, usedSilencePhase: boolean }}
 */
export function classifyFrames({ rms, frameSec }, speechSegments, recordingStartTime, silenceStartTime) {
  const toFrame = (time) => Math.max(0, Math.floor((time - recordingStartTime) / 1000 / frameSec));

  const vadSpeech = new Uint8Array(rms.length);
  for (const { startTime, endTime } of speechSegments || []) {
    vadSpeech.fill(1, toFrame(startTime), toFrame(endTime) + 1);
  }
  const usedVad = vadSpeech.includes(1);

  // Without VAD, speech is the counting phase: everything before the silence prompt.
  const countingEnd = toFrame(silenceStartTime ?? recordingStartTime + FALLBACK_SPEECH_MS);
  const silenceStart = silenceStartTime ? toFrame(silenceStartTime + SILENCE_REACTION_MS) : 0;

  const speech = [], silence = [], other = [];
  for (let k = 0; k < rms.length; k++) {
    if (usedVad ? vadSpeech[k] : k < countingEnd) speech.push(rms[k]);
    else if (k >= silenceStart) silence.push(rms[k]);
    else other.push(rms[k]);  // between counting and silence phase (the reaction margin)
  }

  // No usable silence phase (e.g. stopped early): fall back to every non-speech frame.
  return {
    speech,
    noise: silence.length ? silence : other,
    usedVad,
    usedSilencePhase: !!silenceStartTime && silence.length > 0,
  };
}

/**
 * @param {{ frameSec: number, rms: Float32Array, peak: number }} levelFrames - from computeFrames()
 * @param {Array<{ startTime: number, endTime: number }>} speechSegments - VAD segments (Date.now() ms)
 * @param {number} recordingStartTime - Date.now() ms of the recording's first sample
 * @param {number|null} silenceStartTime - Date.now() ms when the "stay silent" prompt appeared
 * @returns {{ snr: number, error: string|null, debugData: object|null }}
 */
export function calculateSNR(levelFrames, speechSegments, recordingStartTime, silenceStartTime) {
  try {
    if (!levelFrames?.rms.length || levelFrames.peak < MUTED_PEAK_LSB) {
      return { snr: 0, error: 'muted', debugData: { peak: levelFrames?.peak ?? null } };
    }

    const { speech, noise, usedVad, usedSilencePhase } =
      classifyFrames(levelFrames, speechSegments, recordingStartTime, silenceStartTime);

    const noiseRms = noise.length ? sortedPercentile(noise, NOISE_PERCENTILE) : 0;
    const signalRms = sortedPercentile(speech.length ? speech : levelFrames.rms, SPEECH_PERCENTILE);
    const debugData = {
      frameSec: levelFrames.frameSec, frames: levelFrames.rms.length, peak: levelFrames.peak,
      usedFallback: !usedVad, usedSilencePhase,
      speechFrames: speech.length, noiseFrames: noise.length,
      signalRms, noiseRms,
    };

    if (noiseRms === 0) return { snr: 100, error: 'no-noise', debugData };
    return { snr: 20 * Math.log10(signalRms / noiseRms), error: null, debugData };

  } catch (error) {
    logger.error("Error analyzing audio SNR:", error);
    return { snr: 0, error: 'processing-error', debugData: null };
  }
}
