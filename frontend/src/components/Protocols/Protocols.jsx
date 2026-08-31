import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useMappings } from "../../context/MappingContext";
import ProtocolLanguageSelector from "../ProtocolLanguageSelector/ProtocolLanguageSelector";
import { useProtocolActions } from "../../hooks/useProtocolActions";
import { useConfirm } from "../ConfirmDialog/ConfirmDialogContext";
import { useParams } from "react-router-dom";
import { getProtocolsByProjectId, getArchivedProtocols, archiveProtocol as archiveProtocolApi } from "../../api/protocols";
import "./Protocols.css";

export default function Protocols({ onSelectProtocol }) {
  const { t } = useTranslation(["admin", "common"]);
  const { mappings } = useMappings();
  const { projectId } = useParams();
  const [protocols, setProtocols] = useState([]);
  const [archivedList, setArchivedList] = useState([]);
  const [loadingProtocols, setLoadingProtocols] = useState(false);
  const [protocolName, setProtocolName] = useState("");
  const [protocolDescription, setProtocolDescription] = useState("");
  const [protocolLanguage, setProtocolLanguage] = useState("en");

  const { viewProtocol, editProtocol, duplicateProtocol } = useProtocolActions();
  const confirm = useConfirm();

  const languages = mappings?.languages || [];

  const existingNames = protocols.map((p) => p.name.toLowerCase().trim());
  const nameExists = existingNames.includes(protocolName.toLowerCase().trim());

  const getLangName = (id) =>
    languages.find((l) => l.id === id)?.name || id;

  const currentProject = mappings?.projects?.find(p => p.id === Number(projectId));
  const projectName = currentProject?.name || "Current Project";
  const isReadOnly = currentProject?.is_active === 0;

  const loadProtocols = useCallback(async () => {
    setLoadingProtocols(true);
    try {
      const [data, archived] = await Promise.all([
        getProtocolsByProjectId(),
        getArchivedProtocols(),
      ]);
      setProtocols(data);
      setArchivedList(archived);
    } catch (err) {
      console.error("Failed to load project protocols:", err);
    } finally {
      setLoadingProtocols(false);
    }
  }, []);

  useEffect(() => {
    if (!projectId) return;
    loadProtocols();
  }, [projectId, loadProtocols]);

  const handleArchive = async (protocol) => {
    const isConfirmed = await confirm({
      title: t("protocolDashboard.confirmArchiveTitle"),
      message: t("protocolDashboard.confirmArchiveMsg", { name: protocol.name }),
      confirmText: t("protocolDashboard.buttons.archive"),
      cancelText: t("common:cancel"),
    });
    if (!isConfirmed) return;

    try {
      await archiveProtocolApi(protocol.id);
      await loadProtocols();
    } catch (err) {
      console.error("Failed to archive protocol:", err);
    }
  };

  const currentProtocols = protocols.filter(p => p.is_current == 1).filter(p => p.project_id == projectId);
  // Other protocols: old versions, other projects' protocols, and truly archived ones
  const archivedProtocols = [
    ...protocols.filter(p => p.is_current != 1 || p.project_id != projectId),
    ...archivedList.map(p => ({ ...p, project_name: t("protocolDashboard.archivedLabel"), isArchived: true })),
  ];

  if (loadingProtocols) return <p>{t("loading")}</p>;

  // Internal helper for table sections
  const ProtocolTableSection = ({ list, title, allowEdit, isHistory }) => (
    <div className="section card">
      <h4 className="section-title">{title}</h4>
      <div className="table-scroll-area">
        <table className="table">
          <thead>
            <tr>
              <th>{t("protocolDashboard.table.name")}</th>
              <th>{t("protocolDashboard.table.language")}</th>
              <th>{t("protocolDashboard.table.description")}</th>
              {isHistory && <th>{t("protocolDashboard.table.projectName")}</th>}
              <th>{t("protocolDashboard.table.version")}</th>
              <th>{t("protocolDashboard.table.tasks")}</th>
              <th>{t("protocolDashboard.table.quests")}</th>
              <th>{t("protocolDashboard.table.createdAt")}</th>
              <th>{t("protocolDashboard.table.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={isHistory ? "9" : "8"} className="empty-row">
                  {t("protocolDashboard.noData", "No protocols found.")}
                </td>
              </tr>
            ) : (
              list.map((p) => (
                <tr key={p.id}>
                  <td className="highlighted">{p.name}</td>
                  <td>{getLangName(p.language_id)}</td>
                  <td>{p.description}</td>
                  {isHistory && (
                    <td>
                      <span className={`status-badge ${p.isArchived ? "archived" : "in-other-project"}`}>
                        {p.project_name}
                      </span>
                    </td>
                  )}
                  <td>{p.version}</td>
                  {/* Display Aggregated Counts */}
                  <td>{p.n_tasks}</td>
                  <td>{p.n_quest}</td>
                  <td>{p.created_at?.slice(0, 10)}</td>
                  <td className="actions">
                    <button
                      className="btn-view"
                      onClick={() => viewProtocol(p.id)}
                      title={t("protocolDashboard.buttons.show")}
                    >
                      {t("protocolDashboard.buttons.show")}
                    </button>
                    {allowEdit && (
                      <button
                        className="btn-edit"
                        onClick={() => editProtocol(p.id)}
                        disabled={isReadOnly}
                        title={t("protocolDashboard.buttons.edit")}
                      >
                        {t("protocolDashboard.buttons.edit")}
                      </button>
                    )}
                    <button
                      className="btn-duplicate"
                      onClick={() => duplicateProtocol(p.id)}
                      disabled={isReadOnly}
                      title={t("protocolDashboard.buttons.duplicate")}
                    >
                      {t("protocolDashboard.buttons.duplicate")}
                    </button>
                    {!isHistory && (
                      <button
                        className="btn-archive"
                        onClick={() => handleArchive(p)}
                        disabled={isReadOnly}
                        title={t("protocolDashboard.buttons.archive")}
                      >
                        {t("protocolDashboard.buttons.archive")}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="protocol-page">
      {/* Header Title - Smaller padding */}
      <h2 className="page-title">{projectName + ': ' + t("protocolDashboard.title")}</h2>
      {isReadOnly && (
          <p className="inactive-mode-warning">
            ⚠️{t("projectDashboard.status.inactive") + ": "+ t("projectDashboard.status.inactiveMode")}
          </p>
        )}

      {/* Create Section - Header with Button + Inputs Row */}
      <div className="card compact-create">
        {/* Header Row: Title on Left, Button on Right */}
        <div className="section-header create-header-row">
          <span className="section-title">{t("protocolDashboard.createNew")}</span>
          <button
            className="btn-create"
            disabled={!protocolName.trim() || nameExists || isReadOnly}
            onClick={() =>
              onSelectProtocol({
                name: protocolName,
                language: protocolLanguage,
                description: protocolDescription,
              })
            }
          >
            + {t("protocolDashboard.buttons.create")}
          </button>
        </div>

        {/* Inputs Row */}
        <div className="create-inputs-container">
          <div className="create-inputs-row">
            <div className="input-group name-group">
              <label>{t("protocolDashboard.namePlaceholder")}:</label>
              <input
                type="text"
                className={`input ${nameExists ? "input-error" : ""}`}
                disabled={isReadOnly}
                value={protocolName}
                onChange={(e) => setProtocolName(e.target.value)}
              />
            </div>

            <div className="input-group grow">
              <label>{t("protocolDashboard.descriptionPlaceholder")}:</label>
              <input
                type="text"
                className="input"
                disabled={isReadOnly}
                value={protocolDescription}
                onChange={(e) => setProtocolDescription(e.target.value)}
              />
            </div>

            <div className="input-group lang-group">
              <ProtocolLanguageSelector
                value={protocolLanguage}
                onChange={setProtocolLanguage}
              />
            </div>
          </div>
          
          {nameExists && (
            <div className="error-text">
              {t("validation.protocol.nameExists")}
            </div>
          )}
        </div>
      </div>

      {/* Two Separate Tables */}
      <ProtocolTableSection
        list={currentProtocols}
        title={t("protocolDashboard.currentProtocols")}
        allowEdit={true}
        isHistory={false}
      />

      <ProtocolTableSection
        list={archivedProtocols}
        title={t("protocolDashboard.archivedProtocols")}
        allowEdit={false}
        isHistory={true}
      />
    </div>
  );
}