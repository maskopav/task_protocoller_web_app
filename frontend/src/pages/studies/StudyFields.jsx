// src/pages/studies/StudyFields.jsx — the study form fields, shared by "New study" and the Settings tab.
import React from "react";
import { useTranslation } from "react-i18next";
import { TextField } from "../../components/ui";

export default function StudyFields({ values, onChange, errors = {} }) {
  const { t } = useTranslation("studies");
  const set = (field) => (e) => onChange({ ...values, [field]: e.target.value });
  const err = (field) => {
    const e = errors[field];
    if (!e) return undefined;
    return typeof e === "string" ? t(`form.errors.${e}`) : t(`form.errors.${e.key}`, { email: e.email });
  };
  return (
    <div className="studies-form">
      <TextField label={t("form.name")} value={values.name} onChange={set("name")} error={err("name")} required data-autofocus />
      <TextField label={t("form.description")} multiline rows={3} value={values.description} onChange={set("description")} />
      <TextField label={t("form.countries")} placeholder={t("form.countriesPlaceholder")} value={values.countries} onChange={set("countries")} />
      <div className="studies-form-row">
        <TextField label={t("form.contactPersons")} placeholder={t("form.contactPersonsPlaceholder")} value={values.contact_persons} onChange={set("contact_persons")} />
        <TextField label={t("form.contactEmails")} placeholder="a@x.org, b@y.org" value={values.contact_emails} onChange={set("contact_emails")} error={err("contact_emails")} />
      </div>
    </div>
  );
}
