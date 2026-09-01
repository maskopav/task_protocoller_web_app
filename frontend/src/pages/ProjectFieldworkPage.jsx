// src/pages/ProjectFieldworkPage.jsx
import React, { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import DashboardTopBar from "../components/DashboardTopBar/DashboardTopBar";
import FieldworkTable from "../components/Fieldwork/FieldworkTable";
import { getProjectFieldwork } from "../api/projects";
import "./Pages.css";

export default function ProjectFieldworkPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation(["admin", "common"]);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadFieldwork = useCallback(async () => {
    try {
      const sessions = await getProjectFieldwork(projectId);
      setData(sessions);
    } catch (e) {
      console.error("Failed to load fieldwork", e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadFieldwork();
  }, [loadFieldwork]);

  return (
    <div className="dashboard-page fieldwork-page">
      <DashboardTopBar onBack={() => navigate(`/admin/projects/${projectId}`)} />
      
      <div className="page-header">
        <h1 className="page-title">Fieldwork Management</h1>
      </div>

      {loading ? (
        <p>{t("loading", { ns: "common" })}...</p>
      ) : (
        <FieldworkTable rows={data} projectId={projectId} onDataChanged={loadFieldwork} />
      )}
    </div>
  );
}