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

// Desktop-app settings stored in sites.config_json (exact keys the app reads).
// Mirrors normalizeSiteSettings in backend/src/utils/fieldValidation.js.
const SETTINGS_DEFAULTS = {
  defaultLanguage: "en",
  languages: [],
  defaultMicName: "",
  defaultMicGain: 1,
  enableEditor: false,
  indicatorType: "CIRCLE",
  useCalibration: true,
};
const UI_LANGUAGES = ["en", "cs", "de"];

const pickSettings = (raw) =>
  Object.fromEntries(Object.keys(SETTINGS_DEFAULTS).map((k) => [k, raw?.[k] ?? SETTINGS_DEFAULTS[k]]));

export default function SiteModal({ site, onClose, onSuccess }) {
  const { t } = useTranslation(["admin", "common"]);
  const isEdit = !!site;
  const [formData, setFormData] = useState({
    name: site?.name || "",
    description: site?.description || "",
    access_token: site?.access_token || "",
    country: site?.country || "",
    contact_persons: site?.contact_persons || "",
    contact_emails: site?.contact_emails || "",
  });
  const [settings, setSettings] = useState(pickSettings(site?.config_json));
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (error) setError("");
  };
  const setSetting = (key, value) => setSettings(prev => ({ ...prev, [key]: value }));
  const toggleLanguage = (code, on) =>
    setSetting("languages", on ? [...settings.languages, code] : settings.languages.filter((l) => l !== code));

  const handleSubmit = async () => {
    if (!formData.name.trim()) return setError(t("management.siteManagement.errors.nameRequired"));
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
        config_json: { ...settings, defaultMicGain: Number(settings.defaultMicGain) || 0 },
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

  const s = (key) => t(`management.siteManagement.settings.${key}`);

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

        {/* Desktop-app settings (sites.config_json) */}
        <fieldset className="form-col" style={{ border: "1px solid #eee", borderRadius: 8, padding: "0.75rem" }}>
          <legend className="form-label">{s("title")}</legend>
          <div className="form-grid-2">
            <div className="form-col">
              <label className="form-label">{s("defaultLanguage")}</label>
              <select className="participant-input" value={settings.defaultLanguage} onChange={(e) => setSetting("defaultLanguage", e.target.value)}>
                {UI_LANGUAGES.map((code) => <option key={code} value={code}>{code}</option>)}
              </select>
            </div>
            <div className="form-col">
              <label className="form-label">{s("languages")}</label>
              <div style={{ display: "flex", gap: "1rem" }}>
                {UI_LANGUAGES.map((code) => (
                  <label key={code} className="checkbox-option">
                    <input type="checkbox" checked={settings.languages.includes(code)} onChange={(e) => toggleLanguage(code, e.target.checked)} /> {code}
                  </label>
                ))}
              </div>
              <span className="text-muted small">{s("languagesHint")}</span>
            </div>
          </div>
          <div className="form-grid-2">
            <div className="form-col">
              <label className="form-label">{s("defaultMicName")}</label>
              <input className="participant-input" placeholder="USB audio CODEC" value={settings.defaultMicName} onChange={(e) => setSetting("defaultMicName", e.target.value)} />
            </div>
            <div className="form-col">
              <label className="form-label">{s("defaultMicGain")}</label>
              <input className="participant-input" type="number" step="0.1" min="0" value={settings.defaultMicGain} onChange={(e) => setSetting("defaultMicGain", e.target.value)} />
            </div>
          </div>
          <div className="form-grid-2">
            <div className="form-col">
              <label className="form-label">{s("indicatorType")}</label>
              <select className="participant-input" value={settings.indicatorType} onChange={(e) => setSetting("indicatorType", e.target.value)}>
                <option value="CIRCLE">CIRCLE</option>
                <option value="WAVEFORM">WAVEFORM</option>
              </select>
            </div>
            <div className="form-col">
              <label className="checkbox-option">
                <input type="checkbox" checked={!!settings.useCalibration} onChange={(e) => setSetting("useCalibration", e.target.checked)} /> {s("useCalibration")}
              </label>
              <label className="checkbox-option">
                <input type="checkbox" checked={!!settings.enableEditor} onChange={(e) => setSetting("enableEditor", e.target.checked)} /> {s("enableEditor")}
              </label>
            </div>
          </div>
        </fieldset>

        {isSubmitting && <p>{t("common:saving")}...</p>}
        {error && <div className="validation-error-msg">{error}</div>}
      </div>
    </Modal>
  );
}