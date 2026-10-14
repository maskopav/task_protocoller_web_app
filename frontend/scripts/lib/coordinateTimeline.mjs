// scripts/lib/coordinateTimeline.mjs
//
// Shared helpers for reading a recorded coordinates.json / coordinates.json.gz
// timeline (see src/hooks/useVideoRecorder.js + src/utils/coordinateOptimizer.js),
// used by the various frontend/scripts/analyze*.mjs tools.

import fs from 'node:fs';
import zlib from 'node:zlib';

export function loadTimeline(filePath) {
  const buf = fs.readFileSync(filePath);
  const isGzip = buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b;
  const jsonBuf = isGzip ? zlib.gunzipSync(buf) : buf;
  const data = JSON.parse(jsonBuf.toString('utf8'));
  if (Array.isArray(data)) return data;
  if (data && data.format === 'transposed-v1') return fromTransposed(data);
  throw new Error(`${filePath}: expected a JSON array of frames or a transposed-v1 object, got ${typeof data}`);
}

// Newest recordings (see coordinateOptimizer.js's transposeCoordinateTimeline)
// store landmarks columnar/per-landmark instead of per-frame, to compress
// better. Expands that back into the same [{timestamp, landmarks}, ...]
// shape the older formats use, so every analysis script below only ever
// deals with one shape.
function fromTransposed(data) {
  const { frameCount, landmarkCount, timestamps, x, y, z } = data;
  const frames = new Array(frameCount);
  for (let f = 0; f < frameCount; f++) {
    const landmarks = new Array(landmarkCount * 3);
    for (let i = 0; i < landmarkCount; i++) {
      const base = i * frameCount + f;
      landmarks[i * 3] = x[base];
      landmarks[i * 3 + 1] = y[base];
      landmarks[i * 3 + 2] = z[base];
    }
    frames[f] = { timestamp: timestamps[f], landmarks };
  }
  return frames;
}

// Two on-disk shapes exist: older recordings store landmarks as an array of
// {x,y,z} objects; newer ones (see coordinateOptimizer.js) flatten each
// frame to a single [x0,y0,z0,x1,...] number array to shrink JSON size.
// Normalizes either shape into a common [{x,y,z}, ...] array of points.
export function toPoints(landmarks) {
  if (landmarks.length > 0 && typeof landmarks[0] === 'number') {
    const points = [];
    for (let i = 0; i + 2 < landmarks.length; i += 3) {
      points.push({ x: landmarks[i], y: landmarks[i + 1], z: landmarks[i + 2] });
    }
    return points;
  }
  return landmarks;
}
