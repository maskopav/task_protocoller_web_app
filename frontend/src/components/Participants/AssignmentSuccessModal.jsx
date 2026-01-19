// src/components/Participants/AssignmentSuccessModal.jsx
import React, { useState, useEffect, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useTranslation, Trans } from "react-i18next";
import AdminModal from "../ProtocolEditor/Modal";
import "./AssignmentSuccessModal.css";

export default function AssignmentSuccessModal({ 
  open, 
  link, 
  emailText, 
  participantEmail, 
  participantName, 
  onClose, 
  onSendEmail 
}) {
  const { t } = useTranslation(["admin", "common"]);
  const qrRef = useRef(null);
  
  const [recipientEmail, setRecipientEmail] = useState("");
  const [editableBody, setEditableBody] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sentSuccessfully, setSentSuccessfully] = useState(false);

  useEffect(() => {
    if (open) {
      setRecipientEmail(participantEmail || "");
      setEditableBody(emailText || t("assignmentModal.emailText", { 
        name: participantName || t("assignmentModal.participant"), 
        link: link 
      }));
      setSentSuccessfully(false); // Reset feedback on open
    }
  }, [open, participantEmail, participantName, emailText, link, t]);

  const handleDownloadQR = () => {
    const svg = qrRef.current.querySelector("svg");
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      const pngFile = canvas.toDataURL("image/png");
      const downloadLink = document.createElement("a");
      downloadLink.download = "protocol-qr.png";
      downloadLink.href = pngFile;
      downloadLink.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(svgData);
  };

  const handleSend = async () => {
    if (!recipientEmail) return;
    setIsSending(true);
    try {
      await onSendEmail(recipientEmail, editableBody);
      setSentSuccessfully(true);
    } catch (err) {
      console.error("Failed to send email:", err);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      title={t("assignmentModal.title")}
      showSaveButton={false}
    >
      <div className="admin-form-container assignment-modal-content">
        <div className="assignment-warning">
          <Trans
            i18nKey="assignmentModal.warning"
            ns="admin"
            components={{ strong: <strong />, br: <br /> }}
          />
        </div>

        {/* Link Row: Label, Link, and Button all together */}
        <div className="form-group link-row-container">
          <label className="form-label compact">{t("assignmentModal.description")}</label>
          <code className="link-text-inline">{link}</code>
          <button className="btn-copy-action" onClick={() => navigator.clipboard.writeText(link)}>
            {t("assignmentModal.copyLink")}
          </button>
        </div>

        {/* QR Section: Smaller vertical space with actions near the code */}
        <div className="qr-container-compact">
          <label className="form-label compact">{t("assignmentModal.descriptionQR")}</label>
          <div className="qr-wrapper-small" ref={qrRef}>
            <QRCodeSVG value={link} size={120} />
          </div>
          <div className="qr-actions-row">
             <button className="btn-qr-action" onClick={handleDownloadQR}>
               💾 {t("protocolDashboard.enrollmentModal.downloadQR")}
             </button>
          </div>
        </div>


        {/* Email Section */}
        <div className="email-edit-section">
          <div className="form-group row-align">
            <label className="form-label">{t("participantDashboard.modal.labels.email")}</label>
            <input 
              type="email" 
              className="participant-input"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="email@example.com"
            />
          </div>

          <div className="form-group">
            <label className="form-label">{t("assignmentModal.emailMessage")}</label>
            <textarea
              className="email-textarea"
              rows={4}
              value={editableBody}
              onChange={(e) => setEditableBody(e.target.value)}
            />
          </div>
          {/* Success Info Display */}
          {sentSuccessfully && (
            <span className="email-success-info">✅ {t("assignmentModal.emailSentSuccess")}</span>
          )}
          <div className="modal-footer-btns">
             <button className="btn-copy-outline" onClick={() => navigator.clipboard.writeText(editableBody)}>
              {t("assignmentModal.copyEmail")}
            </button>
            <button 
              className="btn-sent-email"
              onClick={handleSend}
              disabled={isSending || !recipientEmail}
            >
              {isSending ? t("common:auth.processing") : "✉️ " + t("management.buttons.sendEmail", "Send Email")}
            </button>
          </div>
        </div>
      </div>
    </AdminModal>
  );
}