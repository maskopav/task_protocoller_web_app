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
    [{ 'size': ['12px', false, '20px', '28px'] }], // 'false' defaults to your base 16px
    ['bold', 'italic', 'underline'],
    [{ 'color': [] }, { 'background': [] }],
    [{ 'align': [] }], // Adds Left, Center, Right, Justify
    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
    [{ 'indent': '-1'}, { 'indent': '+1' }], // Adds Indentation
    ['clean']
  ],
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
  const { t } = useTranslation(["admin"]);
  const navigate = useNavigate();
  const { projectId } = useParams();
  const { mappings, loading, error } = useMappings();
  const { selectedProtocol, setSelectedProtocol } = useContext(ProtocolContext);
  const { saveNewProtocol } = useProtocolManager();
  

  const confirm = useConfirm();

  // State: Tasks & Protocol Data 
  const [tasks, setTasks] = useState(initialTasks);
  const [protocolData, setProtocolData] = useState(protocol || selectedProtocol || {});

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
  const [showIntroModal, setShowIntroModal] = useState(false);
  const [showConsentModal, setShowConsentModal] = useState(false);

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

  if (loading) {
    return <p>Loading mappings...</p>;
  }

  if (error) {
    return <p>Error: {error.message}</p>;
  }

  // Start creating a standard task (opens TaskModal)
  function handleCreateTask(category) {
    const base = taskBaseConfig[category];
    if (!base) return;

    const newTaskDefaults = {
      type: base.type,
      category,
      recording: base.recording,
      ...getDefaultParams(category),
    };

    setEditingIndex(null); // New task
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

    if (taskToEdit.category === "questionnaire") {
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
      category: "questionnaire",
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
          title: "Update Active Protocol?",
          message: "You are updating an existing protocol. All participants assigned to this protocol will be automatically moved to this new version. Their existing unique links will continue to work but will load this new content.\n\nAre you sure you want to proceed?",
          confirmText: "Yes, Update Everyone",
          cancelText: "Cancel"
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
      const errorMsg = err.response?.data?.error || err.message || "Failed to save protocol.";
      console.error("Save Error:", err);
      
      await confirm({
        title: "Save Failed",
        message: errorMsg,
        confirmText: "Back to Editor"
      });
    }
  }

  function handleShowProtocol() {
    setSelectedProtocol({ ...protocolData, tasks });
    navigate("/participant/test", {
      state: {
        protocol: { ...protocolData, tasks },
        testingMode: true,
        editingMode,
      },
    });
  }

  // Helper to update protocol data fields
  const updateProtocolField = (field, value) => {
    setProtocolData(prev => ({ ...prev, [field]: value }));
  };

  async function handleDeleteIntro() {
    const isConfirmed = await confirm({
      title: t("protocolEditor.confirmDeleteIntroTitle", "Delete Intro Page?"),
      message: t("protocolEditor.confirmDeleteIntroMsg", "Are you sure you want to remove the introduction text?"),
      confirmText: t("common.delete", "Delete"),
      cancelText: t("common.cancel", "Cancel")
    });
    if (isConfirmed) {
      updateProtocolField("info_text", "");
    }
  }

  async function handleDeleteConsent() {
    const isConfirmed = await confirm({
      title: t("protocolEditor.confirmDeleteConsentTitle", "Delete Consent Form?"),
      message: t("protocolEditor.confirmDeleteConsentMsg", "Are you sure you want to remove the consent form text?"),
      confirmText: t("common.delete", "Delete"),
      cancelText: t("common.cancel", "Cancel")
    });
    if (isConfirmed) {
      updateProtocolField("consent_text", "");
    }
  }

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
          onEditIntro={() => setShowIntroModal(true)}
          onDeleteIntro={handleDeleteIntro}
          onEditConsent={() => setShowConsentModal(true)}
          onDeleteConsent={handleDeleteConsent}
        />
      </div>

      {/* --- Intro Page Rich Text Modal --- */}
      <AdminModal
        open={showIntroModal}
        title={t("protocolEditor.editIntroTitle", "Edit Intro Page")}
        onClose={() => setShowIntroModal(false)}
        onSave={() => setShowIntroModal(false)}
      >
        <div className="mobile-preview-wrapper">
          <div className="mobile-phone-frame">
            <div className="mobile-screen">
               <ReactQuill 
                theme="snow"
                modules={editorModules}
                value={protocolData?.info_text || ""}
                onChange={(val) => updateProtocolField("info_text", val)}
                placeholder="Welcome text for participants..."
              />
            </div>
          </div>
        </div>
      </AdminModal>

      {/* --- Consent Page Rich Text Modal --- */}
      <AdminModal
        open={showConsentModal}
        title={t("protocolEditor.editConsentTitle", "Edit Consent Form")}
        onClose={() => setShowConsentModal(false)}
        onSave={() => setShowConsentModal(false)}
      >
        <div className="mobile-preview-wrapper">
          <div className="mobile-phone-frame">
            <div className="mobile-screen ql-editor">
               <ReactQuill 
                theme="snow"
                modules={editorModules}
                value={protocolData?.consent_text || ""}
                onChange={(val) => updateProtocolField("consent_text", val)}
                placeholder="Legal consent text..."
              />
            </div>
          </div>
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
