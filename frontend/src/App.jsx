// src/App.jsx
import { Routes, Route, Navigate, useLocation, useOutletContext, useParams, generatePath } from "react-router-dom";
import ProtectedRoute from "./components/RouteProtection/ProtectedRoute";
import AppShell from "./components/ui/AppShell";
import { useUser } from "./context/UserContext";
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
import NotAvailablePage from "./pages/NotAvailablePage";
import PlaceholderPage from "./pages/PlaceholderPage";
import UploadsPage from "./pages/UploadsPage";
import SessionDetailPage from "./pages/SessionDetailPage";
import DevicesPage from "./pages/DevicesPage";
import DownloadsPage from "./pages/DownloadsPage";

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

// Clinics list. A non-master with exactly one clinic goes straight to it.
function ClinicsIndex() {
  const { user } = useUser();
  const { clinicsLoaded, singleClinic } = useOutletContext();
  if (user.role_id !== 1) {
    if (!clinicsLoaded) return null;
    if (singleClinic) return <Navigate to={`/clinics/${singleClinic.id}`} replace />;
    return <AdminDashboardPage />;
  }
  return <SiteManagementPage />;
}

function StudiesIndex() {
  const { user } = useUser();
  return user.role_id === 1 ? <ProjectManagementPage /> : <AdminDashboardPage />;
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
        <ProtectedRoute><ParticipantInterfacePage /></ProtectedRoute>
      } />

      {/* Everything else lives inside the shell */}
      <Route element={<ShellRoute />}>
        <Route path="/recordings" element={<UploadsPage />} />
        {/* Temporary home of the old Downloads page until the bulk download lands. Literal before :sessionId. */}
        <Route path="/recordings/downloads" element={<DownloadsPage />} />
        <Route path="/recordings/:sessionId" element={<SessionDetailPage />} />

        <Route path="/studies" element={<StudiesIndex />} />
        <Route path="/studies/:projectId" element={<ProjectDashboardPage />} />
        <Route path="/studies/:projectId/protocols" element={<ProtocolDashboardPage />} />
        <Route path="/studies/:projectId/protocols/:protocolId" element={<ProtocolEditorPage />} />
        <Route path="/studies/:projectId/:tab" element={<ProjectDashboardPage />} />

        <Route path="/clinics" element={<ClinicsIndex />} />
        {/* Temporary home of the old Devices page until clinic Computers lands. Literal before :siteId. */}
        <Route path="/clinics/devices" element={<DevicesPage />} />
        <Route path="/clinics/:siteId" element={<SiteDashboardPage />} />
        <Route path="/clinics/:siteId/:tab" element={<SiteDashboardPage />} />

        <Route path="/library" element={<PlaceholderPage titleKey="library" messageKey="placeholder.library" testId="library-placeholder" />} />
        <Route path="/library/:protocolId" element={<PlaceholderPage titleKey="library" messageKey="placeholder.library" testId="library-placeholder" />} />
        <Route path="/library/:protocolId/edit" element={<PlaceholderPage titleKey="library" messageKey="placeholder.library" testId="library-placeholder" />} />

        <Route path="/users" element={<MasterOnly><AdminManagementPage /></MasterOnly>} />
        <Route path="/users/:id" element={<MasterOnly><AdminManagementPage /></MasterOnly>} />

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
