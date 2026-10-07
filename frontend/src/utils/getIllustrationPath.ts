// src/utils/getIllustrationPath.ts

/**
 * Builds the candidate illustration paths (without extension) based on task
 * category and its first parameter key/value, most specific first:
 *   1. per-language folder, for spoken content (e.g. a retold fairytale)
 *   2. shared root folder, for language-neutral content (phonation, pataka, ...)
 * Example: phonation -> phoneme "a", cs =>
 *   ["/audio/illustrations/cs/phonation_a", "/audio/illustrations/phonation_a"]
 *
 * Which one exists is resolved at runtime in Recorder.jsx, so placing a file
 * in audio/illustrations/<lang>/ is all it takes to make it language-specific.
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

// Tried in order against each candidate path until one responds; see
// resolveExample in Recorder.jsx.
export const ILLUSTRATION_EXTENSIONS = ['m4a', 'wav', 'mp3'];

export function getIllustrationPaths(
  category: string,
  params: Record<string, any> = {},
  language?: string
): string[] | undefined {
  const keys = Object.keys(params ?? {});
  if (keys.length === 0) return undefined;

  const mainParam = keys[0] as keyof typeof params; // first param
  const value = params[mainParam];
  if (!value) return undefined;

  // Construct a base filename, e.g. "phonation_a"
  const baseName = `${category}_${String(value)}`;
  const dir = `${(import.meta as EnvImportMeta).env.BASE_URL || '/'}audio/illustrations/`;

  // Return just the base paths (extension resolved at runtime in Recorder.jsx)
  return language
    ? [`${dir}${language}/${baseName}`, `${dir}${baseName}`]
    : [`${dir}${baseName}`];
}
