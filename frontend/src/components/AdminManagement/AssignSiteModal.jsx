// frontend/src/components/AdminManagement/AssignSiteModal.jsx
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Modal from "../ProtocolEditor/Modal";
import { fetchSites } from "../../api/sites";
import "./AdminManagement.css";

export default function AssignSiteModal({ user, onClose, onAssign }) {
  const { t } = useTranslation(["admin", "common"]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSites()
      .then(setSites)
      .finally(() => setLoading(false));
  }, []);

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={`${t("management.buttons.assignSite")}: ${user.full_name}`}
      showSaveButton={false}
    >
      <div className="modal-body-list">
        {loading ? (
          <p>{t("loading", { ns: "common" })}...</p>
        ) : (
          <div className="project-selection-list">
            {sites.map(s => (
              <div key={s.id} className="project-selection-item card" style={{ marginBottom: '10px', padding: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong style={{ display: 'block' }}>{s.name}</strong>
                    <span className="text-muted small">{s.description || t("projectDashboard.noDescription")}</span>
                  </div>
                  <button
                    className="btn-primary btn-sm"
                    onClick={() => onAssign(user.user_id, s.id)}
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
