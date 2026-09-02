#!/usr/bin/env node
// scripts/analyzeCoordinateFps.mjs
//
// Standalone analysis of a recorded coordinates.json (or coordinates.json.gz)
// file produced by the face-landmark capture pipeline (see
// src/hooks/useVideoRecorder.js + src/utils/coordinateOptimizer.js). Computes
// the ACTUAL achieved capture rate and jitter from the per-frame
// performance.now() timestamps that are already stored on every recording --
// the nominal FRAME_RATE_MS is only a scheduling target, not a guarantee
// (detectForVideo is synchronous and the next setTimeout is only scheduled
// after it returns), so this is the source of truth for "what frame rate did
// this device actually manage."
//
// Also runs a few structural sanity checks on the landmark data itself
// (missing/NaN coordinates, out-of-range values, non-monotonic timestamps,
// inconsistent landmark counts, frozen/duplicate frames) since a device that
// silently drops or corrupts frames wouldn't necessarily show up as a bad
// fps number.
//
// Usage:
//   node frontend/scripts/analyzeCoordinateFps.mjs <file...> [--target-ms=33] 
//
// Accepts one or more coordinates.json / coordinates.json.gz files -- e.g.
// the ones the backend writes to DATA_PATH as S..._D....json, or a raw
// download from the VideoRecorderTest page. Gzip is auto-detected from the
// file's magic bytes. Passing several files (e.g. one per test device) also
// prints a comparison summary at the end.

import path from 'node:path';
import { loadTimeline, toPoints } from './lib/coordinateTimeline.mjs';

function parseArgs(argv) {
  const files = [];
  let targetMs = 33;
  for (const arg of argv) {
    if (arg.startsWith('--target-ms=')) {
      targetMs = Number(arg.slice('--target-ms='.length));
    } else {
      files.push(arg);
    }
  }
  return { files, targetMs };
}

function percentile(sorted, p) {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}

function analyzeFile(filePath, targetMs) {
  const frames = loadTimeline(filePath);
  const label = path.basename(filePath);

  console.log(`\n=== ${label} ===`);

  if (frames.length < 2) {
    console.log(`  Only ${frames.length} frame(s) -- not enough data to analyze.`);
    return { label };
  }

  // --- FPS / timing ---
  const intervals = [];
  let nonMonotonic = 0;
  for (let i = 1; i < frames.length; i++) {
    const dt = frames[i].timestamp - frames[i - 1].timestamp;
    if (dt <= 0) nonMonotonic++;
    intervals.push(dt);
  }

  const durationMs = frames[frames.length - 1].timestamp - frames[0].timestamp;
  const avgFps = (frames.length - 1) / (durationMs / 1000);
  const sortedIntervals = [...intervals].sort((a, b) => a - b);
  const median = percentile(sortedIntervals, 0.5);
  const p95 = percentile(sortedIntervals, 0.95);
  const min = sortedIntervals[0];
  const max = sortedIntervals[sortedIntervals.length - 1];
  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const variance = intervals.reduce((a, b) => a + (b - mean) ** 2, 0) / intervals.length;
  const stddev = Math.sqrt(variance);

  // Frames whose gap to the previous frame is > 1.5x the requested interval --
  // a rough proxy for "the loop fell behind schedule here" (slow inference,
  // GC pause, tab backgrounding, thermal throttling), distinct from ordinary jitter.
  // Recorded with their offset into the recording (not just a raw count) so
  // periodicity -- e.g. a stall landing near-exactly once per second, which
  // points at a 1Hz UI timer competing for the main thread rather than plain
  // inference slowness -- can be confirmed directly instead of guessed at
  // from a coincidental count/duration ratio.
  const stallThreshold = targetMs * 1.5;
  const stallEvents = [];
  for (let i = 1; i < frames.length; i++) {
    const dt = intervals[i - 1];
    if (dt > stallThreshold) {
      stallEvents.push({ offsetMs: frames[i].timestamp - frames[0].timestamp, gapMs: dt });
    }
  }
  const stalls = stallEvents.length;

  // stddev over ALL intervals is dominated by the rare huge stalls (a single
  // multi-second freeze swamps the variance) and ends up saying almost
  // nothing about how smooth a normal frame-to-frame gap is. Recomputing it
  // with stalls excluded gives the jitter a device has during ordinary frames.
  const nonStallIntervals = intervals.filter((dt) => dt <= stallThreshold);
  const nsMean = nonStallIntervals.reduce((a, b) => a + b, 0) / (nonStallIntervals.length || 1);
  const nsStddev = Math.sqrt(
    nonStallIntervals.reduce((a, b) => a + (b - nsMean) ** 2, 0) / (nonStallIntervals.length || 1)
  );

  // Severity split: a 55ms hiccup (mild inference slowness) and a 3.6s freeze
  // (more likely a UI re-render + GC pause, or the tab briefly losing focus)
  // are different phenomena with different causes -- collapsing them into one
  // "stalls" count hides that difference.
  const severity = { mild: 0, moderate: 0, severe: 0 };
  for (const e of stallEvents) {
    if (e.gapMs > 500) severity.severe++;
    else if (e.gapMs > 150) severity.moderate++;
    else severity.mild++;
  }

  console.log(`  Frames: ${frames.length}   Duration: ${(durationMs / 1000).toFixed(2)}s`);
  console.log(`  Average FPS: ${avgFps.toFixed(2)}  (target: ${(1000 / targetMs).toFixed(2)} fps @ ${targetMs}ms)`);
  console.log(`  Frame interval -- min: ${min.toFixed(1)}ms  median: ${median.toFixed(1)}ms  p95: ${p95.toFixed(1)}ms  max: ${max.toFixed(1)}ms`);
  console.log(`  Jitter (stddev, all frames): ${stddev.toFixed(1)}ms`);
  console.log(`  Jitter (stddev, stalls excluded): ${nsStddev.toFixed(1)}ms  <- typical smoothness, not skewed by rare freezes`);
  console.log(`  Stalls (> ${stallThreshold.toFixed(0)}ms gap): ${stalls} (${((100 * stalls) / intervals.length).toFixed(1)}% of frames)`);
  if (stalls > 0) {
    console.log(
      `    by severity -- mild (${stallThreshold.toFixed(0)}-150ms): ${severity.mild}   moderate (150-500ms): ${severity.moderate}   severe (>500ms): ${severity.severe}`
    );
  }
  if (nonMonotonic > 0) {
    console.log(`  ⚠ Non-monotonic timestamps: ${nonMonotonic}`);
  }
  if (stalls >= 2) {
    printStallPeriodicity(stallEvents);
  }

  // --- Landmark sanity checks ---
  const counts = new Map();
  let nanOrMissing = 0;
  let outOfRange = 0;
  let duplicateFrames = 0;
  let prevPoints = null;

  for (const frame of frames) {
    const lm = frame.landmarks;
    if (!Array.isArray(lm)) {
      nanOrMissing++;
      prevPoints = null;
      continue;
    }
    const points = toPoints(lm);
    counts.set(points.length, (counts.get(points.length) || 0) + 1);

    let frameBad = false;
    for (const point of points) {
      const { x, y, z } = point || {};
      if (![x, y, z].every((v) => typeof v === 'number' && Number.isFinite(v))) {
        frameBad = true;
        continue;
      }
      // MediaPipe's normalized x/y are nominally [0,1]; a bit of overshoot is
      // normal when the face is partway out of frame, but far outside that
      // range means something upstream is wrong, not just "near the edge".
      if (x < -0.5 || x > 1.5 || y < -0.5 || y > 1.5) outOfRange++;
    }
    if (frameBad) nanOrMissing++;

    if (prevPoints && points.length === prevPoints.length) {
      const identical = points.every(
        (p, i) => p.x === prevPoints[i].x && p.y === prevPoints[i].y && p.z === prevPoints[i].z
      );
      if (identical) duplicateFrames++;
    }
    prevPoints = points;
  }

  const [modeCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] || [0, 0];
  const inconsistentCounts = [...counts.entries()].filter(([count]) => count !== modeCount);

  console.log(`  Landmarks per frame: ${modeCount} (mode)`);
  if (inconsistentCounts.length > 0) {
    console.log(
      `  ⚠ Frames with a different landmark count: ${inconsistentCounts
        .map(([c, n]) => `${n}× ${c} points`)
        .join(', ')}`
    );
  }
  if (nanOrMissing > 0) console.log(`  ⚠ Frames with NaN/missing coordinates: ${nanOrMissing}`);
  if (outOfRange > 0) console.log(`  ⚠ Points far outside [0,1] normalized range: ${outOfRange}`);
  if (duplicateFrames > 0)
    console.log(`  ⚠ Consecutive frames with identical landmarks (possible repeat/freeze): ${duplicateFrames}`);
  if (inconsistentCounts.length === 0 && nanOrMissing === 0 && outOfRange === 0 && duplicateFrames === 0) {
    console.log(`  ✓ No sanity-check issues found.`);
  }

  return { label, avgFps, median, p95, stalls };
}

// Checks whether stalls recur at a regular period (e.g. once per second,
// consistent with a 1Hz UI timer competing for the main thread) rather than
// happening at random moments (consistent with generic inference slowness or
// GC noise). Two independent signals:
//   1. Spacing between consecutive stalls -- tight clustering around one
//      value (low stddev relative to the median) suggests a fixed-rate cause.
//   2. Each stall's offset modulo 1000ms -- if stalls are phase-locked to a
//      1-second clock, these residuals cluster tightly; if unrelated to any
//      1Hz timer, they'd be spread ~uniformly across [0, 1000), which has a
//      known stddev of ~288.7ms to compare against.
function printStallPeriodicity(stallEvents) {
  const spacings = [];
  for (let i = 1; i < stallEvents.length; i++) {
    spacings.push(stallEvents[i].offsetMs - stallEvents[i - 1].offsetMs);
  }
  const sortedSpacings = [...spacings].sort((a, b) => a - b);
  const spacingMedian = percentile(sortedSpacings, 0.5);
  const spacingMean = spacings.reduce((a, b) => a + b, 0) / spacings.length;
  const spacingStddev = Math.sqrt(
    spacings.reduce((a, b) => a + (b - spacingMean) ** 2, 0) / spacings.length
  );

  const residuals = stallEvents.map((e) => e.offsetMs % 1000);
  const residualMean = residuals.reduce((a, b) => a + b, 0) / residuals.length;
  const residualStddev = Math.sqrt(
    residuals.reduce((a, b) => a + (b - residualMean) ** 2, 0) / residuals.length
  );
  const UNIFORM_1S_STDDEV = 288.7; // stddev of a uniform distribution over [0, 1000)

  console.log(`  Stall periodicity:`);
  console.log(
    `    spacing between stalls -- median: ${spacingMedian.toFixed(0)}ms  stddev: ${spacingStddev.toFixed(0)}ms`
  );
  console.log(
    `    offset mod 1000ms -- stddev: ${residualStddev.toFixed(0)}ms (uniform/random would be ~${UNIFORM_1S_STDDEV}ms)`
  );
  if (residualStddev < UNIFORM_1S_STDDEV * 0.5 && Math.abs(spacingMedian - 1000) < 150) {
    console.log(
      `    ⚠ Stalls look phase-locked to a ~1-second clock -- check for a setInterval(..., 1000) or similar` +
        ` 1Hz timer running concurrently (e.g. a recording-time UI update) rather than treating this as generic` +
        ` inference slowness.`
    );
  }

  const preview = stallEvents.slice(0, 20);
  console.log(`  First ${preview.length} stall(s) (offset into recording -> gap size):`);
  for (const e of preview) {
    console.log(`    ${(e.offsetMs / 1000).toFixed(2)}s -> +${e.gapMs.toFixed(0)}ms`);
  }
  if (stallEvents.length > preview.length) {
    console.log(`    ... ${stallEvents.length - preview.length} more`);
  }
}

function main() {
  const { files, targetMs } = parseArgs(process.argv.slice(2));
  if (files.length === 0) {
    console.error('Usage: node scripts/analyzeCoordinateFps.mjs <file...> [--target-ms=33]');
    process.exit(1);
  }

  const results = files.map((f) => analyzeFile(f, targetMs));

  if (results.length > 1) {
    console.log('\n=== Summary ===');
    for (const r of results) {
      if (r.avgFps === undefined) continue;
      console.log(
        `  ${r.label.padEnd(30)} ${r.avgFps.toFixed(1).padStart(6)} fps avg   median ${r.median.toFixed(
          1
        )}ms   p95 ${r.p95.toFixed(1)}ms   stalls ${r.stalls}`
      );
    }
  }
}

main();
