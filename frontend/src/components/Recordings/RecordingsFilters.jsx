import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button.jsx";
import { Icon } from "../ui/icons.jsx";
import useUploadLabels from "../Uploads/useUploadLabels";
import { ISSUE_KEYS, QC_KEYS } from "../Uploads/format";
import { STATUSES, datePreset, datePresetPatch } from "./recordingsQuery";
import "./recordings.css";

const toggle = (list, v) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

function Field({ label, children }) {
  return (
    <label className="rec-field">
      <span className="ui-sr-only">{label}</span>
      {children}
    </label>
  );
}

/** One filter row (search, Clinic, Study, Protocol, Review, Server check, Date) and the flag chips under "More filters". */
export default function RecordingsFilters({ list }) {
  const { t } = useTranslation("uploads");
  const L = useUploadLabels();
  const { f, update, fixed } = list;

  // Search box: debounce into the URL without piling up history entries.
  const [qText, setQText] = useState(f.q);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return undefined; }
    const id = setTimeout(() => { if (qText.trim() !== f.q) update({ q: qText.trim() }, { replace: true }); }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qText]);
  useEffect(() => setQText(f.q), [f.q]);

  const preset = datePreset(f);
  const [customOpen, setCustomOpen] = useState(false);
  const showCustom = customOpen || preset === "custom";
  const [moreOpen, setMoreOpen] = useState(false);
  const showMore = moreOpen || f.flag.length > 0 || f.hasVideo;

  const clinicValue = f.site[0] ?? "";
  const studyKnown = !f.project || list.studies.some((s) => s.id === f.project);
  const protocolOptions = [...new Set([...list.protocols, f.protocol].filter(Boolean))];
  const facetCount = (k) => list.data?.facets.flags.find((x) => x.key === k)?.count ?? 0;

  return (
    <div className="rec-root" data-testid="recordings-filters">
      <div className="rec-filters">
        <div className="rec-search">
          <Icon name="search" />
          <input
            type="search"
            aria-label={t("recordings.filters.search")}
            placeholder={t("recordings.filters.searchPlaceholder")}
            value={qText}
            onChange={(e) => setQText(e.target.value)}
            data-testid="recordings-search"
          />
        </div>

        {list.clinicVisible && (
          <Field label={t("recordings.filters.clinic")}>
            <select value={clinicValue} onChange={(e) => update({ site: e.target.value })} data-testid="recordings-filter-clinic">
              <option value="">{t("recordings.filters.allClinics")}</option>
              {list.clinics.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
              {clinicValue && !list.clinics.some((c) => String(c.id) === clinicValue) && <option value={clinicValue}>{clinicValue}</option>}
            </select>
          </Field>
        )}

        {fixed.study == null && (
          <Field label={t("recordings.filters.study")}>
            <select value={f.project} onChange={(e) => update({ project: e.target.value })} data-testid="recordings-filter-study">
              <option value="">{t("recordings.filters.allStudies")}</option>
              {list.studies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              {!studyKnown && <option value={f.project}>{f.project}</option>}
            </select>
          </Field>
        )}

        <Field label={t("recordings.filters.protocol")}>
          <select value={f.protocol} onChange={(e) => update({ protocol: e.target.value })} data-testid="recordings-filter-protocol">
            <option value="">{t("recordings.filters.allProtocols")}</option>
            {protocolOptions.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>

        <Field label={t("recordings.filters.review")}>
          <select value={f.qc} onChange={(e) => update({ qc: e.target.value })} data-testid="recordings-filter-review">
            <option value="">{t("recordings.filters.anyReview")}</option>
            {QC_KEYS.map((k) => <option key={k} value={k}>{L.qc(k)}</option>)}
          </select>
        </Field>

        <Field label={t("recordings.filters.serverCheck")}>
          <select value={f.status} onChange={(e) => update({ status: e.target.value })} data-testid="recordings-filter-check">
            <option value="">{t("recordings.filters.anyCheck")}</option>
            {STATUSES.map((s) => <option key={s} value={s}>{L.status(s)}</option>)}
          </select>
        </Field>

        <Field label={t("recordings.filters.date")}>
          <select
            value={showCustom ? "custom" : preset}
            onChange={(e) => {
              const v = e.target.value;
              setCustomOpen(v === "custom");
              update(datePresetPatch(v));
            }}
            data-testid="recordings-filter-date"
          >
            <option value="any">{t("recordings.filters.anyDate")}</option>
            <option value="today">{t("recordings.filters.today")}</option>
            <option value="week">{t("recordings.filters.last7")}</option>
            <option value="month">{t("recordings.filters.last30")}</option>
            <option value="custom">{t("recordings.filters.custom")}</option>
          </select>
        </Field>

        {showCustom && (
          <span className="rec-dates">
            <Field label={t("recordings.filters.from")}>
              <input type="date" value={f.from} onChange={(e) => update({ from: e.target.value })} />
            </Field>
            <Field label={t("recordings.filters.to")}>
              <input type="date" value={f.to} onChange={(e) => update({ to: e.target.value })} />
            </Field>
          </span>
        )}

        <Button variant="quiet" size="sm" aria-expanded={showMore} onClick={() => setMoreOpen(!showMore)} data-testid="recordings-more-filters">
          {t("recordings.filters.more")}
        </Button>
      </div>

      {showMore && (
        <div className="rec-more">
          <span className="rec-more-label">{t("recordings.filters.flags")}</span>
          {ISSUE_KEYS.map((k) => (
            <button key={k} type="button" className="rec-chip" title={L.issueHint(k)} aria-pressed={f.flag.includes(k)} onClick={() => update({ flag: toggle(f.flag, k) })}>
              {L.issue(k)}<span className="rec-chip-count">{facetCount(k)}</span>
            </button>
          ))}
          <button type="button" className="rec-chip" aria-pressed={f.hasVideo} onClick={() => update({ hasVideo: !f.hasVideo })}>
            {t("recordings.filters.hasVideo")}<span className="rec-chip-count">{list.data?.facets.video ?? 0}</span>
          </button>
        </div>
      )}
    </div>
  );
}
