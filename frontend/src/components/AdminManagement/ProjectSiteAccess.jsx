// frontend/src/components/AdminManagement/ProjectSiteAccess.jsx
// The expandable clinic list on a project assignment: which of the project's
// clinics this user sees *through this project*.
//
// "All clinics" is not the same as ticking every box. All = no whitelist, so a
// clinic added to the project later shows up on its own; ticking every box
// stores a whitelist that will not grow.
import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchProjectSiteAccess, setProjectSiteAccess } from "../../api/userProjects";
import "./AdminManagement.css";

export default function ProjectSiteAccess({ userId, projectId, onSaved }) {
  const { t } = useTranslation(["admin", "common"]);
  const [data, setData] = useState(null);
  const [restricted, setRestricted] = useState(false);
  const [selected, setSelected] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetchProjectSiteAccess(userId, projectId);
      setData(res);
      setRestricted(res.restricted);
      setSelected(res.sites.filter(s => s.selected).map(s => s.id));
    } catch (err) {
      setError(err.message);
    }
  }, [userId, projectId]);

  useEffect(() => { load(); }, [load]);

  const toggle = (id) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleSave = async () => {
    setError("");
    setSaving(true);
    try {
      await setProjectSiteAccess(userId, projectId, restricted ? selected : null);
      await load();
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (error && !data) return <p className="validation-error-msg">{error}</p>;
  if (!data) return <p className="text-muted small">{t("loading", { ns: "common" })}...</p>;

  if (data.sites.length === 0) {
    return <p className="text-muted small">{t("management.projectAssignments.noClinics")}</p>;
  }

  return (
    <div className="project-site-access">
      <label className="checkbox-label" style={{ display: "block", marginBottom: "8px" }}>
        <input
          type="checkbox"
          className="checkbox-input"
          checked={!restricted}
          onChange={() => setRestricted(r => !r)}
        />
        <span>{t("management.projectAssignments.allClinics")}</span>
      </label>

      {restricted && (
        <div className="project-selection-grid" style={{ marginBottom: "8px" }}>
          {data.sites.map(s => (
            <div key={s.id} className="project-selection-checkbox">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  className="checkbox-input"
                  checked={selected.includes(s.id)}
                  onChange={() => toggle(s.id)}
                />
                <span>{s.name}</span>
              </label>
              {/* A directly assigned clinic stays visible whatever is ticked
                  here — this list only governs what the project hands over. */}
              {s.granted_directly && !selected.includes(s.id) && (
                <span className="text-muted small" style={{ display: "block", marginLeft: "24px" }}>
                  {t("management.projectAssignments.grantedDirectly")}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {error && <p className="validation-error-msg">{error}</p>}

      <button className="btn-primary btn-sm" onClick={handleSave} disabled={saving}>
        {saving ? t("saving", { ns: "common" }) : t("save", { ns: "common" })}
      </button>
    </div>
  );
}
