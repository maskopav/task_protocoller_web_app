// src/mcp/tools/read.js — the v1 read tools (docs/mcp/01_spec.md section 4).
// Each one calls an existing controller through callHandler and shapes the
// result through an allowlist in ../shape.js.
import { z } from "zod";
import { executeQuery } from "../../db/queryHelper.js";
import { getVisibleSiteIds, getEditableProjectIds } from "../../utils/accessScope.js";
import { getProjectList, getProject } from "../../controllers/projectController.js";
import { getSites, getSiteById } from "../../controllers/siteController.js";
import { getProtocolById, getProtocolsByProjectId } from "../../controllers/protocolController.js";
import { listLibrary, getLibraryEntry } from "../../controllers/libraryController.js";
import { listUploads, getUpload, getSummary, getComments, QCS, STATUSES, FLAG_KEYS, PAGE_SIZES } from "../../controllers/uploadController.js";
import { listDevices } from "../../controllers/deviceController.js";
import * as shape from "../shape.js";

const id = z.number().int().positive().max(2147483647);
const sessionId = z.string().regex(/^[0-9a-f]{32}$/).describe("Recording id: 32 lowercase hex characters");
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const str = (v) => (v === undefined ? undefined : String(v));
const READ_ONLY = { readOnlyHint: true, openWorldHint: false };

/** Tool definitions: { name, description, input, run(admin, args) -> {status, body} }. */
export function readTools({ call }) {
  return [
    {
      name: "whoami",
      description: "Who this connection acts as: role, assigned clinics and which studies you may edit.",
      input: {},
      run: async (admin) => {
        const [users, clinics, editable] = await Promise.all([
          executeQuery(`SELECT full_name, can_create_projects, can_create_sites, can_see_technical FROM users WHERE id = ?`, [admin.id]),
          admin.role === "master"
            ? executeQuery(`SELECT id, name FROM sites ORDER BY name`, [])
            : getVisibleSiteIds(admin.id).then((ids) => ids.length
              ? executeQuery(`SELECT id, name FROM sites WHERE id IN (?) ORDER BY name`, [ids])
              : []),
          admin.role === "master" ? [] : getEditableProjectIds(admin.id),
        ]);
        const u = users[0] ?? {};
        return {
          status: 200,
          body: {
            id: admin.id,
            name: u.full_name ?? null,
            role: admin.role,
            clinics: clinics.map((c) => ({ id: Number(c.id), name: c.name })),
            editsAllStudies: admin.role === "master",
            editableStudyIds: editable,
            canCreateStudies: admin.role === "master" || Number(u.can_create_projects) === 1,
            canCreateClinics: admin.role === "master" || Number(u.can_create_sites) === 1,
            seesTechnicalDetails: admin.role === "master" || Number(u.can_see_technical) === 1,
          },
        };
      },
    },
    {
      name: "list_studies",
      description: "Studies you can see: the ones you edit (access 'owned') and the ones running at your clinics (access 'received', read-only).",
      input: { include_archived: z.boolean().optional().describe("Include inactive (archived) studies. Default false.") },
      run: async (admin, a) => {
        const r = await call(getProjectList, { admin });
        if (r.status !== 200) return r;
        const rows = r.body.map(shape.study);
        return { status: 200, body: a.include_archived ? rows : rows.filter((s) => s.isActive) };
      },
    },
    {
      name: "get_study",
      description: "One study with its counts and whether you may edit it.",
      input: { study_id: id },
      run: async (admin, a) => {
        const r = await call(getProject, { admin, params: { id: String(a.study_id) } });
        return r.status === 200 ? { status: 200, body: shape.study(r.body) } : r;
      },
    },
    {
      name: "list_clinics",
      description: "Clinics assigned to you (a master sees all).",
      input: { study_id: id.optional().describe("Only clinics running this study") },
      run: async (admin, a) => {
        const r = await call(getSites, { admin, query: a.study_id ? { project_id: String(a.study_id) } : {} });
        return r.status === 200 ? { status: 200, body: r.body.map(shape.clinic) } : r;
      },
    },
    {
      name: "get_clinic",
      description: "One clinic: the studies it runs and the protocols its computers receive.",
      input: { clinic_id: id },
      run: async (admin, a) => {
        const r = await call(getSiteById, { admin, params: { id: String(a.clinic_id) } });
        return r.status === 200 ? { status: 200, body: shape.clinicDetail(r.body) } : r;
      },
    },
    {
      name: "list_protocols",
      description: "Current protocols of a study, one entry per protocol with its languages.",
      input: { study_id: id, archived: z.boolean().optional().describe("List archived protocols instead. Default false.") },
      run: async (admin, a) => {
        const r = await call(getProtocolsByProjectId, { admin, params: { id: String(a.study_id) }, query: a.archived ? { archived: "1" } : {} });
        return r.status === 200 ? { status: 200, body: r.body.map(shape.protocolSummary) } : r;
      },
    },
    {
      name: "get_protocol",
      description: "A protocol's full design: tasks with their parameters and texts, identifier field names, file-name template, randomization.",
      input: { protocol_id: id },
      run: async (admin, a) => {
        const r = await call(getProtocolById, { admin, params: { id: String(a.protocol_id) } });
        return r.status === 200 ? { status: 200, body: shape.protocol(r.body) } : r;
      },
    },
    {
      name: "list_library",
      description: "The shared protocol library. Entries are templates: copying one into a study makes an independent copy.",
      input: {
        q: z.string().max(100).optional().describe("Search in name and description"),
        mine: z.boolean().optional().describe("Only entries you shared"),
        lang: z.string().max(10).optional().describe("Language code, e.g. en"),
      },
      run: async (admin, a) => {
        const r = await call(listLibrary, { admin, query: { q: a.q, mine: a.mine ? "1" : undefined, lang: a.lang } });
        return r.status === 200 ? { status: 200, body: r.body.map(shape.libraryEntry) } : r;
      },
    },
    {
      name: "get_library_entry",
      description: "One library entry's full design.",
      input: { entry_id: id },
      run: async (admin, a) => {
        const r = await call(getLibraryEntry, { admin, params: { id: String(a.entry_id) } });
        return r.status === 200 ? { status: 200, body: shape.libraryDetail(r.body) } : r;
      },
    },
    {
      name: "list_task_catalog",
      description: "All task kinds (task_id for protocols), task types and languages (language_id).",
      input: {},
      run: async () => {
        const [tasks, languages] = await Promise.all([
          executeQuery(`SELECT t.id, t.category, tt.type FROM tasks t JOIN task_types tt ON tt.id = t.type_id ORDER BY t.id`, []),
          executeQuery(`SELECT id, code, name, native_name FROM languages ORDER BY id`, []),
        ]);
        return {
          status: 200,
          body: {
            tasks: tasks.map((t) => ({ id: Number(t.id), category: t.category, type: t.type })),
            languages: languages.map((l) => ({ id: Number(l.id), code: l.code, name: l.name, nativeName: l.native_name ?? null })),
          },
        };
      },
    },
    {
      name: "list_recordings",
      description: "Recordings at your clinics, newest first, with paging. Participants appear only as patient code and visit number.",
      input: {
        q: z.string().max(100).optional().describe("Search patient code, recording id or computer"),
        clinic_ids: z.array(id).max(50).optional(),
        study: z.union([id, z.string().max(255)]).optional().describe("Study id or exact name"),
        protocol: z.string().max(255).optional().describe("Exact protocol name"),
        date_field: z.enum(["received", "recorded"]).optional(),
        from: day.optional(),
        to: day.optional(),
        status: z.enum(STATUSES).optional(),
        qc: z.enum(QCS).optional(),
        flags: z.array(z.enum(FLAG_KEYS)).max(FLAG_KEYS.length).optional(),
        has_video: z.boolean().optional(),
        needs_attention: z.boolean().optional(),
        sort: z.enum(["receivedAt", "site", "patient", "protocol", "endedAt", "durationS", "bytes", "status", "qc"]).optional(),
        dir: z.enum(["asc", "desc"]).optional(),
        page: z.number().int().min(1).max(1000000).optional(),
        page_size: z.union(PAGE_SIZES.map((n) => z.literal(n))).optional(),
      },
      run: async (admin, a) => {
        const query = {
          q: a.q,
          site: a.clinic_ids?.length ? a.clinic_ids.join(",") : undefined,
          project: str(a.study),
          protocol: a.protocol,
          dateField: a.date_field,
          from: a.from,
          to: a.to,
          status: a.status,
          qc: a.qc,
          flag: a.flags?.length ? a.flags.join(",") : undefined,
          hasVideo: a.has_video ? "1" : undefined,
          attention: a.needs_attention ? "1" : undefined,
          sort: a.sort,
          dir: a.dir,
          page: str(a.page),
          pageSize: str(a.page_size),
        };
        for (const k of Object.keys(query)) if (query[k] === undefined) delete query[k];
        const r = await call(listUploads, { admin, query });
        return r.status === 200 ? { status: 200, body: shape.recordingList(r.body) } : r;
      },
    },
    {
      name: "get_recording",
      description: "One recording: status, checks, tasks, QC and staff comments. No participant details beyond patient code and visit number.",
      input: { session_id: sessionId },
      run: async (admin, a) => {
        const r = await call(getUpload, { admin, params: { sessionId: a.session_id } });
        return r.status === 200 ? { status: 200, body: shape.recordingDetail(r.body) } : r;
      },
    },
    {
      name: "get_recording_summary",
      description: "Counts of recordings: this week, last 30 days, invalid, needing review, per day, per protocol, per clinic.",
      input: { clinic_id: id.optional(), study_id: id.optional(), days: z.number().int().min(7).max(90).optional() },
      run: async (admin, a) => {
        const query = {};
        if (a.clinic_id) query.siteId = String(a.clinic_id);
        if (a.study_id) query.projectId = String(a.study_id);
        if (a.days) query.days = String(a.days);
        const r = await call(getSummary, { admin, query });
        return r.status === 200 ? { status: 200, body: shape.summary(r.body) } : r;
      },
    },
    {
      name: "list_recording_comments",
      description: "Staff comments and QC changes on one recording, oldest first.",
      input: { session_id: sessionId },
      run: async (admin, a) => {
        const r = await call(getComments, { admin, params: { sessionId: a.session_id } });
        return r.status === 200 ? { status: 200, body: shape.comments(r.body) } : r;
      },
    },
    {
      name: "list_computers",
      description: "Recording computers at your clinics with their health (silent, backlog, healthy).",
      input: { clinic_id: id.optional() },
      run: async (admin, a) => {
        const r = await call(listDevices, { admin, query: a.clinic_id ? { siteId: String(a.clinic_id) } : {} });
        return r.status === 200 ? { status: 200, body: shape.computers(r.body) } : r;
      },
    },
  ].map((t) => ({ annotations: READ_ONLY, ...t }));
}
