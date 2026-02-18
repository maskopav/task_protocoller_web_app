// src/pages/ProtocolEditorPage.jsx
import React, { useState, useContext, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import ProtocolEditor from "../components/ProtocolEditor";
import { ProtocolContext } from "../context/ProtocolContext";
import { useMappings } from "../context/MappingContext";
import { useConfirm } from "../components/ConfirmDialog/ConfirmDialogContext";
import DashboardTopBar from "../components/DashboardTopBar/DashboardTopBar";
import { getProtocolById } from "../api/protocols"; // 1. Import API
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
  const { refreshMappings } = useMappings();
  const confirm = useConfirm();

  const [configuredTasks, setConfiguredTasks] = useState(state?.protocol?.tasks || selectedProtocol?.tasks || []);
  const [protocolData, setProtocolData] = useState(
    attachIds(state?.protocol || selectedProtocol || null, projectId, protocolId)
  );

  const testingMode = state?.testingMode ?? false;
  const editingMode = state?.editingMode ?? false;

  // Keep context in sync (in case of page refresh)
  useEffect(() => {
    if (state?.protocol && !selectedProtocol) {
      setSelectedProtocol(state.protocol);
    }
  }, [state, selectedProtocol, setSelectedProtocol]);

  useEffect(() => {
    console.log("Loaded protocol:", protocolId, protocolData);
    if (!protocolData) {
      // TODO: fetch from backend using protocolId if needed
    }
  }, [protocolId, protocolData]);

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
