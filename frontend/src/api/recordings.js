// src/api/recordings.js
import { optimizeCoordinateTimeline } from "../utils/coordinateOptimizer";

const API_BASE = import.meta.env.VITE_API_BASE;

// fetch() has no built-in timeout, so on a slow/stalled connection an upload
// would otherwise hang indefinitely -- bound it so callers get a predictable
// failure to retry on instead of an unresponsive-looking request.
//
// The timeout scales with payload size rather than a flat cap: this app
// records mono PCM at 44.1kHz (~86 KB/s raw before FLAC), so a multi-minute
// task recording can legitimately be several MB. A flat short timeout would
// abort an upload that's slow-but-actually-progressing on every attempt,
// which is worse than the freeze this is meant to fix -- it would never
// complete instead of just being slow. BASE covers connection setup/latency;
// MS_PER_MB assumes a conservative ~65 KB/s sustained "slow but working"
// mobile connection; MAX is the point past which we treat it as stalled and
// hand off to the retry loop (flushPendingRecordings) instead.
const UPLOAD_TIMEOUT_BASE_MS   = 10_000;
const UPLOAD_TIMEOUT_MS_PER_MB = 15_000;
const UPLOAD_TIMEOUT_MAX_MS    = 300_000;

export function computeUploadTimeoutMs(payloadBytes) {
  const mb = payloadBytes / (1024 * 1024);
  return Math.min(UPLOAD_TIMEOUT_MAX_MS, UPLOAD_TIMEOUT_BASE_MS + mb * UPLOAD_TIMEOUT_MS_PER_MB);
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(`Upload timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// finalizeRecording() returns FLAC when encoding succeeds, WAV as its
// fallback -- the blob's own MIME type says which, so the filename follows
// it instead of assuming. (The backend re-derives the real extension from
// the file's magic bytes regardless -- see recordingController.js.)
function audioFilename(blob, base) {
  return blob.type === "audio/flac" ? `${base}.flac` : `${base}.wav`;
}

export async function uploadRecording(blob, metadata) {
  const formData = new FormData();
  formData.append("audio", blob, audioFilename(blob, "recording"));

  let coordsBlob = null;
  let encoding = null;

  if (metadata.videoData && metadata.videoData.length > 0) {
    const result = await optimizeCoordinateTimeline(metadata.videoData, 4);
    coordsBlob = result.blob;
    encoding = result.encoding;

    const filename = encoding === "gzip" ? "coordinates.json.gz" : "coordinates.json";
    formData.append("coordinates", coordsBlob, filename);
    if (encoding) formData.append("coordinatesEncoding", encoding);
  }

  formData.append("token", metadata.token);
  formData.append("sessionId", metadata.sessionId);
  formData.append("protocolTaskId", metadata.protocolTaskId);
  formData.append("taskCategory", metadata.taskCategory);
  formData.append("taskOrder", metadata.taskOrder);
  formData.append("duration", metadata.duration);
  formData.append("taskParam", metadata.taskParam);
  formData.append("repeatIndex", metadata.repeatIndex);
  formData.append("timeStamp", metadata.timeStamp);

  console.log("Audio blob size:", (blob.size / 1024 / 1024).toFixed(2), "MB");
  if (coordsBlob) {
    console.log("Coordinates blob size:", (coordsBlob.size / 1024).toFixed(1), "KB", "encoding:", encoding);
  }

  let totalSize = 0;
  for (const pair of formData.entries()) {
    if (pair[1] instanceof Blob) totalSize += pair[1].size;
  }
  console.log("Total FormData payload:", (totalSize / 1024 / 1024).toFixed(2), "MB");

  const res = await fetchWithTimeout(`${API_BASE}/recordings/upload`, {
    method: "POST",
    body: formData,
  }, computeUploadTimeoutMs(totalSize));

  if (!res.ok) {
    let errMessage = "Upload failed";
    try {
      const err = await res.json();
      errMessage = err.error || errMessage;
    } catch {
      const text = await res.text();
      console.error("Non-JSON error response:", text.slice(0, 200));
    }
    throw new Error(errMessage);
  }

  return res.json();
}

export async function uploadMicCheck(blob, metadata) {
  const formData = new FormData();
  
  formData.append("audio", blob, audioFilename(blob, "mic_check"));
  formData.append("token", metadata.token);
  formData.append("sessionId", metadata.sessionId);
  formData.append("snrScore", metadata.snrScore);
  formData.append("duration", metadata.duration);
  formData.append("attemptNumber", metadata.attemptNumber);
  // Stringify the JSON array so it travels safely in FormData
  formData.append("speechSegments", JSON.stringify(metadata.speechSegments)); 


  const res = await fetchWithTimeout(`${API_BASE}/recordings/mic-check`, {
    method: "POST",
    body: formData,
  }, computeUploadTimeoutMs(blob.size));

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Mic check upload failed");
  }

  return res.json();
}