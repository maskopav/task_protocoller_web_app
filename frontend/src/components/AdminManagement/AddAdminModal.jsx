// frontend/src/components/AdminManagement/AddAdminModal.jsx
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import Modal from "../ProtocolEditor/Modal";
import { createAdminApi } from "../../api/users";
import "./AdminManagement.css";

export default function AddAdminModal({ open, onClose, projects, sites = [], onSuccess }) {
  const { t, i18n } = useTranslation(["admin", "common"]);
  const [formData, setFormData] = useState({
    email: "",
    full_name: "",
    project_ids: [],
    site_ids: [],
    can_create_projects: false,
    can_create_sites: false
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

  const handleToggleSite = (id) => {
    setFormData(prev => ({
      ...prev,
      site_ids: prev.site_ids.includes(id)
        ? prev.site_ids.filter(sId => sId !== id)
        : [...prev.site_ids, id]
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
      setFormData({ email: "", full_name: "", project_ids: [], site_ids: [], can_create_projects: false, can_create_sites: false });
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
          <label className="form-label">{t("adminDashboard.projectsTitle")}</label>
          <div className="project-selection-grid">
            {projects.map(p => (
              <div key={p.project_id} className="project-selection-checkbox">
                <label className="checkbox-label">
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

        {/* Site access is a separate grant from project access — a site is only
            visible to an admin listed in user_sites for it. */}
        <div className="form-group">
          <label className="form-label">{t("management.siteAssignments.title")}</label>
          <div className="project-selection-grid">
            {sites.map(s => (
              <div key={s.id} className="project-selection-checkbox">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    className="checkbox-input"
                    checked={formData.site_ids.includes(s.id)}
                    onChange={() => handleToggleSite(s.id)}
                  />
                  <span>{s.name}</span>
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* Creating projects is the one right that does not follow from any
            assignment — only a master can hand it out. */}
        <div className="form-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              className="checkbox-input"
              checked={formData.can_create_projects}
              onChange={() => setFormData(prev => ({
                ...prev,
                can_create_projects: !prev.can_create_projects,
              }))}
            />
            <span>{t("management.table.canCreateProjects")}</span>
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              className="checkbox-input"
              checked={formData.can_create_sites}
              onChange={() => setFormData(prev => ({
                ...prev,
                can_create_sites: !prev.can_create_sites,
              }))}
            />
            <span>{t("management.table.canCreateSites")}</span>
          </label>
        </div>

        {error && <div className="validation-error-msg">{error}</div>}
      </div>
    </Modal>
  );
}