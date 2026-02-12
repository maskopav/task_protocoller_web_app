// src/config/tasksBase.ts

export type RecordingMode =
  | { mode: "basicStop" }
  | { mode: "countDown"; duration: number }
  | { mode: "delayedStop"; duration: number };

export interface TaskParamDef {
  default: any;
  // `values` now optional because they’ll be dynamically extracted from translations
  values?: string[];
}

export interface TaskBase {
  type: "voice" | "camera" | "motoric" | "questionnaire" | "vision"; 
  recording: RecordingMode;
  params: Record<string, TaskParamDef>;
  repeat?: number;
  illustration?: string;
}

// Define all base tasks here (typed)
export const taskBaseConfig: Record<string, TaskBase> = {
  questionnaire: {
    type: "questionnaire", // This allows us to distinguish it in the UI
    recording: { mode: "basicStop" }, // Placeholder (not used, but required by type)
    params: {
      title: { default: "Questionnaire" },
      description: { default: "" },
      questions: { default: [] } // Critical: Must be here to accept the array
    },
  },

  phonation: {
    type: "voice",
    recording: { mode: "delayedStop", duration: 5 },
    params: {
      phoneme: { default: "a" },
      repeat: { default: 1 },
      duration: { default: 5 },
    },
  },

  syllableRepeating: {
    type: "voice",
    recording: { mode: "countDown", duration: 5 },
    params: {
      syllable: { default: "pataka" },
      repeat: { default: 1 },
      duration: { default: 3 },
    },
  },

  retelling: {
    type: "voice",
    recording: { mode: "basicStop"},
    params: {
      fairytale: { default: "snowWhite" },
      repeat: { default: 1 },
    },
  },

  reading: {
    type: "voice",
    recording: { mode: "basicStop" },
    params: {
      topic: { default: "seedling" },
      repeat: { default: 1 },
    },
  },

  monologue: {
    type: "voice",
    recording: { mode: "delayedStop", duration: 10 },
    params: {
      topic: { default: "hobbies" },
      repeat: { default: 1 },
      duration: { default: 10 },
    },
  },

  farnsworthD15: {
    type: "vision",
    recording: { mode: "basicStop" },
    params: {
      randomize: { default: true },
      repeat: { default: 1 },
      showNumbers: { default: "never", values: ["never", "after", "always"] },
    },
  },
  
};
