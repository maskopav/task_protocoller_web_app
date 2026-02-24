// src/tasks.ts
import { taskBaseConfig, type RecordingMode } from "./config/tasksBase.js"

export interface TaskInstance {
  category: string;
  type: string;
  title?: string;
  instructionsActive?: string;
  recording: RecordingMode;
  params: Record<string, any>;
  useVAD?: boolean;
  repeat?: number;
  illustration?: string;
  _repeatIndex?: number;
  _repeatTotal?: number;
}

/** Factory to create a task instance with overrides */
export function createTask(category: string, overrides: Record<string, any> = {}): TaskInstance {
  const def = taskBaseConfig[category];
  if (!def) throw new Error(`Unknown task category: ${category}`);

  // Compute param values
  const params = Object.fromEntries(
    Object.entries(def.params).map(([k, v]) => [k, overrides[k] ?? v.default])
  );

    // Merge recording config with param-defined duration (if relevant)
    let recording = { ...def.recording };
    if ("duration" in params && "duration" in recording) {
      recording = { ...recording, duration: params.duration };
    }

  // Extract known non-param overrides
  const { title, instructionsActive, illustration} = overrides;

  return {
    category,
    type: def.type,
    title,
    instructionsActive,
    recording: recording,
    params,
    useVAD: overrides.useVAD ?? def.useVAD ?? true,
    repeat: def.repeat ?? params.repeat ?? 1,
    illustration
  };
}

// Example usage: 
export const TASKS = [ 
  createTask("phonation", { phoneme: "a", duration: 3}), 
  createTask("retelling", { fairytale: "snowWhite" }),
  createTask("reading", { topic: "dog"}),
  createTask("monologue", { topic: "any"}),
  createTask("syllableRepeating", { syllable: "ta", repeat: 2, duration: 7})
];
