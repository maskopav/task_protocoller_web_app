// src/pages/studies/StudiesPage.jsx — the studies list (docs/ui_redesign/02_spec.md section 6.3).
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useUser } from "../../context/UserContext";
import { fetchProjectsList } from "../../api/projects";
import { getProtocolsByProjectId } from "../../api/protocols";
import { fetchSites } from "../../api/sites";
import { fetchUploadSummary } from "../../api/uploads";
import { Button, DataTable, EmptyState, Icon, PageHeader, StatusDot, useToast } from "../../components/ui";
import { apiErrorMessage } from "../../utils/apiError";
import LangChips from "./LangChips";
import NewStudyModal from "./NewStudyModal";
import { groupStudies, isArchived, languageCodes } from "./studyHelpers";
import "./studies.css";

/** Per-study extras the list endpoint does not carry: language chips, recordings in 30 days, clinic name. */
function useStudyExtras(rows) {
  const [extras, setExtras] = useState({});
  const key = rows.map((r) => r.project_id).join(",");
  useEffect(() => {
    let live = true;
    rows.forEach((s) => {
      const id = s.project_id;
      Promise.allSettled([
        getProtocolsByProjectId(id),
        fetchUploadSummary({ projectId: id }),
        s.site_count === 1 ? fetchSites(id) : Promise.resolve(null),
      ]).then(([p, u, c]) => {
        if (!live) return;
        setExtras((prev) => ({
          ...prev,
          [id]: {
            langs: p.status === "fulfilled" ? languageCodes(p.value) : [],
            last30: u.status === "fulfilled" ? u.value?.last30 : undefined,
            clinic: c.status === "fulfilled" && c.value?.length === 1 ? c.value[0].name : undefined,
          },
        }));
      });
    });
    return () => { live = false; };
    // rows are identified by their ids
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return extras;
}

export default function StudiesPage() {
  const { t } = useTranslation("studies");
  const { t: ta } = useTranslation("admin");
  const { user } = useUser();
  const toast = useToast();
  const isMaster = user?.role_id === 1;
  const canCreate = isMaster || !!user?.can_create_projects;

  const [rows, setRows] = useState(null);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let live = true;
    fetchProjectsList()
      .then((d) => { if (live) setRows(d); })
      .catch((err) => { if (live) { setRows([]); toast.error(apiErrorMessage(err, ta)); } });
    return () => { live = false; };
    // toast and ta are stable enough for a one-off load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groups = useMemo(() => groupStudies(rows || [], { isMaster, showArchived, query }), [rows, isMaster, showArchived, query]);
  const visible = useMemo(() => [...groups.all, ...groups.yours, ...groups.received], [groups]);
  const extras = useStudyExtras(visible);
  const hasArchived = (rows || []).some(isArchived);

  const columns = (received) => [
    {
      key: "name",
      header: t("list.columns.study"),
      primary: true,
      sortable: true,
      sortValue: (s) => s.project_name,
      render: (s) => (
        <>
          <Link to={`/studies/${s.project_id}/protocols`} className="studies-name">{s.project_name}</Link>
          {s.description && <div className="ui-tbl-sub studies-sub">{s.description}</div>}
        </>
      ),
    },
    {
      key: "protocols",
      header: t("list.columns.protocols"),
      render: (s) => (
        <>
          {s.protocol_count}
          {extras[s.project_id]?.langs?.length > 0 && <> <span className="studies-faint">·</span> <LangChips codes={extras[s.project_id].langs} /></>}
        </>
      ),
    },
    {
      key: "clinics",
      header: received ? t("list.columns.runsAtYours") : t("list.columns.runsAt"),
      render: (s) => {
        if (!s.site_count) return <span className="studies-faint">—</span>;
        return s.site_count === 1 && extras[s.project_id]?.clinic ? extras[s.project_id].clinic : t("list.clinicsCount", { count: s.site_count });
      },
    },
    {
      key: "recordings",
      header: t("list.columns.recordings"),
      align: "num",
      render: (s) => extras[s.project_id]?.last30 ?? "",
    },
    { key: "unreviewed", header: t("list.columns.unreviewed"), align: "num", render: (s) => s.unreviewed },
    received
      ? { key: "managed", header: t("list.columns.managedBy"), render: (s) => s.creator_name || "" }
      : {
        key: "status",
        header: t("list.columns.status"),
        render: (s) => (
          <StatusDot tone={isArchived(s) ? "idle" : "ok"}>{isArchived(s) ? t("status.archived") : t("status.active")}</StatusDot>
        ),
      },
  ];

  const group = (label, list, received, testId, lock) => list.length > 0 && (
    <section key={testId} data-testid={testId}>
      <div className="studies-group-label">
        {lock && <Icon name="lock" size={14} />}
        {label} <span className="studies-faint">· {list.length}</span>
      </div>
      <DataTable
        columns={columns(received)}
        rows={list}
        rowKey="project_id"
        href={(s) => `/studies/${s.project_id}/protocols`}
        caption={label}
        data-testid={`${testId}-table`}
      />
    </section>
  );

  return (
    <div className="studies-page" data-testid="studies-page">
      <PageHeader
        title={t("list.title")}
        sub={t("list.sub")}
        actions={canCreate && (
          <Button variant="primary" icon="plus" onClick={() => setCreating(true)} data-testid="studies-new">{t("list.new")}</Button>
        )}
      />

      <div className="studies-filters">
        <div className="studies-search">
          <Icon name="search" size={16} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("list.search")}
            aria-label={t("list.search")}
            data-testid="studies-search"
          />
        </div>
        {hasArchived && (
          <label className="studies-check">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} data-testid="studies-show-archived" />
            {t("list.showArchived")}
          </label>
        )}
      </div>

      {rows === null ? (
        <div className="studies-skeleton" aria-busy="true" aria-label={t("loading")} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon="study"
          title={query ? t("list.noMatch") : t("list.empty")}
          description={!query && !canCreate ? t("list.emptyHint") : undefined}
          data-testid="studies-empty"
        />
      ) : (
        <>
          {group(t("list.groups.all"), groups.all, false, "studies-group-all")}
          {group(t("list.groups.yours"), groups.yours, false, "studies-group-yours")}
          {group(t("list.groups.received"), groups.received, true, "studies-group-received", true)}
        </>
      )}

      {canCreate && <NewStudyModal open={creating} onClose={() => setCreating(false)} />}
    </div>
  );
}
