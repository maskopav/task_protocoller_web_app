// src/pages/studies/tabs/SettingsTab.jsx — the study's own fields. A form for editors, "About" for a received study.
import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { updateProject } from "../../../api/projects";
import { KeyValue, useToast } from "../../../components/ui";
import { apiErrorMessage } from "../../../utils/apiError";
import StudyFields from "../StudyFields";
import { studyFormFrom, validateStudyForm } from "../studyForm";

export default function SettingsTab({ study, canEdit, onChanged, onDirtyChange }) {
  const { t } = useTranslation("studies");
  const { t: ta } = useTranslation("admin");
  const toast = useToast();
  const initial = useMemo(() => studyFormFrom(study), [study]);
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => { setValues(initial); }, [initial]);

  const dirty = canEdit && JSON.stringify(values) !== JSON.stringify(initial);
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);

  if (!canEdit) {
    return (
      <div data-testid="study-about">
        <KeyValue
          cols={2}
          items={[
            { label: t("form.description"), value: study.description },
            { label: t("form.countries"), value: study.countries },
            { label: t("form.contactPersons"), value: study.contact_persons },
            { label: t("form.contactEmails"), value: study.contact_emails },
            { label: t("study.managedByLabel"), value: study.creator_name },
          ]}
        />
      </div>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    if (!dirty || saving) return;
    const found = validateStudyForm(values);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    try {
      await updateProject(study.project_id, { ...values, name: values.name.trim() });
      toast.success(t("settings.saved"));
      await onChanged?.();
    } catch (err) {
      toast.error(apiErrorMessage(err, ta));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form id="study-settings-form" className="studies-settings" onSubmit={submit} noValidate data-testid="study-settings">
      <StudyFields values={values} onChange={setValues} errors={errors} />
    </form>
  );
}
