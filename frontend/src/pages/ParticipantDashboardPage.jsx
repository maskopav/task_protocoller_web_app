// src/pages/ParticipantDashboardPage.jsx
import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useMappings } from "../context/MappingContext";

// API
import { getParticipants, searchParticipant } from "../api/participants";
import { getProtocolsByProjectId } from "../api/protocols";
import { fetchParticipantProtocolView, sendProtocolEmailApi } from "../api/participantProtocols";

// Components
import ParticipantTable from "../components/Participants/ParticipantTable";
import AddParticipantModal from "../components/Participants/AddParticipantModal";
import ParticipantProtocolTable from "../components/Participants/ParticipantProtocolTable";
import AssignmentSuccessModal from "../components/Participants/AssignmentSuccessModal"; 
import Modal from "../components/ProtocolEditor/Modal"
import DashboardTopBar from "../components/DashboardTopBar/DashboardTopBar"; 

// Styles
import "./Pages.css";
import "../components/Protocols/Protocols.css"; 

export default function ParticipantDashboardPage() {
  const { t, i18n } = useTranslation(["admin", "common"]);
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { refreshMappings, mappings } = useMappings(); // used to refresh dropdowns context if needed

  // --- State ---
  const [participants, setParticipants] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [protocols, setProtocols] = useState([]); // for the modal dropdown
  
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // State for Modal Modes
  const [isAssignMode, setIsAssignMode] = useState(false);
  const [selectedParticipant, setSelectedParticipant] = useState(null);

  // State for Search
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchError, setSearchError] = useState("");
  const [searching, setSearching] = useState(false);

  // Success Modal State
  const [successModal, setSuccessModal] = useState({ 
    open: false, 
    link: "", 
    text: "", 
    email: "",
    name: ""
  });

  // --- Data Loading ---
  async function loadData() {
    setLoading(true);
    try {
      // Parallel fetch for efficiency
      const [partsData, assignsData, protosData] = await Promise.all([
        getParticipants(projectId),
        fetchParticipantProtocolView({ project_id: projectId }),
        getProtocolsByProjectId(projectId)
      ]);

      setParticipants(partsData);
      setAssignments(assignsData);

      // Filter for current protocols only
      const currentProtocols = protosData.filter(p => p.is_current === 1);
      setProtocols(currentProtocols);
    } catch (err) {
      console.error("Failed to load dashboard data", err);
    } finally {
      setLoading(false);
    }
  }

  // Initial load
  useEffect(() => {
    refreshMappings(["projects"]);
    loadData();
  }, [projectId]);

  // Resolve project name for the title
  const currentProject = mappings?.projects?.find(p => p.id === Number(projectId));
  const projectName = currentProject?.name || "";
  const isReadOnly = currentProject?.is_active === 0;

  // --- Handlers ---
  const handleAddClick = () => {
    setSelectedParticipant(null); // Clear selection for Add mode
    setIsAssignMode(false);
    setShowModal(true);
  };

  const handleEditClick = (participant) => {
    setSelectedParticipant(participant); // Set data for Edit mode
    setIsAssignMode(false);
    setShowModal(true);
  };

  // Handler for 'Assign Protocol' button (Assign Mode)
  const handleOpenAssignModal = (participant) => {
    setSelectedParticipant(participant);
    setIsAssignMode(true);
    setShowModal(true);
  };
  

  const handleSuccess = () => {
    // Refresh both tables (Participants & Assignments)
    // Creating a participant creates an assignment, so both lists change.
    loadData();
  };

  const handleAssignmentChange = () => {
    // Refresh assignments when user activates/deactivates a protocol
    fetchParticipantProtocolView({ project_id: projectId })
      .then(setAssignments)
      .catch(console.error);
  };

  // Handler to open success modal from children
  const handleShowSuccessModal = (link, text, email, name) => {
    setSuccessModal({ open: true, link, text, email: email || "", name: name || "" });
  };

  // Handler for Search Button
  const handleSearchClick = () => {
    setSearchQuery("");
    setSearchError("");
    setShowSearch(true);
  };

  // Perform Search
  const performSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchError("");

    try {
      const foundParticipant = await searchParticipant(searchQuery.trim());
      
      if (foundParticipant) {
        // 1. Close Search Modal
        setShowSearch(false);
        
        // 2. Open AddModal in "Assign Mode" with the found data
        setSelectedParticipant(foundParticipant);
        setIsAssignMode(true);
        setShowModal(true);
      } else {
        setSearchError(t("participantDashboard.search.notFound", "Participant not found."));
      }
    } catch (err) {
      setSearchError(t("error.generic", "Error occurred"));
    } finally {
      setSearching(false);
    }
  };

  // --- Helper: Filter protocols for the modal ---
  const getModalProtocols = () => {
    // If in Assign Mode, remove protocols the participant already has
    if (isAssignMode && selectedParticipant) {
      const assignedProtocolIds = assignments
        .filter(a => a.participant_id === selectedParticipant.participant_id)
        .map(a => a.protocol_id);
      
      return protocols.filter(p => !assignedProtocolIds.includes(p.id));
    }
    // Otherwise show all active protocols
    return protocols;
  };

  const handleSendProtocolEmail = async (email, customBody) => {
    try {
      await sendProtocolEmailApi({
         email,
         body: customBody,
         link: successModal.link,
         lang: i18n.language
      });
    } catch (err) {
      console.error("Email API error:", err);
      // Re-throw so the modal can stop the loading state and potentially show an error
      throw err;
    }
  };

  return (
    <div className="dashboard-page">
      {/* Top Navigation Bar */}
      <DashboardTopBar onBack={() => navigate(`/admin/projects/${projectId}`)} />

      {/* Page Title with Project Name */}
      <h2 className="page-title">
        {projectName ? `${projectName}: ` : ""}
        {t("participantDashboard.title")}
        {isReadOnly && (
          <p className="inactive-mode-warning">
            ⚠️{t("projectDashboard.status.inactive") + ": "+ t("projectDashboard.status.inactiveMode")}
          </p>
        )}
      </h2>

      {/* Main Content */}
      <div className="dashboard-split-container">
        
        {/* --- SECTION 1: Participants Management --- */}
        <section className="card compact-create">
          <div className="section-header create-header-row">
            <div className="header-text-group">
                <div className="section-title">{t("participantDashboard.table.title")}</div>
                <span className="section-subtitle">
                    {t("participantDashboard.table.subtitle")}
                </span>
            </div>
            {/* BUTTON GROUP */}
            <div className="header-actions">
              <button 
                className="btn-create small" 
                onClick={handleAddClick}
                disabled={isReadOnly}
              >
                + {t("participantDashboard.addParticipant")}
              </button>

              <button 
                className="btn-search small" 
                onClick={handleSearchClick}
                disabled={isReadOnly}
              >
                🔍 {t("participantDashboard.addExisting")}
              </button>
            </div>
          </div>
            <ParticipantTable 
              participants={participants} 
              readOnly={isReadOnly}
              loading={loading}
              onEdit={handleEditClick}
              onAssignProtocol={handleOpenAssignModal}
            />
        </section>

        {/* --- SECTION 2: Protocol Assignments --- */}
        <section className="dashboard-section card">
          <div className="section-header">
            <div className="header-text-group">
                <div className="section-title">{t("participantProtocol.table.title")}</div>
                <span className="section-subtitle">
                    {t("participantProtocol.table.subtitle")}
                </span>
            </div>
          </div>

            <ParticipantProtocolTable 
              rows={assignments} 
              onRefresh={handleAssignmentChange}
              onShowSuccessModal={handleShowSuccessModal}
              readOnly={isReadOnly}
            />
        </section>

      </div>

      {/* Add Participant Modal */}
      <AddParticipantModal
        open={showModal}
        onClose={() => setShowModal(false)}
        projectId={projectId}
        protocols={getModalProtocols()}
        participantToEdit={selectedParticipant}
        isAssignMode={isAssignMode}
        onSuccess={handleSuccess}
        onShowSuccessModal={handleShowSuccessModal}
      />

      {/* Global Success Modal */}
      <AssignmentSuccessModal
        open={successModal.open}
        link={successModal.link}
        emailText={successModal.text}
        participantEmail={successModal.email}
        participantName={successModal.name}
        onClose={() => setSuccessModal({ ...successModal, open: false })}
        onSendEmail={handleSendProtocolEmail}
      />

      {/* Search Modal */}
      <Modal
        open={showSearch}
        onClose={() => setShowSearch(false)}
        title={t("participantDashboard.search.title")}
        showSaveButton={false} // Custom buttons
      >
        <div className="search-modal-body">
          <p className="search-modal-instruction">
            {t("participantDashboard.search.instruction")}
          </p>
          
          <div className="search-input-row">
            <input 
              type="text" 
              className="participant-input search-field"
              placeholder={t("participantDashboard.modal.placeholders.externalId")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && performSearch()}
            />
            <button 
              className="btn-modal-search"
              onClick={performSearch} 
              disabled={searching || !searchQuery}
            >
              {searching ? "..." : t("participantDashboard.buttons.search")}
            </button>
          </div>

          {searchError && (
            <div className="validation-error-msg text-left">
              {searchError}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}