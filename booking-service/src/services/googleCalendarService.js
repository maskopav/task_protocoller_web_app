// src/services/googleCalendarService.js — one-way push (this service →
// one shared team Google Calendar) via a service account, so no per-viewer
// OAuth consent flow is needed. Fully optional: if GOOGLE_SERVICE_ACCOUNT_KEY_PATH
// or GOOGLE_CALENDAR_ID isn't set, every function below is a no-op — booking
// CRUD works fine without Calendar configured.
//
// One-time manual setup (cannot be automated from here):
//  1. Create/select a project in Google Cloud Console.
//  2. Enable the "Google Calendar API" for it.
//  3. Create a Service Account, then create+download a JSON key for it.
//  4. Save that JSON file somewhere readable by this server and point
//     GOOGLE_SERVICE_ACCOUNT_KEY_PATH at it.
//  5. In Google Calendar, open the target team calendar's settings →
//     "Share with specific people", add the service account's email
//     (looks like ...@...iam.gserviceaccount.com, found in the JSON key)
//     with "Make changes to events" permission.
//  6. Set GOOGLE_CALENDAR_ID to that calendar's ID (Settings → "Integrate
//     calendar" → Calendar ID; for a dedicated calendar it looks like an
//     email address ending in @group.calendar.google.com).
import { google } from "googleapis";
import { logToFile } from "../utils/logger.js";

let calendarClient = null;
let initAttempted = false;

function getClient() {
  if (initAttempted) return calendarClient;
  initAttempted = true;

  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  if (!keyPath || !process.env.GOOGLE_CALENDAR_ID) {
    logToFile("INFO", "Google Calendar sync disabled — GOOGLE_SERVICE_ACCOUNT_KEY_PATH / GOOGLE_CALENDAR_ID not set");
    return null;
  }

  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: keyPath,
      scopes: ["https://www.googleapis.com/auth/calendar"],
    });
    calendarClient = google.calendar({ version: "v3", auth });
  } catch (err) {
    logToFile("ERROR", "Failed to initialize Google Calendar client", { error: err.message });
    calendarClient = null;
  }
  return calendarClient;
}

// MySQL DATETIME strings (dateStrings:true, "YYYY-MM-DD HH:MM:SS") represent
// the room's local wall-clock time — pass them to Calendar as a floating
// (no-timeZone-conversion) dateTime by attaching a fixed IANA zone name.
// Adjust CALENDAR_TIMEZONE if your rooms aren't in this timezone.
const CALENDAR_TIMEZONE = process.env.GOOGLE_CALENDAR_TIMEZONE || "Europe/Prague";

function toRfc3339(mysqlDateTime) {
  return mysqlDateTime.replace(" ", "T");
}

export async function createCalendarEvent({ summary, description, startsAt, endsAt, location }) {
  const calendar = getClient();
  if (!calendar) return null;

  try {
    const res = await calendar.events.insert({
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      requestBody: {
        summary,
        description,
        location: location || undefined,
        start: { dateTime: toRfc3339(startsAt), timeZone: CALENDAR_TIMEZONE },
        end: { dateTime: toRfc3339(endsAt), timeZone: CALENDAR_TIMEZONE },
      },
    });
    return res.data.id;
  } catch (err) {
    logToFile("ERROR", "Google Calendar event creation failed", { error: err.message });
    return null;
  }
}

export async function updateCalendarEvent(eventId, { summary, description, startsAt, endsAt, location }) {
  const calendar = getClient();
  if (!calendar || !eventId) return;

  try {
    await calendar.events.patch({
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      eventId,
      requestBody: {
        summary,
        description,
        location: location || undefined,
        start: { dateTime: toRfc3339(startsAt), timeZone: CALENDAR_TIMEZONE },
        end: { dateTime: toRfc3339(endsAt), timeZone: CALENDAR_TIMEZONE },
      },
    });
  } catch (err) {
    logToFile("ERROR", "Google Calendar event update failed", { eventId, error: err.message });
  }
}

export async function deleteCalendarEvent(eventId) {
  const calendar = getClient();
  if (!calendar || !eventId) return;

  try {
    await calendar.events.delete({ calendarId: process.env.GOOGLE_CALENDAR_ID, eventId });
  } catch (err) {
    logToFile("ERROR", "Google Calendar event deletion failed", { eventId, error: err.message });
  }
}
