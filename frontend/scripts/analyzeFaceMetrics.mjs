#!/usr/bin/env node
// scripts/analyzeFaceMetrics.mjs
//
// Simple, beginner-friendly analysis of a recorded coordinates.json /
// coordinates.json.gz timeline (see src/hooks/useVideoRecorder.js +
// src/utils/coordinateOptimizer.js). Answers three basic questions:
//   1. Was a face detected continuously, or were there gaps?
//   2. How much did the head move during the recording?
//   3. Can we see the participant blinking, and how often?
//
// This is a quick sanity-check tool, not a research-grade one: it uses
// simple thresholds and normalized (0-1) landmark distances rather than
// real-world units (cm, degrees), since we don't know the camera's
// distance/field of view from the coordinates alone.
//
// Usage:
//   node frontend/scripts/analyzeFaceMetrics.mjs <file...>

import path from 'node:path';
import { loadTimeline, toPoints } from './lib/coordinateTimeline.mjs';

// MediaPipe FaceLandmarker's 478-point topology -- these indices are fixed
// for as long as we use that model. Six points per eye, in the order the
// EAR (Eye Aspect Ratio) formula expects: [outer corner, top-outer,
// top-inner, inner corner, bottom-inner, bottom-outer].
const RIGHT_EYE = [33, 160, 158, 133, 153, 144];
const LEFT_EYE = [362, 385, 387, 263, 373, 380];

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Eye Aspect Ratio (Soukupová & Čech, 2016): roughly 0.25-0.35 for an open
// eye, drops sharply (below ~0.15-0.2) when the eye closes.
function eyeAspectRatio(points, idx) {
  const [p1, p2, p3, p4, p5, p6] = idx.map((i) => points[i]);
  return (dist(p2, p6) + dist(p3, p5)) / (2 * dist(p1, p4));
}

function centroid(points) {
  let x = 0, y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function analyzeFile(filePath) {
  const frames = loadTimeline(filePath);
  const label = path.basename(filePath);
  console.log(`\n=== ${label} ===`);

  if (frames.length < 2) {
    console.log(`  Only ${frames.length} frame(s) -- not enough data to analyze.`);
    return;
  }

  const pointsPerFrame = frames.map((f) => toPoints(f.landmarks));
  const totalDurationMs = frames[frames.length - 1].timestamp - frames[0].timestamp;

  // --- 1. Face detection coverage ---
  // Every stored frame already has a detected face -- frames where no face
  // was found are never saved (see captureCoordinates() in
  // useVideoRecorder.js). So "was the face detected" shows up as GAPS
  // between frames: a normal gap is one frame's worth of processing time; a
  // much bigger gap means several frames in a row had no face found (or the
  // tab was backgrounded/stalled).
  const LOST_FACE_GAP_MS = 400; // well beyond a single slow inference call
  let lostFaceEvents = 0;
  let lostFaceTimeMs = 0;
  for (let i = 1; i < frames.length; i++) {
    const gap = frames[i].timestamp - frames[i - 1].timestamp;
    if (gap > LOST_FACE_GAP_MS) {
      lostFaceEvents++;
      lostFaceTimeMs += gap;
    }
  }
  const coveragePct = 100 * (1 - lostFaceTimeMs / totalDurationMs);

  console.log(`  Face detection coverage: ${coveragePct.toFixed(1)}% of the recording`);
  if (lostFaceEvents > 0) {
    console.log(
      `    ⚠ ${lostFaceEvents} gap(s) longer than ${LOST_FACE_GAP_MS}ms, totaling ${(
        lostFaceTimeMs / 1000
      ).toFixed(1)}s -- likely moments the face left the frame or wasn't recognized.`
    );
  } else {
    console.log(`    ✓ No large gaps -- the face was tracked continuously.`);
  }

  // --- 2. Head movement ---
  // Tracks the centroid (average position) of all landmarks frame-to-frame.
  // Values are in normalized 0-1 frame units, not centimeters -- 0.02 means
  // "moved about 2% of the frame width/height since the last sample".
  const centroids = pointsPerFrame.map(centroid);
  const stepDistances = [];
  for (let i = 1; i < centroids.length; i++) {
    stepDistances.push(dist(centroids[i], centroids[i - 1]));
  }
  const avgMove = stepDistances.reduce((a, b) => a + b, 0) / stepDistances.length;
  const maxMove = Math.max(...stepDistances);
  const BIG_JUMP_THRESHOLD = 0.02;
  const bigJumps = stepDistances.filter((d) => d > BIG_JUMP_THRESHOLD).length;

  let movementLevel;
  if (avgMove < 0.002) movementLevel = 'very still';
  else if (avgMove < 0.006) movementLevel = 'mostly still';
  else if (avgMove < 0.015) movementLevel = 'moderate movement';
  else movementLevel = 'a lot of movement';

  console.log(`  Head movement (normalized frame units, 0-1):`);
  console.log(`    overall: ${movementLevel} (average per-frame movement: ${avgMove.toFixed(4)})`);
  console.log(`    largest single jump: ${maxMove.toFixed(4)}`);
  console.log(
    `    frames with a big jump (> ${BIG_JUMP_THRESHOLD}): ${bigJumps} (${(
      (100 * bigJumps) / stepDistances.length
    ).toFixed(1)}%)`
  );

  // --- 3. Blinks ---
  // EAR drops sharply when an eye closes. Each recording's own median EAR is
  // used as the "eyes open" baseline (eye shape varies person to person),
  // and a blink is counted whenever EAR dips below 75% of that baseline for
  // a short, blink-like stretch of time (50-500ms).
  const ears = computeEars(pointsPerFrame);
  const openBaseline = median(ears);
  const blinkThreshold = openBaseline * 0.75;

  const MIN_BLINK_MS = 50;
  const MAX_BLINK_MS = 500;
  let blinkCount = 0;
  let inBlink = false;
  let blinkStartMs = 0;
  for (let i = 0; i < frames.length; i++) {
    const closed = ears[i] < blinkThreshold;
    if (closed && !inBlink) {
      inBlink = true;
      blinkStartMs = frames[i].timestamp;
    } else if (!closed && inBlink) {
      inBlink = false;
      const durationMs = frames[i - 1].timestamp - blinkStartMs;
      if (durationMs >= MIN_BLINK_MS && durationMs <= MAX_BLINK_MS) blinkCount++;
    }
  }

  const minutes = totalDurationMs / 60000;
  console.log(`  Blinks:`);
  console.log(`    eyes-open baseline (EAR): ${openBaseline.toFixed(3)}`);
  console.log(`    detected blinks: ${blinkCount} (~${(blinkCount / minutes).toFixed(1)} per minute)`);
  if (blinkCount === 0) {
    console.log(
      `    ⚠ No blinks detected -- could be a very short/still recording, or the EAR threshold not fitting this face. Treat blink count as a rough estimate, not ground truth.`
    );
  }
}

function computeEars(pointsPerFrame) {
  return pointsPerFrame.map(
    (points) => (eyeAspectRatio(points, RIGHT_EYE) + eyeAspectRatio(points, LEFT_EYE)) / 2
  );
}

function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error('Usage: node scripts/analyzeFaceMetrics.mjs <file...>');
    process.exit(1);
  }
  for (const file of files) analyzeFile(file);
}

main();
