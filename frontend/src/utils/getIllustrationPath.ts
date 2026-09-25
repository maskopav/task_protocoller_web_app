// src/utils/getIllustrationPath.ts

/**
 * Builds a predictable illustration path (without extension) based on task
 * category and its first parameter key/value.
 * Example: phonation -> phoneme "a" => /illustrations/phonation_a
 *
 * No extension is appended because the illustration files on disk aren't
 * consistently encoded (some are .wav, some are .m4a) — the caller resolves
 * the real extension at runtime, see ILLUSTRATION_EXTENSIONS below.
 */
interface EnvImportMeta extends ImportMeta {
  env: {
    BASE_URL: string;
  };
}

// Tried in order against the resolved base path until one responds; see
// resolveIllustrationSrc in Recorder.jsx.
export const ILLUSTRATION_EXTENSIONS = ['m4a', 'wav', 'mp3'];

export function getIllustrationPath(category: string, params: Record<string, any> = {}): string | undefined {
  const keys = Object.keys(params ?? {});
  if (keys.length === 0) return undefined;

  const mainParam = keys[0] as keyof typeof params; // first param
  const value = params[mainParam];
  if (!value) return undefined;

  // Construct a base filename, e.g. "phonation_a"
  const baseName = `${category}_${String(value)}`;
  const basePath = (import.meta as EnvImportMeta).env.BASE_URL || '/';

  // Return just the base path (extension resolved at runtime in Recorder.jsx)
  return `${basePath}audio/illustrations/${baseName}`;
}
