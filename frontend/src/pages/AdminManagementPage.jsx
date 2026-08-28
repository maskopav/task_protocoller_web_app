// frontend/src/pages/AdminManagementPage.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useConfirm } from "../components/ConfirmDialog/ConfirmDialogContext";
import DashboardTopBar from "../components/DashboardTopBar/DashboardTopBar";
import UserTable from "../components/AdminManagement/UserTable";
import UserProjectTable from "../components/AdminManagement/UserProjectTable";
import UserSiteTable from "../components/AdminManagement/UserSiteTable";
import AssignProjectModal from "../components/AdminManagement/AssignProjectModal";
import AssignSiteModal from "../components/AdminManagement/AssignSiteModal";
import AddAdminModal from "../components/AdminManagement/AddAdminModal";
import EditAdminModal from "../components/AdminManagement/EditAdminModal";
import { fetchProjectsList } from "../api/projects";
import { fetchAllAdmins, toggleAdminActive} from "../api/users";
import { fetchAdminAssignments, assignProjectToUser, removeUserProjectAssignmentApi } from "../api/userProjects";
import { fetchSiteAssignments, assignSiteToUser, removeUserSiteAssignmentApi } from "../api/userSites";
import "./Pages.css";

export default function AdminManagementPage() {
  const { t } = useTranslation(["admin", "common"]);
  const navigate = useNavigate();
  const confirm = useConfirm();

  const [users, setUsers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [siteAssignments, setSiteAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserForProject, setSelectedUserForProject] = useState(null);
  const [selectedUserForSite, setSelectedUserForSite] = useState(null);
  const [allProjects, setAllProjects] = useState([]);
  const [isAddAdminOpen, setIsAddAdminOpen] = useState(false);
  const [userToEdit, setUserToEdit] = useState(null);

  const loadData = async () => {
    try {
      const [uData, aData, sData, pData] = await Promise.all([
        fetchAllAdmins(),
        fetchAdminAssignments(),
        fetchSiteAssignments(),
        fetchProjectsList()
      ]);
      setUsers(uData);
      setAssignments(aData);
      setSiteAssignments(sData);
      setAllProjects(pData);
    } catch (err) {
      console.error("Management data error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleToggleStatus = async (user_id, current_status) => {
    try {
      await toggleAdminActive(user_id, current_status === 1 ? 0 : 1);
      await loadData(); 
    } catch (err) {
      alert(t("management.alerts.statusError")); // Translated alert
    }
  };

  const handleRemoveAssignment = async (id) => {
    // Call the custom dialog and wait for the boolean result
    const isConfirmed = await confirm({
      title: t("management.confirm.deleteTitle"),
      message: t("management.confirm.removeAssignment"),
      confirmText: t("management.confirm.confirm"),
      cancelText: t("management.confirm.cancel"),
    });

    if (isConfirmed) {
      try {
        await removeUserProjectAssignmentApi(id);
        await loadData(); // Refresh assignments table
      } catch (err) {
        // You could also implement a "useAlert" here for consistency
        alert(err.message || "Failed to remove assignment.");
      }
    }
  };

  const handleAssignProject = async (user_id, project_id) => {
    try {
      await assignProjectToUser(user_id, project_id);
      setSelectedUserForProject(null);
      await loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleRemoveSiteAssignment = async (id) => {
    const isConfirmed = await confirm({
      title: t("management.confirm.deleteTitle"),
      message: t("management.confirm.removeSiteAssignment"),
      confirmText: t("management.confirm.confirm"),
      cancelText: t("management.confirm.cancel"),
    });

    if (isConfirmed) {
      try {
        await removeUserSiteAssignmentApi(id);
        await loadData();
      } catch (err) {
        alert(err.message || "Failed to remove assignment.");
      }
    }
  };

  const handleAssignSite = async (user_id, site_id) => {
    try {
      await assignSiteToUser(user_id, site_id);
      setSelectedUserForSite(null);
      await loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading) return <div className="app-container"><p>{t("loading", { ns: "common" })}...</p></div>;

  return (
    <div className="dashboard-page">
      <DashboardTopBar onBack={() => navigate("/admin")} />

      <div className="page-header">
        <h1 className="page-title">{t("adminDashboard.masterTools.users")}</h1> {/* From admin.json */}
        <p className="project-description">
          {t("adminDashboard.masterTools.usersDesc")} {/* From admin.json */}
        </p>
      </div>

      <div className="management-sections">
        <UserTable 
          users={users} 
          onToggleStatus={handleToggleStatus}
          onEdit={(u) => setUserToEdit(u)}
          onAssignProject={(u) => setSelectedUserForProject(u)}
          onAssignSite={(u) => setSelectedUserForSite(u)}
          onAddClick={() => setIsAddAdminOpen(true)}
        />

        <AddAdminModal 
          open={isAddAdminOpen}
          onClose={() => setIsAddAdminOpen(false)}
          projects={allProjects}
          onSuccess={loadData}
        />

        <EditAdminModal 
          open={!!userToEdit}
          user={userToEdit}
          onClose={() => setUserToEdit(null)}
          onSuccess={loadData}
        />

        <UserProjectTable
          assignments={assignments}
          onRemove={handleRemoveAssignment}
        />

        <UserSiteTable
          assignments={siteAssignments}
          onRemove={handleRemoveSiteAssignment}
        />
      </div>

      {selectedUserForProject && (
        <AssignProjectModal
          user={selectedUserForProject}
          onClose={() => setSelectedUserForProject(null)}
          onAssign={handleAssignProject}
        />
      )}

      {selectedUserForSite && (
        <AssignSiteModal
          user={selectedUserForSite}
          onClose={() => setSelectedUserForSite(null)}
          onAssign={handleAssignSite}
        />
      )}
    </div>
  );
}