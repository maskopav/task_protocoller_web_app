// src/services/emailService.js — own nodemailer setup, independent of any
// consuming app (mirrors the shape of task_protocoller_web_app's
// backend/src/utils/emailService.js, minus its i18next dependency — this
// service ships plain English copy for now; a per-tenant locale can be
// threaded through later if a consumer needs it).
import "dotenv/config";
import nodemailer from "nodemailer";
import { logToFile } from "../utils/logger.js";

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

function formatSlot(startsAt, endsAt, location) {
  return `
    <p><strong>When:</strong> ${startsAt} – ${endsAt}</p>
    ${location ? `<p><strong>Where:</strong> ${location}</p>` : ""}
  `;
}

export async function sendBookingConfirmationEmail({ to, resourceName, startsAt, endsAt, location, manageLink }) {
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; border: 1px solid #eee; padding: 20px;">
      <h2 style="color: #3764df;">Your appointment is confirmed</h2>
      <p>${resourceName}</p>
      ${formatSlot(startsAt, endsAt, location)}
      <p>Need to change it? You can reschedule or cancel up to one day before your appointment:</p>
      <a href="${manageLink}" style="background:#3764df; color:white; padding:10px 20px; text-decoration:none; border-radius:5px; display:inline-block;">
        Manage my appointment
      </a>
    </div>
  `;
  return sendEmail({ to, subject: `Appointment confirmed — ${resourceName}`, html });
}

export async function sendBookingRescheduledEmail({ to, resourceName, startsAt, endsAt, location, manageLink }) {
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; border: 1px solid #eee; padding: 20px;">
      <h2 style="color: #3764df;">Your appointment was rescheduled</h2>
      <p>${resourceName}</p>
      ${formatSlot(startsAt, endsAt, location)}
      <a href="${manageLink}" style="background:#3764df; color:white; padding:10px 20px; text-decoration:none; border-radius:5px; display:inline-block;">
        Manage my appointment
      </a>
    </div>
  `;
  return sendEmail({ to, subject: `Appointment rescheduled — ${resourceName}`, html });
}

export async function sendBookingCancelledEmail({ to, resourceName, startsAt }) {
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; border: 1px solid #eee; padding: 20px;">
      <h2 style="color: #3764df;">Your appointment was cancelled</h2>
      <p>${resourceName} — originally scheduled for ${startsAt}.</p>
    </div>
  `;
  return sendEmail({ to, subject: `Appointment cancelled — ${resourceName}`, html });
}
