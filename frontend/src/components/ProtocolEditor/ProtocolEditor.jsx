// src/components/ProtocolEditor/ProtocolEditor.jsx
import React, { useState, useContext, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { taskBaseConfig } from "../../config/tasksBase";
import { getDefaultParams } from "../../utils/translations"; 

import TaskList from "./TaskList";
import ProtocolForm from "./ProtocolForm";
import TaskModal from "./TaskModal";
import QuestionnaireModal from "./QuestionnaireModal";
import { useMappings } from "../../context/MappingContext";
import { useProtocolManager } from "../../hooks/useProtocolManager";
import { ProtocolContext } from "../../context/ProtocolContext";
import { useConfirm } from "../ConfirmDialog/ConfirmDialogContext"; // Import confirm
import { validate } from "../../utils/validation";
import AdminModal from "./Modal";
import {
  IDENTIFIER_CATALOGUE,
  catalogueField,
  emptyCustomField,
  normalizeIdentifiers,
  FIELD_NAME_RE,
  NEW_PROTOCOL_FILE_NAME,
} from '../Identifiers/IdentifierFields';
import ReactQuill, { Quill } from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import "./ProtocolEditor.css";

// Force Quill to use inline styles instead of classes for font sizes
const Size = Quill.import('attributors/style/size');
Size.whitelist = ['12px', '16px', '20px', '28px']; // small, normal, large, huge equivalents
Quill.register(Size, true);

const editorModules = {
  toolbar: [
    [{ 'header': [1, 2, 3, false] }],
    ['bold', 'italic', 'underline'],
    [{ 'color': [] }, { 'background': [] }],
    [{ 'align': [] }], // Adds Left, Center, Right, Justify
    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
    [{ 'indent': '-1'}, { 'indent': '+1' }], // Adds Indentation
    ['clean']
  ],
};

const TemplateSelector = ({ templateType, currentLanguage, onSelect, i18n }) => {
  let templates = {};
  
  // 1. Get the raw JSON bundle for the protocol's language, fallback to 'en'
  const bundle = i18n.getResourceBundle(currentLanguage, "intro") || i18n.getResourceBundle("en", "intro");
  
  // 2. Safely traverse the JSON object without relying on i18next dot-notation parsing
  if (bundle && bundle.templates && bundle.templates[templateType]) {
    templates = bundle.templates[templateType];
  }

  return (
    <div className="template-selector" style={{ marginBottom: '10px' }}>
      <select 
        onChange={(e) => {
          const selectedKey = e.target.value;
          if (selectedKey && templates[selectedKey]) {
            onSelect(templates[selectedKey].content);
            e.target.value = ""; 
          }
        }}
      >
        <option value="">-- Load a standard template --</option>
        {Object.keys(templates).map(key => (
          <option key={key} value={key}>
            {templates[key].label}
          </option>
        ))}
      </select>
    </div>
  );
};

export function ProtocolEditor({ 
  initialTasks = [], 
  onSave = () => {}, 
  onChange = () => {}, 
  protocol,
  testingMode,
  editingMode
  }
) {
  const { t, i18n } = useTranslation(["admin", "common", "intro"]);
  const navigate = useNavigate();
  const { projectId } = useParams();
  const { mappings, loading, error } = useMappings();
  const { selectedProtocol, setSelectedProtocol } = useContext(ProtocolContext);
  const { saveNewProtocol } = useProtocolManager();


  const confirm = useConfirm();

  // State: Tasks & Protocol Data 
  const [tasks, setTasks] = useState(initialTasks);
  // A brand-new protocol starts with the participant code identifier and a
  // filename template that uses it (desktop-app defaults).
  const [protocolData, setProtocolData] = useState(
    protocol || selectedProtocol || {
      required_identifiers: [catalogueField("patient_code")],
      recordings_file_name: NEW_PROTOCOL_FILE_NAME,
    }
  );

  // State: Modals & Editing
  // Tracks which task index is currently being edited (null = creating new)
  const [editingIndex, setEditingIndex] = useState(null);
  // Holds the data being edited (for both regular tasks and questionnaires)
  const [editingData, setEditingData] = useState(null);
  // Controls visibility of the standard Task Modal
  const [showTaskModal, setShowTaskModal] = useState(false);
  // Controls visibility of the Questionnaire Modal
  const [showQuestionnaireModal, setShowQuestionnaireModal] = useState(false);
  // Intro components modals
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showInstructionsModal, setShowInstructionsModal] = useState(false);
  const [showIdentifiersModal, setShowIdentifiersModal] = useState(false);

  // --- State: UI & Validation ---
  const [reorderMode, setReorderMode] = useState(false);
  const [dragIndex, setDragIndex] = useState(null);

  const protocols = mappings?.protocols || [];

  useEffect(() => {
    // Only update if protocol actually contains data
    if (protocol && Object.keys(protocol).length > 0) {
      setProtocolData(protocol);
      setSelectedProtocol(protocol);
    }
  }, [protocol, setSelectedProtocol]);

  // Whenever local protocolData changes, reflect it globally
  useEffect(() => {
    if (protocolData) {
      setSelectedProtocol(protocolData);
    }
  }, [protocolData, setSelectedProtocol]);  

  // Effect: Validate Name
  // --- Validation Logic ---
  const validation = React.useMemo(() => {
    // 1. Get base validation (Name required, Language, Tasks)
    const result = validate.protocol({ ...protocolData, tasks });

    // 2. Add Contextual Validation: Duplicate Name Check
    if (protocolData?.name) {
      const isDuplicate = protocols.some(p => 
        p.id !== protocolData.id && 
        p.protocol_group_id !== protocolData.protocol_group_id &&
        p.name.toLowerCase().trim() === protocolData.name.toLowerCase().trim()
      );

      if (isDuplicate) {
        result.isValid = false;
        result.errors.name = "nameExists"; // Overwrite or add name error
      }
    }

    return result;
  }, [protocolData, tasks, protocols]);

  // Effect: Notify Parent on Change
  useEffect(() => {
    if (onChange) {
      onChange(tasks);
    }
  }, [tasks, onChange]);  

  if (loading) return <p>{t("common:loading")}</p>;
  if (error) return <p>{t("common:error")}: {error.message}</p>;

  // Start creating a standard task (opens TaskModal; standard questionnaires
  // open QuestionnaireModal pre-filled with their per-language default content)
  function handleCreateTask(category) {
    const base = taskBaseConfig[category];
    if (!base) return;

    setEditingIndex(null); // New task
      // In case of questionnaire, the opened modal is different
    if (base.type === "questionnaire") {
      // Content comes from i18n in the PROTOCOL's language (not the admin UI language)
      const lang = protocolData?.language || "en";
      // getResource does not apply i18next's fallbackLng — fall back to en manually
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

    const newTaskDefaults = {
      type: base.type,
      category,
      recording: base.recording,
      ...getDefaultParams(category),
    };

    setEditingData(newTaskDefaults);
    setShowTaskModal(true);
  }

  // Start creating a questionnaire (opens QuestionnaireModal)
  function handleCreateQuestionnaire() {
    setEditingIndex(null); // New task
    setEditingData(null); // No initial data
    setShowQuestionnaireModal(true);
  }

  // Edit an existing task (determines type and opens correct modal)
  function handleEditTask(index) {
    const taskToEdit = tasks[index];
    setEditingIndex(index);
    setEditingData(taskToEdit); // Load existing data

    // Keyed off type so standard questionnaires (rbdsq, hhies, ...) route here too
    if (taskToEdit.type === "questionnaire") {
      setShowQuestionnaireModal(true);
    } else {
      setShowTaskModal(true);
    }
  }
  // Save task (Create or Update) - Unified Handler
  function handleSaveTask(taskData) {
    setTasks((prev) => {
      if (editingIndex !== null) {
        // Update existing at index
        return prev.map((t, i) => (i === editingIndex ? { ...t, ...taskData } : t));
      } else {
        // Create new
        return [...prev, taskData];
      }
    });

    // Close all modals and reset states
    closeModals();
  }

  // Close Modals Helper
  function closeModals() {
    setShowTaskModal(false);
    setShowQuestionnaireModal(false);
    setEditingIndex(null);
    setEditingData(null);
  }

  // Delete Task
  function handleDeleteTask(index) {
    setTasks((prev) => prev.filter((_, i) => i !== index));
  }
  
  // --- Handlers: Questionnaire Specific Save ---
  // Used by QuestionnaireModal to format data before saving
  const handleSaveQuestionnaire = (data) => {
    // Ensure data is flat and has correct type
    const questionnaireTask = {
      // Standard questionnaires keep their own category (rbdsq, hhies, ...) so the
      // DB task_id resolves to their row; manual ones stay "questionnaire"
      category: editingData?.category || "questionnaire",
      type: "questionnaire",
      ...data, // Spread { title, description, questions } flatly
    };
    handleSaveTask(questionnaireTask);
  };

  // --- Handlers: Drag & Drop ---
  const handleDragStart = (i) => setDragIndex(i);
  const handleDrop = (targetIndex) => {
    if (dragIndex === null || dragIndex === targetIndex) return;
    setTasks((prev) => {
      const updated = [...prev];
      const [moved] = updated.splice(dragIndex, 1);
      updated.splice(targetIndex, 0, moved);
      return updated;
    });
    setDragIndex(null);
  };

  // --- Handlers: Protocol Actions ---
  async function handleSaveProtocol() {
    if (!validation.isValid) return;

    // If Editing Mode: Ask for confirmation
    if (editingMode) {
      const isConfirmed = await confirm({
        title: t("protocolEditor.confirmUpdateTitle"),
        message: t("protocolEditor.confirmUpdateMsg"),
        confirmText: t("protocolEditor.buttons.updateEveryone"),
        cancelText: t("common:cancel")
      });

      if (!isConfirmed) return;
    }

    try {
      const result = await saveNewProtocol(
        tasks,
        protocolData,
        projectId,
        editingMode
      );
      onSave(result);
      setSelectedProtocol(null);
      navigate(`/admin/projects/${projectId}/protocols`);
    } catch (err) {
      // Show the specific error message from the backend (Conflict 409)
      const errorMsg = err.response?.data?.error || err.message || t("protocolEditor.saveFailedMsg");
      console.error("Save Error:", err);
      
      await confirm({
        title: t("protocolEditor.saveFailedTitle"),
        message: errorMsg,
        confirmText: t("protocolEditor.buttons.backToEditor")
      });
    }
  }

  function handleShowProtocol() {
    // Tasks always run in the order listed here.
    const previewProtocol = { ...protocolData, tasks };

    // Send the version to the interface
    setSelectedProtocol(previewProtocol);
    navigate("/participant/test", {
      state: {
        protocol: previewProtocol,
        originalTasks: tasks, // untouched tasks list
        testingMode: true,
        editingMode,
      },
    });
  }

  const isQuillEmpty = (content) => {
    // Catch completely null/empty or Quill's default empty paragraph
    if (!content || content === '<p><br></p>') return true;
    
    // Strip tags to check for raw text
    const plainText = content.replace(/<(.|\n)*?>/g, '').trim();
    
    // Also check if media elements like images exist
    const hasMedia = content.includes('<img');
    
    // It is only truly empty if there is no text AND no media
    return plainText.length === 0 && !hasMedia;
  };

  // Helper to update protocol data fields
  const updateProtocolField = (field, value) => {
    // If the editor only contains empty tags, save it as an empty string
    const cleanValue = isQuillEmpty(value) ? "" : value;
    setProtocolData(prev => ({ ...prev, [field]: cleanValue }));
  };

  async function handleDeleteInfo() {
    const isConfirmed = await confirm({
      title: t("protocolEditor.confirmDeleteInfoTitle"),
      message: t("protocolEditor.confirmDeleteInfoMsg"),
      confirmText: t("common:delete"),
      cancelText: t("common:cancel")
    });
    if (isConfirmed) {
      updateProtocolField("info_text", "");
    }
  }

  async function handleDeleteInstructions() {
    const isConfirmed = await confirm({
      title: t("protocolEditor.confirmDeleteInstructionsTitle"),
      message: t("protocolEditor.confirmDeleteInstructionsMsg"),
      confirmText: t("common:delete"),
      cancelText: t("common:cancel")
    });
    if (isConfirmed) {
      updateProtocolField("instructions_text", "");
    }
  }

  // --- Identifier editor helpers (catalogue + custom fields) ---
  const identifiers = normalizeIdentifiers(protocolData?.required_identifiers);
  const setIdentifiers = (updater) =>
    setProtocolData(prev => ({ ...prev, required_identifiers: updater(normalizeIdentifiers(prev?.required_identifiers)) }));
  const addIdentifier = (field) => setIdentifiers(list => [...list, field]);
  const removeIdentifierAt = (idx) => setIdentifiers(list => list.filter((_, i) => i !== idx));
  const updateIdentifierAt = (idx, patch) => setIdentifiers(list => list.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  const identifierNameInvalid = (f, idx) =>
    !FIELD_NAME_RE.test(f.name || "") ||
    IDENTIFIER_CATALOGUE.some(c => c.name === f.name) ||
    identifiers.some((o, i) => i !== idx && o.name === f.name);

  return (
    <div className="admin-container">
      <h2>{t("protocolEditor.title")}</h2>

      <div className="admin-grid">
        <TaskList onCreate={handleCreateTask} />

        <ProtocolForm
          tasks={tasks}
          protocolData={protocolData}
          setProtocolData={setProtocolData}
          reorderMode={reorderMode}
          setReorderMode={setReorderMode}
          onEdit={handleEditTask}
          onDelete={handleDeleteTask}
          onDragStart={handleDragStart}
          onDrop={handleDrop}
          dragIndex={dragIndex}
          onAddQuestionnaire={handleCreateQuestionnaire}
          onSave={handleSaveProtocol}
          onShowProtocol={handleShowProtocol}
          validation={validation} 
          editingMode={editingMode}
          onEditInfo={() => setShowInfoModal(true)}
          onDeleteInfo={handleDeleteInfo}
          onEditInstructions={() => setShowInstructionsModal(true)}
          onDeleteInstructions={handleDeleteInstructions}
          onEditIdentifiers={() => setShowIdentifiersModal(true)}
        />
      </div>

      {/* --- Info Page Rich Text Modal --- */}
      <AdminModal
        open={showInfoModal}
        title={t("protocolEditor.editInfoTitle", "Edit Info")}
        onClose={() => setShowInfoModal(false)}
        onSave={() => setShowInfoModal(false)}
      >
        <div className="mobile-preview-wrapper">
          <TemplateSelector 
            templateType="info" 
            currentLanguage={protocolData?.language || "en"} 
            onSelect={(content) => updateProtocolField("info_text", content)} 
            i18n={i18n}
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

      {/* --- Instructions Page Rich Text Modal --- */}
      <AdminModal
        open={showInstructionsModal}
        title={t("protocolEditor.editInstructionsTitle", "Edit Instructions")}
        onClose={() => setShowInstructionsModal(false)}
        onSave={() => setShowInstructionsModal(false)}
      >
        <div className="mobile-preview-wrapper">
          <TemplateSelector 
            templateType="instructions" 
            currentLanguage={protocolData?.language || "en"} 
            onSelect={(content) => updateProtocolField("instructions_text", content)} 
            i18n={i18n}
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

      {/* --- Identifiers (patientFields) Modal: catalogue + custom fields --- */}
      <AdminModal
        open={showIdentifiersModal}
        title={t("protocolEditor.editIdentifiersTitle", "Participant identifiers")}
        onClose={() => setShowIdentifiersModal(false)}
        onSave={() => setShowIdentifiersModal(false)}
        showSaveButton={true}
      >
        <div className="modal-settings">
          <p>{t("protocolEditor.identifiersDesc", "Details the examiner fills in before starting the protocol in the desktop app:")}</p>

          <h5>{t("protocolEditor.identifiers.catalogue", "Standard fields")}</h5>
          {IDENTIFIER_CATALOGUE.map(entry => {
            const idx = identifiers.findIndex(f => f.catalogue && f.name === entry.name);
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
          {identifiers.map((f, idx) => f.catalogue ? null : (
            <div key={idx} className="sub-options identifier-custom-row">
              <input
                type="text"
                className={identifierNameInvalid(f, idx) ? "name-input-error" : ""}
                placeholder={t("protocolEditor.identifiers.name", "name (a-z, 0-9, _)")}
                value={f.name}
                onChange={(e) => updateIdentifierAt(idx, { name: e.target.value })}
              />
              <input type="text" className={!f.label?.trim() ? "name-input-error" : ""} placeholder={t("protocolEditor.identifiers.label", "Label") + "*"} value={f.label} onChange={(e) => updateIdentifierAt(idx, { label: e.target.value })} />
              <input type="text" placeholder={t("protocolEditor.identifiers.help", "Help text")} value={f.help} onChange={(e) => updateIdentifierAt(idx, { help: e.target.value })} />
              <input type="text" placeholder={t("protocolEditor.identifiers.placeholder", "Placeholder")} value={f.placeholder} onChange={(e) => updateIdentifierAt(idx, { placeholder: e.target.value })} />
              <input type="text" style={{ fontFamily: "monospace" }} placeholder={t("protocolEditor.identifiers.regex", "Regex")} value={f.regex} onChange={(e) => updateIdentifierAt(idx, { regex: e.target.value })} />
              <label className="checkbox-option">
                <input type="checkbox" checked={!!f.required} onChange={(e) => updateIdentifierAt(idx, { required: e.target.checked })} />
                {t("protocolEditor.identifiers.required", "Required")}
              </label>
              <span className="delete-icon-small" title={t("protocolEditor.tooltips.delete")} onClick={() => removeIdentifierAt(idx)}>✖</span>
            </div>
          ))}
          <button type="button" className="btn-add-page-minimal" onClick={() => addIdentifier(emptyCustomField())}>
            + {t("protocolEditor.identifiers.addCustom", "Add custom field")}
          </button>

          {validation.errors.identifiers && (
            <div className="error-text">{t(`validation.protocol.${validation.errors.identifiers}`)}</div>
          )}
        </div>
      </AdminModal>

      {/* Task edit/create modal */}
      <TaskModal
        open={showTaskModal}
        creatingNewTask={editingIndex === null} // Derived state
        editingTask={editingIndex}
        editingData={editingData}
        tasks={tasks}
        setEditingData={setEditingData}
        onClose={closeModals}
        onSave={handleSaveTask}
      />

      <QuestionnaireModal
        open={showQuestionnaireModal}
        initialData={editingData} // Pass loaded data for editing
        onClose={closeModals}
        onSave={handleSaveQuestionnaire}
      />
    </div>
  );
}
