// src/pages/library/LibraryPage.jsx — the protocol library list (docs/ui_redesign/02_spec.md 6.10).
// There is no primary action: entries are created only by sharing a protocol from a study.
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { DataTable, EmptyState, Icon, PageHeader, useToast } from "../../components/ui";
import { listLibrary } from "../../api/library";
import { apiErrorMessage } from "../../utils/apiError";
import { formatRelative } from "../../utils/formatDate";
import LangChips from "../studies/LangChips";
import NotAvailablePage from "../NotAvailablePage";
import "../studies/studies.css";
import "./library.css";

export default function LibraryPage() {
  const { t } = useTranslation("library");
  const { t: ta } = useTranslation("admin");
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [mine, setMine] = useState(false);
  const [rows, setRows] = useState(null);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      const params = {};
      if (query.trim()) params.q = query.trim();
      if (mine) params.mine = 1;
      listLibrary(params)
        .then((d) => { if (live) setRows(Array.isArray(d) ? d : []); })
        .catch((err) => {
          if (!live) return;
          setRows((r) => r ?? []);
          if (err?.status === 403) setForbidden(true);
          else toast.error(apiErrorMessage(err, ta));
        });
    }, query ? 250 : 0);
    return () => { live = false; clearTimeout(timer); };
  }, [query, mine, toast, ta]);

  if (forbidden) return <NotAvailablePage />;

  const muted = <span className="library-muted">—</span>;
  const columns = [
    {
      key: "name", header: t("columns.name"), primary: true, sortable: true,
      render: (e) => (
        <div>
          <span>{e.name}</span>
          {e.description && <span className="library-sub">{e.description}</span>}
        </div>
      ),
    },
    { key: "languages", header: t("columns.languages"), render: (e) => <LangChips codes={e.languages} /> },
    { key: "tasks", header: t("columns.tasks"), align: "num", sortable: true, sortValue: (e) => e.n_tasks, render: (e) => e.n_tasks },
    { key: "author", header: t("columns.author"), sortable: true, render: (e) => e.author || muted },
    { key: "usedIn", header: t("columns.usedIn"), align: "num", sortable: true, sortValue: (e) => e.used_in, render: (e) => e.used_in },
    {
      key: "updated", header: t("columns.updated"), sortable: true, sortValue: (e) => e.updated_at || "",
      render: (e) => (e.updated_at ? formatRelative(e.updated_at) : muted),
    },
  ];

  const filtered = !!query.trim() || mine;

  return (
    <div className="library-page" data-testid="library-page">
      <PageHeader title={t("title")} sub={t("sub")} />

      <div className="library-filters">
        <div className="library-search">
          <Icon name="search" size={16} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("search")}
            aria-label={t("search")}
            data-testid="library-search"
          />
        </div>
        <label className="library-check">
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} data-testid="library-mine" />
          {t("sharedByMe")}
        </label>
      </div>

      {rows === null ? (
        <div className="library-skeleton" aria-busy="true" aria-label={t("loading")} />
      ) : (
        <DataTable
          data-testid="library-table"
          caption={t("title")}
          columns={columns}
          rows={rows}
          href={(e) => `/library/${e.id}`}
          defaultSort={{ key: "updated", dir: "desc" }}
          rowClassName={(e) => `library-row-${e.id}`}
          empty={(
            <EmptyState
              icon="library"
              title={filtered ? t("noMatch") : t("emptyTitle")}
              description={filtered ? undefined : t("emptyBody")}
              data-testid="library-empty"
            />
          )}
        />
      )}
    </div>
  );
}
