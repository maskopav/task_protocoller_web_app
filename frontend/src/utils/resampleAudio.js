// utils/resampleAudio.js
//
// Downsamples recorded PCM to a fixed target rate before it becomes a WAV
// file, purely to shrink upload size. Uses libsamplerate (compiled to WASM)
// rather than a hand-rolled decimator or the browser's built-in
// OfflineAudioContext resampler:
//   - a naive "drop every Nth sample" decimator does NOT low-pass filter
//     first, so energy above the new Nyquist frequency folds back into the
//     audible band as aliasing distortion (most audible in fricatives/
//     sibilants) — libsamplerate's sinc converters filter before decimating.
//   - the Web Audio API resampler is spec-legal but not spec-defined: two
//     browsers can produce very slightly different output for the same
//     input. libsamplerate gives identical output regardless of browser/OS,
//     which matters when comparing acoustic features across participants
//     recorded on different devices.
//
// Spectral proof that this filters correctly instead of aliasing (white
// noise frequency response, a swept-sine spectrogram, and an above-Nyquist
// tone probe, all run against this exact function): `npm run verify:resample`
// in frontend/, or see scripts/verifyResampleSpectrum.mjs.
// Namespace import + `.default` fallback, not a plain default import: the
// package marks itself `__esModule: true` without actually setting a real
// `default` export. A plain `import X from '...'` follows that flag and
// resolves to `X.default`, which doesn't exist -- verified this throws
// "Cannot destructure property 'create' of 'LibSampleRate' as it is
// undefined" in an actual browser via scripts/verifyRecordingPipelineBrowser.mjs,
// even though the equivalent named-import form worked under Vite's test
// runner (vitest's transform handles this package's shape differently than
// Vite's real dev-server bundling does). `NS.default` covers plain Node
// (always the true `module.exports`, regardless of static export detection);
// `NS` itself covers Vite/browser (where the named exports land directly on
// the namespace object and `.default` is absent). This is the one form
// that's been confirmed working in both.
import * as LibSampleRateNS from '@alexanderolsen/libsamplerate-js';
const { create, ConverterType } = LibSampleRateNS.default || LibSampleRateNS;

// CD-quality / effectively universal — chosen for interoperability with
// downstream audio tooling rather than for maximum size reduction. Native
// capture is 48 kHz on most Chrome/Android devices, so this saves ~8% there;
// devices already recording at <=44.1 kHz (some iOS configs) are untouched.
export const TARGET_SAMPLE_RATE = 44100;

export function int16ToFloat32(int16Samples) {
    const out = new Float32Array(int16Samples.length);
    for (let i = 0; i < int16Samples.length; i++) {
        const s = int16Samples[i];
        out[i] = s < 0 ? s / 0x8000 : s / 0x7fff;
    }
    return out;
}

export function float32ToInt16(float32Samples) {
    const out = new Int16Array(float32Samples.length);
    for (let i = 0; i < float32Samples.length; i++) {
        const s = Math.max(-1, Math.min(1, float32Samples[i]));
        out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
}

/**
 * Resamples mono Int16 PCM down to TARGET_SAMPLE_RATE with anti-aliasing.
 * Never upsamples (that would only add bytes, not information) — returns
 * the input untouched whenever fromSampleRate is already <= target.
 *
 * Throws on failure (WASM load error, unexpected output) rather than
 * swallowing it — the caller decides the fallback (see finalizeRecording.js),
 * so a resampling bug can never silently ship corrupted audio.
 */
export async function resampleTo44100(int16Samples, fromSampleRate) {
    if (!int16Samples || int16Samples.length === 0 || fromSampleRate <= TARGET_SAMPLE_RATE) {
        return { samples: int16Samples, sampleRate: fromSampleRate };
    }

    let converter = null;
    try {
        converter = await create(1, fromSampleRate, TARGET_SAMPLE_RATE, {
            converterType: ConverterType.SRC_SINC_BEST_QUALITY,
        });

        const floatOut = converter.simple(int16ToFloat32(int16Samples));

        // Sanity check: catches a misbehaving/mismatched converter instead of
        // silently shipping a truncated or corrupt recording.
        const expectedLength = Math.round(int16Samples.length * (TARGET_SAMPLE_RATE / fromSampleRate));
        const tolerance = Math.max(64, expectedLength * 0.02);
        if (!floatOut || Math.abs(floatOut.length - expectedLength) > tolerance) {
            throw new Error(
                `Resampled output length ${floatOut?.length} outside expected range (~${expectedLength} +/-${tolerance})`
            );
        }

        return { samples: float32ToInt16(floatOut), sampleRate: TARGET_SAMPLE_RATE };
    } finally {
        // Release WASM-side resources regardless of success/failure.
        if (converter) converter.destroy();
    }
}
