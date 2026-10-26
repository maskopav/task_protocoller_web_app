// src/pages/library/AddToStudyModal.jsx: "Add to study": pick one of my studies, name the copy (spec 6.10).
// Adding always copies; the copy is an ordinary protocol of the study.
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button, Modal, Select, TextField, useToast } from "../../components/ui";
import { fetchProjectsList } from "../../api/projects";
import { copyFromLibrary } from "../../api/library";
import { apiErrorMessage } from "../../utils/apiError";
import { addableStudies } from "./libraryHelpers";

export default function AddToStudyModal({ open, entry, onClose }) {
  const { t } = useTranslation("library");
  const { t: ta } = useTranslation("admin");
  const navigate = useNavigate();
  const toast = useToast();
  const [studies, setStudies] = useState(null);
  const [target, setTarget] = useState("");
  const [name, setName] = useState("");
  const [openAfter, setOpenAfter] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    let live = true;
    setStudies(null);
    setTarget("");
    setName(entry?.name || "");
    setOpenAfter(true);
    setFailure("");
    fetchProjectsList()
      .then((rows) => {
        if (!live) return;
        const list = addableStudies(rows);
        setStudies(list);
        setTarget(list[0] ? String(list[0].project_id) : "");
      })
      .catch(() => { if (live) setStudies([]); });
    return () => { live = false; };
    // the reset belongs to opening only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = async (e) => {
    e?.preventDefault();
    if (!target || !name.trim() || busy) return;
    setBusy(true);
    setFailure("");
    try {
      const res = await copyFromLibrary(entry.id, { project_id: Number(target), name: name.trim() });
      const newId = res?.protocol_id;
      if (!newId) throw new Error("library_copy_failed"); // never navigate to /protocols/undefined
      toast.success(t("add.done", { name: name.trim() }));
      onClose();
      navigate(openAfter ? `/studies/${target}/protocols/${newId}` : `/studies/${target}/protocols`);
    } catch (err) {
      setFailure(apiErrorMessage(err, ta));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("add.title", { name: entry?.name })}
      description={t("add.description")}
      data-testid="library-add-modal"
      footer={(
        <>
          <Button onClick={onClose}>{t("cancel")}</Button>
          <Button variant="primary" type="submit" form="library-add-form" disabled={busy || !target || !name.trim()} data-testid="library-add-submit">
            {t("add.submit")}
          </Button>
        </>
      )}
    >
      {studies === null ? (
        <div className="library-skeleton" aria-busy="true" aria-label={t("loading")} />
      ) : studies.length === 0 ? (
        <p className="library-muted" data-testid="library-add-none">{t("add.none")}</p>
      ) : (
        <form id="library-add-form" className="library-form" onSubmit={submit}>
          <Select
            label={t("add.study")}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            options={studies.map((s) => ({ value: String(s.project_id), label: s.project_name }))}
            data-testid="library-add-study"
          />
          <TextField label={t("add.name")} value={name} onChange={(e) => setName(e.target.value)} data-testid="library-add-name" />
          <label className="library-check-row">
            <input type="checkbox" checked={openAfter} onChange={(e) => setOpenAfter(e.target.checked)} />
            {t("add.openAfter")}
          </label>
          {failure && <p className="library-error" role="alert">{failure}</p>}
        </form>
      )}
    </Modal>
  );
}
