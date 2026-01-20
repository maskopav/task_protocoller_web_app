// frontend/src/components/Protocols/EnrollmentModal.jsx
import React, { useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useTranslation, Trans } from "react-i18next";
import AdminModal from "../ProtocolEditor/Modal";
import { useConfirm } from "../ConfirmDialog/ConfirmDialogContext";
import "./EnrollmentModal.css";

export default function EnrollmentModal({ protocol, onClose }) {
  const { t } = useTranslation(["admin", "common"]);
  const qrRef = useRef(null);
  const confirm = useConfirm();

  const getEnrollmentLink = () => {
    const baseUrl = window.location.href.split('#')[0];
    return `${baseUrl}#/protocol/${protocol.access_token}`;
  };

  const link = getEnrollmentLink();

  const downloadQRCode = () => {
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
      downloadLink.download = `qr-enrollment-${protocol.name}.png`;
      downloadLink.href = pngFile;
      downloadLink.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  };

  const copyQRCodeImage = async () => {
    try {
      const svg = qrRef.current.querySelector("svg");
      const svgData = new XMLSerializer().serializeToString(svg);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const img = new Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(async (blob) => {
          const item = new ClipboardItem({ "image/png": blob });
          await navigator.clipboard.write([item]);
          await confirm({
            title: t("confirmModal.info", { ns: "common" }),
            message: t("protocolDashboard.enrollmentModal.qrCopied"),
            confirmText: t("buttons.ok", { ns: "common" }),
            cancelText: ""
          });
        });
      };
      img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
    } catch (err) {
      console.error("Failed to copy image: ", err);
    }
  };

  return (
    <AdminModal
      open={true}
      onClose={onClose}
      title={t("protocolDashboard.enrollmentModal.title")}
      showSaveButton={false}
    >
      <div className="admin-form-container assignment-modal-content">
        {/* Warning Section */}
        <div className="assignment-warning">
          <Trans
            i18nKey="protocolDashboard.enrollmentModal.description"
            ns="admin"
            components={{ strong: <strong />, br: <br /> }}
          />
        </div>

        {/* Link Row: Label + Inline Link + Copy Button */}
        <div className="form-group link-row-container">
          <label className="form-label compact">{t("protocolDashboard.enrollmentModal.linkInstruction")}</label>
          <code className="link-text-inline">{link}</code>
          <button className="btn-copy-action" onClick={() => navigator.clipboard.writeText(link)}>
            {t("protocolDashboard.enrollmentModal.copyLink")}
          </button>
        </div>

        {/* QR Section: Horizontal layout matching AssignmentSuccessModal */}
        <div className="qr-container-compact">
          <label className="form-label compact">{t("protocolDashboard.enrollmentModal.qrTitle")}</label>
          <div className="qr-wrapper-small" ref={qrRef}>
            <QRCodeSVG value={link} size={120} includeMargin={false} />
          </div>
          <div className="qr-actions-row">
            <button className="btn-qr-action" onClick={downloadQRCode}>
              💾 {t("protocolDashboard.enrollmentModal.downloadQR")}
            </button>
            <button className="btn-qr-action" onClick={copyQRCodeImage} style={{ marginTop: '8px' }}>
              📋 {t("protocolDashboard.enrollmentModal.copyQR")}
            </button>
          </div>
        </div>
      </div>
    </AdminModal>
  );
}