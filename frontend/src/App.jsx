// src/App.jsx
import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./components/RouteProtection/ProtectedRoute";
import { ROLES } from "./constants/roles";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import AdminManagementPage from "./pages/AdminManagementPage";
import ProjectManagementPage from "./pages/ProjectManagementPage";
import ProjectDashboardPage from "./pages/ProjectDashboardPage";
import ProtocolDashboardPage from "./pages/ProtocolDashboardPage";
import ProtocolEditorPage from "./pages/ProtocolEditorPage";
import ProjectFieldworkPage from "./pages/ProjectFieldworkPage";
import ParticipantInterfacePage from "./pages/ParticipantInterfacePage";
import ParticipantInterfaceLoader from "./pages/ParticipantInterfaceLoader";
import ParticipantDashboardPage from "./pages/ParticipantDashboardPage";
import ParticipantAuthPage from "./pages/ParticipantAuthPage"; 
import ResetPasswordModal from "./components/AuthForm/ResetPasswordModal";
import AdminLoginPage from "./pages/AdminLoginPage";
import OnboardingPage from "./pages/OnboardingPage";
import SystemLogsPage from "./pages/SystemLogsPage";
import SessionDataPage from "./pages/SessionDataPage";
import BookingSlotsPage from "./pages/BookingSlotsPage";
import NotFoundPage from "./pages/NotFoundPage";

// survey_agency is restricted to /admin (redirects to their one project's
// fieldwork page -- see AdminDashboardPage.jsx) and the fieldwork page
// itself; every other /admin/* route is project-management or
// account-management and stays master/admin only.
const STAFF_ROLES = [ROLES.MASTER, ROLES.ADMIN];

export default function App() {
  return (
    <Routes>
      {/* Default Route*/}
      <Route path="/" element={<Navigate to="/login" replace />} />

      {/* Public Protocol Link for participants */}
      <Route path="/protocol/:token" element={<ParticipantAuthPage />} />
      <Route path="/reset-password/:token" element={<ResetPasswordModal />} />
      <Route path="/participant/:token" element={<ParticipantInterfaceLoader />} />
      <Route path="/participant/interface" element={<ParticipantInterfacePage />} />
      <Route path="/admin/reset-password/:token" element={<ResetPasswordModal isAdmin={true} />} />

      {/* Public Admin login */}
      <Route path="/login" element={<AdminLoginPage />} />

      {/* Admin routes - require login */} 
      <Route path="/setup-account" element={
        <ProtectedRoute><OnboardingPage /></ProtectedRoute>
      } />
      
      <Route path="/admin" element={
        <ProtectedRoute><AdminDashboardPage /></ProtectedRoute>
      } />
      
      <Route path="/admin/admin-management" element={
        <ProtectedRoute allowedRoles={STAFF_ROLES}><AdminManagementPage /></ProtectedRoute>
      } />

      <Route path="/admin/project-management" element={
        <ProtectedRoute allowedRoles={STAFF_ROLES}><ProjectManagementPage /></ProtectedRoute>
      } />

      <Route path="/admin/system-logs" element={
        <ProtectedRoute allowedRoles={STAFF_ROLES}><SystemLogsPage /></ProtectedRoute>
      } />

      <Route path="/admin/session-data" element={
        <ProtectedRoute allowedRoles={STAFF_ROLES}><SessionDataPage /></ProtectedRoute>
      } />

      <Route path="/admin/booking-slots" element={
        <ProtectedRoute allowedRoles={STAFF_ROLES}><BookingSlotsPage /></ProtectedRoute>
      } />

      <Route path="/admin/projects/:projectId" element={
        <ProtectedRoute allowedRoles={STAFF_ROLES}><ProjectDashboardPage /></ProtectedRoute>
      } />

      <Route path="/admin/projects/:projectId/fieldwork" element={
        <ProtectedRoute><ProjectFieldworkPage /></ProtectedRoute>
      } />

      <Route path="/admin/projects/:projectId/participants" element={
        <ProtectedRoute allowedRoles={STAFF_ROLES}><ParticipantDashboardPage /></ProtectedRoute>
      } />

      <Route path="/admin/projects/:projectId/protocols" element={
        <ProtectedRoute allowedRoles={STAFF_ROLES}><ProtocolDashboardPage /></ProtectedRoute>
      } />

      <Route path="/admin/projects/:projectId/protocols/:protocolId" element={
        <ProtectedRoute allowedRoles={STAFF_ROLES}><ProtocolEditorPage /></ProtectedRoute>
      } />

      {/* Interface routes (for testing, so we protect them) */}
      <Route path="/participant/test" element={
        <ProtectedRoute><ParticipantInterfacePage /></ProtectedRoute>
      } />

      {/* Fallback */}
      <Route path="*" element={<NotFoundPage/>} />
    </Routes>
  );
}
