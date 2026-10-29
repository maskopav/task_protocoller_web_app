// src/pages/studies/tabs/ProtocolsTab.jsx — one row per protocol group, with language chips and a row menu.
import React, { useCallback, useContext, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { archiveProtocol, getProtocolsByProjectId, shareProtocol } from "../../../api/protocols";
import { fetchProjectsList } from "../../../api/projects";
import {
  Badge, Button, DataTable, EmptyState, Icon, Menu, Modal, Select, useConfirm, useToast,
} from "../../../components/ui";
import { ProtocolContext } from "../../../context/ProtocolContext";
import { useMappings } from "../../../context/MappingContext";
import { apiErrorMessage } from "../../../utils/apiError";
import { formatRelative } from "../../../utils/formatDate";
import LangChips from "../LangChips";
import NewProtocolModal from "../NewProtocolModal";
import { loadMappedProtocol } from "../protocolMapping";
import { duplicateDraft } from "../studyHelpers";

/** "Copy to another study": pick a study the caller edits, then open the editor on an unsaved copy there. */
function CopyToStudyModal({ protocol, currentId, onClose, onPick }) {
  const { t } = useTranslation("studies");
  const [studies, setStudies] = useState(null);
  const [target, setTarget] = useState("");

  useEffect(() => {
    if (!protocol) return undefined;
    let live = true;
    setTarget("");
    fetchProjectsList()
      .then((rows) => {
        if (!live) return;
        const list = rows.filter((s) => s.can_edit && Number(s.project_is_active) !== 0 && s.project_id !== currentId);
        setStudies(list);
        setTarget(list[0] ? String(list[0].project_id) : "");
      })
      .catch(() => { if (live) setStudies([]); });
    return () => { live = false; };
  }, [protocol, currentId]);

  return (
    <Modal
      open={!!protocol}
      onClose={onClose}
      title={t("protocols.copyTitle", { name: protocol?.name })}
      description={t("protocols.copyDescription")}
      footer={(
        <>
          <Button onClick={onClose}>{t("cancel")}</Button>
          <Button variant="primary" disabled={!target} onClick={() => onPick(Number(target))} data-testid="copy-to-study-submit">{t("protocols.copyAction")}</Button>
        </>
      )}
    >
      {studies === null ? (
        <div className="studies-skeleton" aria-busy="true" aria-label={t("loading")} />
      ) : studies.length === 0 ? (
        <p className="studies-muted">{t("protocols.copyNone")}</p>
      ) : (
        <Select
          label={t("protocols.copyStudy")}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          options={studies.map((s) => ({ value: String(s.project_id), label: s.project_name }))}
        />
      )}
    </Modal>
  );
}

export default function ProtocolsTab({ study, canEdit, creating, onOpenCreate, onCloseCreate, onChanged }) {
  const { t } = useTranslation("studies");
  const { t: ta } = useTranslation("admin");
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { mappings } = useMappings();
  const { setSelectedProtocol } = useContext(ProtocolContext);
  const projectId = study.project_id;

  const [current, setCurrent] = useState(null);
  const [archived, setArchived] = useState([]);
  const [copying, setCopying] = useState(null);

  const load = useCallback(async () => {
    try {
      const [cur, arch] = await Promise.all([
        getProtocolsByProjectId(projectId),
        getProtocolsByProjectId(projectId, { archived: true }),
      ]);
      setCurrent(cur);
      setArchived(arch);
    } catch (err) {
      setCurrent([]);
      toast.error(apiErrorMessage(err, ta));
    }
  }, [projectId, toast, ta]);

  useEffect(() => { load(); }, [load]);

  const reload = async () => { await load(); await onChanged?.(); };

  // Loads a protocol in the shape the preview and the editor draft use.
  const loadMapped = (p) => loadMappedProtocol(p.id, mappings);

  const run = (fn) => async (...args) => {
    try {
      await fn(...args);
    } catch (err) {
      toast.error(apiErrorMessage(err, ta));
    }
  };

  const preview = run(async (p) => {
    const mapped = { ...(await loadMapped(p)), projectId };
    setSelectedProtocol(mapped);
    navigate(`/studies/${projectId}/protocols/${p.id}/preview`, {
      state: { protocol: mapped, testingMode: true, editingMode: false, returnTo: "dashboard" },
    });
  });

  const duplicate = run(async (p) => {
    const draft = duplicateDraft(await loadMapped(p), t("protocols.copyName", { name: p.name }));
    navigate(`/studies/${projectId}/protocols/new`, { state: { draft } });
  });

  const copyTo = run(async (targetId) => {
    const p = copying;
    const draft = duplicateDraft(await loadMapped(p), p.name);
    setCopying(null);
    navigate(`/studies/${targetId}/protocols/new`, { state: { draft } });
  });

  const share = run(async (p) => {
    const res = await shareProtocol(p.id);
    toast.success(res?.updated ? t("protocols.libraryUpdated", { version: res.version }) : t("protocols.shared", { name: p.name }));
    await load();
  });

  const archive = run(async (p) => {
    const ok = await confirm({
      title: t("protocols.archiveTitle"),
      message: t("protocols.archiveMessage", { name: p.name }),
      confirmText: t("protocols.archive"),
      cancelText: t("cancel"),
      danger: true,
    });
    if (!ok) return;
    await archiveProtocol(p.id);
    toast.success(t("protocols.archived", { name: p.name }));
    await reload();
  });

  const menu = (p) => {
    const items = [
      { label: t("protocols.preview"), icon: "eye", onSelect: () => preview(p) },
    ];
    if (canEdit) {
      items.push(
        { label: t("protocols.duplicate"), icon: "copy", onSelect: () => duplicate(p) },
        { label: t("protocols.copyTo"), onSelect: () => setCopying(p) },
        { label: p.library_entry_id ? t("protocols.updateLibrary") : t("protocols.shareLibrary"), icon: "library", onSelect: () => share(p) },
        { separator: true },
        { label: t("protocols.archive"), danger: true, onSelect: () => archive(p) },
      );
    }
    return <Menu label={t("protocols.rowActions", { name: p.name })} items={items} />;
  };

  const columns = [
    {
      key: "name",
      header: t("protocols.columns.protocol"),
      primary: true,
      render: (p) => (
        <>
          <Link to={`/studies/${projectId}/protocols/${p.id}`} className="studies-name">{p.name}</Link>
          {p.library_entry_id && <> <Badge tone="outline" icon="library" className="studies-in-library">{t("protocols.inLibrary")}</Badge></>}
          {p.copied_from_id && (
            <div className="ui-tbl-sub studies-sub">
              <Link to={`/library/${p.copied_from_id}`} className="studies-from-lib">
                <Icon name="library" size={12} /> {t("protocols.fromLibraryNote", { name: p.copied_from_name, version: p.copied_from_version })}
              </Link>
            </div>
          )}
          {p.description && !p.copied_from_id && <div className="ui-tbl-sub studies-sub">{p.description}</div>}
        </>
      ),
    },
    { key: "languages", header: t("protocols.columns.languages"), render: (p) => <LangChips codes={(p.languages || []).map((l) => l.code)} /> },
    { key: "version", header: t("protocols.columns.version"), render: (p) => `v${p.version}` },
    { key: "tasks", header: t("protocols.columns.tasks"), align: "num", render: (p) => Number(p.n_tasks || 0) + Number(p.n_quest || 0) },
    { key: "changed", header: t("protocols.columns.changed"), render: (p) => formatRelative(p.updated_at || p.created_at) },
    { key: "actions", header: <span className="ui-sr-only">{t("protocols.columns.actions")}</span>, align: "end", render: menu },
  ];

  if (current === null) return <div className="studies-skeleton" aria-busy="true" aria-label={t("loading")} />;

  const empty = (
    <EmptyState
      icon="file"
      title={t("protocols.empty")}
      description={canEdit ? t("protocols.emptyHint") : undefined}
      action={canEdit ? <Button onClick={onOpenCreate} data-testid="protocols-create-first">{t("protocols.createFirst")}</Button> : undefined}
      data-testid="protocols-empty"
    />
  );

  return (
    <div data-testid="study-protocols">
      <DataTable
        columns={columns}
        rows={current}
        rowKey="protocol_group_id"
        href={(p) => `/studies/${projectId}/protocols/${p.id}`}
        empty={empty}
        caption={t("tabs.protocols")}
        data-testid="study-protocols-table"
      />

      {archived.length > 0 && (
        <details className="studies-archived" data-testid="study-protocols-archived">
          <summary>{t("protocols.archivedSection", { count: archived.length })}</summary>
          <ul>
            {archived.map((p) => (
              <li key={p.protocol_group_id}>
                <span>{p.name}</span> <LangChips codes={(p.languages || []).map((l) => l.code)} />
                <span className="studies-faint"> · v{p.version}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {canEdit && (
        <NewProtocolModal
          open={!!creating}
          onClose={onCloseCreate}
          projectId={projectId}
          existing={[...current, ...archived]}
          onAdded={reload}
        />
      )}
      {canEdit && <CopyToStudyModal protocol={copying} currentId={projectId} onClose={() => setCopying(null)} onPick={copyTo} />}
    </div>
  );
}
