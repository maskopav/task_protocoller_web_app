// src/services/emailService.js — own nodemailer setup, independent of any
// consuming app (mirrors the shape of task_protocoller_web_app's
// backend/src/utils/emailService.js). Copy comes from src/i18n/emailTranslations.js
// rather than i18next — see that file for why.
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import nodemailer from "nodemailer";
import { logToFile } from "../utils/logger.js";
import { t } from "../i18n/emailTranslations.js";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: { rejectUnauthorized: false },
});

// EMAIL_DRY_RUN=true skips the real SMTP send and instead writes the
// rendered HTML to logs/dev-emails/ so the booking flow can be exercised
// end-to-end locally (confirmation/reschedule/cancel/no-slot emails) without
// sending through the real Gmail account. Everything else about the flow
// (DB writes, Calendar sync, API responses) runs unchanged.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dryRunDir = path.resolve(__dirname, "../../logs/dev-emails");

function saveDryRunPreview({ to, subject, html }) {
  try {
    if (!fs.existsSync(dryRunDir)) fs.mkdirSync(dryRunDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const slug = subject.replace(/[^a-z0-9]+/gi, "-").slice(0, 60);
    const filePath = path.join(dryRunDir, `${stamp}_${slug}.html`);
    const banner = `<div style="background:#fffbe6;border:1px solid #f0c36d;padding:10px;margin-bottom:16px;font-family:sans-serif;font-size:13px;">
      <strong>DRY RUN — this email was not sent.</strong><br>To: ${to}<br>Subject: ${subject}
    </div>`;
    fs.writeFileSync(filePath, banner + html);
    logToFile("INFO", "Email dry-run — not sent, preview saved", { to, subject, file: filePath });
  } catch (err) {
    logToFile("ERROR", "Email dry-run preview write failed", { to, subject, error: err.message });
  }
}

async function sendEmail({ to, subject, html }) {
  if (process.env.EMAIL_DRY_RUN === "true") {
    saveDryRunPreview({ to, subject, html });
    return true;
  }
  try {
    await transporter.sendMail({
      from: `"${process.env.SMTP_FROM_NAME || "neuroSHARE návštěva"}" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
    });
    return true;
  } catch (error) {
    logToFile("ERROR", "Email delivery failed", { to, subject, error: error.message });
    return false;
  }
}

function formatSlot(locale, startsAt, endsAt, location) {
  return `
    <p><strong>${t(locale, "whenLabel")}</strong> ${startsAt} – ${endsAt}</p>
    ${location ? `<p><strong>${t(locale, "whereLabel")}</strong> ${location}</p>` : ""}
  `;
}

// Fixed to the CVUT building -- this service is currently single-location.
// If a second location/tenant is ever added, this needs to become
// conditional (or per-resource) rather than always shown.
const locationPhotoUrl = `${process.env.PUBLIC_BASE_URL}/images/CVUT-building.jpg`;

export async function sendBookingConfirmationEmail({ to, startsAt, endsAt, location, manageLink, locale = "en" }) {
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; border: 1px solid #eee; padding: 20px;">
      <h2 style="color: #3764df;">${t(locale, "confirmationHeading")}</h2>
      ${formatSlot(locale, startsAt, endsAt, location)}
      <img src="${locationPhotoUrl}" alt="ČVUT FEL" width="560" style="width: 100%; max-width: 560px; height: auto; border-radius: 8px; display: block; margin: 12px 0;" />
      <p>${t(locale, "manageNotice")}</p>
      <a href="${manageLink}" style="background:#3764df; color:white; padding:10px 20px; text-decoration:none; border-radius:5px; display:inline-block;">
        ${t(locale, "manageButton")}
      </a>
    </div>
  `;
  return sendEmail({ to, subject: t(locale, "confirmationSubject"), html });
}

export async function sendBookingRescheduledEmail({ to, startsAt, endsAt, location, manageLink, locale = "en" }) {
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; border: 1px solid #eee; padding: 20px;">
      <h2 style="color: #3764df;">${t(locale, "rescheduledHeading")}</h2>
      ${formatSlot(locale, startsAt, endsAt, location)}
      <a href="${manageLink}" style="background:#3764df; color:white; padding:10px 20px; text-decoration:none; border-radius:5px; display:inline-block;">
        ${t(locale, "manageButton")}
      </a>
    </div>
  `;
  return sendEmail({ to, subject: t(locale, "rescheduledSubject"), html });
}

// Sent when a respondent reports that none of the offered slots work for
// them (see publicController.reportNoSlot) — no appointment exists yet, so
// this just confirms the message was received and gives them a link back
// to the booking page in case a new slot opens before staff reach out.
export async function sendNoSlotFollowupEmail({ to, selfBookingLink, contactInfo, locale = "en" }) {
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; border: 1px solid #eee; padding: 20px;">
      <h2 style="color: #3764df;">${t(locale, "noSlotHeading")}</h2>
      <p>${t(locale, "noSlotBody")}</p>
      <div style="text-align: center; background: #f9f9f9; padding: 20px; margin: 20px 0; border-radius: 8px;">
        <a href="${selfBookingLink}" style="background:#3764df; color:white; padding:10px 20px; text-decoration:none; border-radius:5px; display:inline-block;">
          ${t(locale, "noSlotLinkButton")}
        </a>
      </div>
      ${contactInfo ? `
        <p style="color: #666; font-size: 0.9em;">${t(locale, "questionsLabel")} ${contactInfo}</p>
      ` : ""}
    </div>
  `;
  return sendEmail({ to, subject: t(locale, "noSlotSubject"), html });
}

export async function sendBookingCancelledEmail({ to, startsAt, rebookLink, contactInfo, locale = "en" }) {
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; border: 1px solid #eee; padding: 20px;">
      <h2 style="color: #3764df;">${t(locale, "cancelledHeading")}</h2>
      <p>${t(locale, "cancelledBody", startsAt)}</p>
      ${rebookLink ? `
        <div style="text-align: center; background: #f9f9f9; padding: 20px; margin: 20px 0; border-radius: 8px;">
          <a href="${rebookLink}" style="background:#3764df; color:white; padding:10px 20px; text-decoration:none; border-radius:5px; display:inline-block;">
            ${t(locale, "rebookButton")}
          </a>
        </div>
      ` : ""}
      ${contactInfo ? `
        <p style="color: #666; font-size: 0.9em;">${t(locale, "questionsLabel")} ${contactInfo}</p>
      ` : ""}
    </div>
  `;
  return sendEmail({ to, subject: t(locale, "cancelledSubject"), html });
}
