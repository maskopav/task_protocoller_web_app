// src/pages/studies/StudyPage.jsx — one study with its tabs (docs/ui_redesign/02_spec.md section 6.4).
import React, { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useUser } from "../../context/UserContext";
import { archiveProject, fetchProject } from "../../api/projects";
import {
  Badge, Button, EmptyState, Icon, Menu, PageHeader, Tabs, useConfirm, useToast,
} from "../../components/ui";
import { apiErrorMessage } from "../../utils/apiError";
import { clinicCounts, isArchived } from "./studyHelpers";
import ProtocolsTab from "./tabs/ProtocolsTab";
import ClinicsTab from "./tabs/ClinicsTab";
import RecordingsTab from "./tabs/RecordingsTab";
import EditorsTab from "./tabs/EditorsTab";
import SettingsTab from "./tabs/SettingsTab";
import "./studies.css";

const OWNED_TABS = ["protocols", "clinics", "recordings", "editors", "settings"];
const RECEIVED_TABS = ["protocols", "recordings", "settings"];

/** `#/studies/:id` opens the Protocols tab. */
export function StudyIndexRedirect() {
  const { projectId } = useParams();
  return <Navigate to={`/studies/${projectId}/protocols`} replace />;
}

export default function StudyPage() {
  const { projectId, tab = "protocols" } = useParams();
  const { t } = useTranslation("studies");
  const { t: ta } = useTranslation("admin");
  const { user } = useUser();
  const toast = useToast();
  const confirm = useConfirm();
  const isMaster = user?.role_id === 1;

  const [study, setStudy] = useState(null);
  const [failed, setFailed] = useState(false);
  const [newProtocol, setNewProtocol] = useState(false);
  const [addEditor, setAddEditor] = useState(false);
  const [settingsDirty, setSettingsDirty] = useState(false);

  const load = useCallback(async () => {
    try {
      setStudy(await fetchProject(projectId));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [projectId]);

  useEffect(() => {
    setStudy(null);
    setFailed(false);
    load();
  }, [load]);

  if (failed) {
    return (
      <EmptyState
        icon="study"
        title={t("study.notFound")}
        description={t("study.notFoundHint")}
        action={<Button as={Link} to="/studies">{t("study.backToStudies")}</Button>}
        data-testid="study-not-found"
      />
    );
  }
  if (!study) return <div className="studies-skeleton" aria-busy="true" aria-label={t("loading")} />;

  const canEdit = !!study.can_edit;
  const archived = isArchived(study);
  const tabs = canEdit ? OWNED_TABS : RECEIVED_TABS;
  if (!tabs.includes(tab)) return <Navigate to={`/studies/${projectId}/protocols`} replace />;

  const id = study.project_id;
  const name = study.project_name;
  const canArchive = canEdit && (isMaster || study.is_owner);
  const base = `/studies/${id}`;

  const toggleArchive = async () => {
    const ok = await confirm({
      title: archived ? t("study.restoreTitle") : t("study.archiveTitle"),
      message: archived ? t("study.restoreMessage", { name }) : t("study.archiveMessage", { name }),
      confirmText: archived ? t("study.restore") : t("study.archive"),
      cancelText: t("cancel"),
      danger: !archived,
    });
    if (!ok) return;
    try {
      await archiveProject(id, !archived);
      toast.success(archived ? t("study.restored", { name }) : t("study.archived", { name }));
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err, ta));
    }
  };

  let primary = null;
  if (canEdit && tab === "protocols" && !archived) {
    primary = <Button variant="primary" icon="plus" onClick={() => setNewProtocol(true)} data-testid="study-new-protocol">{t("protocols.new")}</Button>;
  } else if (canEdit && tab === "editors") {
    primary = <Button variant="primary" icon="plus" onClick={() => setAddEditor(true)} data-testid="study-add-editor">{t("editors.add")}</Button>;
  } else if (canEdit && tab === "settings") {
    primary = (
      <Button variant="primary" type="submit" form="study-settings-form" disabled={!settingsDirty} data-testid="study-settings-save">
        {t("settings.save")}
      </Button>
    );
  }

  const clinics = clinicCounts(study);
  const tabItems = tabs.map((key) => ({
    to: `${base}/${key}`,
    label: key === "settings" && !canEdit ? t("tabs.about") : t(`tabs.${key}`),
    count: key === "protocols" ? study.protocol_count : key === "clinics" ? (clinics.partial ? t("list.countVisible", { count: clinics.total, visible: clinics.visible }) : study.site_count) : undefined,
    testId: `study-tab-${key}`,
  }));

  const sub = [study.description, study.countries].filter(Boolean).join(" · ");

  return (
    <div className="studies-page" data-testid="study-page">
      <PageHeader
        breadcrumbs={[{ label: t("list.title"), to: "/studies" }, { label: name }]}
        title={name}
        badges={(
          <>
            <Badge tone={archived ? "neutral" : "ok"} data-testid="study-status">{archived ? t("status.archived") : t("status.active")}</Badge>
            {canEdit ? null : <Badge lock data-testid="study-received-badge">{t("study.received")}</Badge>}
            {clinics.total > 1 && (
              <Badge tone="accent">
                {clinics.partial
                  ? t("study.sharedWithVisible", { count: clinics.total, visible: clinics.visible })
                  : t("study.sharedWith", { count: clinics.total })}
              </Badge>
            )}
          </>
        )}
        sub={sub || undefined}
        actions={(
          <>
            {canArchive && (
              <Menu
                label={t("study.more")}
                items={[{ label: archived ? t("study.restore") : t("study.archive"), danger: !archived, onSelect: toggleArchive }]}
              />
            )}
            {primary}
          </>
        )}
      />

      {!canEdit && (
        <div className="studies-banner" role="note" data-testid="study-received-banner">
          <Icon name="lock" />
          <span>{t("study.managedBy", { name: study.creator_name || "—" })}</span>
        </div>
      )}
      {canEdit && archived && (
        <div className="studies-banner studies-banner-warn" role="note" data-testid="study-archived-banner">
          <Icon name="alert" />
          <span>{t("study.archivedBanner")}</span>
        </div>
      )}

      <Tabs items={tabItems} label={name} />

      {tab === "protocols" && (
        <ProtocolsTab
          study={study}
          canEdit={canEdit && !archived}
          creating={newProtocol}
          onOpenCreate={() => setNewProtocol(true)}
          onCloseCreate={() => setNewProtocol(false)}
          onChanged={load}
        />
      )}
      {tab === "clinics" && <ClinicsTab study={study} onChanged={load} />}
      {tab === "recordings" && <RecordingsTab study={study} />}
      {tab === "editors" && <EditorsTab study={study} adding={addEditor} onCloseAdd={() => setAddEditor(false)} />}
      {tab === "settings" && <SettingsTab study={study} canEdit={canEdit} onChanged={load} onDirtyChange={setSettingsDirty} />}
    </div>
  );
}
