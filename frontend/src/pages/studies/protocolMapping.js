// src/pages/studies/protocolMapping.js — backend protocol -> the shape the editor and the preview use.
import { normalizeIdentifiers } from "../../components/Identifiers/IdentifierFields";
import { getProtocolById } from "../../api/protocols";

/**
 * Reverse-maps backend ids (language, task) into a readable protocol object.
 * Returns null when the mappings are not loaded yet.
 */
export function mapProtocolWithNames(raw, mappings) {
  if (!raw || !mappings?.languages || !mappings?.tasks) return null;

  const language = mappings.languages.find((l) => l.id === raw.language_id);
  const mappedTasks = (raw.tasks || []).map((t) => {
    const taskDef = mappings.tasks.find((task) => task.id === t.task_id);
    return {
      ...t.params,
      category: taskDef?.category || `unknown(${t.task_id})`,
      task_order: t.task_order,
    };
  });

  return {
    id: raw.id,
    protocol_group_id: raw.protocol_group_id,
    name: raw.name,
    version: raw.version,
    description: raw.description,
    language: language?.code || "unknown",
    info_text: raw.info_text || "",
    instructions_text: raw.instructions_text || "",
    required_identifiers: normalizeIdentifiers(raw.required_identifiers),
    recordings_file_name: raw.recordings_file_name || null,
    instructions_pdf_url: raw.instructions_pdf_url || null,
    tasks: mappedTasks,
  };
}

/**
 * Loads a saved protocol by id in the shape the preview and the editor draft use.
 * Throws when it cannot be loaded (or the mappings are not ready).
 */
export async function loadMappedProtocol(id, mappings) {
  const mapped = mapProtocolWithNames(await getProtocolById(id), mappings);
  if (!mapped) throw new Error("protocol_load_failed");
  return mapped;
}
