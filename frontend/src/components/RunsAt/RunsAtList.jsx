// src/components/RunsAt/RunsAtList.jsx
// A list of "Runs here" switches, shared by the study (clinics) and clinic (studies) tabs.
// No data fetching: callers pass rows and perform setRunsAt / removeRunsAt in onToggle.
import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Switch, useToast } from "../ui";
import { useTranslation } from "react-i18next";
import { apiErrorMessage } from "../../utils/apiError";
import "./RunsAt.css";

/**
 * @param {{key:string|number,title:string,subtitle?:string,on:boolean,disabled?:boolean,disabledReason?:string,href?:string}[]} rows
 * @param {(row, nextOn:boolean) => Promise} onToggle  busy state is shown while it runs; errors become a toast
 */
export function RunsAtList({ rows = [], onToggle, emptyText, testId = "runs-at-list" }) {
  const toast = useToast();
  const { t } = useTranslation();
  const [busy, setBusy] = useState(() => new Set());

  const toggle = async (row, next) => {
    setBusy((s) => new Set(s).add(row.key));
    try {
      await onToggle?.(row, next);
    } catch (err) {
      toast.error(apiErrorMessage(err, t));
    } finally {
      setBusy((s) => {
        const n = new Set(s);
        n.delete(row.key);
        return n;
      });
    }
  };

  if (!rows.length) {
    return emptyText ? <p className="runs-at-empty" data-testid={`${testId}-empty`}>{emptyText}</p> : null;
  }

  return (
    <ul className="runs-at-list" data-testid={testId}>
      {rows.map((row) => {
        const isBusy = busy.has(row.key);
        return (
          <li
            key={row.key}
            className="runs-at-row"
            data-testid={`${testId}-row-${row.key}`}
            aria-busy={isBusy || undefined}
          >
            <Switch
              checked={row.on}
              label={row.title}
              hideLabel
              disabled={!!row.disabled || isBusy}
              onChange={(next) => toggle(row, next)}
              data-testid={`${testId}-switch-${row.key}`}
            />
            <div className="runs-at-text">
              {row.href ? <Link to={row.href} className="runs-at-title">{row.title}</Link> : <span className="runs-at-title">{row.title}</span>}
              {row.subtitle && <span className="runs-at-sub">{row.subtitle}</span>}
              {row.disabled && row.disabledReason && <span className="runs-at-reason">{row.disabledReason}</span>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
