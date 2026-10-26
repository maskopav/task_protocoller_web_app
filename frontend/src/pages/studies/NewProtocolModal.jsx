// src/pages/studies/NewProtocolModal.jsx — "New protocol": Blank, or copied From library (spec 6.4).
// A blank protocol cannot be saved without tasks, so "Create and edit" opens the editor on an unsaved
// draft; the editor then navigates to the real id once it is saved (F-058). A library copy exists at
// once, and both buttons use the id the server returns.
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { copyFromLibrary, getLibraryEntry, listLibrary } from "../../api/library";
import { Button, Icon, Modal, Select, TextField, useToast } from "../../components/ui";
import { LANGUAGES } from "../../i18n";
import { useMappings } from "../../context/MappingContext";
import { apiErrorMessage } from "../../utils/apiError";
import { translateTaskName } from "../../utils/translations";
import LangChips from "./LangChips";
import { blankProtocolDraft, defaultLanguage, protocolNameTaken } from "./studyHelpers";

export default function NewProtocolModal({ open, onClose, projectId, existing, onAdded }) {
  const { t, i18n } = useTranslation("studies");
  const { t: ta } = useTranslation("admin");
  const navigate = useNavigate();
  const toast = useToast();
  const { mappings } = useMappings();

  const languages = useMemo(() => {
    const known = (mappings?.languages || []).map((l) => l.code);
    const list = LANGUAGES.filter((l) => !known.length || known.includes(l.code));
    return list.length ? list : LANGUAGES;
  }, [mappings?.languages]);

  const [pane, setPane] = useState("blank");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [language, setLanguage] = useState("en");

  const [libAvailable, setLibAvailable] = useState(true);
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState(null);
  const [picked, setPicked] = useState(null);
  const [pickedTasks, setPickedTasks] = useState([]);
  const [libName, setLibName] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");

  // Reset whenever the modal opens.
  useEffect(() => {
    if (!open) return;
    setPane("blank");
    setName("");
    setDescription("");
    setLanguage(defaultLanguage(i18n.language, languages.map((l) => l.code)));
    setQuery("");
    setPicked(null);
    setPickedTasks([]);
    setLibName("");
    setFailure("");
    setLibAvailable(true);
    // languages is derived from mappings; the reset belongs to opening only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Library entries (search is debounced a little). A user who may not use the library gets a 404.
  useEffect(() => {
    if (!open || pane !== "library") return undefined;
    let live = true;
    const timer = setTimeout(() => {
      listLibrary(query.trim() ? { q: query.trim() } : {})
        .then((d) => { if (live) setEntries(d); })
        .catch(() => { if (live) { setEntries([]); if (!query) setLibAvailable(false); } });
    }, query ? 250 : 0);
    return () => { live = false; clearTimeout(timer); };
  }, [open, pane, query]);

  useEffect(() => {
    if (!picked) { setPickedTasks([]); return undefined; }
    let live = true;
    getLibraryEntry(picked.id)
      .then((e) => {
        if (!live) return;
        setPickedTasks((e.tasks || []).map((tk) => {
          const category = mappings?.tasks?.find((m) => m.id === tk.task_id)?.category;
          return category ? translateTaskName(category) : t("protocols.unknownTask");
        }));
      })
      .catch(() => { if (live) setPickedTasks([]); });
    return () => { live = false; };
    // mappings.tasks only translate names
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked?.id]);

  const busyGuard = (fn) => async (...args) => {
    setBusy(true);
    setFailure("");
    try {
      await fn(...args);
    } catch (err) {
      setFailure(apiErrorMessage(err, ta));
    } finally {
      setBusy(false);
    }
  };

  const blankTaken = protocolNameTaken(name, existing);
  const libTaken = protocolNameTaken(libName, existing);

  const createBlank = (e) => {
    e?.preventDefault();
    if (!name.trim() || blankTaken) return;
    const draft = blankProtocolDraft({ name, description, language });
    onClose();
    navigate(`/studies/${projectId}/protocols/new`, { state: { draft } });
  };

  const addFromLibrary = busyGuard(async (thenEdit) => {
    if (!picked || !libName.trim() || libTaken) return;
    const res = await copyFromLibrary(picked.id, { project_id: Number(projectId), name: libName.trim() });
    const newId = res?.protocol_id;
    if (!newId) throw new Error("library_copy_failed"); // never navigate to /protocols/undefined
    toast.success(t("protocols.added", { name: libName.trim() }));
    onClose();
    if (thenEdit) navigate(`/studies/${projectId}/protocols/${newId}`);
    else onAdded?.(newId);
  });

  const pick = (entry) => {
    setPicked(entry);
    setLibName(entry.name);
    setFailure("");
  };

  const footer = pane === "blank" ? (
    <>
      <Button onClick={onClose}>{t("cancel")}</Button>
      <Button variant="primary" type="submit" form="new-protocol-form" disabled={!name.trim() || blankTaken} data-testid="new-protocol-create">
        {t("protocols.createAndEdit")}
      </Button>
    </>
  ) : (
    <>
      <Button onClick={onClose}>{t("cancel")}</Button>
      <Button onClick={() => addFromLibrary(true)} disabled={busy || !picked || !libName.trim() || libTaken} data-testid="new-protocol-add-edit">
        {t("protocols.addAndEdit")}
      </Button>
      <Button variant="primary" onClick={() => addFromLibrary(false)} disabled={busy || !picked || !libName.trim() || libTaken} data-testid="new-protocol-add">
        {t("protocols.addToStudy")}
      </Button>
    </>
  );

  return (
    <Modal open={open} onClose={onClose} size="wide" dismissible={!busy} title={t("protocols.newTitle")} footer={footer} data-testid="new-protocol-modal">
      {libAvailable && (
        <div className="studies-seg" role="group" aria-label={t("protocols.newTitle")}>
          <button type="button" aria-pressed={pane === "blank"} onClick={() => setPane("blank")} data-testid="new-protocol-blank-tab">{t("protocols.blank")}</button>
          <button type="button" aria-pressed={pane === "library"} onClick={() => setPane("library")} data-testid="new-protocol-library-tab">
            <Icon name="library" size={14} />{t("protocols.fromLibrary")}
          </button>
        </div>
      )}

      {pane === "blank" ? (
        <form id="new-protocol-form" className="studies-form" onSubmit={createBlank} noValidate>
          <p className="studies-muted">{t("protocols.blankHint")}</p>
          <TextField
            label={t("protocols.name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("protocols.namePlaceholder")}
            error={blankTaken ? t("protocols.nameTaken") : undefined}
            data-autofocus
            data-testid="new-protocol-name"
          />
          <Select
            label={t("protocols.language")}
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            options={languages.map((l) => ({ value: l.code, label: l.label }))}
            data-testid="new-protocol-language"
          />
          <TextField label={t("protocols.description")} multiline rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </form>
      ) : (
        <div className="studies-form">
          <div className="studies-search studies-search-wide">
            <Icon name="search" size={16} />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("protocols.searchLibrary")}
              aria-label={t("protocols.searchLibrary")}
              data-testid="new-protocol-search"
            />
          </div>
          {entries === null ? (
            <div className="studies-skeleton" aria-busy="true" aria-label={t("loading")} />
          ) : entries.length === 0 ? (
            <p className="studies-muted">{t("protocols.libraryEmpty")}</p>
          ) : (
            <div className="studies-pick-list" data-testid="new-protocol-entries">
              {entries.map((en) => (
                <button
                  key={en.id}
                  type="button"
                  className="studies-pick"
                  aria-pressed={picked?.id === en.id}
                  onClick={() => pick(en)}
                  data-testid={`library-entry-${en.id}`}
                >
                  <span>
                    <span className="studies-pick-name">{en.name} <span className="studies-faint">· v{en.version}</span></span>
                    <span className="studies-pick-meta">
                      {t("protocols.tasksCount", { count: en.n_tasks })}{en.author ? ` · ${en.author}` : ""}
                    </span>
                  </span>
                  <LangChips codes={en.languages} />
                </button>
              ))}
            </div>
          )}
          {picked && (
            <>
              {pickedTasks.length > 0 && (
                <ol className="studies-task-preview" aria-label={t("protocols.tasksOfEntry")}>
                  {pickedTasks.map((n, i) => <li key={`${i}-${n}`}>{n}</li>)}
                </ol>
              )}
              <TextField
                label={t("protocols.nameInStudy")}
                value={libName}
                onChange={(e) => setLibName(e.target.value)}
                error={libTaken ? t("protocols.nameTaken") : undefined}
                data-testid="new-protocol-lib-name"
              />
            </>
          )}
        </div>
      )}
      {failure && <p className="studies-form-error" role="alert">{failure}</p>}
    </Modal>
  );
}
