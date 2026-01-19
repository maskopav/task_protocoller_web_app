// src/components/ParticipantProtocol/ParticipantProtocol.jsx
import React, { useState } from "react";
import "./ParticipantProtocolTable.css";
import {
  activateParticipantProtocol,
  deactivateParticipantProtocol,
} from "../../api/participantProtocols";
import { useTranslation } from "react-i18next";
import { useConfirm } from "../ConfirmDialog/ConfirmDialogContext";

const VITE_APP_BASE_PATH = import.meta.env.VITE_APP_BASE_PATH;

export default function ParticipantProtocolTable({ rows, onRefresh, onShowSuccessModal, readOnly }) {
  const { t } = useTranslation(["admin"]);
  const confirm = useConfirm();

  function generateEmail(name, link) {
    const finalName = name || t("assignmentModal.participant");
  
    return t("assignmentModal.emailText", {
      name: finalName,
      link,
    });
  }

  async function handleActivate(id, protocolName, participantName, uniqueToken, contactEmail) {
    const ok = await confirm({
      title: t("participantProtocol.confirm.assign.title"),
      message: t("participantProtocol.confirm.assign.message", {
        protocol: protocolName,
        participant: participantName,
      }),
      confirmText: t("participantProtocol.confirm.confirm"),
      cancelText: t("participantProtocol.confirm.cancel"),
    });
    
    if (!ok) return;
    await activateParticipantProtocol(id);

    const link = `${window.location.origin}${VITE_APP_BASE_PATH}#/participant/${uniqueToken}`;
    const emailText = generateEmail(participantName, link);

    // Call Parent Handler
    if (onShowSuccessModal) onShowSuccessModal(link, emailText, contactEmail, participantName);
    onRefresh && onRefresh();
  }

  async function handleDeactivate(id, protocolName, participantName) {
    const ok = await confirm({
      title: t("participantProtocol.confirm.end.title"),
      message: t("participantProtocol.confirm.end.message", {
        protocol: protocolName,
        participant: participantName,
      }),
      confirmText: t("participantProtocol.confirm.confirm"),
      cancelText: t("participantProtocol.confirm.cancel"),
    });
    
    if (!ok) return;

    await deactivateParticipantProtocol(id);
    onRefresh && onRefresh();
  }

  return (
      <>
        <div className="table-scroll-area">
          <table className="table">
            <thead>
              <tr>
                <th>{t("participantProtocol.table.participant")}</th>
                <th>{t("participantProtocol.table.externalId")}</th>
                <th>{t("participantProtocol.table.protocol")}</th>
                <th>{t("participantProtocol.table.version")}</th>
                <th>{t("participantProtocol.table.nTasks")}</th>
                <th>{t("participantProtocol.table.nQuest")}</th>
                <th>{t("participantProtocol.table.start")}</th>
                <th>{t("participantProtocol.table.end")}</th>
                <th>{t("participantProtocol.table.status")}</th>
                <th>{t("participantProtocol.table.actions")}</th>
              </tr>
            </thead>

            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan="10" className="empty-row">
                    {t("participantProtocol.noAssignments")}
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.participant_protocol_id}>
                    <td className="highlighted">{r.full_name || "—"}</td>
                    <td>{r.external_id || "—"}</td>
                    <td>{r.protocol_name}</td>
                    <td>{r.protocol_version}</td>
                    <td>{r.n_tasks}</td>
                    <td>{r.n_quest}</td>
                    <td>{r.start_date?.slice(0, 10) || "—"}</td>
                    <td>{r.end_date?.slice(0, 10) || "—"}</td>
                    <td>
                      {r.is_active
                        ? t("participantProtocol.status.active")
                        : t("participantProtocol.status.inactive")}
                    </td>

                    <td className="actions">
                      {r.is_active == 0 && (
                        <button
                          className="btn-view"
                          disabled={readOnly}
                          onClick={() =>
                            handleActivate(
                              r.participant_protocol_id,
                              r.protocol_name,
                              r.full_name,
                              r.access_token,
                              r.contactEmail
                            )
                          }
                        >
                          {t("participantProtocol.buttons.activate")}
                        </button>
                      )}

                      {r.is_active == 1 && (
                        <>
                          <button
                            className="btn-edit"
                            disabled={readOnly}
                            onClick={() =>
                              handleDeactivate(
                                r.participant_protocol_id,
                                r.protocol_name,
                                r.full_name
                              )
                            }
                          >
                            {t("participantProtocol.buttons.end")}
                          </button>

                          {/* EXTRA BUTTON TO SHOW MODAL */}
                          <button
                            className="btn-show-modal"
                            disabled={readOnly}
                            onClick={() => {
                              const link = `${window.location.origin}${VITE_APP_BASE_PATH}#/participant/${r.access_token}`;
                              const emailText = generateEmail(
                                r.full_name,
                                link
                              );
                              if (onShowSuccessModal) onShowSuccessModal(link, emailText, r.contact_email, r.full_name);
                            }}
                          >
                            {t("participantProtocol.buttons.showModal")}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
    </>
  );
}
