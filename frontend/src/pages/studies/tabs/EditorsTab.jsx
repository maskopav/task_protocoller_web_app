// src/pages/studies/tabs/EditorsTab.jsx — who may change this study (added by exact email).
import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { addEditor, fetchEditors, removeEditor } from "../../../api/projects";
import {
  Badge, Button, DataTable, EmptyState, Modal, TextField, useConfirm, useToast,
} from "../../../components/ui";
import { apiErrorMessage } from "../../../utils/apiError";
import { canRemoveEditor } from "../studyHelpers";

export default function EditorsTab({ study, adding, onCloseAdd }) {
  const { t } = useTranslation("studies");
  const { t: ta } = useTranslation("admin");
  const toast = useToast();
  const confirm = useConfirm();
  const projectId = study.project_id;

  const [editors, setEditors] = useState(null);
  const [email, setEmail] = useState("");
  const [failure, setFailure] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setEditors(await fetchEditors(projectId));
    } catch (err) {
      setEditors([]);
      toast.error(apiErrorMessage(err, ta));
    }
  }, [projectId, toast, ta]);

  useEffect(() => { load(); }, [load]);

  const closeAdd = () => {
    if (saving) return;
    setEmail("");
    setFailure("");
    onCloseAdd();
  };

  const submit = async (e) => {
    e.preventDefault();
    const value = email.trim();
    if (!value) { setFailure(t("editors.emailRequired")); return; }
    setSaving(true);
    setFailure("");
    try {
      const added = await addEditor(projectId, value);
      const name = added?.name || added?.email || value;
      // F-100: re-adding someone who already edits answers 200 with their existing grant.
      const already = (editors || []).some((ed) => ed.user_id === added?.user_id);
      if (already) toast.info(t("editors.alreadyEditor", { name }));
      else toast.success(t("editors.added", { name }));
      setEmail("");
      onCloseAdd();
      await load();
    } catch (err) {
      setFailure(err?.code === "user_not_found" ? t("editors.noUser") : apiErrorMessage(err, ta));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (editor) => {
    const label = editor.name || editor.email;
    const ok = await confirm({
      title: t("editors.removeTitle", { name: label }),
      message: t("editors.removeMessage", { name: label }),
      confirmText: t("editors.remove"),
      cancelText: t("cancel"),
      danger: true,
    });
    if (!ok) return;
    try {
      await removeEditor(projectId, editor.user_id);
      toast.success(t("editors.removed", { name: label }));
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err, ta));
    }
  };

  const columns = [
    {
      key: "name",
      header: t("editors.columns.name"),
      primary: true,
      render: (r) => (
        <span className="studies-inline">
          {r.name || "—"}
          {r.is_creator && <Badge>{t("editors.creator")}</Badge>}
        </span>
      ),
    },
    { key: "email", header: t("editors.columns.email"), render: (r) => <span className="studies-muted">{r.email}</span> },
    {
      key: "actions",
      header: <span className="ui-sr-only">{t("editors.columns.actions")}</span>,
      align: "end",
      render: (r) => canRemoveEditor(r, editors) && (
        <Button variant="quiet" size="sm" onClick={() => remove(r)} data-testid={`editor-remove-${r.user_id}`}>
          {t("editors.remove")}
        </Button>
      ),
    },
  ];

  return (
    <div data-testid="study-editors">
      <p className="studies-lead">{t("editors.lead")}</p>
      {editors === null ? (
        <div className="studies-skeleton" aria-busy="true" aria-label={t("loading")} />
      ) : (
        <DataTable
          columns={columns}
          rows={editors}
          rowKey="user_id"
          caption={t("tabs.editors")}
          empty={<EmptyState icon="users" title={t("editors.empty")} />}
          data-testid="study-editors-table"
        />
      )}

      <Modal
        open={adding}
        onClose={closeAdd}
        dismissible={!saving}
        title={t("editors.addTitle")}
        description={t("editors.addDescription")}
        data-testid="add-editor-modal"
        footer={(
          <>
            <Button onClick={closeAdd} disabled={saving}>{t("cancel")}</Button>
            <Button variant="primary" type="submit" form="add-editor-form" disabled={saving} data-testid="add-editor-submit">{t("editors.addSubmit")}</Button>
          </>
        )}
      >
        <form id="add-editor-form" onSubmit={submit} noValidate>
          <TextField
            label={t("editors.email")}
            type="email"
            value={email}
            placeholder="name@example.org"
            onChange={(e) => { setEmail(e.target.value); setFailure(""); }}
            error={failure || undefined}
            data-autofocus
            data-testid="add-editor-email"
          />
        </form>
      </Modal>
    </div>
  );
}
