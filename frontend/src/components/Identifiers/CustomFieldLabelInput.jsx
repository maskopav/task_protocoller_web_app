import React from "react";
import { useTranslation } from "react-i18next";

// Label input of a custom patient field. Custom label/help are ONE text sent
// unchanged for every language (catalogue fields are translated instead), so
// the editor says so right under the input.
export default function CustomFieldLabelInput({ value, invalid, onChange }) {
  const { t } = useTranslation(["admin"]);
  const label = t("protocolEditor.identifiers.label", "Label");
  return (
    <div className="identifier-label-cell">
      <input
        type="text"
        aria-label={label}
        className={invalid ? "name-input-error" : ""}
        placeholder={`${label}*`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <small className="identifier-label-hint">
        {t("protocolEditor.identifiers.labelHint", "Shown as typed in every language.")}
      </small>
    </div>
  );
}
