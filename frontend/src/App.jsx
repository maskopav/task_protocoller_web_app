// src/App.jsx
import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./components/RouteProtection/ProtectedRoute";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import AdminManagementPage from "./pages/AdminManagementPage";
import ProjectManagementPage from "./pages/ProjectManagementPage";
import ProjectDashboardPage from "./pages/ProjectDashboardPage";
import ProtocolDashboardPage from "./pages/ProtocolDashboardPage";
import ProtocolEditorPage from "./pages/ProtocolEditorPage";
// import DataExplorerPage from "./pages/DataExplorerPage";
import ParticipantInterfacePage from "./pages/ParticipantInterfacePage";
import ParticipantInterfaceLoader from "./pages/ParticipantInterfaceLoader";
import ParticipantDashboardPage from "./pages/ParticipantDashboardPage";
import ParticipantAuthPage from "./pages/ParticipantAuthPage"; 
import ResetPasswordModal from "./components/AuthForm/ResetPasswordModal";
import AdminLoginPage from "./pages/AdminLoginPage";
import OnboardingPage from "./pages/OnboardingPage";
import NotFoundPage from "./pages/NotFoundPage";

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
        <ProtectedRoute><AdminManagementPage /></ProtectedRoute>
      } />

      <Route path="/admin/project-management" element={
        <ProtectedRoute><ProjectManagementPage /></ProtectedRoute>
      } />
      
      <Route path="/admin/projects/:projectId" element={
        <ProtectedRoute><ProjectDashboardPage /></ProtectedRoute>
      } />
      
      <Route path="/admin/projects/:projectId/participants" element={
        <ProtectedRoute><ParticipantDashboardPage /></ProtectedRoute>
      } />
      
      <Route path="/admin/projects/:projectId/protocols" element={
        <ProtectedRoute><ProtocolDashboardPage /></ProtectedRoute>
      } />
      
      <Route path="/admin/projects/:projectId/protocols/:protocolId" element={
        <ProtectedRoute><ProtocolEditorPage /></ProtectedRoute>
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
