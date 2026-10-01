// utils/finalizeRecording.js
//
// Turns the recorded PCM session into the final upload Blob, always at the
// device's native sample rate, then losslessly encodes it as FLAC
// (flacEncoder.js), falling back to plain WAV of the same samples if that
// fails. Uploading at native rate rather than failing the whole recording --
// an encoder bug must never cost the participant's recording.
//
// Downsampling to TARGET_SAMPLE_RATE (resampleAudio.js's resampleTo44100(),
// still present and tested, just not called here) was measured to be ~95%
// of total post-recording processing time on a real device/browser (see
// scripts/benchmarkProcessingPipelineBrowser.mjs) -- FLAC encoding itself is
// only ~5%. On a weak/budget CPU that dominated the participant-visible
// wait after recording (tens of seconds), for a purely cosmetic bandwidth
// saving (resampling was never a scientific requirement -- see
// resampleAudio.js's own header comment). Dropped entirely rather than
// swapped for a cheaper converter type, since native rate removes the cost
// completely instead of just shrinking it, and also means the ~1.4MB
// libsamplerate WASM chunk is never fetched at all.
//
// Isolated from useVoiceRecorder.js so this decision tree is a plain async
// function that can be unit tested without mounting the hook's audio graph
// (AudioContext/AudioWorklet aren't available outside a real browser).
import { getAllSamplesInt16, encodeWAV } from './audioIDB';
import { encodeFlacBlob } from './flacEncoder';
import { measureLevels } from './audioLevels';
import { logger } from './frontendLogger';

/**
 * Builds the final audio Blob for a completed recording (FLAC when possible,
 * WAV as the fallback), at the device's native sample rate, and measures its
 * signal levels (audioLevels.js) while all samples are in memory anyway.
 * The Blob's `type` tells the uploader which format it got -- see
 * api/recordings.js.
 *
 * @returns {Promise<{ blob: Blob, levels: object }>}
 */
export async function finalizeRecording(nativeSampleRate) {
    const samples = await getAllSamplesInt16();
    const levels = measureLevels(samples, nativeSampleRate);
    return { blob: await encode(samples, nativeSampleRate), levels };
}

async function encode(samples, sampleRate) {
    try {
        return await encodeFlacBlob(samples, sampleRate);
    } catch (err) {
        logger.error('FLAC encoding failed, falling back to WAV', err);
        return encodeWAV(samples, sampleRate);
    }
}
