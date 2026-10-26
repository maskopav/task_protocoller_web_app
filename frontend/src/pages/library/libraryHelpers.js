// src/pages/library/libraryHelpers.js — small pure helpers for the library screens (spec 6.10).

/** Studies the caller may add a copy to: editable and not archived. */
export const addableStudies = (rows) =>
  (Array.isArray(rows) ? rows : []).filter((s) => s.can_edit && Number(s.project_is_active ?? 1) !== 0);

/** Task categories of a library entry (GET /library/:id), in order, via the mappings. Unknown ones become null. */
export function entryTaskCategories(entry, mappings) {
  const defs = mappings?.tasks || [];
  return [...(entry?.tasks || [])]
    .sort((a, b) => (a.task_order || 0) - (b.task_order || 0))
    .map((tk) => defs.find((d) => d.id === tk.task_id)?.category ?? null);
}

/** The id of the language variant to link to, or null. */
export const variantId = (entry, code) => entry?.protocol_ids?.[code] ?? null;
