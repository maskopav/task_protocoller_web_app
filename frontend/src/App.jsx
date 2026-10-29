// src/App.jsx
import { Routes, Route, Navigate, useLocation, useOutletContext, useParams, generatePath } from "react-router-dom";
import ProtectedRoute from "./components/RouteProtection/ProtectedRoute";
import AppShell from "./components/ui/AppShell";
import { useUser } from "./context/UserContext";
import UsersListPage from "./pages/users/UsersListPage";
import UserPage from "./pages/users/UserPage";
import ClinicsListPage from "./pages/clinics/ClinicsListPage";
import ClinicPage from "./pages/clinics/ClinicPage";
import LibraryPage from "./pages/library/LibraryPage";
import LibraryEntryPage from "./pages/library/LibraryEntryPage";
import LibraryEditorPage from "./pages/library/LibraryEditorPage";
import ProtocolEditorPage from "./pages/ProtocolEditorPage";
import StudiesPage from "./pages/studies/StudiesPage";
import StudyPage, { StudyIndexRedirect } from "./pages/studies/StudyPage";
import ParticipantInterfacePage from "./pages/ParticipantInterfacePage";
import ProtocolPreviewRoute from "./pages/ProtocolPreviewRoute";
import ResetPasswordModal from "./components/AuthForm/ResetPasswordModal";
import AdminLoginPage from "./pages/AdminLoginPage";
import OnboardingPage from "./pages/OnboardingPage";
import NotFoundPage from "./pages/NotFoundPage";
import NotAvailablePage from "./pages/NotAvailablePage";
import RecordingsPage from "./pages/RecordingsPage";
import RecordingPage from "./pages/RecordingPage";

// Old links keep working for one release: the target path may name the old
// route's params (":projectId"), and ?site= / ?project= become ?clinic= / ?study=.
const QUERY_RENAMES = { site: "clinic", project: "study" };

function mapLegacySearch(search) {
  const incoming = new URLSearchParams(search);
  const mapped = new URLSearchParams();
  for (const [key, value] of incoming) mapped.append(QUERY_RENAMES[key] || key, value);
  const s = mapped.toString();
  return s ? `?${s}` : "";
}

function LegacyRedirect({ to }) {
  const params = useParams();
  const { search } = useLocation();
  return <Navigate to={`${generatePath(to, params)}${mapLegacySearch(search)}`} replace />;
}

// Clinics list. A non-master with exactly one clinic goes straight to it,
// unless they may create clinics (singleClinic is then null, see AppShell).
function ClinicsIndex() {
  const { user } = useUser();
  const { clinicsLoaded, singleClinic } = useOutletContext();
  if (user.role_id !== 1) {
    if (!clinicsLoaded) return null;
    if (singleClinic) return <Navigate to={`/clinics/${singleClinic.id}`} replace />;
  }
  return <ClinicsListPage />;
}

function MasterOnly({ children }) {
  const { user } = useUser();
  return user.role_id === 1 ? children : <NotAvailablePage />;
}

function ShellRoute() {
  return (
    <ProtectedRoute>
      <AppShell />
    </ProtectedRoute>
  );
}

const legacy = (from, to) => <Route key={from} path={from} element={<LegacyRedirect to={to} />} />;

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/recordings" replace />} />

      {/* Auth: no shell */}
      <Route path="/login" element={<AdminLoginPage />} />
      <Route path="/reset-password/:token" element={<ResetPasswordModal />} />
      <Route path="/setup-account" element={
        <ProtectedRoute><OnboardingPage /></ProtectedRoute>
      } />

      {/* Participant preview of a protocol (in-memory, no persistence): no shell */}
      <Route path="/studies/:projectId/protocols/:protocolId/preview" element={
        <ProtectedRoute><ProtocolPreviewRoute /></ProtectedRoute>
      } />

      {/* Everything else lives inside the shell */}
      <Route element={<ShellRoute />}>
        <Route path="/recordings" element={<RecordingsPage />} />
        <Route path="/recordings/:sessionId" element={<RecordingPage />} />

        <Route path="/studies" element={<StudiesPage />} />
        <Route path="/studies/:projectId" element={<StudyIndexRedirect />} />
        <Route path="/studies/:projectId/protocols/:protocolId" element={<ProtocolEditorPage />} />
        <Route path="/studies/:projectId/:tab" element={<StudyPage />} />

        <Route path="/clinics" element={<ClinicsIndex />} />
        {/* The old Devices page now lives in the clinics list (unassigned) and each clinic's Computers tab. */}
        <Route path="/clinics/devices" element={<Navigate to="/clinics" replace />} />
        <Route path="/clinics/:siteId" element={<ClinicPage />} />
        <Route path="/clinics/:siteId/:tab" element={<ClinicPage />} />

        <Route path="/library" element={<LibraryPage />} />
        <Route path="/library/:protocolId" element={<LibraryEntryPage />} />
        <Route path="/library/:protocolId/edit" element={<LibraryEditorPage />} />

        <Route path="/users" element={<MasterOnly><UsersListPage /></MasterOnly>} />
        <Route path="/users/:id" element={<MasterOnly><UserPage /></MasterOnly>} />

        <Route path="*" element={<NotFoundPage />} />
      </Route>

      {/* Redirects from the old routes (kept for one release) */}
      {legacy("/admin", "/recordings")}
      {legacy("/admin/uploads", "/recordings")}
      {legacy("/admin/uploads/devices", "/clinics")}
      {legacy("/admin/uploads/downloads", "/recordings")}
      {legacy("/admin/uploads/:sessionId", "/recordings/:sessionId")}
      {legacy("/admin/projects/:projectId", "/studies/:projectId")}
      {legacy("/admin/projects/:projectId/protocols", "/studies/:projectId/protocols")}
      {legacy("/admin/projects/:projectId/protocols/:protocolId", "/studies/:projectId/protocols/:protocolId")}
      {legacy("/admin/sites/:siteId", "/clinics/:siteId")}
      {legacy("/admin/project-management", "/studies")}
      {legacy("/admin/site-management", "/clinics")}
      {legacy("/admin/admin-management", "/users")}
      {legacy("/participant/test", "/recordings")}
      {legacy("/admin/reset-password/:token", "/reset-password/:token")}
    </Routes>
  );
}
