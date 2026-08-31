// utils/finalizeRecording.js
//
// Turns the recorded PCM session into the final upload Blob:
//   1. downsample to TARGET_SAMPLE_RATE if the device recorded above it
//      (resampleAudio.js), falling back to the native rate if that fails.
//   2. losslessly encode the result as FLAC (flacEncoder.js) for the upload,
//      falling back to plain WAV of the same samples if that fails.
// Both steps degrade independently rather than failing the whole recording --
// a resampler or encoder bug must never cost the participant's recording.
//
// Isolated from useVoiceRecorder.js so this decision tree is a plain async
// function that can be unit tested without mounting the hook's audio graph
// (AudioContext/AudioWorklet aren't available outside a real browser).
import { getAllSamplesInt16, encodeWAV } from './audioIDB';
import { resampleTo44100, TARGET_SAMPLE_RATE } from './resampleAudio';
import { encodeFlacBlob } from './flacEncoder';
import { logger } from './frontendLogger';

async function pcmAtTargetRate(nativeSampleRate) {
    const samples = await getAllSamplesInt16();
    if (nativeSampleRate <= TARGET_SAMPLE_RATE) {
        return { samples, sampleRate: nativeSampleRate };
    }
    try {
        return await resampleTo44100(samples, nativeSampleRate);
    } catch (err) {
        logger.error('Resampling failed, keeping native sample rate', err);
        return { samples, sampleRate: nativeSampleRate };
    }
}

/**
 * Builds the final audio Blob for a completed recording (FLAC when possible,
 * WAV as the fallback). The Blob's `type` tells the uploader which one it got
 * -- see api/recordings.js.
 */
export async function finalizeRecording(nativeSampleRate) {
    const { samples, sampleRate } = await pcmAtTargetRate(nativeSampleRate);

    try {
        return await encodeFlacBlob(samples, sampleRate);
    } catch (err) {
        logger.error('FLAC encoding failed, falling back to WAV', err);
        return encodeWAV(samples, sampleRate);
    }
}
