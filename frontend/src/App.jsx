// src/App.jsx
import { Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./components/RouteProtection/ProtectedRoute";
import { ROLES } from "./constants/roles";

// Route-level code splitting: each page below becomes its own chunk, fetched
// only when its route is actually visited. Without this, every admin-only
// page (project/protocol management, the rich-text ProtocolEditor pulling in
// react-quill-new, system logs, etc.) was bundled together with the
// participant-facing recording flow into a single ~3.2MB JS file that EVERY
// participant had to download/parse/compile before the app was interactive
// -- including on the low-end Android devices where that's most costly.
const AdminDashboardPage = lazy(() => import("./pages/AdminDashboardPage"));
const AdminManagementPage = lazy(() => import("./pages/AdminManagementPage"));
const ProjectManagementPage = lazy(() => import("./pages/ProjectManagementPage"));
const ProjectDashboardPage = lazy(() => import("./pages/ProjectDashboardPage"));
const ProtocolDashboardPage = lazy(() => import("./pages/ProtocolDashboardPage"));
const ProtocolEditorPage = lazy(() => import("./pages/ProtocolEditorPage"));
const ProjectFieldworkPage = lazy(() => import("./pages/ProjectFieldworkPage"));
const ParticipantInterfacePage = lazy(() => import("./pages/ParticipantInterfacePage"));
const ParticipantInterfaceLoader = lazy(() => import("./pages/ParticipantInterfaceLoader"));
const ParticipantDashboardPage = lazy(() => import("./pages/ParticipantDashboardPage"));
const ParticipantAuthPage = lazy(() => import("./pages/ParticipantAuthPage"));
const ResetPasswordModal = lazy(() => import("./components/AuthForm/ResetPasswordModal"));
const AdminLoginPage = lazy(() => import("./pages/AdminLoginPage"));
const OnboardingPage = lazy(() => import("./pages/OnboardingPage"));
const SystemLogsPage = lazy(() => import("./pages/SystemLogsPage"));
const SessionDataPage = lazy(() => import("./pages/SessionDataPage"));
const BookingSlotsPage = lazy(() => import("./pages/BookingSlotsPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));

// Minimal, dependency-free fallback -- only ever visible briefly on a route's
// first visit (subsequent navigations hit the cached chunk instantly).
const RouteLoadingFallback = () => (
  <div style={{ padding: "2rem", textAlign: "center" }}>Loading…</div>
);

// survey_agency is restricted to /admin (redirects to their one project's
// fieldwork page -- see AdminDashboardPage.jsx) and the fieldwork page
// itself; every other /admin/* route is project-management or
// account-management and stays master/admin only.
const STAFF_ROLES = [ROLES.MASTER, ROLES.ADMIN];

export default function App() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
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
    </Suspense>
  );
}
