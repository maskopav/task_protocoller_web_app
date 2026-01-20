// frontend/src/components/ProjectManagement/AddProjectModal.jsx
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import Modal from "../ProtocolEditor/Modal";
import { createProjectApi } from "../../api/projects";
import { useUser } from "../../context/UserContext";

export default function AddProjectModal({ open, onClose, onSuccess }) {
  const { t } = useTranslation(["admin", "common"]);
  const { user } = useUser();
  const [formData, setFormData] = useState({
    name: "", description: "", frequency: "", country: "", contact_person: ""
  });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (error) setError(""); 
  };

  const handleSubmit = async () => {
    if (!formData.name) return setError(t("projectDashboard.errors.nameRequired"));
    setIsSubmitting(true);
    try {
      await createProjectApi({
        ...formData,
        created_by: user.id
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal 
      open={open} onClose={onClose} 
      title={t("management.projectManagement.createNew", "Create New Project")}
      onSave={handleSubmit} showSaveButton={true}
      saveLabel={isSubmitting ? t("common:saving") : t("common:save")}
    >
      <div className="participant-form">
        <div className="form-col">
          <label className="form-label">{t("projectDashboard.fields.name")}*</label>
          <input className="participant-input" value={formData.name} onChange={(e) => handleInputChange("name", e.target.value)} />
        </div>
        <div className="form-col">
          <label className="form-label">{t("projectDashboard.fields.description")}</label>
          <textarea className="participant-input description-textarea" value={formData.description} onChange={(e) => handleInputChange("description", e.target.value)} />
        </div>
        <div className="form-grid-2">
           <div className="form-col">
              <label className="form-label">{t("projectDashboard.fields.country")}</label>
              <input className="participant-input" value={formData.country} onChange={(e) => handleInputChange("country", e.target.value)} />
           </div>
           <div className="form-col">
              <label className="form-label">{t("projectDashboard.fields.frequency")}</label>
              <input type="number" className="participant-input" value={formData.frequency} onChange={(e) => handleInputChange("frequency", e.target.value)} />
           </div>
        </div>
        <div className="form-col">
          <label className="form-label">{t("projectDashboard.fields.contact")}</label>
          <input className="participant-input" value={formData.contact_person} onChange={(e) => handleInputChange("contact_person", e.target.value)} />
        </div>
        {error && <div className="validation-error-msg">{error}</div>}
      </div>
    </Modal>
  );
}