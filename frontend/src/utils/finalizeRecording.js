// utils/finalizeRecording.js
//
// Turns the recorded PCM session into the final WAV Blob, downsampling to
// TARGET_SAMPLE_RATE (see resampleAudio.js) when the device recorded above
// it. Isolated from useVoiceRecorder.js so the resample-or-fallback decision
// is a plain async function that can be unit tested without mounting the
// hook's audio graph (AudioContext/AudioWorklet aren't available outside a
// real browser).
import { getAllSamplesInt16, encodeWAV, buildWAV } from './audioIDB';
import { resampleTo44100, TARGET_SAMPLE_RATE } from './resampleAudio';
import { logger } from './frontendLogger';

/**
 * Builds the final WAV Blob for a completed recording.
 *
 * If resampling fails for any reason (WASM unavailable, a bad output),
 * this falls back to the original native-sample-rate WAV instead of
 * throwing — a resampler bug must never cost the participant's recording.
 */
export async function finalizeRecordingWAV(nativeSampleRate) {
    if (nativeSampleRate <= TARGET_SAMPLE_RATE) {
        return buildWAV(nativeSampleRate);
    }

    try {
        const samples = await getAllSamplesInt16();
        const { samples: resampled, sampleRate } = await resampleTo44100(samples, nativeSampleRate);
        return encodeWAV(resampled, sampleRate);
    } catch (err) {
        logger.error('Resampling failed, falling back to native sample rate WAV', err);
        return buildWAV(nativeSampleRate);
    }
}
