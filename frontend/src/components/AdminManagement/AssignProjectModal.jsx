// frontend/src/components/AdminManagement/AssignProjectModal.jsx
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Modal from "../ProtocolEditor/Modal";
import { fetchProjectsList } from "../../api/projects";
import "./AdminManagement.css";

export default function AssignProjectModal({ user, onClose, onAssign }) {
  const { t } = useTranslation(["admin", "common"]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProjectsList()
      .then(setProjects)
      .finally(() => setLoading(false));

    console.log(projects);
  }, []);

  return (
    <Modal 
      open={true} 
      onClose={onClose} 
      title={`${t("management.buttons.assign")}: ${user.full_name}`}
      showSaveButton={false}
    >
      <div className="modal-body-list">
        {loading ? (
          <p>{t("loading", { ns: "common" })}...</p>
        ) : (
          <div className="project-selection-list">
            {projects.map(p => (
              <div key={p.project_id} className="project-selection-item card" style={{ marginBottom: '10px', padding: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong style={{ display: 'block' }}>{p.project_name}</strong>
                    <span className="text-muted small">{p.description || t("projectDashboard.noDescription")}</span>
                  </div>
                  <button 
                    className="btn-primary btn-sm" 
                    onClick={() => onAssign(user.user_id, p.project_id)}
                  >
                    + {t("management.buttons.assignShort", "Assign")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}