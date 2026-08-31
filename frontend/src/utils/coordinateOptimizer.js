// src/utils/coordinateOptimizer.js

/**
 * Rounds landmark x/y/z values to a fixed precision to shrink JSON size
 * without meaningful loss of accuracy (4 decimals ≈ sub-millimeter precision
 * at typical webcam resolutions), and flattens each frame's landmarks from
 * 478 `{x,y,z}` objects into a single flat number array `[x0,y0,z0,x1,...]`.
 * Point i's coordinates live at indices `3*i, 3*i+1, 3*i+2`. Dropping the
 * repeated x/y/z keys roughly halves the raw JSON size before gzip even
 * runs, and avoids allocating 478 objects per frame on both write and read.
 */
export function roundCoordinateTimeline(timeline, precision = 4) {
  const factor = 10 ** precision;
  const round = (n) => Math.round(n * factor) / factor;

  return timeline.map((frame) => {
    const landmarks = new Array(frame.landmarks.length * 3);
    frame.landmarks.forEach((point, i) => {
      landmarks[i * 3] = round(point.x);
      landmarks[i * 3 + 1] = round(point.y);
      landmarks[i * 3 + 2] = round(point.z);
    });
    return {
      timestamp: Math.round(frame.timestamp), // ms precision is enough
      landmarks,
    };
  });
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
 * Convenience wrapper: round + compress in one call.
 */
export async function optimizeCoordinateTimeline(timeline, precision = 4) {
  const rounded = roundCoordinateTimeline(timeline, precision);
  return compressJsonToBlob(rounded);
}