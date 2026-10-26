// src/pages/library/LibraryEntryPage.jsx: one library entry, read-only tasks and settings (spec 6.10).
import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Badge, Button, EmptyState, KeyValue, Menu, PageHeader, Section, useConfirm, useToast } from "../../components/ui";
import { getLibraryEntry, withdrawEntry } from "../../api/library";
import { useMappings } from "../../context/MappingContext";
import { apiErrorMessage } from "../../utils/apiError";
import { formatRelative } from "../../utils/formatDate";
import { translateTaskName } from "../../utils/translations";
import { DEFAULT_RECORDINGS_FILE_NAME, normalizeIdentifiers } from "../../components/Identifiers/IdentifierFields";
import LangChips from "../studies/LangChips";
import NotAvailablePage from "../NotAvailablePage";
import AddToStudyModal from "./AddToStudyModal";
import { entryTaskCategories } from "./libraryHelpers";
import "../studies/studies.css";
import "./library.css";

export default function LibraryEntryPage() {
  const { protocolId } = useParams();
  const { t } = useTranslation("library");
  const { t: ta } = useTranslation("admin");
  const { t: tc } = useTranslation("common");
  const { t: ts } = useTranslation("studies");
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { mappings } = useMappings();
  const [entry, setEntry] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ok | missing | forbidden
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let live = true;
    setStatus("loading");
    getLibraryEntry(protocolId)
      .then((e) => { if (live) { setEntry(e); setStatus("ok"); } })
      .catch((err) => { if (live) setStatus(err?.status === 403 ? "forbidden" : "missing"); });
    return () => { live = false; };
  }, [protocolId]);

  if (status === "forbidden") return <NotAvailablePage />;
  if (status === "missing") {
    return (
      <EmptyState
        icon="library"
        title={t("entry.notFound")}
        action={<Button as={Link} to="/library">{t("entry.back")}</Button>}
        data-testid="library-entry-missing"
      />
    );
  }
  if (status === "loading" || !entry) return <div className="library-skeleton" aria-busy="true" aria-label={t("loading")} />;

  const withdraw = async () => {
    const ok = await confirm({
      title: t("withdraw.title", { name: entry.name }),
      message: t("withdraw.message"),
      confirmText: t("withdraw.confirm"),
      cancelText: t("cancel"),
      danger: true,
    });
    if (!ok) return;
    try {
      await withdrawEntry(entry.id);
      toast.success(t("withdraw.done", { name: entry.name }));
      navigate("/library", { replace: true });
    } catch (err) {
      toast.error(apiErrorMessage(err, ta));
    }
  };

  const categories = entryTaskCategories(entry, mappings);
  const identifiers = normalizeIdentifiers(entry.required_identifiers);
  const identifierLabel = (f) => (f.catalogue ? tc(`identifiers.catalogue.${f.name}.label`) : f.label || f.name);
  const codes = [].concat(entry.language || []);
  const updated = entry.updated_at ? formatRelative(entry.updated_at) : null;
  const sub = [
    entry.author ? t("entry.author", { name: entry.author }) : null,
    updated ? t("entry.updated", { when: updated }) : null,
    t("entry.usedIn", { count: entry.used_in || 0 }),
  ].filter(Boolean).join(" · ");

  return (
    <div className="library-page" data-testid="library-entry-page">
      <PageHeader
        breadcrumbs={[{ label: t("title"), to: "/library" }, { label: entry.name }]}
        title={entry.name}
        badges={(
          <>
            {entry.version != null && <Badge tone="outline" data-testid="library-entry-version">v{entry.version}</Badge>}
            <LangChips codes={codes} />
          </>
        )}
        sub={sub}
        actions={(
          <>
            {entry.can_edit && (
              <Menu
                label={t("entry.more")}
                items={[
                  { label: t("entry.edit"), onSelect: () => navigate(`/library/${entry.id}/edit`) },
                  { label: t("withdraw.action"), danger: true, onSelect: withdraw },
                ]}
              />
            )}
            <Button variant="primary" icon="plus" onClick={() => setAdding(true)} data-testid="library-add">{t("add.action")}</Button>
          </>
        )}
      />

      {entry.description && <p className="library-sub" data-testid="library-entry-description">{entry.description}</p>}

      <Section title={t("entry.tasks", { count: categories.length })}>
        {categories.length === 0 ? (
          <p className="library-muted">{t("entry.noTasks")}</p>
        ) : (
          <ol className="library-tasks" data-testid="library-entry-tasks">
            {categories.map((c, i) => <li key={i}>{c ? translateTaskName(c) : ts("protocols.unknownTask")}</li>)}
          </ol>
        )}
      </Section>

      <Section title={t("entry.settings")}>
        <KeyValue
          cols={2}
          items={[
            { label: t("entry.identifiers"), value: identifiers.map(identifierLabel).join(", ") },
            { label: t("entry.fileName"), value: entry.recordings_file_name || DEFAULT_RECORDINGS_FILE_NAME, mono: true },
            { label: t("entry.languages"), value: codes.join(", ").toUpperCase() },
          ]}
        />
      </Section>

      <AddToStudyModal open={adding} entry={entry} onClose={() => setAdding(false)} />
    </div>
  );
}
