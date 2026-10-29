// src/components/ProtocolEditor/ProtocolEditor.jsx
// The protocol workspace (docs/ui_redesign/02_spec.md section 6.5): task catalogue on the left, the protocol's
// tasks in the middle, collapsible settings on the right. Save is the only primary action and is enabled once
// the protocol is dirty. The page (ProtocolEditorPage) loads the data and decides read-only mode.
import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import ReactQuill, { Quill } from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";

import { taskBaseConfig } from "../../config/tasksBase";
import { getDefaultParams } from "../../utils/translations";
import TaskList from "./TaskList";
import ProtocolForm from "./ProtocolForm";
import ProtocolSettings from "./ProtocolSettings";
import TaskModal from "./TaskModal";
import QuestionnaireModal from "./QuestionnaireModal";
import { useMappings } from "../../context/MappingContext";
import { useProtocolManager } from "../../hooks/useProtocolManager";
import { ProtocolContext } from "../../context/ProtocolContext";
import { Badge, Button, Icon, IconButton, PageHeader, StatusDot, useConfirm, useToast } from "../ui";
import { validate } from "../../utils/validation";
import { apiErrorMessage } from "../../utils/apiError";
import AdminModal from "./Modal";
import {
  IDENTIFIER_CATALOGUE,
  catalogueField,
  emptyCustomField,
  normalizeIdentifiers,
  FIELD_NAME_RE,
} from "../Identifiers/IdentifierFields";
import CustomFieldLabelInput from "../Identifiers/CustomFieldLabelInput";
import { protocolSnapshot } from "./snapshot";
import "./ProtocolEditor.css";
import "./ProtocolWorkspace.css";

// Force Quill to use inline styles instead of classes for font sizes
const Size = Quill.import("attributors/style/size");
Size.whitelist = ["12px", "16px", "20px", "28px"]; // small, normal, large, huge equivalents
Quill.register(Size, true);

const editorModules = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ["bold", "italic", "underline"],
    [{ color: [] }, { background: [] }],
    [{ align: [] }],
    [{ list: "ordered" }, { list: "bullet" }],
    [{ indent: "-1" }, { indent: "+1" }],
    ["clean"],
  ],
};

const TemplateSelector = ({ templateType, currentLanguage, onSelect, i18n, label }) => {
  let templates = {};
  // The raw bundle of the protocol's language, falling back to 'en'
  const bundle = i18n.getResourceBundle(currentLanguage, "intro") || i18n.getResourceBundle("en", "intro");
  if (bundle && bundle.templates && bundle.templates[templateType]) {
    templates = bundle.templates[templateType];
  }
  return (
    <div className="pe-template-select">
      <select
        aria-label={label}
        defaultValue=""
        onChange={(e) => {
          const selectedKey = e.target.value;
          if (selectedKey && templates[selectedKey]) {
            onSelect(templates[selectedKey].content);
            e.target.value = "";
          }
        }}
      >
        <option value="">{label}</option>
        {Object.keys(templates).map((key) => (
          <option key={key} value={key}>{templates[key].label}</option>
        ))}
      </select>
    </div>
  );
};

/**
 * @param {object} props
 * @param {string|number} props.projectId
 * @param {{project_id:number, project_name:string}} props.study
 * @param {object} props.protocol the protocol as loaded (or the unsaved draft)
 * @param {Array} props.initialTasks
 * @param {{protocol: object, tasks: Array}} [props.restored] unsaved edits coming back from the preview
 * @param {boolean} props.readOnly
 * @param {string} [props.readOnlyReason] banner text when read-only
 * @param {boolean} props.isDraft an unsaved new protocol (no id yet)
 * @param {Array<{code:string, protocol_id:number}>} [props.variants] language variants of the group
 * @param {boolean} [props.library] a library entry (spec 6.10): no study, no preview, saves a new library version
 * @param {number} [props.usedIn] library mode: how many studies hold a copy
 * @param {(result) => Promise|void} props.onSaved called with the save result
 */
export function ProtocolEditor({
  projectId,
  study,
  protocol,
  initialTasks = [],
  restored,
  readOnly = false,
  readOnlyReason,
  isDraft = false,
  variants = [],
  library = false,
  usedIn = 0,
  onSaved,
}) {
  const { t, i18n } = useTranslation(["admin", "common", "intro"]);
  const { t: ts } = useTranslation("studies");
  const { t: tl } = useTranslation("library");
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { mappings, loading, error } = useMappings();
  const { setSelectedProtocol } = useContext(ProtocolContext);
  const { saveNewProtocol } = useProtocolManager();

  const editingMode = !isDraft;

  const [tasks, setTasks] = useState(restored?.tasks ?? initialTasks);
  const [protocolData, setProtocolData] = useState(restored?.protocol ?? protocol);
  const baseline = useRef(protocolSnapshot(protocol, initialTasks));
  const [saving, setSaving] = useState(false);

  const [editingIndex, setEditingIndex] = useState(null); // null = creating a new task
  const [editingData, setEditingData] = useState(null);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showQuestionnaireModal, setShowQuestionnaireModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showInstructionsModal, setShowInstructionsModal] = useState(false);
  const [showIdentifiersModal, setShowIdentifiersModal] = useState(false);
  const [dragIndex, setDragIndex] = useState(null);

  const dirty = !readOnly && (isDraft || protocolSnapshot(protocolData, tasks) !== baseline.current);

  // Names are unique within a study (uploads match by study and protocol name).
  const studyProtocols = useMemo(
    () => (mappings?.protocols || []).filter((p) => Number(p.project_id) === Number(projectId)),
    [mappings?.protocols, projectId],
  );
  const validation = useMemo(() => {
    const result = validate.protocol({ ...protocolData, tasks });
    if (protocolData?.name) {
      const wanted = protocolData.name.toLowerCase().trim();
      const isDuplicate = studyProtocols.some((p) => (
        p.id !== protocolData.id
        && p.protocol_group_id !== protocolData.protocol_group_id
        && String(p.name).toLowerCase().trim() === wanted
      ));
      if (isDuplicate) {
        result.isValid = false;
        result.errors.name = "nameExists";
      }
    }
    return result;
  }, [protocolData, tasks, studyProtocols]);

  // Leaving with unsaved changes asks first. HashRouter has no route blocker, so internal links are
  // intercepted before the router sees them, and closing the tab uses beforeunload.
  useEffect(() => {
    if (!dirty || saving) return undefined;
    const onClick = async (e) => {
      const a = e.target?.closest?.("a[href]");
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || a.target === "_blank") return;
      const href = a.getAttribute("href") || "";
      if (!href.startsWith("#/")) return;
      e.preventDefault();
      e.stopPropagation();
      const ok = await confirm({
        title: t("protocolEditor.confirmBack.title"),
        message: t("protocolEditor.confirmBack.message"),
        confirmText: t("protocolEditor.confirmBack.confirmText"),
        cancelText: t("common:ui.cancel"),
        danger: true,
      });
      if (ok) navigate(href.slice(1));
    };
    const onUnload = (e) => { e.preventDefault(); e.returnValue = ""; };
    document.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [dirty, saving, confirm, navigate, t]);

  if (loading) return <p>{t("common:ui.loading")}</p>;
  if (error) return <p>{t("common:ui.error")}: {error.message}</p>;

  // --- Tasks ---
  function handleCreateTask(category) {
    const base = taskBaseConfig[category];
    if (!base) return;
    setEditingIndex(null);
    if (base.type === "questionnaire") {
      // Content comes from i18n in the PROTOCOL's language (not the admin UI language)
      const lang = [].concat(protocolData?.language || "en")[0];
      // getResource does not apply i18next's fallbackLng, so fall back to en by hand
      const content = i18n.getResource(lang, "tasks", `${category}.defaultContent`)
        || i18n.getResource("en", "tasks", `${category}.defaultContent`)
        || {};
      setEditingData({
        category,
        title: content.title || "",
        description: content.description || "",
        questions: content.questions || [],
      });
      setShowQuestionnaireModal(true);
      return;
    }
    setEditingData({ type: base.type, category, recording: base.recording, ...getDefaultParams(category) });
    setShowTaskModal(true);
  }

  function handleCreateQuestionnaire() {
    setEditingIndex(null);
    setEditingData(null);
    setShowQuestionnaireModal(true);
  }

  function handleEditTask(index) {
    const taskToEdit = tasks[index];
    setEditingIndex(index);
    setEditingData(taskToEdit);
    // Keyed off type so standard questionnaires (rbdsq, hhies, ...) route here too
    if (taskToEdit.type === "questionnaire") setShowQuestionnaireModal(true);
    else setShowTaskModal(true);
  }

  function closeModals() {
    setShowTaskModal(false);
    setShowQuestionnaireModal(false);
    setEditingIndex(null);
    setEditingData(null);
  }

  function handleSaveTask(taskData) {
    setTasks((prev) => (editingIndex !== null
      ? prev.map((task, i) => (i === editingIndex ? { ...task, ...taskData } : task))
      : [...prev, taskData]));
    closeModals();
  }

  const handleSaveQuestionnaire = (data) => {
    handleSaveTask({
      // Standard questionnaires keep their own category (rbdsq, hhies, ...) so the DB task_id resolves
      category: editingData?.category || "questionnaire",
      type: "questionnaire",
      ...data,
    });
  };

  const handleDelete = (index) => setTasks((prev) => prev.filter((_, i) => i !== index));

  const handleDrop = (targetIndex) => {
    if (dragIndex === null || dragIndex === targetIndex) { setDragIndex(null); return; }
    setTasks((prev) => {
      const updated = [...prev];
      const [moved] = updated.splice(dragIndex, 1);
      updated.splice(targetIndex, 0, moved);
      return updated;
    });
    setDragIndex(null);
  };

  // --- Save and preview ---
  async function handleSave() {
    if (!dirty || !validation.isValid || saving) return;
    if (editingMode) {
      const ok = await confirm({
        title: library ? tl("edit.confirmTitle") : t("protocolEditor.confirmUpdateTitle"),
        message: library ? tl("edit.confirmMessage", { count: usedIn }) : t("protocolEditor.confirmUpdateMsg"),
        confirmText: library ? tl("edit.confirmSave") : t("protocolEditor.buttons.updateEveryone"),
        cancelText: t("common:ui.cancel"),
      });
      if (!ok) return;
    }
    setSaving(true);
    try {
      const result = await saveNewProtocol(tasks, protocolData, library ? null : projectId, editingMode, { library });
      setSelectedProtocol(null);
      await onSaved?.(result);
    } catch (err) {
      console.error("Save Error:", err);
      toast.error(`${ts("editor.saveFailed")}: ${err?.code ? apiErrorMessage(err, t) : (err?.message || "")}`);
      setSaving(false);
    }
  }

  function handlePreview() {
    // Tasks always run in the order listed here.
    const previewProtocol = { ...protocolData, projectId, tasks };
    setSelectedProtocol(previewProtocol);
    navigate(`/studies/${projectId}/protocols/${protocolData?.id ?? "new"}/preview`, {
      state: { protocol: previewProtocol, originalTasks: tasks, testingMode: true, editingMode },
    });
  }

  // --- Protocol fields ---
  const isQuillEmpty = (content) => {
    if (!content || content === "<p><br></p>") return true;
    const plainText = content.replace(/<(.|\n)*?>/g, "").trim();
    return plainText.length === 0 && !content.includes("<img");
  };

  const updateProtocolField = (field, value) => {
    const cleanValue = isQuillEmpty(value) ? "" : value; // empty tags are saved as an empty string
    setProtocolData((prev) => ({ ...prev, [field]: cleanValue }));
  };

  async function handleDeleteInfo() {
    const ok = await confirm({
      title: t("protocolEditor.confirmDeleteInfoTitle"),
      message: t("protocolEditor.confirmDeleteInfoMsg"),
      confirmText: t("common:ui.delete"),
      cancelText: t("common:ui.cancel"),
      danger: true,
    });
    if (ok) updateProtocolField("info_text", "");
  }

  async function handleDeleteInstructions() {
    const ok = await confirm({
      title: t("protocolEditor.confirmDeleteInstructionsTitle"),
      message: t("protocolEditor.confirmDeleteInstructionsMsg"),
      confirmText: t("common:ui.delete"),
      cancelText: t("common:ui.cancel"),
      danger: true,
    });
    if (ok) updateProtocolField("instructions_text", "");
  }

  // --- Identifier editor helpers (catalogue + custom fields) ---
  const identifiers = normalizeIdentifiers(protocolData?.required_identifiers);
  const setIdentifiers = (updater) =>
    setProtocolData((prev) => ({ ...prev, required_identifiers: updater(normalizeIdentifiers(prev?.required_identifiers)) }));
  const addIdentifier = (field) => setIdentifiers((list) => [...list, field]);
  const removeIdentifierAt = (idx) => setIdentifiers((list) => list.filter((_, i) => i !== idx));
  const updateIdentifierAt = (idx, patch) => setIdentifiers((list) => list.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  const identifierNameInvalid = (f, idx) =>
    !FIELD_NAME_RE.test(f.name || "")
    || IDENTIFIER_CATALOGUE.some((c) => c.name === f.name)
    || identifiers.some((o, i) => i !== idx && o.name === f.name);

  // --- Header ---
  const currentId = protocolData?.id;
  const language = [].concat(protocolData?.language || [])[0] || "";
  const chips = variants.length > 0
    ? variants
    : [].concat(protocolData?.language || []).map((code) => ({ code, protocol_id: currentId }));
  const name = protocolData?.name || ts("editor.untitled");
  const nextVersion = Number(protocolData?.version || 1) + 1;

  let sub = null;
  if (dirty) {
    sub = (
      <span className="pe-dirty" data-testid="protocol-dirty-note">
        <StatusDot tone="warn" />
        {isDraft ? ts("editor.draftNote") : ts("editor.dirtyNote", { version: nextVersion })}
      </span>
    );
  }

  return (
    <div className="pe" data-testid="protocol-editor">
      <PageHeader
        breadcrumbs={library ? [
          { label: tl("title"), to: "/library" },
          { label: name, to: protocolData?.id ? `/library/${protocolData.id}` : undefined },
          { label: tl("edit.crumb") },
        ] : [
          { label: ts("list.title"), to: "/studies" },
          { label: study?.project_name || "…", to: `/studies/${projectId}/protocols` },
          { label: name },
        ]}
        title={name}
        badges={(
          <>
            {!isDraft && protocolData?.version != null && <Badge tone="outline" data-testid="protocol-version">v{protocolData.version}</Badge>}
            {chips.length > 0 && (
              <span className="pe-lang-tabs" data-testid="protocol-languages">
                {chips.map((c) => (
                  c.protocol_id === currentId || !c.protocol_id || c.code === language
                    ? <span key={c.code} className="pe-lang pe-lang-on" aria-current="true">{c.code}</span>
                    : <Link key={c.code} className="pe-lang" to={library ? `/library/${c.protocol_id}/edit` : `/studies/${projectId}/protocols/${c.protocol_id}`}>{c.code}</Link>
                ))}
              </span>
            )}
            {readOnly && <Badge lock>{ts("editor.readOnly")}</Badge>}
          </>
        )}
        sub={sub}
        actions={(
          <>
            {!library && <Button variant="quiet" icon="eye" onClick={handlePreview} disabled={!tasks.length} data-testid="protocol-preview">{ts("protocols.preview")}</Button>}
            {!readOnly && (
              <Button
                variant="primary"
                onClick={handleSave}
                disabled={!dirty || !validation.isValid || saving}
                data-testid="protocol-save"
              >
                {t("protocolEditor.saveProtocol")}
              </Button>
            )}
          </>
        )}
      />

      {readOnly && (
        <div className="studies-banner" role="note" data-testid="protocol-readonly-banner">
          <Icon name="lock" />
          <span>{readOnlyReason}</span>
        </div>
      )}

      <div className={`pe-grid${readOnly ? " pe-grid-readonly" : ""}`}>
        {!readOnly && <TaskList onCreate={handleCreateTask} />}

        <ProtocolForm
          tasks={tasks}
          readOnly={readOnly}
          validation={validation}
          dragIndex={dragIndex}
          onDragStart={setDragIndex}
          onDrop={handleDrop}
          onEdit={handleEditTask}
          onDelete={handleDelete}
          onAddQuestionnaire={handleCreateQuestionnaire}
        />

        <ProtocolSettings
          protocolData={protocolData}
          setProtocolData={setProtocolData}
          validation={validation}
          readOnly={readOnly}
          editingMode={editingMode}
          isDraft={isDraft}
          libraryNote={library ? tl("edit.note", { count: usedIn }) : undefined}
          onEditInfo={() => setShowInfoModal(true)}
          onDeleteInfo={handleDeleteInfo}
          onEditInstructions={() => setShowInstructionsModal(true)}
          onDeleteInstructions={handleDeleteInstructions}
          onEditIdentifiers={() => setShowIdentifiersModal(true)}
        />
      </div>

      {!readOnly && (
        <>
          {/* --- Info page rich text --- */}
          <AdminModal
            open={showInfoModal}
            title={t("protocolEditor.editInfoTitle", "Edit Info")}
            onClose={() => setShowInfoModal(false)}
            onSave={() => setShowInfoModal(false)}
          >
            <div className="mobile-preview-wrapper">
              <TemplateSelector
                templateType="info"
                currentLanguage={language || "en"}
                onSelect={(content) => updateProtocolField("info_text", content)}
                i18n={i18n}
                label={ts("editor.loadTemplate")}
              />
              <div className="mobile-phone-frame">
                <div className="mobile-screen">
                  <ReactQuill
                    theme="snow"
                    modules={editorModules}
                    value={protocolData?.info_text || ""}
                    onChange={(val) => updateProtocolField("info_text", val)}
                  />
                </div>
              </div>
            </div>
          </AdminModal>

          {/* --- Instructions rich text --- */}
          <AdminModal
            open={showInstructionsModal}
            title={t("protocolEditor.editInstructionsTitle", "Edit Instructions")}
            onClose={() => setShowInstructionsModal(false)}
            onSave={() => setShowInstructionsModal(false)}
          >
            <div className="mobile-preview-wrapper">
              <TemplateSelector
                templateType="instructions"
                currentLanguage={language || "en"}
                onSelect={(content) => updateProtocolField("instructions_text", content)}
                i18n={i18n}
                label={ts("editor.loadTemplate")}
              />
              <div className="mobile-phone-frame">
                <div className="mobile-screen">
                  <ReactQuill
                    theme="snow"
                    modules={editorModules}
                    value={protocolData?.instructions_text || ""}
                    onChange={(val) => updateProtocolField("instructions_text", val)}
                  />
                </div>
              </div>
            </div>
          </AdminModal>

          {/* --- Identifiers (patientFields): catalogue + custom fields --- */}
          <AdminModal
            open={showIdentifiersModal}
            title={t("protocolEditor.editIdentifiersTitle", "Participant identifiers")}
            onClose={() => setShowIdentifiersModal(false)}
            onSave={() => setShowIdentifiersModal(false)}
          >
            <div className="modal-settings">
              <p>{t("protocolEditor.identifiersDesc", "Details the examiner fills in before starting the protocol in the desktop app:")}</p>

              <h5>{t("protocolEditor.identifiers.catalogue", "Standard fields")}</h5>
              {IDENTIFIER_CATALOGUE.map((entry) => {
                const idx = identifiers.findIndex((f) => f.catalogue && f.name === entry.name);
                const field = idx >= 0 ? identifiers[idx] : null;
                return (
                  <div key={entry.name}>
                    <label className="checkbox-option">
                      <input
                        type="checkbox"
                        checked={!!field}
                        onChange={(e) => (e.target.checked ? addIdentifier(catalogueField(entry.name)) : removeIdentifierAt(idx))}
                      />
                      <span>
                        {t(`identifiers.catalogue.${entry.name}.label`, { ns: "common" })} <code>{entry.name}</code>
                        {entry.name === "current_date" && <small> ({t("identifiers.autoFilled", { ns: "common" })})</small>}
                      </span>
                    </label>
                    {field && (
                      <div className="sub-options identifier-options">
                        <label className="checkbox-option">
                          <input type="checkbox" checked={!!field.required} onChange={(e) => updateIdentifierAt(idx, { required: e.target.checked })} />
                          {t("protocolEditor.identifiers.required", "Required")}
                        </label>
                        {entry.name !== "current_date" && (
                          <label>
                            {t("protocolEditor.identifiers.placeholder", "Placeholder")}{" "}
                            <input type="text" value={field.placeholder ?? ""} onChange={(e) => updateIdentifierAt(idx, { placeholder: e.target.value })} />
                          </label>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              <h5>{t("protocolEditor.identifiers.custom", "Custom fields")}</h5>
              {identifiers.map((f, idx) => (f.catalogue ? null : (
                <div key={idx} className="sub-options identifier-custom-row">
                  <input
                    type="text"
                    aria-label={t("protocolEditor.identifiers.name", "name (a-z, 0-9, _)")}
                    className={identifierNameInvalid(f, idx) ? "name-input-error" : ""}
                    placeholder={t("protocolEditor.identifiers.name", "name (a-z, 0-9, _)")}
                    value={f.name}
                    onChange={(e) => updateIdentifierAt(idx, { name: e.target.value })}
                  />
                  <CustomFieldLabelInput value={f.label} invalid={!f.label?.trim()} onChange={(label) => updateIdentifierAt(idx, { label })} />
                  <input type="text" aria-label={t("protocolEditor.identifiers.help", "Help text")} placeholder={t("protocolEditor.identifiers.help", "Help text")} value={f.help} onChange={(e) => updateIdentifierAt(idx, { help: e.target.value })} />
                  <input type="text" aria-label={t("protocolEditor.identifiers.placeholder", "Placeholder")} placeholder={t("protocolEditor.identifiers.placeholder", "Placeholder")} value={f.placeholder} onChange={(e) => updateIdentifierAt(idx, { placeholder: e.target.value })} />
                  <input type="text" aria-label={t("protocolEditor.identifiers.regex", "Regex")} className="pe-mono" placeholder={t("protocolEditor.identifiers.regex", "Regex")} value={f.regex} onChange={(e) => updateIdentifierAt(idx, { regex: e.target.value })} />
                  <label className="checkbox-option">
                    <input type="checkbox" checked={!!f.required} onChange={(e) => updateIdentifierAt(idx, { required: e.target.checked })} />
                    {t("protocolEditor.identifiers.required", "Required")}
                  </label>
                  <IconButton icon="x" label={t("protocolEditor.tooltips.delete")} onClick={() => removeIdentifierAt(idx)} />
                </div>
              )))}
              <Button size="sm" icon="plus" onClick={() => addIdentifier(emptyCustomField())}>
                {t("protocolEditor.identifiers.addCustom", "Add custom field")}
              </Button>

              {validation.errors.identifiers && (
                <div className="error-text">{t(`validation.protocol.${validation.errors.identifiers}`)}</div>
              )}
            </div>
          </AdminModal>

          <TaskModal
            open={showTaskModal}
            creatingNewTask={editingIndex === null}
            editingTask={editingIndex}
            editingData={editingData}
            tasks={tasks}
            setEditingData={setEditingData}
            onClose={closeModals}
            onSave={handleSaveTask}
          />

          <QuestionnaireModal
            open={showQuestionnaireModal}
            initialData={editingData}
            onClose={closeModals}
            onSave={handleSaveQuestionnaire}
          />
        </>
      )}
    </div>
  );
}
