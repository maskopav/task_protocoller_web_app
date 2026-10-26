// src/pages/studies/NewStudyModal.jsx — creates a study, then opens Study > Protocols.
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button, Modal } from "../../components/ui";
import { createProject } from "../../api/projects";
import { useMappings } from "../../context/MappingContext";
import { apiErrorMessage } from "../../utils/apiError";
import StudyFields from "./StudyFields";
import { EMPTY_STUDY, validateStudyForm } from "./studyForm";

export default function NewStudyModal({ open, onClose }) {
  const { t } = useTranslation("studies");
  const { t: ta } = useTranslation("admin");
  const navigate = useNavigate();
  const { refreshMappings } = useMappings();
  const [values, setValues] = useState(EMPTY_STUDY);
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState("");
  const [saving, setSaving] = useState(false);

  const close = () => {
    if (saving) return;
    setValues(EMPTY_STUDY);
    setErrors({});
    setFailure("");
    onClose();
  };

  const submit = async (e) => {
    e.preventDefault();
    const found = validateStudyForm(values);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    setFailure("");
    try {
      const res = await createProject({ ...values, name: values.name.trim() });
      refreshMappings();
      setValues(EMPTY_STUDY);
      onClose();
      navigate(`/studies/${res.id}/protocols`);
    } catch (err) {
      setFailure(apiErrorMessage(err, ta));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      dismissible={!saving}
      title={t("new.title")}
      description={t("new.description")}
      data-testid="new-study-modal"
      footer={(
        <>
          <Button onClick={close} disabled={saving}>{t("cancel")}</Button>
          <Button variant="primary" type="submit" form="new-study-form" disabled={saving} data-testid="new-study-submit">{t("new.create")}</Button>
        </>
      )}
    >
      <form id="new-study-form" onSubmit={submit} noValidate>
        <StudyFields values={values} onChange={setValues} errors={errors} />
        {failure && <p className="studies-form-error" role="alert">{failure}</p>}
      </form>
    </Modal>
  );
}
