// src/components/ProtocolEditor/ProtocolSettings.jsx — the collapsible "Protocol settings" panel.
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import ProtocolLanguageSelector from "../ProtocolLanguageSelector/ProtocolLanguageSelector";
import FileNameModal from "./FileNameModal";
import { Badge, Button, Icon, KeyValue, TextField } from "../ui";
import {
  DEFAULT_RECORDINGS_FILE_NAME,
  normalizeIdentifiers,
  renderFileNameExample,
} from "../Identifiers/IdentifierFields";

const isQuillEmpty = (content) => !content || content.replace(/<(.|\n)*?>/g, "").trim().length === 0;

export default function ProtocolSettings({
  protocolData,
  setProtocolData,
  validation,
  readOnly,
  editingMode,
  isDraft,
  libraryNote,
  onEditInfo,
  onDeleteInfo,
  onEditInstructions,
  onDeleteInstructions,
  onEditIdentifiers,
}) {
  const { t } = useTranslation(["admin", "common"]);
  const { t: ts } = useTranslation("studies");
  const [open, setOpen] = useState(true);
  const [showFileName, setShowFileName] = useState(false);

  const identifiers = normalizeIdentifiers(protocolData?.required_identifiers);
  const template = protocolData?.recordings_file_name || DEFAULT_RECORDINGS_FILE_NAME;
  const labelOf = (f) => (f.catalogue ? t(`identifiers.catalogue.${f.name}.label`, { ns: "common" }) : f.label || f.name);
  const set = (patch) => setProtocolData((prev) => ({ ...prev, ...patch }));
  const err = (field) => validation.errors[field] && t(`validation.protocol.${validation.errors[field]}`);

  const header = (
    <button type="button" className="pe-panel-head" aria-expanded={open} onClick={() => setOpen((o) => !o)} data-testid="protocol-settings-toggle">
      <span>{ts("editor.settings")}</span>
      <Icon name="chevron" size={14} className={open ? "pe-chevron-open" : undefined} />
    </button>
  );

  if (readOnly) {
    return (
      <aside className="pe-settings" data-testid="protocol-settings">
        {header}
        {open && (
          <KeyValue
            cols={1}
            items={[
              { label: ts("protocols.description"), value: protocolData?.description },
              { label: t("protocolEditor.editIdentifiersTitle"), value: identifiers.map(labelOf).join(", ") },
              { label: t("protocolEditor.recordingsFileName"), value: template, mono: true },
              { label: t("protocolEditor.instructionsPdfUrl"), value: protocolData?.instructions_pdf_url },
            ]}
          />
        )}
      </aside>
    );
  }

  return (
    <aside className="pe-settings" data-testid="protocol-settings">
      {header}
      {open && (
        <div className="pe-settings-body">
          {libraryNote && <p className="pe-note">{libraryNote}</p>}

          {isDraft && (
            <TextField
              label={ts("protocols.name")}
              value={protocolData?.name || ""}
              onChange={(e) => set({ name: e.target.value })}
              error={err("name")}
              data-testid="protocol-name"
            />
          )}
          {!isDraft && err("name") && <p className="ui-field-error">{err("name")}</p>}

          <TextField
            label={ts("protocols.description")}
            value={protocolData?.description || ""}
            onChange={(e) => set({ description: e.target.value })}
            data-testid="protocol-description"
          />

          <div className="pe-block">
            <ProtocolLanguageSelector
              value={protocolData?.language || "en"}
              onChange={(lang) => set({ language: lang })}
              editingMode={editingMode}
            />
          </div>

          <div className="pe-block">
            <span className="pe-label">{ts("editor.identifiersAsked")}</span>
            <div className="pe-tags">
              {identifiers.length === 0 && <span className="studies-muted">{ts("editor.noIdentifiers")}</span>}
              {identifiers.map((f, i) => (
                <Badge key={f.name || i} tone={f.required ? "accent" : "neutral"}>
                  {labelOf(f)}{f.required ? ` · ${ts("editor.required")}` : ""}
                </Badge>
              ))}
            </div>
            {err("identifiers") && <p className="ui-field-error">{err("identifiers")}</p>}
            <Button size="sm" variant="quiet" onClick={onEditIdentifiers} data-testid="edit-identifiers">{ts("editor.editFields")}</Button>
          </div>

          <div className="pe-block">
            <span className="pe-label">{t("protocolEditor.recordingsFileName")}</span>
            <code className={`pe-code${validation.errors.recordings_file_name ? " pe-code-error" : ""}`}>{template}</code>
            <span className="pe-hint">{t("protocolEditor.fileName.example")}: <code>{renderFileNameExample(template, identifiers)}</code></span>
            {err("recordings_file_name") && <p className="ui-field-error">{err("recordings_file_name")}</p>}
            <Button size="sm" variant="quiet" onClick={() => setShowFileName(true)} data-testid="edit-file-name">{t("protocolEditor.fileName.button")}</Button>
          </div>

          <TextField
            label={t("protocolEditor.instructionsPdfUrl")}
            type="url"
            placeholder="https://"
            value={protocolData?.instructions_pdf_url || ""}
            onChange={(e) => set({ instructions_pdf_url: e.target.value })}
            error={err("instructions_pdf_url")}
          />

          <div className="pe-block">
            <span className="pe-label">{ts("editor.pages")}</span>
            <div className="pe-pages">
              {isQuillEmpty(protocolData?.info_text) ? (
                <Button size="sm" icon="plus" onClick={onEditInfo} data-testid="add-info-page">{t("protocolEditor.addInfoPage")}</Button>
              ) : (
                <span className="pe-page">
                  <Icon name="check" /> {t("protocolEditor.introPageAdded")}
                  <Button size="sm" variant="quiet" onClick={onEditInfo}>{t("common:buttons.edit")}</Button>
                  <Button size="sm" variant="quiet" onClick={onDeleteInfo}>{ts("editor.remove")}</Button>
                </span>
              )}
              {isQuillEmpty(protocolData?.instructions_text) ? (
                <Button size="sm" icon="plus" onClick={onEditInstructions} data-testid="add-instructions-page">{t("protocolEditor.addInstructionsPage", "Add Instructions")}</Button>
              ) : (
                <span className="pe-page">
                  <Icon name="check" /> {t("protocolEditor.instructionsAdded", "Instructions Added")}
                  <Button size="sm" variant="quiet" onClick={onEditInstructions}>{t("common:buttons.edit")}</Button>
                  <Button size="sm" variant="quiet" onClick={onDeleteInstructions}>{ts("editor.remove")}</Button>
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      <FileNameModal
        open={showFileName}
        template={template}
        identifiers={identifiers}
        onClose={() => setShowFileName(false)}
        onSave={(tpl) => { set({ recordings_file_name: tpl }); setShowFileName(false); }}
      />
    </aside>
  );
}
