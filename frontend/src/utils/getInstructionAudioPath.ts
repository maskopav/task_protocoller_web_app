// src/utils/getInstructionAudioPath.ts

interface EnvImportMeta extends ImportMeta {
  env: {
    VITE_APP_BASE_PATH?: string;
    BASE_URL?: string;
  };
}

export function getInstructionAudioPath(
  taskName: string,
  params: Record<string, any> = {},
  repeatIndex: number = 1,
  language: string = 'en'
): string | null {
  if (!taskName) return null;

  const envMeta = (import.meta as EnvImportMeta).env;
  const basePath = envMeta.VITE_APP_BASE_PATH || envMeta.BASE_URL || '/';

  // 1. Handle Repetitions (Generic "Perform the task again" audio)
  if (repeatIndex > 1) {
    return `${basePath}audio/instructions/${language}/repeat.mp3`;
  }

  // 2. Determine base filename (e.g., "sdmt")
  let fileName = taskName;

  // 3. Add parameter suffix if needed (e.g., "phonation_a", "syllableRepeating_pataka")
  const keys = Object.keys(params);
  if (keys.length > 0) {
    // Define which tasks should use parameterized audio instructions
    const paramDependentTasks = ['phonation', 'syllableRepeating', 'retelling', 'reading'];
    
    if (paramDependentTasks.includes(taskName)) {
      const mainParam = keys[0]; // Gets 'phoneme', 'syllable', etc.
      const value = params[mainParam as keyof typeof params];
      if (value) {
        fileName = `${taskName}_${String(value)}`; 
      }
    }
  }

  return `${basePath}audio/instructions/${language}/${fileName}.wav`;
}