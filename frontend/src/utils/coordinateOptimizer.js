// src/utils/coordinateOptimizer.js

/**
 * Rounds landmark x/y/z values to a fixed precision to shrink JSON size
 * without meaningful loss of accuracy (4 decimals ≈ sub-millimeter precision
 * at typical webcam resolutions).
 */
export function roundCoordinateTimeline(timeline, precision = 4) {
  const factor = 10 ** precision;
  const round = (n) => Math.round(n * factor) / factor;

  return timeline.map((frame) => ({
    timestamp: Math.round(frame.timestamp), // ms precision is enough
    landmarks: frame.landmarks.map((point) => ({
      x: round(point.x),
      y: round(point.y),
      z: round(point.z),
    })),
  }));
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