// src/api/recordings.js
import { optimizeCoordinateTimeline } from "../utils/coordinateOptimizer";

const API_BASE = import.meta.env.VITE_API_BASE;

export async function uploadRecording(blob, metadata) {
  const formData = new FormData();
  formData.append("audio", blob, "recording.wav");

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

  const res = await fetch(`${API_BASE}/recordings/upload`, {
    method: "POST",
    body: formData,
  });

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
  
  formData.append("audio", blob, "mic_check.wav");
  formData.append("token", metadata.token);
  formData.append("sessionId", metadata.sessionId);
  formData.append("snrScore", metadata.snrScore);
  formData.append("duration", metadata.duration);
  formData.append("attemptNumber", metadata.attemptNumber);
  // Stringify the JSON array so it travels safely in FormData
  formData.append("speechSegments", JSON.stringify(metadata.speechSegments)); 


  const res = await fetch(`${API_BASE}/recordings/mic-check`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Mic check upload failed");
  }

  return res.json();
}