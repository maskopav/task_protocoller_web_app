import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Modal, TextField, useToast } from "../../components/ui";
import { createSite } from "../../api/sites";
import { apiErrorMessage } from "../../utils/apiError";
import ClinicNameField from "./ClinicNameField";
import { nameProblem, pickSettings, settingsPayload } from "./clinicLogic";

/** New clinic: name and country. The rest (contacts, desktop defaults) is edited in the clinic's Settings. */
export default function NewClinicModal({ open, onClose, onCreated }) {
  const { t } = useTranslation("clinics");
  const { t: tc } = useTranslation();
  const toast = useToast();
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");

  const close = () => {
    if (busy) return;
    setName("");
    setCountry("");
    setError("");
    setFormError("");
    onClose();
  };

  const submit = async (e) => {
    e?.preventDefault();
    const problem = nameProblem(name);
    if (problem !== "ok") return setError(t(`name.${problem}`));
    setFormError("");
    setBusy(true);
    try {
      const res = await createSite({
        name: name.trim(), country: country.trim(), config_json: settingsPayload(pickSettings({})).value,
      });
      toast.success(t("new.created"));
      setName("");
      setCountry("");
      setError("");
      onCreated?.(res.site_id);
    } catch (err) {
      if (err?.code === "invalid_name") setError(apiErrorMessage(err, tc));
      else setFormError(apiErrorMessage(err, tc));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      dismissible={!busy}
      title={t("new.title")}
      description={t("new.desc")}
      data-testid="new-clinic-modal"
      footer={(
        <>
          <Button onClick={close} disabled={busy}>{t("cancel")}</Button>
          <Button variant="primary" type="submit" form="new-clinic-form" disabled={busy} data-testid="new-clinic-submit">{t("new.create")}</Button>
        </>
      )}
    >
      <form id="new-clinic-form" className="clinics-form" onSubmit={submit} noValidate>
        <ClinicNameField value={name} onChange={(v) => { setName(v); setError(""); }} error={error} autoFocus />
        <TextField label={t("fields.country")} value={country} onChange={(e) => setCountry(e.target.value)} maxLength={100} />
        {formError && <p className="clinics-form-error" role="alert">{formError}</p>}
      </form>
    </Modal>
  );
}
