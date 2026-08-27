// frontend/src/components/SiteManagement/SiteModal.jsx
// One modal for both create (site == null) and edit (site set).
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import Modal from "../ProtocolEditor/Modal";
import { createSite, updateSite } from "../../api/sites";

export default function SiteModal({ site, onClose, onSuccess }) {
  const { t } = useTranslation(["admin", "common"]);
  const isEdit = !!site;
  const [formData, setFormData] = useState({
    name: site?.name || "",
    description: site?.description || "",
    config_json: site?.config_json ? JSON.stringify(site.config_json, null, 2) : "",
  });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (error) setError("");
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) return setError(t("management.siteManagement.errors.nameRequired"));
    if (formData.config_json.trim()) {
      try {
        JSON.parse(formData.config_json);
      } catch {
        return setError(t("management.siteManagement.errors.invalidJson"));
      }
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name: formData.name.trim(),
        description: formData.description,
        config_json: formData.config_json.trim() || null,
      };
      if (isEdit) {
        await updateSite(site.id, { ...payload, is_active: site.is_active });
      } else {
        await createSite(payload);
      }
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
      open={true} onClose={onClose}
      title={isEdit ? t("management.siteManagement.editTitle") : t("management.siteManagement.createNew")}
      onSave={handleSubmit} showSaveButton={true}
    >
      <div className="participant-form">
        <div className="form-col">
          <label className="form-label">{t("management.siteManagement.table.name")}*</label>
          <input className="participant-input" value={formData.name} onChange={(e) => handleInputChange("name", e.target.value)} />
        </div>
        <div className="form-col">
          <label className="form-label">{t("management.siteManagement.table.description")}</label>
          <textarea className="participant-input description-textarea" value={formData.description} onChange={(e) => handleInputChange("description", e.target.value)} />
        </div>
        <div className="form-col">
          <label className="form-label">{t("management.siteManagement.configJson")}</label>
          <textarea
            className="participant-input description-textarea"
            style={{ fontFamily: "monospace", minHeight: "120px" }}
            placeholder='{ "defaultLanguage": "en" }'
            value={formData.config_json}
            onChange={(e) => handleInputChange("config_json", e.target.value)}
          />
          <span className="text-muted small">{t("management.siteManagement.configJsonHint")}</span>
        </div>
        {isSubmitting && <p>{t("common:saving")}...</p>}
        {error && <div className="validation-error-msg">{error}</div>}
      </div>
    </Modal>
  );
}