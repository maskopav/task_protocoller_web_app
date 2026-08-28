// utils/flacEncoder.js
//
// Lossless FLAC encoding for the finished recording, in place of raw WAV.
// FLAC decodes back to bit-exact PCM (verified in flacEncoder.test.js via a
// real encode->decode round-trip), it just costs fewer bytes to get there --
// typically 40-60% smaller than WAV for real speech, more for quiet/paused
// recordings, less for noisy ones.
//
// The WASM engine (`window.Flac`) is loaded once, globally, via the <script>
// tags in index.html -- same pattern this app already uses for the Silero VAD
// model (see public/vad/ + useVADLogic.js).
//
// encodeFlac() below talks to Flac's raw C-API functions directly instead of
// importing the library's own `libflacjs/lib/encoder` Encoder class. That
// class is a UMD module whose factory receives `require` as a parameter and
// calls it indirectly (`const data_utils_1 = require("./utils/data-utils")`
// inside the factory body, not as a static top-level `require("literal")`).
// esbuild -- which Vite's dev-server dependency pre-bundler uses -- can't
// statically resolve that indirection and falls back to a runtime stub that
// throws "Dynamic require of './utils/data-utils' is not supported" the
// moment the module loads in a real browser (confirmed with
// scripts/verifyRecordingPipelineBrowser.mjs against a live Vite dev
// server -- it works fine under plain Node, where `require` is real, which
// is why this didn't show up in unit tests until it was checked in an
// actual browser). The handful of raw functions used below have no such
// wrapper and no import of their own, so they don't hit this problem.
const READY_TIMEOUT_MS = 15000;

let runtimePromise = null;

/**
 * Resolves once the global FLAC WASM engine has finished loading.
 * Cached (module-level) so every recording after the first one is instant --
 * the WASM engine only initializes once per page session. Not exported --
 * only encodeFlacBlob() below needs it.
 */
function getFlacRuntime() {
    if (runtimePromise) return runtimePromise;

    runtimePromise = new Promise((resolve, reject) => {
        const flac = window.Flac;
        if (!flac) {
            reject(new Error('window.Flac missing -- check the <script src="/flac/..."> tags in index.html'));
            return;
        }
        if (flac.isReady()) {
            resolve(flac);
            return;
        }

        const timer = setTimeout(() => {
            reject(new Error('Timed out waiting for FLAC WASM engine to become ready'));
        }, READY_TIMEOUT_MS);

        flac.onready = () => {
            clearTimeout(timer);
            resolve(flac);
        };
    });

    // A failed load should not permanently poison future attempts (e.g. a
    // transient network blip fetching the .wasm binary) -- let the next call
    // retry from scratch instead of rejecting forever.
    runtimePromise.catch(() => { runtimePromise = null; });

    return runtimePromise;
}

/**
 * Encodes mono Int16 PCM to a FLAC byte stream using an already-ready engine.
 * Mirrors exactly what libflacjs's own Encoder class does internally (create
 * -> init stream with a write callback -> process_interleaved -> finish ->
 * concatenate the collected chunks -> delete) -- see the comment above for
 * why this doesn't use that class directly. Pure otherwise: no I/O beyond
 * the Flac calls, so it's directly unit-testable by handing it a Flac
 * instance obtained however the environment needs (browser-loaded global
 * here, Node's CJS factory in tests).
 */
export function encodeFlac(flac, int16Samples, sampleRate) {
    const channels = 1;
    const bitsPerSample = 16;
    const compression = 5;
    const verify = true;

    const id = flac.create_libflac_encoder(sampleRate, channels, bitsPerSample, compression, int16Samples.length, verify);
    if (id === 0) {
        throw new Error('Failed to create FLAC encoder');
    }

    try {
        const chunks = [];
        let totalBytes = 0;
        const onWrite = (data) => { chunks.push(data); totalBytes += data.byteLength; };

        const initStatus = flac.init_encoder_stream(id, onWrite);
        if (initStatus !== 0) {
            throw new Error(`Failed to initialize FLAC encoder (status ${initStatus})`);
        }

        const int32 = Int32Array.from(int16Samples);
        const processed = flac.FLAC__stream_encoder_process_interleaved(id, int32, int16Samples.length);
        if (!processed) {
            throw new Error('FLAC encoding failed during process_interleaved');
        }

        const finished = flac.FLAC__stream_encoder_finish(id);
        if (!finished) {
            throw new Error('FLAC encoder failed to finish/flush');
        }

        const bytes = new Uint8Array(totalBytes);
        let offset = 0;
        for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.byteLength;
        }
        return bytes;
    } finally {
        flac.FLAC__stream_encoder_delete(id);
    }
}

/** Convenience wrapper: load the runtime (if needed) and return a ready-to-upload Blob. */
export async function encodeFlacBlob(int16Samples, sampleRate) {
    const flac = await getFlacRuntime();
    const bytes = encodeFlac(flac, int16Samples, sampleRate);
    return new Blob([bytes], { type: 'audio/flac' });
}
