// src/utils/vadPreload.js
//
// Warms the browser's HTTP cache for the VAD (voice-activity-detection)
// model assets before MicVAD.new() ever needs them (see useVADLogic.js).
//
// The ONNX Runtime WASM binary this pulls in is genuinely large (~9.2MB) and
// the Silero model is ~2.3MB -- on a slow connection or a slow phone, fetching
// that cold is a very plausible multi-second block on its own. Warming both
// into the HTTP cache during the permission/instructions screens (dead time
// the participant is already spending reading) means that network cost is
// already paid by the time recording starts, instead of competing with the
// face-capture loop for the main thread right when it matters most.
//
// This intentionally only prefetches static assets over the network -- it
// does NOT construct a MicVAD instance early, since MicVAD ties its whole
// audio graph (AudioWorkletNode, AudioContext) to the specific MediaStream
// passed at construction time, and there is no live mic stream to give it
// until the participant actually starts recording.

// Same detection used in useVADLogic.js's ortConfig -- kept here too (rather
// than only there) so the asset this file prefetches always matches the one
// onnxruntime-web will actually pick at MicVAD.new() time. Firefox on
// Android is forced onto the baseline (no-SIMD) WASM build to work around a
// SIMD crash on that specific browser/OS combination; every other browser
// gets the SIMD build (this app doesn't set the Cross-Origin-Opener/Embedder
// headers cross-origin isolation requires, so the threaded WASM variants are
// never reachable regardless of device -- no point prefetching those).
export function isFirefoxAndroid(ua = navigator.userAgent) {
    return ua.includes('Firefox') && ua.includes('Android');
}

let vadPreloadPromise = null;

export function preloadVadAssets(basePath = `${import.meta.env.BASE_URL}vad/`) {
    if (vadPreloadPromise) return vadPreloadPromise;

    const wasmFile = isFirefoxAndroid() ? 'ort-wasm.wasm' : 'ort-wasm-simd.wasm';
    const assets = ['silero_vad_v5.onnx', 'vad.worklet.bundle.min.js', wasmFile];

    vadPreloadPromise = Promise.all(
        assets.map((name) => fetch(basePath + name).catch(() => {}))
    );
    return vadPreloadPromise;
}
