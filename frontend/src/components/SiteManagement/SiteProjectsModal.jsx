// frontend/src/components/SiteManagement/SiteProjectsModal.jsx
// Assign/remove the projects a site inherits its protocols from.
import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Modal from "../ProtocolEditor/Modal";
import { fetchSiteById, assignProjectToSite, removeProjectFromSite } from "../../api/sites";
import { useMappings } from "../../context/MappingContext";

export default function SiteProjectsModal({ site, onClose, onChanged }) {
  const { t } = useTranslation(["admin", "common"]);
  const { mappings } = useMappings();
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");

  const loadDetail = useCallback(async () => {
    try {
      setDetail(await fetchSiteById(site.id));
    } catch (err) {
      setError(err.message);
    }
  }, [site.id]);

  useEffect(() => { loadDetail(); }, [loadDetail]);

  const assignedIds = new Set((detail?.projects || []).map(p => p.id));
  const availableProjects = (mappings?.projects || []).filter(p => !assignedIds.has(p.id));

  const handleAssign = async (projectId) => {
    setError("");
    try {
      await assignProjectToSite(site.id, projectId);
      await loadDetail();
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRemove = async (projectId) => {
    setError("");
    try {
      await removeProjectFromSite(site.id, projectId);
      await loadDetail();
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={`${t("management.siteManagement.manageProjects")}: ${site.name}`}
      showSaveButton={false}
    >
      <div className="modal-body-list">
        {!detail ? (
          <p>{t("loading", { ns: "common" })}...</p>
        ) : (
          <>
            <h4>{t("management.siteManagement.assignedProjects")}</h4>
            {detail.projects.length === 0 && (
              <p className="text-muted small">{t("management.siteManagement.noAssignedProjects")}</p>
            )}
            {detail.projects.map(p => (
              <div key={p.id} className="project-selection-item card" style={{ marginBottom: '10px', padding: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong>{p.name}</strong>
                  <button className="btn-secondary btn-sm" onClick={() => handleRemove(p.id)}>
                    ✖ {t("management.buttons.remove", "Remove")}
                  </button>
                </div>
              </div>
            ))}

            <h4>{t("management.siteManagement.availableProjects")}</h4>
            {availableProjects.map(p => (
              <div key={p.id} className="project-selection-item card" style={{ marginBottom: '10px', padding: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong style={{ display: 'block' }}>{p.name}</strong>
                    <span className="text-muted small">{p.description || t("projectDashboard.noDescription")}</span>
                  </div>
                  <button className="btn-primary btn-sm" onClick={() => handleAssign(p.id)}>
                    + {t("management.buttons.assignShort", "Assign")}
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
        {error && <div className="validation-error-msg">{error}</div>}
      </div>
    </Modal>
  );
}