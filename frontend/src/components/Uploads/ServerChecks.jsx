import React from "react";
import { useTranslation } from "react-i18next";
import { StatusDot } from "../ui";
import "../Recording/Recording.css";

const TONE = { ok: "ok", bad: "bad", warn: "warn", skip: "idle" };

/** The server checks (zip checksum, manifest, ids, ...) with the server's detail text where a check did not pass. */
export default function ServerChecks({ checks = [] }) {
  const { t } = useTranslation("recording");
  return (
    <section className="recd-card" aria-label={t("checks.title")}>
      <div className="recd-card-head"><h2>{t("checks.title")}</h2></div>
      <ul className="recd-checks">
        {checks.map((c) => {
          const why = c.detail || t(`checks.desc.${c.key}`, { defaultValue: "" });
          return (
            <li key={c.key}>
              <StatusDot tone={TONE[c.result] || "idle"} title={why || undefined}>
                {t(`checks.keys.${c.key}`, { defaultValue: c.key })}
              </StatusDot>
              {c.result !== "ok" && c.detail && <span className="why">{c.detail}</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
