// Pure helpers of the recording detail page. Nothing here translates.

const pad = (n) => String(n).padStart(2, "0");

/** A value worth printing: not null/undefined/empty and not the strings "undefined"/"null"/"NaN". */
export function hasValue(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v === "string") {
    const s = v.trim();
    return s !== "" && s !== "undefined" && s !== "null" && s !== "NaN";
  }
  return true;
}

export const shortId = (id) => (id && id.length > 12 ? `${id.slice(0, 8)}…` : id);
export const prettyName = (s) => String(s).replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());

export function fmtDur(s) {
  if (!hasValue(s)) return "";
  const m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${pad(m % 60)} min` : `${m} min ${pad(Math.round(s % 60))} s`;
}
export function fmtClock(sec) {
  const m = Math.floor(sec / 60);
  return `${m}:${pad(Math.round(sec % 60))}`;
}
export function fmtBytes(b) {
  if (!hasValue(b)) return "";
  if (b > 1e9) return `${(b / 1e9).toFixed(2)} GB`;
  if (b > 1e6) return `${(b / 1e6).toFixed(1)} MB`;
  return `${Math.round(b / 1e3)} kB`;
}

/** The session end; processedAt when the app never wrote endedAt (crash recovery). */
export const endOf = (row) => row.endedAt || row.processedAt;

/** Delay between the end of the session and its upload, as {unit, n}, or null. */
export function lagParts(row) {
  const h = (new Date(row.receivedAt) - new Date(endOf(row))) / 3600e3;
  if (!Number.isFinite(h)) return null;
  if (h < 1) return { unit: "min", n: Math.max(0, Math.round(h * 60)) };
  if (h < 48) return { unit: "h", n: Math.round(h) };
  return { unit: "days", n: Math.round(h / 24) };
}

/** "48 kHz · 16-bit · mono" from a capture format, skipping whatever is missing. */
export function audioFormatParts(fmt, monoLabel, channelsLabel) {
  if (!fmt) return "";
  const parts = [];
  if (hasValue(fmt.sampleRate)) parts.push(`${+(fmt.sampleRate / 1000).toFixed(1)} kHz`);
  if (hasValue(fmt.bits)) parts.push(`${fmt.bits}-bit`);
  if (hasValue(fmt.channels)) parts.push(fmt.channels === 1 ? monoLabel : channelsLabel(fmt.channels));
  return parts.join(" · ");
}

/** "75 %" or "75 % → 80 %" for the mic uses that report a gain; "" when none does (F-035). */
export function gainText(micUses = []) {
  const gains = micUses.map((m) => m?.inputGainPercent).filter((g) => typeof g === "number" && Number.isFinite(g));
  return gains.length ? gains.map((g) => `${g} %`).join(" → ") : "";
}

/** "1920×1080 · 30 fps" from a camera capture format, skipping whatever is missing. */
export function videoFormatText(fmt) {
  if (!fmt) return "";
  const parts = [];
  if (hasValue(fmt.width) && hasValue(fmt.height)) parts.push(`${fmt.width}×${fmt.height}`);
  if (hasValue(fmt.fps)) parts.push(`${fmt.fps} fps`);
  return parts.join(" · ");
}

/**
 * Questionnaire answers as rows of {key, question, answer, resolved}.
 * `texts` maps question keys and option keys to text (from the session's protocol snapshot).
 * The internal key is the fallback only where the text is missing (F-040).
 */
export function answerRows(answers, texts = {}) {
  const lookup = (k) => (typeof texts[k] === "string" && texts[k] !== "" ? texts[k] : null);
  return Object.entries(answers || {}).map(([key, value]) => {
    const values = [].concat(value ?? []).filter((v) => hasValue(v));
    return {
      key,
      question: lookup(key) ?? key,
      answer: values.map((v) => lookup(String(v)) ?? String(v)).join(", "),
      resolved: lookup(key) !== null,
    };
  });
}
