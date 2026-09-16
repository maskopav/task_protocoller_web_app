import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import Modal from "../ProtocolEditor/Modal";
import { updateUserApi } from "../../api/users";

export default function EditAdminModal({ open, onClose, user, onSuccess }) {
  const { t } = useTranslation(["admin", "common"]);
  const [formData, setFormData] = useState({ email: "", full_name: "", can_create_projects: false, can_create_sites: false });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Prefill data when the user prop changes
  useEffect(() => {
    if (user) {
      setFormData({
        email: user.user_email || "",
        full_name: user.full_name || "",
        can_create_projects: user.can_create_projects === 1 || user.can_create_projects === true,
        can_create_sites: user.can_create_sites === 1 || user.can_create_sites === true
      });
    }
  }, [user]);

  const handleSubmit = async () => {
    if (!formData.email) return setError("Email is required");
    
    setIsSubmitting(true);
    setError("");
    try {
      await updateUserApi({
        user_id: user.user_id,
        email: formData.email,
        full_name: formData.full_name,
        can_create_projects: formData.can_create_projects,
        can_create_sites: formData.can_create_sites
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
      open={open} 
      onClose={onClose} 
      title={t("management.buttons.edit")}
      onSave={handleSubmit}
      showSaveButton={true}
      saveLabel={isSubmitting ? t("saving", { ns: "common" }) : t("save", { ns: "common" })}
    >
      <div className="participant-form">
        <div className="form-col">
          <label className="form-label">{t("management.table.user")} <span className="label-required">*</span></label>
          <input 
            className="participant-input"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({...formData, email: e.target.value})}
          />
        </div>
        <div className="form-col">
          <label className="form-label">{t("management.table.fullName")}</label>
          <input 
            className="participant-input"
            value={formData.full_name}
            onChange={(e) => setFormData({...formData, full_name: e.target.value})}
          />
        </div>
        <div className="form-col">
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
        {error && <div className="validation-error-msg" style={{marginTop: '10px'}}>{error}</div>}
      </div>
    </Modal>
  );
}