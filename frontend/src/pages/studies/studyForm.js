// src/pages/studies/studyForm.js — values and validation of the study form.
import { validate } from "../../utils/validation";

export const EMPTY_STUDY = { name: "", description: "", countries: "", contact_persons: "", contact_emails: "" };

export const studyFormFrom = (study) => ({
  name: study?.project_name ?? study?.name ?? "",
  description: study?.description ?? "",
  countries: study?.countries ?? "",
  contact_persons: study?.contact_persons ?? "",
  contact_emails: study?.contact_emails ?? "",
});

/** Returns { field: message-key } for an invalid form, or {} when it is valid. */
export function validateStudyForm(values) {
  const errors = {};
  if (!String(values.name || "").trim()) errors.name = "nameRequired";
  const bad = validate.emailList(values.contact_emails);
  if (bad) errors.contact_emails = { key: "invalidEmail", email: bad };
  return errors;
}
