// src/components/ProtocolEditor/TaskList.jsx — the task catalogue ("Tasks"): search, groups, one row per task to add.
import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { taskBaseConfig } from "../../config/tasksBase";
import { translateTaskName, translateTaskDescription, getAllParams, getDefaultParams } from "../../utils/translations";
import { Icon, IconButton } from "../ui";
import InfoTooltip from "../InfoToolTip/InfoToolTip";
import { defaultLabel } from "./paramText";

export default function TaskList({ onCreate }) {
  const { t } = useTranslation(["admin", "tasks", "common"]);
  const { t: ts } = useTranslation("studies");
  const [query, setQuery] = useState("");
  const yn = (k) => ts(`editor.${k}`);

  const tasksByType = useMemo(
    () => Object.entries(taskBaseConfig)
      // The generic manual questionnaire has its own button; predefined questionnaires stay in the pool.
      .filter(([category]) => category !== "questionnaire")
      .reduce((acc, [category, task]) => {
        const type = task.type || "other";
        if (!acc[type]) acc[type] = [];
        acc[type].push({ category, ...task });
        return acc;
      }, {}),
    [],
  );

  const [collapsed, setCollapsed] = useState({});
  const q = query.trim().toLowerCase();

  return (
    <div className="pe-catalogue" data-testid="task-catalogue">
      <h2 className="pe-side-label">{ts("editor.tasks")}</h2>
      <div className="pe-search">
        <Icon name="search" size={16} />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={ts("editor.searchTasks")}
          aria-label={ts("editor.searchTasks")}
          data-testid="task-search"
        />
      </div>

      <ul className="pe-groups">
        {Object.keys(tasksByType).map((type) => {
          const items = tasksByType[type].filter(({ category }) => !q || translateTaskName(category).toLowerCase().includes(q));
          if (items.length === 0) return null;
          const open = q ? true : !collapsed[type];
          return (
            <li key={type} className="pe-group">
              <button
                type="button"
                className="pe-group-head"
                aria-expanded={open}
                onClick={() => setCollapsed((c) => ({ ...c, [type]: !c[type] }))}
              >
                <span>{t(`taskLabels.${type}`, { ns: "common", defaultValue: type })}</span>
                <Icon name="chevron" size={14} className={open ? "pe-chevron-open" : undefined} />
              </button>
              {open && (
                <ul className="pe-task-options">
                  {items.map(({ category }) => {
                    const name = translateTaskName(category);
                    const params = getAllParams(category);
                    const defaults = getDefaultParams(category);
                    return (
                      <li key={category} className="pe-option" data-testid={`task-option-${category}`}>
                        <div className="pe-option-body">
                          <div className="pe-option-title">
                            {name}
                            <InfoTooltip title={name} text={translateTaskDescription(category)} />
                          </div>
                          <div className="pe-params">
                            {Object.entries(params).map(([key, p], i) => (
                              <span key={key}>
                                {i > 0 && " · "}
                                <strong>{p.label}:</strong> <em>{defaultLabel(p, defaults[key] ?? p.default ?? "", yn)}</em>
                              </span>
                            ))}
                          </div>
                        </div>
                        <IconButton icon="plus" label={ts("editor.addTask", { name })} onClick={() => onCreate(category)} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
