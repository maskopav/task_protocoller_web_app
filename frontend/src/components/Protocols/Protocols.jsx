import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useMappings } from "../../context/MappingContext";
import ProtocolLanguageSelector from "../ProtocolLanguageSelector";
import { useProtocolActions } from "../../hooks/useProtocolActions";
import { useParams } from "react-router-dom";
import { getProtocolsByProjectId } from "../../api/protocols";
import EnrollmentModal from "./EnrollmentModal";
import "./Protocols.css";

export default function Protocols({ onSelectProtocol }) {
  const { t } = useTranslation(["admin", "common"]);
  const { mappings } = useMappings();
  const { projectId } = useParams();
  const [protocols, setProtocols] = useState([]);
  const [loadingProtocols, setLoadingProtocols] = useState(false);
  const [protocolName, setProtocolName] = useState("");
  const [protocolDescription, setProtocolDescription] = useState("");
  const [protocolLanguage, setProtocolLanguage] = useState("en");
  const [selectedEnrollment, setSelectedEnrollment] = useState(null);

  const { viewProtocol, editProtocol, duplicateProtocol } = useProtocolActions();

  const languages = mappings?.languages || [];

  const existingNames = protocols.map((p) => p.name.toLowerCase().trim());
  const nameExists = existingNames.includes(protocolName.toLowerCase().trim());

  const getLangName = (id) =>
    languages.find((l) => l.id === id)?.name || id;

  const currentProject = mappings?.projects?.find(p => p.id === Number(projectId));
  const projectName = currentProject?.name || "Current Project";
  const isReadOnly = currentProject?.is_active === 0;

  useEffect(() => {
    if (!projectId) return;

    async function loadProjectProtocols() {
      setLoadingProtocols(true);
      try {
        const data = await getProtocolsByProjectId();
        setProtocols(data);
      } catch (err) {
        console.error("Failed to load project protocols:", err);
      } finally {
        setLoadingProtocols(false);
      }
    }

    loadProjectProtocols();
  }, [projectId]);

  const currentProtocols = protocols.filter(p => p.is_current == 1).filter(p => p.project_id == projectId);
  // Archived/Other protocols: Anything not current in this project
  const archivedProtocols = protocols.filter(p => 
    p.is_current != 1 || p.project_id != projectId
  );

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
              <th>{t("protocolDashboard.table.version")}</th>
              <th>{t("protocolDashboard.table.tasks")}</th> 
              <th>{t("protocolDashboard.table.quests")}</th>
              <th>{t("protocolDashboard.table.createdAt")}</th>
              {isHistory && <th>{t("protocolDashboard.table.projectName")}</th>}
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
                  <td>{p.version}</td>
                  {/* Display Aggregated Counts */}
                  <td>{p.n_tasks}</td>
                  <td>{p.n_quest}</td>
                  <td>{p.created_at?.slice(0, 10)}</td>
                  {isHistory && <td>{p.project_name}</td>}
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
                    {allowEdit && (
                      <button
                        className="btn-share"
                        onClick={() => setSelectedEnrollment(p)}
                        disabled={isReadOnly}
                        title={t("protocolDashboard.buttons.share")}
                      >
                        🔀
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
              {t("protocolDashboard.nameExists")}
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

      {/* Render the modal if a protocol is selected */}
      {selectedEnrollment && (
        <EnrollmentModal 
          protocol={selectedEnrollment} 
          onClose={() => setSelectedEnrollment(null)} 
        />
      )}

      <ProtocolTableSection
        list={archivedProtocols}
        title={t("protocolDashboard.archivedProtocols")}
        allowEdit={false}
        isHistory={true}
      />
    </div>
  );
}