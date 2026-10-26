// src/components/ProtocolEditor/ProtocolForm.jsx — the protocol's task list: reorder by drag, edit, remove.
import React from "react";
import { useTranslation } from "react-i18next";
import { Button, Icon, IconButton } from "../ui";
import { getAllParams, getResolvedParams, translateTaskName } from "../../utils/translations";
import { paramText } from "./paramText";

export default function ProtocolForm({
  tasks,
  readOnly,
  validation,
  dragIndex,
  onDragStart,
  onDrop,
  onEdit,
  onDelete,
  onAddQuestionnaire,
}) {
  const { t } = useTranslation(["admin", "tasks", "common"]);
  const { t: ts } = useTranslation("studies");
  const yn = (k) => ts(`editor.${k}`);
  const [overIndex, setOverIndex] = React.useState(null);

  return (
    <div className="pe-tasks" data-testid="protocol-tasks">
      <div className="pe-tasks-head">
        <h2 className="pe-side-label">{ts("editor.protocolTasks", { count: tasks.length })}</h2>
        {!readOnly && (
          <Button size="sm" icon="plus" onClick={onAddQuestionnaire} data-testid="add-questionnaire">
            {t("protocolEditor.addQuestionnaire")}
          </Button>
        )}
      </div>

      <ul className="pe-task-list protocol-list">
        {tasks.length === 0 ? (
          <li className={`empty-protocol pe-empty ${validation.errors.tasks && !readOnly ? "tasks-error" : ""}`}>
            <em>
              {validation.errors.tasks && !readOnly
                ? t(`validation.protocol.${validation.errors.tasks}`)
                : t("protocolEditor.noTasks")}
            </em>
            {!readOnly && <span className="pe-empty-hint">{ts("editor.emptyHint")}</span>}
          </li>
        ) : (
          tasks.map((task, idx) => {
            const params = getAllParams(task.category);
            const resolved = getResolvedParams(task.category, task);
            return (
              <li
                key={idx}
                draggable={!readOnly}
                onDragStart={() => onDragStart(idx)}
                onDragOver={(e) => { e.preventDefault(); setOverIndex(idx); }}
                onDragLeave={() => setOverIndex((i) => (i === idx ? null : i))}
                onDrop={() => { setOverIndex(null); onDrop(idx); }}
                onDragEnd={() => setOverIndex(null)}
                className={`protocol-item pe-task${dragIndex === idx ? " dragging" : ""}${overIndex === idx && dragIndex !== idx ? " pe-drop" : ""}`}
              >
                {!readOnly && <span className="pe-grip" aria-hidden="true"><Icon name="grip" /></span>}
                <span className="pe-task-num">{idx + 1}</span>
                <div className="pe-task-body">
                  <div className="pe-task-title">{translateTaskName(task.category)}</div>
                  <div className="pe-params">
                    {Object.entries(params).filter(([key]) => key !== "questions").map(([key, p], i) => (
                      <span key={key}>
                        {i > 0 && " · "}
                        <strong>{p.label}: </strong><em>{paramText(resolved[key] ?? task[key], yn)}</em>
                      </span>
                    ))}
                    {task.questions?.length > 0 && (
                      <span> · <strong>{t("questionnaire.params.questions.label", { ns: "tasks" })}:</strong> <em>{task.questions.length}</em></span>
                    )}
                  </div>
                </div>
                {!readOnly && (
                  <div className="pe-task-tools">
                    <IconButton icon="settings" label={t("protocolEditor.tooltips.edit")} onClick={() => onEdit(idx)} data-testid={`task-edit-${idx}`} />
                    <IconButton icon="x" label={t("protocolEditor.tooltips.delete")} onClick={() => onDelete(idx)} data-testid={`task-remove-${idx}`} />
                  </div>
                )}
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
