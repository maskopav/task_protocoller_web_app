// State of a recordings list: filters (in the URL or local), the page of rows from GET /uploads,
// the ticked rows and the bulk download. The page header and the table share one instance.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useUser } from "../../context/UserContext";
import { useToast } from "../ui/toastContext.js";
import { fetchProjectsList } from "../../api/projects";
import { downloadBundle, downloadUploadsCsv, fetchUploads } from "../../api/uploads";
import { fmtBytes } from "../Uploads/format";
import {
  MAX_BUNDLE_BYTES, MAX_BUNDLE_SESSIONS, checkBundleLimits, downloadTarget, downloadableFromFilter, isBulkSelectable,
} from "./bulk";
import { filterKey, hasActiveFilters, listContext, orderRows, readFilters, showClinic, toApiParams } from "./recordingsQuery";

const PAGE = 100;

/** Filters live in the URL query by default (syncUrl), or in local state (a tab that owns the URL). */
function useFilterParams(syncUrl) {
  const [urlSp, setUrlSp] = useSearchParams();
  const [localSp, setLocalSp] = useState(() => new URLSearchParams());
  return syncUrl ? [urlSp, setUrlSp] : [localSp, setLocalSp];
}

/**
 * @param {{fixed?: {clinic?: string|number, study?: string|number}, syncUrl?: boolean}} [opts]
 */
export default function useRecordingsList({ fixed = {}, syncUrl = true } = {}) {
  const { t } = useTranslation("uploads");
  const toast = useToast();
  const { user } = useUser();
  const shell = useOutletContext();
  const isMaster = user?.role_id === 1;

  const [sp, setSp] = useFilterParams(syncUrl);
  const fixedClinic = fixed.clinic;
  const fixedStudy = fixed.study;
  const f = useMemo(() => readFilters(sp, { clinic: fixedClinic, study: fixedStudy }), [sp, fixedClinic, fixedStudy]);
  const apiParams = useMemo(() => toApiParams(f), [f]);
  const key = JSON.stringify(apiParams);
  const resultKey = filterKey(f);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [studies, setStudies] = useState([]);
  const [protocols, setProtocols] = useState([]);
  const [selected, setSelected] = useState(() => new Map()); // id -> row, across pages of one filter
  const [busy, setBusy] = useState(false);

  // Replace keys in the URL. Any change except paging itself returns to page 1.
  const update = useCallback((patch, { replace = false } = {}) => {
    const next = new URLSearchParams(sp);
    for (const [name, value] of Object.entries(patch)) {
      next.delete(name);
      if (name === "site") next.delete("clinic");
      if (name === "project") next.delete("study");
      const vals = Array.isArray(value) ? value : [value];
      vals.forEach((v) => v !== "" && v != null && v !== false && next.append(name, v === true ? "1" : String(v)));
    }
    if (!("page" in patch)) next.delete("page");
    setSp(next, { replace });
  }, [sp, setSp]);
  const clearAll = useCallback(() => setSp(new URLSearchParams(), {}), [setSp]);

  // Load the page for the current filters; ignore responses that arrive out of order.
  useEffect(() => {
    let live = true;
    setLoading(true);
    fetchUploads(apiParams)
      .then((d) => { if (live) { setData(d); setError(""); } })
      .catch((e) => { if (live) setError(e.message || t("recordings.loadError")); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
    // apiParams is keyed by `key`; reload re-runs the same query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reload]);

  // Study and Protocol options: the studies in scope, and the protocols seen in the scope's recordings
  // (the API has no protocol facet, so one unfiltered page of the scope has to do).
  useEffect(() => {
    let live = true;
    fetchProjectsList()
      .then((rows) => { if (live) setStudies((Array.isArray(rows) ? rows : []).map((p) => ({ id: String(p.project_id), name: p.project_name }))); })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  useEffect(() => {
    let live = true;
    fetchUploads({ pageSize: 100, project: fixedStudy ?? "", site: fixedClinic != null ? [fixedClinic] : [] })
      .then((d) => { if (live) setProtocols((o) => [...new Set([...o, ...d.rows.map((r) => r.protocol).filter(Boolean)])].sort()); })
      .catch(() => {});
    return () => { live = false; };
  }, [fixedStudy, fixedClinic]);
  useEffect(() => {
    if (data?.rows) setProtocols((o) => [...new Set([...o, ...data.rows.map((r) => r.protocol).filter(Boolean)])].sort());
  }, [data]);

  // A new result set starts with nothing ticked.
  useEffect(() => { setSelected(new Map()); }, [resultKey]);

  const rows = useMemo(() => orderRows(data?.rows ?? [], f), [data, f]);
  const total = data?.total ?? 0;

  const clinicCount = isMaster ? (data?.facets.sites.length ?? 0)
    : shell?.clinicsLoaded ? shell.clinics.length : (data?.facets.sites.length ?? 0);
  const clinicVisible = showClinic({ isMaster, clinicCount, fixedClinic });
  const filtered = hasActiveFilters(f, { clinic: fixedClinic, study: fixedStudy });

  const toggleRow = (row, on) => setSelected((prev) => {
    const next = new Map(prev);
    if (on) next.set(row.id, row); else next.delete(row.id);
    return next;
  });
  const selectablePage = rows.filter(isBulkSelectable);
  const allPageSelected = selectablePage.length > 0 && selectablePage.every((r) => selected.has(r.id));
  const togglePage = (on) => setSelected((prev) => {
    const next = new Map(prev);
    selectablePage.forEach((r) => (on ? next.set(r.id, r) : next.delete(r.id)));
    return next;
  });
  const clearSelection = () => setSelected(new Map());

  const refuse = (limits) => toast.error(limits.reason === "tooMany"
    ? t("recordings.bulk.tooMany", { count: limits.count, max: MAX_BUNDLE_SESSIONS })
    : t("recordings.bulk.tooLarge", { size: fmtBytes(limits.bytes), maxSize: fmtBytes(MAX_BUNDLE_BYTES) }));

  // Download: the ticked rows as one ZIP, or (nothing ticked) every downloadable row of the filter.
  const download = async () => {
    setBusy(true);
    try {
      const target = downloadTarget([...selected.values()]);
      let chosen;
      if (target.mode === "selection") {
        chosen = [...selected.values()].filter((r) => target.ids.includes(r.id));
      } else {
        // Keyed by id: a recording arriving mid-paging shifts rows, and the
        // server refuses a bundle with duplicate ids. The limit is checked on the
        // downloadable rows, not on the filter total; only a filter far past it
        // is refused without paging.
        if (total > 10 * MAX_BUNDLE_SESSIONS) { refuse({ reason: "tooMany", count: total, bytes: 0 }); return; }
        const byId = new Map();
        const base = { ...apiParams, page: "", pageSize: PAGE };
        for (let page = 1; ; page++) {
          const res = await fetchUploads({ ...base, page });
          downloadableFromFilter(res.rows).forEach((r) => byId.set(r.id, r));
          if (!res.rows.length || page * PAGE >= res.total) break;
        }
        chosen = [...byId.values()];
      }
      if (!chosen.length) { toast.info(t("recordings.bulk.nothing")); return; }
      const limits = checkBundleLimits(chosen);
      if (!limits.ok) { refuse(limits); return; }
      await downloadBundle(chosen.map((r) => r.id));
      toast.success(t("recordings.bulk.started", { count: chosen.length }));
    } catch (err) {
      toast.error(err?.message || t("recordings.bulk.failed"));
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = async () => {
    try { await downloadUploadsCsv({ ...apiParams, page: "", pageSize: "" }); } catch { toast.error(t("list.csvFailed")); }
  };

  return {
    f, update, clearAll, apiParams, context: listContext(f), fixed: { clinic: fixedClinic, study: fixedStudy },
    data, rows, total, loading, error, retry: () => setReload((n) => n + 1),
    studies, protocols, clinicVisible, filtered, clinics: data?.facets.sites ?? [],
    selected, selectedCount: selected.size, toggleRow, togglePage, allPageSelected, selectablePage, clearSelection,
    download, downloading: busy, exportCsv,
  };
}
