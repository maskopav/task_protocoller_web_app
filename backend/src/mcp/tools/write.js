// src/mcp/tools/write.js — the v1 write tools (docs/mcp/01_spec.md sections 4, 6).
// Comments and QC go straight through the existing controllers (with their
// audit and system notes). Protocol writes are previewed first and need
// confirm: true, because a saved protocol reaches every computer at the
// clinics running the study.
import { z } from "zod";
import { addComment, putQc, QCS } from "../../controllers/uploadController.js";
import { saveProtocol } from "../../controllers/protocolController.js";
import { copyFromLibrary } from "../../controllers/libraryController.js";
import { previewProtocolSave, checkBaseVersion, previewLibraryCopy } from "../protocolPreview.js";
import * as shape from "../shape.js";

const id = z.number().int().positive().max(2147483647);
const sessionId = z.string().regex(/^[0-9a-f]{32}$/).describe("Recording id: 32 lowercase hex characters");
const html = z.string().max(200000);

const task = z.object({
  task_id: id.describe("Task kind from list_task_catalog"),
  task_order: z.number().int().positive().max(10000).optional(),
  params: z.record(z.string(), z.unknown()).optional().describe("Task parameters, as in get_protocol"),
  contents: z.array(z.object({ type: z.string().max(50), html })).max(50).optional(),
});

export function writeTools({ call }) {
  return [
    {
      name: "add_recording_comment",
      description: "Add a staff comment to a recording you may review. Comments must not contain names, birth dates or any other identifying details of the participant.",
      input: { session_id: sessionId, text: z.string().min(1).max(2000) },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      run: async (admin, a) => {
        const r = await call(addComment, { admin, params: { sessionId: a.session_id }, body: { text: a.text } });
        return r.status === 201 ? { status: 201, body: shape.comments([r.body])[0] ?? null } : r;
      },
    },
    {
      name: "set_recording_qc",
      description: "Set a recording's review status: unreviewed, ok, review (needs review) or excluded. Recorded in the recording's history.",
      input: { session_id: sessionId, qc: z.enum(QCS) },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      run: async (admin, a) => {
        const r = await call(putQc, { admin, params: { sessionId: a.session_id }, body: { qc: a.qc } });
        return r.status === 200 ? { status: 200, body: { qc: r.body.qc, comments: shape.comments(r.body.comments) } } : r;
      },
    },
    {
      name: "save_protocol",
      description:
        "Create a protocol in a study you edit, or save a new version of one (pass protocol_group_id). " +
        "Saving goes live: every computer at the clinics running the study receives it on its next config refresh. " +
        "Without confirm: true this only previews (validation, diff, affected clinics) and writes nothing. " +
        "Always show the preview to the user before confirming. Read get_protocol first and send the complete protocol, not just the changes.",
      input: {
        study_id: id.optional().describe("The study. Omit only to save a new version of a library entry you authored."),
        protocol_group_id: id.optional().describe("Existing protocol group: saves a new version. Omit to create a new protocol."),
        name: z.string().min(1).max(100),
        language_ids: z.array(id).min(1).max(20).describe("Languages; the first is the one these texts are in. Others keep their translations."),
        description: z.string().max(5000).optional(),
        tasks: z.array(task).min(1).max(200),
        randomization: z.record(z.string(), z.unknown()).optional(),
        required_identifiers: z.array(z.union([z.string().max(100), z.object({ name: z.string().max(100) }).passthrough()])).max(50).optional()
          .describe("Identifier field names the computer asks for (names only, never values)"),
        info_text: html.optional(),
        instructions_text: html.optional(),
        use_audio_guide: z.boolean().optional(),
        recordings_file_name: z.string().max(255).optional(),
        instructions_pdf_url: z.string().max(2000).optional(),
        confirm: z.boolean().optional().describe("true writes. Leave out to preview."),
        base_version: z.number().int().positive().optional().describe("Required with confirm when editing: baseVersion from the preview"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
      run: async (admin, a) => {
        const body = {
          project_id: a.study_id ?? null,
          protocol_group_id: a.protocol_group_id,
          editingMode: !!a.protocol_group_id,
          name: a.name,
          language_id: a.language_ids,
          description: a.description,
          tasks: a.tasks,
          randomization: a.randomization,
          required_identifiers: a.required_identifiers,
          info_text: a.info_text,
          instructions_text: a.instructions_text,
          use_audio_guide: a.use_audio_guide,
          recordings_file_name: a.recordings_file_name,
          instructions_pdf_url: a.instructions_pdf_url,
        };
        if (!a.confirm) return previewProtocolSave(admin, body, call);
        if (a.protocol_group_id && a.base_version == null) return { status: 400, body: { error: "base_version_required" } };
        const stale = await checkBaseVersion(body, a.base_version);
        if (stale) return stale;
        const r = await call(saveProtocol, { admin, body });
        return r.status === 200 ? { status: 200, body: { saved: true, protocolId: r.body.protocol_id } } : r;
      },
    },
    {
      name: "copy_library_protocol",
      description:
        "Copy a library entry into a study you edit, as a new independent protocol. " +
        "It goes live: the study's clinics' computers receive it on their next config refresh. " +
        "Without confirm: true this only previews and writes nothing. Always show the preview to the user before confirming.",
      input: {
        entry_id: id,
        study_id: id,
        name: z.string().min(1).max(100).optional().describe("Name in the study. Default: the entry's name."),
        confirm: z.boolean().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
      run: async (admin, a) => {
        const body = { project_id: a.study_id, ...(a.name ? { name: a.name } : {}) };
        if (!a.confirm) return previewLibraryCopy(admin, a.entry_id, body, call);
        const r = await call(copyFromLibrary, { admin, params: { id: String(a.entry_id) }, body });
        return r.status === 201 ? { status: 201, body: { copied: true, protocolId: r.body.protocol_id } } : r;
      },
    },
  ];
}
