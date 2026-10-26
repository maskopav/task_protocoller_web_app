// src/components/ProtocolEditor/paramText.js — parameter values as text (booleans read Yes/No, F-007).
import { yesNo } from "../../pages/studies/studyHelpers";

/** One parameter value as text for the summary line of a task row. */
export function paramText(value, t) {
  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === "object" ? v.label || v.topicDescription : v)).join("; ");
  }
  const shown = yesNo(value, t);
  return shown === undefined || shown === null ? "" : String(shown);
}

/** The default of one parameter as text: option labels, lists joined, booleans as Yes/No (F-007). */
export function defaultLabel(p, val, t) {
  if (Array.isArray(val)) {
    return val.map((vKey) => p.values?.find((v) => v.key === vKey)?.label || vKey).join("; ");
  }
  const labelled = p.values?.find((v) => v.key === val)?.label;
  if (labelled) return labelled;
  const shown = yesNo(val, t);
  return shown === undefined || shown === null ? "" : String(shown);
}
