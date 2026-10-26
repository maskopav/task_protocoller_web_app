// src/pages/ProtocolEditorPage.jsx — the protocol workspace at #/studies/:projectId/protocols/:protocolId.
// An existing protocol is always loaded by id (a direct link has no router state). `protocolId` "new" is an
// unsaved draft handed over in the router state; once saved, the page moves to the real id (F-058).
import React, { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import ProtocolEditor from "../components/ProtocolEditor";
import { useMappings } from "../context/MappingContext";
import { fetchProject } from "../api/projects";
import { getProtocolById, getProtocolsByProjectId } from "../api/protocols";
import { Button, EmptyState, useToast } from "../components/ui";
import { mapProtocolWithNames } from "./studies/protocolMapping";
import { isArchived } from "./studies/studyHelpers";
import "./studies/studies.css";

export default function ProtocolEditorPage() {
  const { projectId, protocolId } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const { t } = useTranslation("studies");
  const { mappings, refreshMappings } = useMappings();
  const isNew = protocolId === "new";

  const [study, setStudy] = useState(null);
  const [loaded, setLoaded] = useState(null); // { protocol, tasks, canEdit, variants }
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setStudy(null);
    fetchProject(projectId).then((s) => { if (live) setStudy(s); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [projectId]);

  const mappingsReady = !!(mappings?.languages && mappings?.tasks);
  useEffect(() => {
    if (isNew || !mappingsReady) return undefined;
    let live = true;
    setLoaded(null);
    setFailed(false);
    (async () => {
      try {
        const [raw, groups] = await Promise.all([
          getProtocolById(protocolId),
          getProtocolsByProjectId(projectId).catch(() => []),
        ]);
        if (!live) return;
        // A protocol of another study (or a library entry) is not shown under this study.
        if (raw.project_id == null || Number(raw.project_id) !== Number(projectId)) { setFailed(true); return; }
        const mapped = mapProtocolWithNames(raw, mappings);
        const group = groups.find((g) => g.protocol_group_id === raw.protocol_group_id);
        setLoaded({
          protocol: { ...mapped, projectId },
          tasks: mapped.tasks,
          canEdit: raw.can_edit !== false,
          variants: (group?.languages || []).map((l) => ({ code: l.code, protocol_id: l.protocol_id })),
        });
      } catch (err) {
        console.error("Failed to load protocol:", protocolId, err);
        if (live) setFailed(true);
      }
    })();
    return () => { live = false; };
    // mappings only supply the language and task names
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [protocolId, projectId, isNew, mappingsReady]);

  const onSaved = async (result) => {
    // All tables: a partial refresh would drop the languages and tasks. The save
    // already succeeded, so a failed refresh must not report it as failed.
    await refreshMappings().catch((err) => console.error("Mappings refresh failed after save:", err));
    const newId = result?.protocol_id;
    toast.success(isNew ? t("editor.created") : t("editor.saved"));
    // Never navigate to /protocols/undefined: without an id, fall back to the list.
    navigate(newId ? `/studies/${projectId}/protocols/${newId}` : `/studies/${projectId}/protocols`, { replace: true });
  };

  if (failed) {
    return (
      <EmptyState
        icon="file"
        title={t("editor.notFound")}
        action={<Button as={Link} to={`/studies/${projectId}/protocols`}>{t("editor.backToProtocols")}</Button>}
        data-testid="protocol-not-found"
      />
    );
  }

  // The preview hands the unsaved edits back in the state; a draft arrives as state.draft.
  const draft = isNew ? (state?.draft ?? (state?.protocol ? { ...state.protocol, tasks: state.originalTasks ?? state.protocol.tasks } : null)) : null;
  if (isNew && !draft) return <Navigate to={`/studies/${projectId}/protocols`} replace />;

  if (!study || (!isNew && !loaded)) {
    return <div className="studies-skeleton" aria-busy="true" aria-label={t("loading")} />;
  }

  if (isNew) {
    const { tasks = [], ...protocol } = draft;
    return (
      <ProtocolEditor
        key="new"
        projectId={projectId}
        study={study}
        protocol={{ ...protocol, projectId }}
        initialTasks={tasks}
        isDraft
        readOnly={isArchived(study)}
        readOnlyReason={t("editor.archivedReadOnly")}
        onSaved={onSaved}
      />
    );
  }

  const archived = isArchived(study);
  const readOnly = !loaded.canEdit || archived;
  const restored = state?.originalTasks && state?.protocol?.id === loaded.protocol.id
    ? { protocol: { ...state.protocol, projectId }, tasks: state.originalTasks }
    : undefined;

  return (
    <ProtocolEditor
      key={protocolId}
      projectId={projectId}
      study={study}
      protocol={loaded.protocol}
      initialTasks={loaded.tasks}
      restored={restored}
      variants={loaded.variants}
      readOnly={readOnly}
      readOnlyReason={loaded.canEdit ? t("editor.archivedReadOnly") : t("editor.readOnlyBanner", { name: study.creator_name || "—" })}
      onSaved={onSaved}
    />
  );
}
