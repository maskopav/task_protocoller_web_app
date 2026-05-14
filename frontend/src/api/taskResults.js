// src/api/taskResults.js
const API_BASE = import.meta.env.VITE_API_BASE;

export async function saveTaskResult(data) {
  const res = await fetch(`${API_BASE}/task-results/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to save task result");
  return res.json();
}