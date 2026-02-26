// src/utils/getIllustrationPath.ts

/**
 * Builds a predictable illustration path based on task category and its first parameter key/value.
 * Example: phonation -> phoneme "a" => /illustrations/phonation_a.mp3
 */
interface EnvImportMeta extends ImportMeta {
  env: {
    BASE_URL: string;
  };
}

export function getIllustrationPath(category: string, params: Record<string, any>): string | undefined {
  const keys = Object.keys(params);
  if (keys.length === 0) return undefined;

  const mainParam = keys[0] as keyof typeof params; // first param
  const value = params[mainParam];
  if (!value) return undefined;

  // Construct a base filename, e.g. "phonation_a"
  const baseName = `${category}_${String(value)}`;
  const basePath = (import.meta as EnvImportMeta).env.BASE_URL || '/';

  // Return just the base path (actual existence check will happen in VoiceRecorder)
  return `${basePath}audio/illustrations/${baseName}.mp3`;
}
