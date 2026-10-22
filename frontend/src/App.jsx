// src/App.jsx
import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./components/RouteProtection/ProtectedRoute";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import AdminManagementPage from "./pages/AdminManagementPage";
import ProjectManagementPage from "./pages/ProjectManagementPage";
import SiteManagementPage from "./pages/SiteManagementPage";
import ProjectDashboardPage from "./pages/ProjectDashboardPage";
import SiteDashboardPage from "./pages/SiteDashboardPage";
import ProtocolDashboardPage from "./pages/ProtocolDashboardPage";
import ProtocolEditorPage from "./pages/ProtocolEditorPage";
import ParticipantInterfacePage from "./pages/ParticipantInterfacePage";
import ResetPasswordModal from "./components/AuthForm/ResetPasswordModal";
import AdminLoginPage from "./pages/AdminLoginPage";
import OnboardingPage from "./pages/OnboardingPage";
import NotFoundPage from "./pages/NotFoundPage";
import UploadsPage from "./pages/UploadsPage";
import SessionDetailPage from "./pages/SessionDetailPage";
import DevicesPage from "./pages/DevicesPage";
import DownloadsPage from "./pages/DownloadsPage";

export default function App() {
  return (
    <Routes>
      {/* Default Route*/}
      <Route path="/" element={<Navigate to="/login" replace />} />

      <Route path="/admin/reset-password/:token" element={<ResetPasswordModal />} />

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
        <ProtectedRoute requireMaster><AdminManagementPage /></ProtectedRoute>
      } />

      <Route path="/admin/project-management" element={
        <ProtectedRoute requireMaster><ProjectManagementPage /></ProtectedRoute>
      } />

      <Route path="/admin/site-management" element={
        <ProtectedRoute requireMaster><SiteManagementPage /></ProtectedRoute>
      } />

      <Route path="/admin/sites/:siteId" element={
        <ProtectedRoute><SiteDashboardPage /></ProtectedRoute>
      } />

      <Route path="/admin/projects/:projectId" element={
        <ProtectedRoute><ProjectDashboardPage /></ProtectedRoute>
      } />

      <Route path="/admin/projects/:projectId/protocols" element={
        <ProtectedRoute><ProtocolDashboardPage /></ProtectedRoute>
      } />

      <Route path="/admin/projects/:projectId/protocols/:protocolId" element={
        <ProtectedRoute><ProtocolEditorPage /></ProtectedRoute>
      } />

      {/* Phase B upload management. Literal paths before :sessionId. */}
      <Route path="/admin/uploads" element={
        <ProtectedRoute><UploadsPage /></ProtectedRoute>
      } />

      <Route path="/admin/uploads/devices" element={
        <ProtectedRoute><DevicesPage /></ProtectedRoute>
      } />

      <Route path="/admin/uploads/downloads" element={
        <ProtectedRoute><DownloadsPage /></ProtectedRoute>
      } />

      <Route path="/admin/uploads/:sessionId" element={
        <ProtectedRoute><SessionDetailPage /></ProtectedRoute>
      } />

      {/* Protocol preview for admins (in-memory protocol, no persistence) */}
      <Route path="/participant/test" element={
        <ProtectedRoute><ParticipantInterfacePage /></ProtectedRoute>
      } />

      {/* Fallback */}
      <Route path="*" element={<NotFoundPage/>} />
    </Routes>
  );
}