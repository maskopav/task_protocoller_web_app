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
  return `${basePath}audio/guide/${language}/${fileName}.m4a`;
}

// getAudioGuidePath.ts
export function getCompletionAudioPath(language: string = 'en'): string {
  return buildAudioGuidePath(language, 'completed');
}

/**
 * Path for a single topic's guide clip within a "dynamic" task (dynamic_monologue,
 * everyday, etc. — any task whose params include an array of topics the user
 * cycles through). Always resolves to `${taskName}_${topicValue}`, independent of
 * whatever other params the task has, so it doesn't share the fragile
 * "first param key wins" logic that getAudioGuidePath() uses for its general clip.
 *
 * Expects a file per topic value, e.g. audio/guide/en/dynamic_monologue_family.m4a
 */
export function getTopicAudioPath(
  taskName: string,
  topicValue: unknown,
  language: string = 'en'
): string | null {
  if (!taskName || topicValue == null || topicValue === '') return null;
  return buildAudioGuidePath(language, `${taskName}_${String(topicValue)}`);
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
    return buildAudioGuidePath(language, 'perform_task_again');
  }

  // 2. Base filename from task
  let fileName = taskName;

  // 3. Parameter-dependent filenames
  const keys = Object.keys(params);
  if (keys.length > 0) {
    const paramDependentTasks = ['phonation', 'syllableRepeating'];
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