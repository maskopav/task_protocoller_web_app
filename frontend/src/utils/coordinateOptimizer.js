// src/utils/coordinateOptimizer.js

/**
 * Rounds landmark x/y/z values to a fixed precision to shrink JSON size
 * without meaningful loss of accuracy (4 decimals ≈ sub-millimeter precision
 * at typical webcam resolutions), and flattens each frame's landmarks from
 * 478 `{x,y,z}` objects into a single flat number array `[x0,y0,z0,x1,...]`.
 * Point i's coordinates live at indices `3*i, 3*i+1, 3*i+2`. Dropping the
 * repeated x/y/z keys roughly halves the raw JSON size before gzip even
 * runs, and avoids allocating 478 objects per frame on both write and read.
 * Frames where no face was found have `landmarks: null` and keep it.
 */
export function roundCoordinateTimeline(timeline, precision = 4) {
  const factor = 10 ** precision;
  const round = (n) => Math.round(n * factor) / factor;

  return timeline.map((frame) => {
    let landmarks = null;
    if (frame.landmarks) {
      landmarks = new Array(frame.landmarks.length * 3);
      frame.landmarks.forEach((point, i) => {
        landmarks[i * 3] = round(point.x);
        landmarks[i * 3 + 1] = round(point.y);
        landmarks[i * 3 + 2] = round(point.z);
      });
    }
    return {
      timestamp: Math.round(frame.timestamp), // ms precision is enough
      // Camera capture time, where the browser reports it (see useVideoRecorder)
      ...(Number.isFinite(frame.captureTimestamp) && { captureTimestamp: Math.round(frame.captureTimestamp) }),
      landmarks,
    };
  });
}

/**
 * Re-lays out a rounded/flattened timeline (array of
 * `{timestamp, landmarks: [x0,y0,z0,x1,...]}` frames) into a columnar,
 * per-landmark time series: `x[i]`/`y[i]`/`z[i]` hold landmark `i`'s value
 * across every frame, contiguously (index `landmarkIndex * frameCount +
 * frameIndex`).
 *
 * This keeps every landmark and axis (no data is dropped), it just reorders
 * them. The point is gzip's compression window: consecutive numbers in the
 * original per-frame layout are different landmarks with unrelated values,
 * but a face barely moves frame-to-frame, so consecutive numbers *within one
 * landmark's own time series* are nearly identical (shared digit prefixes)
 * and compress far better.
 *
 * Returns `null` if the frames don't all share the same landmark count
 * (the model is expected to always emit a fixed topology per detected face,
 * but if that ever isn't true, transposing would silently produce wrong
 * data — callers should fall back to the untransposed shape instead).
 *
 * Frames where the model found no face (`landmarks: null`) are not part of
 * the x/y/z arrays; their times go to `noFaceTimestamps` (and
 * `noFaceCaptureTimestamps`, like captureTimestamps). Every processed frame
 * is thus in one of the two lists; a gap in both means no frame was
 * processed then (camera stall, or idle time on a slow phone).
 */
export function transposeCoordinateTimeline(allFrames) {
  const noFace = allFrames.filter((frame) => !frame.landmarks);
  const noFaceFields = noFace.length > 0 && {
    noFaceTimestamps: noFace.map((frame) => frame.timestamp),
    ...(noFace.some((frame) => Number.isFinite(frame.captureTimestamp)) && {
      noFaceCaptureTimestamps: noFace.map((frame) => (Number.isFinite(frame.captureTimestamp) ? frame.captureTimestamp : null)),
    }),
  };
  const timeline = allFrames.filter((frame) => frame.landmarks);
  const frameCount = timeline.length;
  if (frameCount === 0) {
    return { format: "transposed-v1", frameCount: 0, landmarkCount: 0, timestamps: [], x: [], y: [], z: [], ...noFaceFields };
  }

  const counts = new Map();
  for (const frame of timeline) {
    const count = frame.landmarks.length / 3;
    counts.set(count, (counts.get(count) || 0) + 1);
  }
  const [landmarkCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (counts.size > 1) return null; // inconsistent landmark counts -- unsafe to transpose

  const timestamps = new Array(frameCount);
  const x = new Array(landmarkCount * frameCount);
  const y = new Array(landmarkCount * frameCount);
  const z = new Array(landmarkCount * frameCount);

  for (let f = 0; f < frameCount; f++) {
    timestamps[f] = timeline[f].timestamp;
    const landmarks = timeline[f].landmarks;
    for (let i = 0; i < landmarkCount; i++) {
      const base = i * frameCount + f;
      x[base] = landmarks[i * 3];
      y[base] = landmarks[i * 3 + 1];
      z[base] = landmarks[i * 3 + 2];
    }
  }

  // Camera capture times ride along when any frame has one, index-aligned
  // with timestamps; null for frames without one (e.g. the few frames the
  // timer loop processed during a frame-callback stall, session 583).
  const hasCapture = timeline.some((frame) => Number.isFinite(frame.captureTimestamp));
  return {
    format: "transposed-v1", frameCount, landmarkCount, timestamps,
    ...(hasCapture && {
      captureTimestamps: timeline.map((frame) => (Number.isFinite(frame.captureTimestamp) ? frame.captureTimestamp : null)),
    }),
    ...noFaceFields,
    x, y, z,
  };
}

/**
 * Gzip-compresses a JSON-serializable value using the native
 * CompressionStream API. Falls back to returning uncompressed JSON
 * if the browser doesn't support it (Safari < 16.4, older browsers).
 */
export async function compressJsonToBlob(data) {
  const jsonString = JSON.stringify(data);

  if (typeof CompressionStream === "undefined") {
    // Fallback: no compression support, ship raw JSON
    return {
      blob: new Blob([jsonString], { type: "application/json" }),
      encoding: null,
    };
  }

  const stream = new Blob([jsonString]).stream();
  const compressedStream = stream.pipeThrough(new CompressionStream("gzip"));
  const compressedBlob = await new Response(compressedStream).blob();

  return {
    blob: new Blob([compressedBlob], { type: "application/gzip" }),
    encoding: "gzip",
  };
}

/**
 * Convenience wrapper: round + transpose + compress in one call. Falls back
 * to the untransposed (per-frame) shape if the frames don't share a
 * consistent landmark count -- see transposeCoordinateTimeline().
 */
export async function optimizeCoordinateTimeline(timeline, precision = 4) {
  const rounded = roundCoordinateTimeline(timeline, precision);
  const transposed = transposeCoordinateTimeline(rounded);
  return compressJsonToBlob(transposed ?? rounded);
}