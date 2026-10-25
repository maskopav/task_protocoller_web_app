// src/pages/ProtocolDashboardPage.jsx
import React, { useContext, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ProtocolContext } from "../context/ProtocolContext";
import { useMappings } from "../context/MappingContext";
import Protocols from "../components/Protocols/Protocols";
import "./Pages.css"

export default function ProtocolDashboardPage() {
  const { setSelectedProtocol } = useContext(ProtocolContext);
  const { refreshMappings } = useMappings();
  const { projectId } = useParams();
  const navigate = useNavigate();

  // Refresh only once, when page is mounted the first time
  const didRefresh = useRef(false);
  useEffect(() => {
    if (!didRefresh.current) {
      refreshMappings();
      didRefresh.current = true;
    }
  }, [refreshMappings]);

  const handleSelectProtocol = (protocol) => {
    const testingMode = true; // always in test mode for admin
    const editingMode = false; // because user opens it for creating
    setSelectedProtocol(protocol);
    navigate(`/studies/${projectId}/protocols/${protocol.id}`, {
      state: { 
        protocol,
        testingMode,
        editingMode,
      }, 
    });
  };

  return (
    <div className="dashboard-page">
      <Protocols onSelectProtocol={handleSelectProtocol} />
    </div>
  );
}
