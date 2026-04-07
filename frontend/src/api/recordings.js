// src/api/recordings.js
const API_BASE = import.meta.env.VITE_API_BASE;

export async function uploadRecording(blob, metadata) {
  const formData = new FormData();
  
  // Append the file
  formData.append("audio", blob, "recording.webm");

  // Append metadata
  formData.append("token", metadata.token);
  formData.append("sessionId", metadata.sessionId);
  formData.append("protocolTaskId", metadata.protocolTaskId);
  formData.append("taskCategory", metadata.taskCategory);
  formData.append("taskOrder", metadata.taskOrder); // The 1-based index in the protocol
  formData.append("duration", metadata.duration);
  formData.append("taskParam", metadata.taskParam);       // e.g. "a", "pataka", "hobbies"
  formData.append("repeatIndex", metadata.repeatIndex);   // 1, 2...
  formData.append("timeStamp", metadata.timeStamp);

  const res = await fetch(`${API_BASE}/recordings/upload`, {
    method: "POST",
    body: formData, // Do not set Content-Type header manually for FormData!
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Upload failed");
  }

  return res.json();
}

export async function uploadMicCheck(blob, metadata) {
  const formData = new FormData();
  
  formData.append("audio", blob, "mic_check.webm");
  formData.append("token", metadata.token);
  formData.append("sessionId", metadata.sessionId);
  formData.append("snrScore", metadata.snrScore);
  formData.append("duration", metadata.duration);
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