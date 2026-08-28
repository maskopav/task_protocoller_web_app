// frontend/src/components/SiteManagement/SiteModal.jsx
// One modal for both create (site == null) and edit (site set).
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import Modal from "../ProtocolEditor/Modal";
import { createSite, updateSite } from "../../api/sites";
import { validate } from "../../utils/validation";

// Mirrors isValidAccessToken in backend/src/utils/fieldValidation.js. The
// backend re-checks it — this is UX only.
const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

export default function SiteModal({ site, onClose, onSuccess }) {
  const { t } = useTranslation(["admin", "common"]);
  const isEdit = !!site;
  const [formData, setFormData] = useState({
    name: site?.name || "",
    description: site?.description || "",
    config_json: site?.config_json ? JSON.stringify(site.config_json, null, 2) : "",
    access_token: site?.access_token || "",
    country: site?.country || "",
    contact_persons: site?.contact_persons || "",
    contact_emails: site?.contact_emails || "",
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
    // Blank is allowed: on create the backend generates one, on edit it keeps
    // the stored value (access_token = IFNULL(?, access_token)).
    const token = formData.access_token.trim();
    if (token && !TOKEN_RE.test(token)) {
      return setError(t("management.siteManagement.errors.invalidToken"));
    }
    const badEmail = validate.emailList(formData.contact_emails);
    if (badEmail) {
      return setError(t("management.siteManagement.errors.invalidEmail", { email: badEmail }));
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name: formData.name.trim(),
        description: formData.description,
        config_json: formData.config_json.trim() || null,
        access_token: token,
        country: formData.country,
        contact_persons: formData.contact_persons,
        contact_emails: formData.contact_emails,
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
        <div className="form-grid-2">
          <div className="form-col">
            <label className="form-label">{t("management.siteManagement.table.country")}</label>
            <input className="participant-input" value={formData.country} onChange={(e) => handleInputChange("country", e.target.value)} />
          </div>
          <div className="form-col">
            <label className="form-label">{t("management.siteManagement.table.contactPersons")}</label>
            <input className="participant-input" placeholder="Jane Doe, John Roe" value={formData.contact_persons} onChange={(e) => handleInputChange("contact_persons", e.target.value)} />
          </div>
        </div>
        <div className="form-col">
          <label className="form-label">{t("management.siteManagement.table.contactEmails")}</label>
          <input className="participant-input" placeholder="a@x.org, b@y.org" value={formData.contact_emails} onChange={(e) => handleInputChange("contact_emails", e.target.value)} />
        </div>
        <div className="form-col">
          <label className="form-label">{t("management.siteManagement.accessToken")}</label>
          <input
            className="participant-input"
            style={{ fontFamily: "monospace" }}
            placeholder={t("management.siteManagement.accessTokenPlaceholder")}
            value={formData.access_token}
            onChange={(e) => handleInputChange("access_token", e.target.value)}
          />
          <span className="text-muted small">⚠️ {t("management.siteManagement.accessTokenHint")}</span>
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