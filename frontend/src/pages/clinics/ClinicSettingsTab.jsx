// Clinic › Settings: identity and the desktop-app defaults. Editable for master and the creator; a summary otherwise.
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyValue, Section, Select, TextField, useToast } from "../../components/ui";
import { updateSite } from "../../api/sites";
import { validate } from "../../utils/validation";
import { apiErrorMessage } from "../../utils/apiError";
import ClinicNameField from "./ClinicNameField";
import { APP_LANGUAGES, nameProblem, pickSettings, settingsPayload } from "./clinicLogic";
import "./clinics.css";

export const SETTINGS_FORM_ID = "clinic-settings-form";

const identityOf = (site) => ({
  name: site?.name || "",
  description: site?.description || "",
  country: site?.country || "",
  contact_persons: site?.contact_persons || "",
  contact_emails: site?.contact_emails || "",
});

function ReadOnlySettings({ site, langName }) {
  const { t } = useTranslation("clinics");
  const s = pickSettings(site.config_json);
  return (
    <div className="clinics-form" data-testid="clinic-settings-readonly">
      <p className="clinics-fieldset-hint">{t("settings.readOnly")}</p>
      <Section title={t("settings.identity")}>
        <KeyValue cols={2} items={[
          { label: t("fields.name"), value: site.name },
          { label: t("fields.country"), value: site.country },
          { label: t("fields.description"), value: site.description },
          { label: t("fields.contactPersons"), value: site.contact_persons },
          { label: t("fields.contactEmails"), value: site.contact_emails },
        ]} />
      </Section>
      <Section title={t("settings.desktop")}>
        <KeyValue cols={2} items={[
          { label: t("settings.appLanguage"), value: langName(s.defaultLanguage) },
          { label: t("settings.languages"), value: s.languages.length ? s.languages.map(langName).join(", ") : t("settings.languagesAll") },
          { label: t("settings.mic"), value: s.defaultMicName },
          { label: t("settings.gain"), value: s.defaultMicGain === "" ? "" : `${s.defaultMicGain} %` },
          { label: t("settings.indicator"), value: t(`settings.indicators.${s.indicatorType}`, { defaultValue: s.indicatorType }) },
          { label: t("settings.steps"), value: [s.useCalibration && t("settings.useCalibration"), s.enableEditor && t("settings.enableEditor")].filter(Boolean).join(" · ") },
        ]} />
      </Section>
    </div>
  );
}

export default function ClinicSettingsTab({ site, onSaved }) {
  const { t } = useTranslation("clinics");
  const { t: tc } = useTranslation();
  const toast = useToast();
  const [identity, setIdentity] = useState(() => identityOf(site));
  const [settings, setSettings] = useState(() => pickSettings(site.config_json));
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  // A reload after saving brings the stored values back into the form.
  useEffect(() => {
    setIdentity(identityOf(site));
    setSettings(pickSettings(site.config_json));
  }, [site]);

  const langName = (code) => t(`settings.languageNames.${code}`, { defaultValue: code });
  if (!site.can_edit) return <ReadOnlySettings site={site} langName={langName} />;

  const setId = (k) => (e) => { setIdentity((p) => ({ ...p, [k]: e.target.value })); setErrors((p) => ({ ...p, [k]: undefined })); };
  const setSetting = (k, v) => setSettings((p) => ({ ...p, [k]: v }));
  const toggleLanguage = (code, on) =>
    setSetting("languages", on ? [...settings.languages, code] : settings.languages.filter((l) => l !== code));

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const next = {};
    const problem = nameProblem(identity.name);
    if (problem !== "ok") next.name = t(`name.${problem}`);
    const badEmail = validate.emailList(identity.contact_emails);
    if (badEmail) next.contact_emails = t("errors.invalidEmail", { email: badEmail });
    const cfg = settingsPayload(settings);
    if (cfg.error) next.defaultMicGain = t(`errors.${cfg.error}`);
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      await updateSite(site.id, { ...identity, name: identity.name.trim(), config_json: cfg.value });
      toast.success(t("settings.saved"));
      await onSaved();
    } catch (err) {
      toast.error(apiErrorMessage(err, tc));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form id={SETTINGS_FORM_ID} className="clinics-form" onSubmit={submit} noValidate data-testid="clinic-settings-form">
      <fieldset className="clinics-fieldset">
        <legend>{t("settings.identity")}</legend>
        <ClinicNameField value={identity.name} onChange={(v) => { setIdentity((p) => ({ ...p, name: v })); setErrors((p) => ({ ...p, name: undefined })); }} error={errors.name} showRenameNote />
        <TextField label={t("fields.description")} multiline value={identity.description} onChange={setId("description")} />
        <div className="clinics-grid2">
          <TextField label={t("fields.country")} value={identity.country} onChange={setId("country")} maxLength={100} />
          <TextField label={t("fields.contactPersons")} value={identity.contact_persons} onChange={setId("contact_persons")} placeholder={t("placeholders.persons")} />
        </div>
        <TextField label={t("fields.contactEmails")} value={identity.contact_emails} onChange={setId("contact_emails")} placeholder={t("placeholders.emails")} error={errors.contact_emails} />
      </fieldset>

      <fieldset className="clinics-fieldset">
        <legend>{t("settings.desktop")}</legend>
        <p className="clinics-fieldset-hint">{t("settings.desktopHint")}</p>
        <div className="clinics-grid2">
          <Select label={t("settings.appLanguage")} value={settings.defaultLanguage} onChange={(e) => setSetting("defaultLanguage", e.target.value)}>
            {APP_LANGUAGES.map((c) => <option key={c} value={c}>{langName(c)}</option>)}
          </Select>
          <div className="ui-field">
            <label id="clinic-languages-label">{t("settings.languages")}</label>
            <div className="clinics-checks" role="group" aria-labelledby="clinic-languages-label">
              {APP_LANGUAGES.map((c) => (
                <label key={c} className="clinics-check">
                  <input type="checkbox" checked={settings.languages.includes(c)} onChange={(e) => toggleLanguage(c, e.target.checked)} />
                  {langName(c)}
                </label>
              ))}
            </div>
            <span className="ui-field-help">{t("settings.languagesHint")}</span>
          </div>
        </div>
        <div className="clinics-grid2">
          <TextField label={t("settings.mic")} value={settings.defaultMicName} onChange={(e) => setSetting("defaultMicName", e.target.value)} placeholder={t("placeholders.mic")} help={t("settings.micHint")} />
          <TextField
            label={t("settings.gain")} type="number" step="1" min="0" max="100"
            value={settings.defaultMicGain} onChange={(e) => setSetting("defaultMicGain", e.target.value)}
            placeholder={t("placeholders.gain")} error={errors.defaultMicGain} help={t("settings.gainHint")}
          />
        </div>
        <Select label={t("settings.indicator")} value={settings.indicatorType} onChange={(e) => setSetting("indicatorType", e.target.value)}>
          <option value="CIRCLE">{t("settings.indicators.CIRCLE")}</option>
          <option value="WAVEFORM">{t("settings.indicators.WAVEFORM")}</option>
        </Select>
        <div className="ui-field">
          <label id="clinic-steps-label">{t("settings.steps")}</label>
          <label className="clinics-check">
            <input type="checkbox" checked={!!settings.useCalibration} onChange={(e) => setSetting("useCalibration", e.target.checked)} />
            {t("settings.useCalibration")}
          </label>
          <label className="clinics-check">
            <input type="checkbox" checked={!!settings.enableEditor} onChange={(e) => setSetting("enableEditor", e.target.checked)} />
            {t("settings.enableEditor")}
          </label>
        </div>
      </fieldset>
    </form>
  );
}
