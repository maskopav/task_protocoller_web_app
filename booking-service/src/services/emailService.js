// src/services/emailService.js — own nodemailer setup, independent of any
// consuming app (mirrors the shape of task_protocoller_web_app's
// backend/src/utils/emailService.js). Copy comes from src/i18n/emailTranslations.js
// rather than i18next — see that file for why.
import "dotenv/config";
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

async function sendEmail({ to, subject, html }) {
  try {
    await transporter.sendMail({
      from: `"${process.env.SMTP_FROM_NAME || "Booking"}" <${process.env.SMTP_USER}>`,
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

export async function sendBookingConfirmationEmail({ to, resourceName, startsAt, endsAt, location, manageLink, locale = "en" }) {
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; border: 1px solid #eee; padding: 20px;">
      <h2 style="color: #3764df;">${t(locale, "confirmationHeading")}</h2>
      <p>${resourceName}</p>
      ${formatSlot(locale, startsAt, endsAt, location)}
      <p>${t(locale, "manageNotice")}</p>
      <a href="${manageLink}" style="background:#3764df; color:white; padding:10px 20px; text-decoration:none; border-radius:5px; display:inline-block;">
        ${t(locale, "manageButton")}
      </a>
    </div>
  `;
  return sendEmail({ to, subject: t(locale, "confirmationSubject", resourceName), html });
}

export async function sendBookingRescheduledEmail({ to, resourceName, startsAt, endsAt, location, manageLink, locale = "en" }) {
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; border: 1px solid #eee; padding: 20px;">
      <h2 style="color: #3764df;">${t(locale, "rescheduledHeading")}</h2>
      <p>${resourceName}</p>
      ${formatSlot(locale, startsAt, endsAt, location)}
      <a href="${manageLink}" style="background:#3764df; color:white; padding:10px 20px; text-decoration:none; border-radius:5px; display:inline-block;">
        ${t(locale, "manageButton")}
      </a>
    </div>
  `;
  return sendEmail({ to, subject: t(locale, "rescheduledSubject", resourceName), html });
}

export async function sendBookingCancelledEmail({ to, resourceName, startsAt, rebookLink, contactInfo, locale = "en" }) {
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; border: 1px solid #eee; padding: 20px;">
      <h2 style="color: #3764df;">${t(locale, "cancelledHeading")}</h2>
      <p>${t(locale, "cancelledBody", resourceName, startsAt)}</p>
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
  return sendEmail({ to, subject: t(locale, "cancelledSubject", resourceName), html });
}
