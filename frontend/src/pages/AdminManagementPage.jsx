// frontend/src/pages/AdminManagementPage.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useConfirm } from "../components/ConfirmDialog/ConfirmDialogContext";
import DashboardTopBar from "../components/DashboardTopBar/DashboardTopBar";
import UserTable from "../components/AdminManagement/UserTable";
import UserSiteTable from "../components/AdminManagement/UserSiteTable";
import AssignSiteModal from "../components/AdminManagement/AssignSiteModal";
import AddAdminModal from "../components/AdminManagement/AddAdminModal";
import EditAdminModal from "../components/AdminManagement/EditAdminModal";
import { fetchSites } from "../api/sites";
import { fetchAllAdmins, toggleAdminActive, updateUser, setUserSites } from "../api/users";
import { apiErrorMessage } from "../utils/apiError";
import "./Pages.css";

export default function AdminManagementPage() {
  const { t } = useTranslation(["admin", "common"]);
  const navigate = useNavigate();
  const confirm = useConfirm();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserForSite, setSelectedUserForSite] = useState(null);
  const [allSites, setAllSites] = useState([]);
  const [isAddAdminOpen, setIsAddAdminOpen] = useState(false);
  const [userToEdit, setUserToEdit] = useState(null);

  const loadData = async () => {
    try {
      const [uData, siteData] = await Promise.all([
        fetchAllAdmins(),
        fetchSites()
      ]);
      setUsers(uData);
      setAllSites(siteData);
    } catch (err) {
      console.error("Management data error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  // GET /users carries each user's clinics, so the clinic assignments table is
  // derived from it. A row is one (user, clinic) pair.
  const siteAssignments = users.flatMap((u) =>
    (u.sites || []).map((s) => ({
      assignment_id: `${u.id}:${s.id}`,
      user_id: u.id,
      user_name: u.name,
      user_email: u.email,
      site_id: s.id,
      site_name: s.name,
    }))
  );

  const handleToggleStatus = async (user_id, current_status) => {
    try {
      await toggleAdminActive(user_id, !current_status);
      await loadData(); 
    } catch (err) {
      alert(apiErrorMessage(err, t) || t("management.alerts.statusError"));
    }
  };

  const handleToggleRight = async (user_id, right, value) => {
    try {
      // PATCH is partial, so sending one field leaves the rest alone.
      await updateUser(user_id, { [right]: value });
      await loadData();
    } catch (err) {
      alert(apiErrorMessage(err, t));
    }
  };

  // PUT /users/:id/sites replaces the user's clinic set, so both assigning and
  // removing send the new full list.
  const handleRemoveSiteAssignment = async (assignment) => {
    const isConfirmed = await confirm({
      title: t("management.confirm.deleteTitle"),
      message: t("management.confirm.removeSiteAssignment"),
      confirmText: t("management.confirm.confirm"),
      cancelText: t("management.confirm.cancel"),
    });

    if (isConfirmed) {
      try {
        const owner = users.find((u) => u.id === assignment.user_id);
        const remaining = (owner?.sites || []).map((x) => x.id).filter((id) => id !== assignment.site_id);
        await setUserSites(assignment.user_id, remaining);
        await loadData();
      } catch (err) {
        alert(apiErrorMessage(err, t));
      }
    }
  };

  const handleAssignSite = async (user_id, site_id) => {
    try {
      const owner = users.find((u) => u.id === user_id);
      const current = (owner?.sites || []).map((x) => x.id);
      if (!current.includes(site_id)) await setUserSites(user_id, [...current, site_id]);
      setSelectedUserForSite(null);
      await loadData();
    } catch (err) {
      alert(apiErrorMessage(err, t));
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
          onAssignSite={(u) => setSelectedUserForSite(u)}
          onToggleRight={handleToggleRight}
          onAddClick={() => setIsAddAdminOpen(true)}
        />

        <AddAdminModal 
          open={isAddAdminOpen}
          onClose={() => setIsAddAdminOpen(false)}
          sites={allSites}
          onSuccess={loadData}
        />

        <EditAdminModal 
          open={!!userToEdit}
          user={userToEdit}
          onClose={() => setUserToEdit(null)}
          onSuccess={loadData}
        />

        <UserSiteTable
          assignments={siteAssignments}
          onRemove={handleRemoveSiteAssignment}
        />
      </div>

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