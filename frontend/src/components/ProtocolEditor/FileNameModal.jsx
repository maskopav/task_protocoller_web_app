// src/components/ProtocolEditor/FileNameModal.jsx
// Builds protocols.recordings_file_name: tick the parts to include, drag to
// reorder. The text field below stays editable by hand, but any table edit
// reformats it as the ticked tokens joined by "_".
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import AdminModal from "./Modal";
import {
  FILE_NAME_TOKENS,
  fieldToken,
  normalizeIdentifiers,
  parseFileNameTokens,
  renderFileNameExample,
} from "../Identifiers/IdentifierFields";

export default function FileNameModal({ open, template, identifiers, onClose, onSave }) {
  const { t } = useTranslation(["admin", "common"]);
  const fields = normalizeIdentifiers(identifiers);

  const [rows, setRows] = useState([]);
  const [draft, setDraft] = useState("");
  const [dragIndex, setDragIndex] = useState(null);

  // Re-seed on every open so Cancel really discards the previous edits.
  useEffect(() => {
    if (!open) return;
    const labelOf = (f) =>
      f.catalogue ? t(`identifiers.catalogue.${f.name}.label`, { ns: "common" }) : f.label || f.name;
    const available = [
      ...FILE_NAME_TOKENS.map((v) => ({ token: v.token, desc: t(`protocolEditor.fileName.vars.${v.key}`) })),
      ...fields.map((f) => ({ token: fieldToken(f.name), desc: labelOf(f) })),
    ];
    // Used tokens first, in the order the stored template uses them.
    const used = parseFileNameTokens(template).filter((tok) => available.some((a) => a.token === tok));
    setRows(
      [...used, ...available.map((a) => a.token).filter((tok) => !used.includes(tok))]
        .map((tok) => ({ ...available.find((a) => a.token === tok), checked: used.includes(tok) }))
    );
    setDraft(template || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const applyRows = (next) => {
    setRows(next);
    setDraft(next.filter((r) => r.checked).map((r) => r.token).join("_"));
  };

  const toggle = (i) => applyRows(rows.map((r, idx) => (idx === i ? { ...r, checked: !r.checked } : r)));

  const handleDrop = (target) => {
    if (dragIndex === null || dragIndex === target) return;
    const next = [...rows];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(target, 0, moved);
    setDragIndex(null);
    applyRows(next);
  };

  return (
    <AdminModal
      open={open}
      title={t("protocolEditor.fileName.title")}
      onClose={onClose}
      onSave={() => onSave(draft.trim())}
      showCancelButton
    >
      <div className="file-name-editor">
        <p>{t("protocolEditor.fileName.desc")}</p>

        <table className="file-name-table">
          <thead>
            <tr>
              <th />
              <th>{t("protocolEditor.fileName.colVariable")}</th>
              <th>{t("protocolEditor.fileName.colDesc")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r.token}
                draggable
                onDragStart={() => setDragIndex(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(i)}
                className={dragIndex === i ? "dragging" : ""}
              >
                <td><input type="checkbox" checked={r.checked} onChange={() => toggle(i)} /></td>
                <td><code>{r.token}</code></td>
                <td>{r.desc}</td>
                <td className="drag-handle" title={t("protocolEditor.fileName.dragHint")}>⠿</td>
              </tr>
            ))}
          </tbody>
        </table>

        <label className="protocol-label">{t("protocolEditor.fileName.templateLabel")}</label>
        <input
          type="text"
          className="file-name-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <small className="text-muted">
          {t("protocolEditor.fileName.example")}: <code>{renderFileNameExample(draft, fields)}</code>
        </small>
      </div>
    </AdminModal>
  );
}