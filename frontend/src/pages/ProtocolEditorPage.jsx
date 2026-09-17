// src/pages/ProtocolEditorPage.jsx
import React, { useState, useContext, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import ProtocolEditor from "../components/ProtocolEditor";
import { ProtocolContext } from "../context/ProtocolContext";
import { useMappings } from "../context/MappingContext";
import { useConfirm } from "../components/ConfirmDialog/ConfirmDialogContext";
import DashboardTopBar from "../components/DashboardTopBar/DashboardTopBar";
import { getProtocolById } from "../api/protocols";
import { mapProtocolWithNames } from "../hooks/useProtocolActions";
import "./Pages.css"

function attachIds(protocol, projectId, protocolId) {
  if (!protocol) return null;
  return {
    ...protocol,
    projectId,
    protocolId
  };
}  

export default function ProtocolEditorPage() {
  const { t } = useTranslation(["admin"]);
  const { projectId, protocolId } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const { selectedProtocol, setSelectedProtocol } = useContext(ProtocolContext);
  const { refreshMappings, mappings } = useMappings();
  const confirm = useConfirm();

  // 1. Prepare restored data
  const restoredTasks = state?.originalTasks || state?.protocol?.tasks || selectedProtocol?.tasks || [];
  
  // 2. If we have original tasks, ensure the protocol object passed to the editor uses them
  const restoredProtocol = state?.protocol ? { ...state.protocol, tasks: restoredTasks } : selectedProtocol;

  const [configuredTasks, setConfiguredTasks] = useState(restoredTasks);
  const [protocolData, setProtocolData] = useState(
    attachIds(restoredProtocol || null, projectId, protocolId)
  );
  // React Router's `state` (and the in-memory ProtocolContext fallback) don't
  // survive a hard refresh or a direct/bookmarked link. When neither has the
  // protocol, fetch it by id instead of rendering an editor with silently
  // empty tasks. ProtocolEditor reads `initialTasks` only on mount, so hold
  // off rendering it until the data is in.
  const [loading, setLoading] = useState(!restoredProtocol);

  const testingMode = state?.testingMode ?? false;
  const editingMode = state?.editingMode ?? false;

  // Keep context in sync (in case of page refresh)
  useEffect(() => {
    if (state?.protocol && !selectedProtocol) {
      setSelectedProtocol(state.protocol);
    }
  }, [state, selectedProtocol, setSelectedProtocol]);

  useEffect(() => {
    if (restoredProtocol || !protocolId || !mappings?.languages || !mappings?.tasks) return;

    let cancelled = false;
    (async () => {
      try {
        const mapped = mapProtocolWithNames(await getProtocolById(protocolId), mappings);
        if (cancelled) return;
        setSelectedProtocol(mapped);
        setProtocolData(attachIds(mapped, projectId, protocolId));
        setConfiguredTasks(mapped?.tasks || []);
      } catch (err) {
        console.error("Failed to load protocol:", protocolId, err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [protocolId, mappings?.languages, mappings?.tasks]);

  async function handleSave() {
    // ProtocolEditor.jsx: handleSaveProtocol calls saveNewProtocol -> then onSave(result).
    // This means the saving happens INSIDE ProtocolEditor. 
    console.log("✅ Protocol saved, refreshing mappings...");
    try {
      await refreshMappings(["protocols"]); // reload relevant tables
      console.log("Mappings refreshed successfully.");
    } catch (err) {
      console.error("❌ Failed to refresh mappings:", err);
    }
  }

  // Back navigation handler
  async function handleBack() {
    const isConfirmed = await confirm({
      title: t("protocolEditor.confirmBack.title"),
      message: t("protocolEditor.confirmBack.message"),
      confirmText: t("protocolEditor.confirmBack.confirmText"),
      cancelText: t("protocolEditor.buttons.cancel") //
    });

    if (isConfirmed) {
      // Clean environment
      setSelectedProtocol(null);
      // Redirect to dashboard
      navigate(`/admin/projects/${projectId}/protocols`);
    }
  };

  if (loading) {
    return (
      <div className="protocol-editor-page">
        <DashboardTopBar onBack={handleBack} />
        <p>{t("loading")}</p>
      </div>
    );
  }

  return (
    <div className="protocol-editor-page">
      <DashboardTopBar
        onBack={handleBack}
      />

      <ProtocolEditor
        initialTasks={configuredTasks}
        onChange={setConfiguredTasks}
        protocol={protocolData}
        onSave={handleSave}
        testingMode={testingMode}
        editingMode={editingMode}
      />
    </div>
  );
}
