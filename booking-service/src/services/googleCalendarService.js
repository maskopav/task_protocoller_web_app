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
//
// Every slot (not just booked ones) gets its own event, styled by status —
// see upsertSlotEvent below — so the shared calendar shows the whole
// offered schedule, not just confirmed visits. The event tracks the time
// SLOT, not any one booking of it: book/cancel/rebook cycles flip the same
// event between "available" and "booked" rather than creating new ones.
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

// Google Calendar's standard colorId palette (1-11). Sage/green reads as
// "open" and Tomato/red as "taken" — a plain traffic-light convention, not
// tied to anything Calendar itself assigns meaning to.
const STATUS_STYLE = {
  available: { colorId: "2", transparency: "transparent", label: "Available" }, // Sage; "transparent" also means Calendar doesn't count it as busy time
  booked: { colorId: "11", transparency: "opaque", label: "Booked" }, // Tomato
};

// Everything above this marker is rewritten by this service on every
// sync; everything below it is left alone. Lets a team member type notes
// (who's covering the slot, etc.) directly into the event in Google
// Calendar's own UI without a later status flip wiping them out.
const TEAM_NOTES_MARKER = "\n\n--- Team notes (edit freely below — preserved on updates) ---\n";

export function extractTeamNotes(existingDescription) {
  if (!existingDescription) return "";
  const idx = existingDescription.indexOf(TEAM_NOTES_MARKER);
  return idx === -1 ? "" : existingDescription.slice(idx + TEAM_NOTES_MARKER.length);
}

export function buildManagedDescription(systemLines, existingDescription) {
  return systemLines.join("\n") + TEAM_NOTES_MARKER + extractTeamNotes(existingDescription);
}

// Creates the event if `eventId` is null/not yet known, otherwise updates
// the existing one in place (fetching its current description first, so
// buildManagedDescription can preserve any team notes already in it).
// Returns the event id either way — null only if Calendar isn't configured
// or the call failed (never throws; every caller treats sync as
// best-effort, matching the rest of this service's fire-and-forget pattern
// for Calendar/email work).
export async function upsertSlotEvent({ eventId, startsAt, endsAt, location, status, systemNotes = [], contactEmail }) {
  const calendar = getClient();
  if (!calendar) return null;

  const style = STATUS_STYLE[status];
  // contactEmail only ever set for status "booked" (see callers) — shown in
  // the title itself, not just the description, so it's visible at a glance
  // in month/week view without opening the event.
  const summary = contactEmail
    ? `${style.label} — ${contactEmail}`
    : style.label;

  try {
    let existingDescription = null;
    if (eventId) {
      try {
        const existing = await calendar.events.get({ calendarId: process.env.GOOGLE_CALENDAR_ID, eventId });
        existingDescription = existing.data.description;
      } catch (err) {
        // Event may have been deleted directly in Calendar by a team
        // member — fall through and create a fresh one rather than fail.
        logToFile("INFO", "Existing Calendar event not found, creating a new one", { eventId });
        eventId = null;
      }
    }

    const requestBody = {
      summary,
      description: buildManagedDescription([style.label, ...systemNotes], existingDescription),
      location: location || undefined,
      colorId: style.colorId,
      transparency: style.transparency,
      start: { dateTime: toRfc3339(startsAt), timeZone: CALENDAR_TIMEZONE },
      end: { dateTime: toRfc3339(endsAt), timeZone: CALENDAR_TIMEZONE },
    };

    if (eventId) {
      await calendar.events.patch({ calendarId: process.env.GOOGLE_CALENDAR_ID, eventId, requestBody });
      return eventId;
    }
    const res = await calendar.events.insert({ calendarId: process.env.GOOGLE_CALENDAR_ID, requestBody });
    return res.data.id;
  } catch (err) {
    logToFile("ERROR", "Google Calendar event upsert failed", { eventId, error: err.message });
    return null;
  }
}

// Used only when a slot itself is deleted (not just cancelled/reopened —
// see upsertSlotEvent for the book/cancel/rebook cycle, which flips styling
// on the same event instead of deleting it).
export async function deleteCalendarEvent(eventId) {
  const calendar = getClient();
  if (!calendar || !eventId) return;

  try {
    await calendar.events.delete({ calendarId: process.env.GOOGLE_CALENDAR_ID, eventId });
  } catch (err) {
    logToFile("ERROR", "Google Calendar event deletion failed", { eventId, error: err.message });
  }
}
