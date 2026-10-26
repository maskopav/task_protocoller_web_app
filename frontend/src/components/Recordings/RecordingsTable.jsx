import React from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button.jsx";
import { DataTable } from "../ui/DataTable.jsx";
import { EmptyState } from "../ui/EmptyState.jsx";
import StatusPill from "../Uploads/StatusPill";
import QcPill from "../Uploads/QcPill";
import FlagTags from "../Uploads/FlagTags";
import useUploadLabels from "../Uploads/useUploadLabels";
import { PAGE_SIZES, fmtDurShort } from "../Uploads/format";
import { formatDateTime, formatRelative } from "../../utils/formatDate";
import { blockedReason } from "./bulk";
import { pageWindow } from "./recordingsQuery";
import RecordingsFilters from "./RecordingsFilters";
import RecordingsKpis from "./RecordingsKpis";
import DownloadButton from "./DownloadButton";
import useRecordingsList from "./useRecordingsList";
import "./recordings.css";

function Pager({ list }) {
  const { t } = useTranslation("uploads");
  const { f, update, total } = list;
  const pages = Math.max(1, Math.ceil(total / f.pageSize));
  const from = list.rows.length ? (f.page - 1) * f.pageSize + 1 : 0;
  return (
    <div className="rec-foot">
      <span data-testid="recordings-count">{t("recordings.foot.showing", { from, to: from ? from + list.rows.length - 1 : 0, total })}</span>
      <div className="rec-pager">
        <label>
          {t("recordings.foot.rows")}
          <select value={f.pageSize} onChange={(e) => update({ pageSize: e.target.value === "25" ? "" : e.target.value })}>
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <Button variant="quiet" size="sm" disabled={f.page <= 1} aria-label={t("recordings.foot.prev")} onClick={() => update({ page: f.page - 1 > 1 ? f.page - 1 : "" })}>‹</Button>
        {pageWindow(f.page, pages).map((n) => (typeof n === "string"
          ? <span key={n} className="rec-faint">…</span>
          : (
            <Button key={n} variant="quiet" size="sm" aria-current={n === f.page ? "page" : undefined} onClick={() => update({ page: n > 1 ? n : "" })}>
              {n === f.page ? <strong>{n}</strong> : n}
            </Button>
          )))}
        <Button variant="quiet" size="sm" disabled={f.page >= pages} aria-label={t("recordings.foot.next")} onClick={() => update({ page: f.page + 1 })}>›</Button>
      </div>
    </div>
  );
}

/**
 * The recordings table with its filters (and optionally the KPI strip): the Recordings page, and later
 * the Recordings tab of a study or a clinic.
 *
 * @param {object} props
 * @param {{clinic?: string|number, study?: string|number}} [props.fixed] pins the list to one clinic or study;
 *   its filter (and, for a clinic, the Clinic column) is hidden. Without it, `?clinic=` / `?study=` in the URL apply.
 * @param {ReturnType<typeof useRecordingsList>} [props.list] state owned by the caller (the page header needs the
 *   Download button); when omitted the table owns it and renders a secondary Download button of its own.
 * @param {boolean} [props.showKpis=false] the KPI strip above the filters
 * @param {boolean} [props.syncUrl=true] keep the filters in the URL query; false keeps them in local state
 */
export default function RecordingsTable({ fixed, list: given, showKpis = false, syncUrl = true }) {
  const own = useRecordingsList({ fixed, syncUrl });
  const list = given || own;
  const { t } = useTranslation("uploads");
  const L = useUploadLabels();
  const navigate = useNavigate();
  const { rows, selected, loading, data } = list;

  const open = (r) => navigate(`/recordings/${r.id}${list.context ? `?ctx=${encodeURIComponent(list.context)}` : ""}`);

  const columns = [
    {
      key: "select",
      header: (
        <input
          type="checkbox"
          aria-label={t("recordings.selectAll")}
          checked={list.allPageSelected}
          disabled={!list.selectablePage.length}
          ref={(el) => { if (el) el.indeterminate = !list.allPageSelected && list.selectedCount > 0; }}
          onChange={(e) => list.togglePage(e.target.checked)}
          data-testid="recordings-select-all"
        />
      ),
      render: (r) => {
        const why = blockedReason(r);
        return (
          <input
            type="checkbox"
            checked={selected.has(r.id)}
            disabled={!!why}
            title={why ? t(`recordings.blocked.${why}`) : undefined}
            aria-label={t("recordings.selectRow", { code: r.participant?.patient_code || r.id.slice(0, 8) })}
            onChange={(e) => list.toggleRow(r, e.target.checked)}
          />
        );
      },
    },
    {
      key: "receivedAt",
      header: t("recordings.columns.received"),
      render: (r) => (
        <div title={formatDateTime(r.receivedAt)}>
          <span className="ui-tbl-primary">{formatRelative(r.receivedAt)}</span>
          <span className="rec-sub">{formatDateTime(r.receivedAt)}</span>
        </div>
      ),
    },
    {
      key: "patient",
      header: t("recordings.columns.patient"),
      render: (r) => (
        <div>
          <span className="ui-tbl-primary">{r.participant?.patient_code || <span className="rec-faint">—</span>}</span>
          <span className="rec-sub">
            {r.participant?.visit_number ? `${r.participant.visit_number} · ` : ""}
            <span className="rec-id" title={r.id}>{r.id.slice(0, 8)}</span>
          </span>
        </div>
      ),
    },
    {
      key: "study",
      header: t("recordings.columns.studyProtocol"),
      render: (r) => (
        <div>
          {list.fixed.study == null && <span>{r.project || <span className="rec-faint">—</span>}</span>}
          <span className={list.fixed.study == null ? "rec-sub" : undefined}>{r.protocol}</span>
        </div>
      ),
    },
    ...(list.clinicVisible ? [{
      key: "clinic",
      header: t("recordings.columns.clinic"),
      render: (r) => r.site || <span className="rec-faint">{t("recordings.noClinic")}</span>,
    }] : []),
    { key: "length", header: t("recordings.columns.length"), render: (r) => fmtDurShort(r.durationS) },
    {
      key: "tasks",
      header: t("recordings.columns.tasks"),
      render: (r) => (
        <span title={t("list.tasksTitle", { done: r.tasksDone, skipped: r.tasksSkipped, missing: Math.max(0, r.tasksTotal - r.tasksDone - r.tasksSkipped), total: r.tasksTotal })}>
          {r.tasksDone} / {r.tasksTotal}
          {r.tasksSkipped > 0 && <span className="rec-sub">{t("list.skipped", { count: r.tasksSkipped })}</span>}
        </span>
      ),
    },
    {
      key: "status",
      header: t("recordings.columns.serverCheck"),
      render: (r) => (
        <div>
          <StatusPill status={r.status} invalidReason={r.invalidReason} />
          {r.status === "invalid" && <span className="rec-sub rec-sub-bad">{L.invalidReason(r.invalidReason)}</span>}
        </div>
      ),
    },
    {
      key: "qc",
      header: t("recordings.columns.review"),
      render: (r) => (
        <div>
          <QcPill qc={r.qc} />
          {r.commentCount > 0 && <span className="rec-sub">{t("recordings.comments", { count: r.commentCount })}</span>}
        </div>
      ),
    },
    { key: "flags", header: t("recordings.columns.flags"), render: (r) => <FlagTags issues={r.issues} max={2} /> },
  ];

  let empty;
  if (!data && loading) empty = <EmptyState title={t("recordings.loading")} />;
  else if (list.error && !data) empty = <EmptyState icon="alert" title={t("recordings.loadError")} action={<Button onClick={list.retry}>{t("list.retry")}</Button>} />;
  else if (list.filtered) {
    empty = (
      <EmptyState
        title={t("recordings.emptyFiltered")}
        action={<Button onClick={list.clearAll} data-testid="recordings-clear-filters">{t("list.clearFilters")}</Button>}
        data-testid="recordings-empty"
      />
    );
  } else {
    empty = <EmptyState title={t("recordings.emptyTitle")} description={t("recordings.emptyBody")} data-testid="recordings-empty" />;
  }

  return (
    <div className="rec-root" data-testid="recordings-list">
      {showKpis && <RecordingsKpis list={list} />}
      <RecordingsFilters list={list} />
      {list.error && data && (
        <div className="rec-error" role="alert">
          {list.error}
          <Button size="sm" onClick={list.retry}>{t("list.retry")}</Button>
        </div>
      )}
      {!given && <div><DownloadButton list={list} variant="secondary" /></div>}
      <div className={`rec-table${loading && data ? " is-loading" : ""}`} aria-busy={loading}>
        <DataTable
          columns={columns}
          rows={rows}
          onRowClick={open}
          rowClassName={() => "clickable"}
          empty={empty}
          caption={t("recordings.title")}
          data-testid="recordings-table"
        />
      </div>
      {rows.length > 0 && <Pager list={list} />}
    </div>
  );
}
