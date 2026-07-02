// src/utils/getAudioGuidePath.ts

interface EnvImportMeta extends ImportMeta {
  env: {
    VITE_APP_BASE_PATH?: string;
    BASE_URL?: string;
  };
}

type AudioGuideParams = Record<string, unknown>;

function getBasePath(): string {
  const envMeta = (import.meta as EnvImportMeta).env;
  return envMeta.VITE_APP_BASE_PATH || envMeta.BASE_URL || '/';
}

export function buildAudioGuidePath(
  language: string,
  fileName: string
): string {
  const basePath = getBasePath();
  return `${basePath}audio/guide/${language}/${fileName}.wav`;
}

// getAudioGuidePath.ts
export function getCompletionAudioPath(language: string = 'en'): string {
  return buildAudioGuidePath(language, 'completed');
}

export function getAudioGuidePath(
  taskName: string,
  params: AudioGuideParams = {},
  repeatIndex: number = 1,
  language: string = 'en'
): string | null {
  if (!taskName) return null;

  // 1. Handle repetitions (generic "repeat" audio)
  if (repeatIndex > 1) {
    return buildAudioGuidePath(language, 'repeat');
  }

  // 2. Base filename from task
  let fileName = taskName;

  // 3. Parameter-dependent filenames
  const keys = Object.keys(params);
  if (keys.length > 0) {
    const paramDependentTasks = ['phonation', 'syllableRepeating', 'retelling', 'reading'];
    if (paramDependentTasks.includes(taskName)) {
      const mainParamKey = keys[0];
      const value = params[mainParamKey as keyof typeof params];
      if (value != null) {
        fileName = `${taskName}_${String(value)}`;
      }
    }
  }

  return buildAudioGuidePath(language, fileName);
}