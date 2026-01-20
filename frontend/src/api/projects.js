// src/api/projects.js
const API_BASE = import.meta.env.VITE_API_BASE;
import { getMappings } from "./mappings";

// Fetch stats for a specific project from the view
// We reuse the generic mappings endpoint since the view is now in the DB
export async function getProjectStats(projectId) {
  try {
    const data = await getMappings(["v_project_summary_stats"]);
    const allStats = data.v_project_summary_stats || [];
    
    // Filter client-side for the specific project
    const projectStats = allStats.find(p => p.project_id === Number(projectId));
    return projectStats || null;
  } catch (err) {
    console.error("Failed to load project stats:", err);
    throw err;
  }
}

export async function fetchProjectsList(userId, role) {
  const params = new URLSearchParams();
  if (userId) params.append("userId", userId);
  if (role) params.append("role", role);

  const res = await fetch(`${API_BASE}/projects/projects-list?${params.toString()}`);
  
  if (!res.ok) throw new Error("Failed to fetch projects");
  return res.json();
}

export async function createProjectApi(payload) {
  const res = await fetch(`${API_BASE}/projects/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to create project");
  return json;
}

export async function updateProjectApi(payload) {
  const res = await fetch(`${API_BASE}/projects/update`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to update project");
  return json;
}