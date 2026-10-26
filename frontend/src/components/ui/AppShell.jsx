// src/components/ui/AppShell.jsx
// The one app chrome: sidebar (nav, user menu) plus a content area. It is a
// layout route, so it stays mounted while the page inside it changes.
import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, matchPath } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useUser } from "../../context/UserContext";
import { LANGUAGES } from "../../i18n/index";
import { fetchUploadSummary } from "../../api/uploads";
import { fetchSites } from "../../api/sites";
import { fetchProjectsList } from "../../api/projects";
import { Icon } from "./icons.jsx";
import { IconButton } from "./Button.jsx";
import "./AppShell.css";

// Routes that run with the narrow, icon-only sidebar.
const COLLAPSED_PATTERNS = [
  "/studies/:projectId/protocols/:protocolId",
  "/library/:protocolId/edit",
];

const isCollapsedPath = (pathname) =>
  COLLAPSED_PATTERNS.some((pattern) => matchPath({ path: pattern, end: true }, pathname));

const initialsOf = (name) =>
  (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("") || "?";

/**
 * What the sidebar needs to know about the signed-in user:
 *  - clinics: the clinics in scope (the server scopes GET /sites by user), so
 *    a non-master with exactly one clinic gets "My clinic" and a direct link;
 *  - canWriteProtocols: master, can_create_projects, or editor of at least one
 *    study (a project row with can_edit) decides whether Library shows;
 *  - unreviewed: the badge count on Recordings (GET /uploads/summary).
 */
function useShellData(user, pathname) {
  const userId = user?.id;
  const isMaster = user?.role_id === 1;
  const [clinics, setClinics] = useState(null);
  const [editsAStudy, setEditsAStudy] = useState(false);
  const [unreviewed, setUnreviewed] = useState(0);

  useEffect(() => {
    // A master sees every clinic and may write protocols: nothing to look up.
    if (!userId || isMaster) return undefined;
    let cancelled = false;
    fetchSites()
      .then((rows) => { if (!cancelled) setClinics(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (!cancelled) setClinics([]); });
    fetchProjectsList()
      .then((rows) => { if (!cancelled) setEditsAStudy((rows || []).some((p) => p.can_edit)); })
      .catch(() => { if (!cancelled) setEditsAStudy(false); });
    return () => { cancelled = true; };
  }, [userId, isMaster]);

  // Refreshed on navigation so the badge follows reviews done on other pages.
  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    fetchUploadSummary()
      .then((s) => { if (!cancelled) setUnreviewed(Number(s?.unreviewed) || 0); })
      .catch(() => { if (!cancelled) setUnreviewed(0); });
    return () => { cancelled = true; };
  }, [userId, pathname]);

  return {
    clinics: clinics || [],
    clinicsLoaded: clinics !== null,
    // A clinic creator keeps the list, where "New clinic" lives.
    singleClinic: !isMaster && !user?.can_create_sites && clinics?.length === 1 ? clinics[0] : null,
    canWriteProtocols: isMaster || !!user?.can_create_projects || editsAStudy,
    unreviewed,
  };
}

function NavItem({ to, icon, label, testId, count }) {
  const { t } = useTranslation("nav");
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `shell-nav-link${isActive ? " is-active" : ""}`}
      data-testid={testId}
      title={label}
    >
      <Icon name={icon} />
      <span className="shell-nav-label">{label}</span>
      {count > 0 && (
        <span className="shell-nav-count" title={t("unreviewed", { count })}>{count}</span>
      )}
    </NavLink>
  );
}

function Sidebar({ data }) {
  const { t, i18n } = useTranslation("nav");
  const { user, logout } = useUser();
  const isMaster = user?.role_id === 1;

  const changeLanguage = (event) => {
    const lang = event.target.value;
    i18n.changeLanguage(lang);
    try { localStorage.setItem("appLanguage", lang); } catch { /* storage may be blocked */ }
  };

  let roleLine;
  if (isMaster) roleLine = t("roleMaster");
  else if (data.singleClinic) roleLine = data.singleClinic.name;
  else if (data.clinics.length > 1) roleLine = t("clinicsCount", { count: data.clinics.length });
  else roleLine = t("roleUser");

  return (
    <aside className="shell-sidebar" data-testid="app-sidebar">
      <div className="shell-brand">
        <span className="shell-brand-mark"><Icon name="wave" /></span>
        <span className="shell-brand-name">{t("brand")}</span>
      </div>

      <nav className="shell-nav" aria-label={t("main")}>
        <NavItem to="/recordings" icon="inbox" testId="nav-recordings" label={t("recordings")} count={data.unreviewed} />
        <NavItem to="/studies" icon="study" testId="nav-studies" label={t("studies")} />
        {data.singleClinic ? (
          <NavItem to={`/clinics/${data.singleClinic.id}`} icon="clinic" testId="nav-clinics" label={t("myClinic")} />
        ) : (
          <NavItem to="/clinics" icon="clinic" testId="nav-clinics" label={t("clinics")} />
        )}
        {data.canWriteProtocols && (
          <NavItem to="/library" icon="library" testId="nav-library" label={t("library")} />
        )}
        {isMaster && (
          <>
            <div className="shell-nav-sep" role="separator" />
            <div className="shell-nav-heading">{t("admin")}</div>
            <NavItem to="/users" icon="users" testId="nav-users" label={t("users")} />
          </>
        )}
      </nav>

      <div className="shell-user" data-testid="user-menu">
        <div className="shell-user-row">
          <span className="shell-avatar" aria-hidden="true">{initialsOf(user?.full_name)}</span>
          <div className="shell-user-text">
            <div className="shell-user-name" data-testid="user-name">{user?.full_name}</div>
            <div className="shell-user-role" data-testid="user-role">{roleLine}</div>
          </div>
        </div>
        <div className="shell-user-actions">
          <select
            className="shell-lang"
            value={i18n.resolvedLanguage || i18n.language}
            onChange={changeLanguage}
            aria-label={t("language")}
            data-testid="shell-language"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>{lang.label}</option>
            ))}
          </select>
          <IconButton icon="logout" label={t("logout")} onClick={logout} data-testid="shell-logout" />
        </div>
      </div>
    </aside>
  );
}

export default function AppShell() {
  const { user } = useUser();
  const { pathname } = useLocation();
  const { i18n } = useTranslation();
  const collapsed = isCollapsedPath(pathname);
  const data = useShellData(user, pathname);

  // Restore the saved language (the old top bar did this on every page).
  useEffect(() => {
    try {
      const saved = localStorage.getItem("appLanguage");
      if (saved && saved !== i18n.language) i18n.changeLanguage(saved);
    } catch { /* storage may be blocked */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`shell${collapsed ? " is-collapsed" : ""}`} data-testid="app-shell" data-collapsed={collapsed ? "true" : "false"}>
      <Sidebar data={data} />
      <main className="shell-main">
        <div className={`shell-content${collapsed ? " is-wide" : ""}`}>
          <Outlet context={data} />
        </div>
      </main>
    </div>
  );
}
