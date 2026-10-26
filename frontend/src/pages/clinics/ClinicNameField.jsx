import React from "react";
import { useTranslation } from "react-i18next";
import { TextField } from "../../components/ui";
import { fileNameForm } from "../../utils/fileNameForm";
import { NAME_MAX } from "./clinicLogic";
import "./clinics.css";

/**
 * The clinic name (any text, 1 to 64 characters, F-008) with the live "File names will use: ..." hint.
 * The name itself reaches the desktop app unchanged; the hint only shows what the app makes of it.
 */
export default function ClinicNameField({ value, onChange, error, showRenameNote = false, autoFocus = false }) {
  const { t } = useTranslation("clinics");
  const form = fileNameForm(value);
  const hint = (
    <>
      <span className={`clinics-hint${value.trim() && !form ? " clinics-hint-warn" : ""}`} data-testid="clinic-filename-hint">
        {value.trim() && !form
          ? t("name.hintEmpty")
          : <>{t("name.hint")} <code data-testid="clinic-filename-form">{form || "—"}</code></>}
      </span>
      {showRenameNote && <span className="clinics-hint"> {t("name.renameNote")}</span>}
    </>
  );
  return (
    <TextField
      label={t("fields.name")}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      maxLength={NAME_MAX}
      required
      autoFocus={autoFocus}
      error={error}
      help={hint}
      data-testid="clinic-name-input"
    />
  );
}
