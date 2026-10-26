// src/components/ProtocolEditor/snapshot.js
import { normalizeIdentifiers } from "../Identifiers/IdentifierFields";

/** The parts of the editor state that make a protocol "changed". */
export function protocolSnapshot(p, tasks) {
  return JSON.stringify({
    name: p?.name ?? "",
    description: p?.description ?? "",
    language: p?.language ?? "",
    identifiers: normalizeIdentifiers(p?.required_identifiers),
    file: p?.recordings_file_name ?? "",
    info: p?.info_text ?? "",
    instructions: p?.instructions_text ?? "",
    pdf: p?.instructions_pdf_url ?? "",
    tasks,
  });
}
