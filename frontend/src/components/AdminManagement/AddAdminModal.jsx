// frontend/src/components/AdminManagement/AddAdminModal.jsx
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import Modal from "../ProtocolEditor/Modal";
import { createAdminApi } from "../../api/users";
import { ROLES } from "../../constants/roles";
import "./AdminManagement.css";

export default function AddAdminModal({ open, onClose, projects, onSuccess }) {
  const { t, i18n } = useTranslation(["admin", "common"]);
  const [formData, setFormData] = useState({
    email: "",
    full_name: "",
    role: ROLES.ADMIN,
    project_ids: []
  });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleToggleProject = (id) => {
    setFormData(prev => ({
      ...prev,
      project_ids: prev.project_ids.includes(id)
        ? prev.project_ids.filter(pId => pId !== id)
        : [...prev.project_ids, id]
    }));
  };

  const handleSubmit = async () => {
    if (!formData.email) return setError(t("adminLogin.errorGeneric"));

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      return setError("Please enter a valid email format");
    } 

    setIsSubmitting(true);
    setError("");
    try {
      await createAdminApi({
        ...formData,
        lang: i18n.language
      });
      onSuccess();
      onClose();
      setFormData({ email: "", full_name: "", role: ROLES.ADMIN, project_ids: [] });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal 
      open={open} 
      onClose={onClose} 
      title={t("management.addUser")}
      onSave={handleSubmit}
      showSaveButton={true}
      saveLabel={isSubmitting ? t("common:saving") : t("management.addUser")}
    >
      <div className="admin-form-container">
        <div className="form-group">
          <label className="form-label">
            {t("management.table.user")} <span className="label-required">*</span>
          </label>
          <input 
            className="participant-input"
            type="email"
            value={formData.email}
            onChange={(e) => {
                setFormData({...formData, email: e.target.value})
                if (error) setError("");
            }}
            placeholder="admin@example.com"
          />
        </div>

        <div className="form-group">
          <label className="form-label">{t("management.table.fullName")}</label>
          <input 
            className="participant-input"
            value={formData.full_name}
            onChange={(e) => setFormData({...formData, full_name: e.target.value})}
            placeholder="e.g. John Doe"
          />
        </div>
        
        <div className="form-group">
          <label className="form-label">{t("management.table.role")}</label>
          <select
            className="participant-input"
            value={formData.role}
            onChange={(e) => setFormData({ ...formData, role: e.target.value })}
          >
            <option value={ROLES.ADMIN}>Admin</option>
            <option value={ROLES.SURVEY_AGENCY}>Survey Agency</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">{t("adminDashboard.projectsTitle")}</label>
          <div className="project-selection-grid">
            {projects.map(p => (
              <div className="project-selection-checkbox">
                <label key={p.project_id} className="checkbox-label">
                  <input 
                    type="checkbox" 
                    className="checkbox-input"
                    checked={formData.project_ids.includes(p.project_id)}
                    onChange={() => handleToggleProject(p.project_id)}
                  />
                  <span>{p.project_name}</span>
                </label>
              </div>
            ))}
          </div>
        </div>

        {error && <div className="validation-error-msg">{error}</div>}
      </div>
    </Modal>
  );
}