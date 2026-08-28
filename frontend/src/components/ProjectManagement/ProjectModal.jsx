// frontend/src/components/ProjectManagement/ProjectModal.jsx
// One modal for create and edit, following SiteModal's isEdit pattern.
import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import Modal from "../ProtocolEditor/Modal";
import { createProjectApi, updateProjectApi } from "../../api/projects";
import { useUser } from "../../context/UserContext";
import { validate } from "../../utils/validation";

const BLANK = {
  name: "", description: "", countries: "", contact_persons: "", contact_emails: ""
};

export default function ProjectModal({ open, onClose, project, onSuccess }) {
  const { t } = useTranslation(["admin", "common"]);
  const { user } = useUser();
  const isEdit = !!project;
  const [formData, setFormData] = useState(BLANK);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Reset to blanks in create mode, otherwise reopening after a save shows
    // the previously edited project's values.
    setFormData(project ? {
      name: project.name || "",
      description: project.description || "",
      countries: project.countries || "",
      contact_persons: project.contact_persons || "",
      contact_emails: project.contact_emails || ""
    } : BLANK);
    setError("");
    // Using project?.id instead of project prevents the reset-while-typing loop
  }, [open, project?.id]);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (error) setError("");
  };

  const handleSubmit = async () => {
    if (!formData.name) return setError(t("projectDashboard.errors.nameRequired"));

    const badEmail = validate.emailList(formData.contact_emails);
    if (badEmail) {
      return setError(t("projectDashboard.errors.invalidEmail", { email: badEmail }));
    }

    setIsSubmitting(true);
    try {
      // Always send all five keys: updateProject uses IFNULL(?, col), so an
      // omitted field means "unchanged" and only "" can clear a value.
      if (isEdit) {
        await updateProjectApi({ id: project.id, ...formData, updated_by: user.id });
      } else {
        await createProjectApi({ ...formData, created_by: user.id });
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
      open={open} onClose={onClose}
      title={isEdit
        ? t("projectDashboard.editProject")
        : t("management.projectManagement.createNew")}
      onSave={handleSubmit} showSaveButton={true}
    >
      <div className="participant-form">
        <div className="form-col">
          <label className="form-label">{t("projectDashboard.fields.name")}*</label>
          <input
            className="participant-input"
            value={formData.name}
            onChange={(e) => handleInputChange("name", e.target.value)}
          />
        </div>
        <div className="form-col">
          <label className="form-label">{t("projectDashboard.fields.description")}</label>
          <textarea
            className="participant-input description-textarea"
            value={formData.description}
            onChange={(e) => handleInputChange("description", e.target.value)}
          />
        </div>
        <div className="form-grid-2">
          <div className="form-col">
            <label className="form-label">{t("projectDashboard.fields.countries")}</label>
            <input
              className="participant-input"
              placeholder="Czechia, Poland"
              value={formData.countries}
              onChange={(e) => handleInputChange("countries", e.target.value)}
            />
          </div>
          <div className="form-col">
            <label className="form-label">{t("projectDashboard.fields.contactPersons")}</label>
            <input
              className="participant-input"
              placeholder="Jane Doe, John Roe"
              value={formData.contact_persons}
              onChange={(e) => handleInputChange("contact_persons", e.target.value)}
            />
          </div>
        </div>
        <div className="form-col">
          <label className="form-label">{t("projectDashboard.fields.contactEmails")}</label>
          <input
            className="participant-input"
            placeholder="a@x.org, b@y.org"
            value={formData.contact_emails}
            onChange={(e) => handleInputChange("contact_emails", e.target.value)}
          />
        </div>
        {error && <div className="validation-error-msg">{error}</div>}
        {isSubmitting && <p className="text-muted small">{t("common:saving")}…</p>}
      </div>
    </Modal>
  );
}
