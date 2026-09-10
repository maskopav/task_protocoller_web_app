// src/i18n/emailTranslations.js — server-side copy for the three booking
// emails. Deliberately a plain object, not i18next: booking-service stays
// dependency-light on purpose (see README), and this is a handful of short
// strings, not a full translation pipeline. Add a locale by adding a key
// here; t() falls back to "en" for an unknown locale or a missing key, so a
// partial translation never breaks — it just shows English for what's
// missing.
const TRANSLATIONS = {
  en: {
    confirmationSubject: (r) => `Appointment confirmed — ${r}`,
    confirmationHeading: "Your appointment is confirmed",
    rescheduledSubject: (r) => `Appointment rescheduled — ${r}`,
    rescheduledHeading: "Your appointment was rescheduled",
    cancelledSubject: (r) => `Appointment cancelled — ${r}`,
    cancelledHeading: "Your appointment was cancelled",
    cancelledBody: (r, s) => `${r} — originally scheduled for ${s}.`,
    whenLabel: "When:",
    whereLabel: "Where:",
    manageNotice: "Need to change it? You can reschedule or cancel up to one day before your appointment:",
    manageButton: "Manage my appointment",
    rebookButton: "Book a new appointment",
    questionsLabel: "Questions?",
  },
  cs: {
    confirmationSubject: (r) => `Schůzka potvrzena — ${r}`,
    confirmationHeading: "Vaše schůzka byla potvrzena",
    rescheduledSubject: (r) => `Schůzka přeložena — ${r}`,
    rescheduledHeading: "Vaše schůzka byla přeložena",
    cancelledSubject: (r) => `Schůzka zrušena — ${r}`,
    cancelledHeading: "Vaše schůzka byla zrušena",
    cancelledBody: (r, s) => `${r} — původně naplánováno na ${s}.`,
    whenLabel: "Kdy:",
    whereLabel: "Kde:",
    manageNotice: "Potřebujete termín změnit? Schůzku můžete přeložit nebo zrušit nejpozději jeden den předem:",
    manageButton: "Spravovat schůzku",
    rebookButton: "Objednat nový termín",
    questionsLabel: "Máte dotaz?",
  },
  de: {
    confirmationSubject: (r) => `Termin bestätigt — ${r}`,
    confirmationHeading: "Ihr Termin wurde bestätigt",
    rescheduledSubject: (r) => `Termin verschoben — ${r}`,
    rescheduledHeading: "Ihr Termin wurde verschoben",
    cancelledSubject: (r) => `Termin storniert — ${r}`,
    cancelledHeading: "Ihr Termin wurde storniert",
    cancelledBody: (r, s) => `${r} — ursprünglich geplant für ${s}.`,
    whenLabel: "Wann:",
    whereLabel: "Wo:",
    manageNotice: "Möchten Sie etwas ändern? Sie können den Termin bis einen Tag vorher verschieben oder stornieren:",
    manageButton: "Termin verwalten",
    rebookButton: "Neuen Termin buchen",
    questionsLabel: "Fragen?",
  },
};

export function t(locale, key, ...args) {
  const dict = TRANSLATIONS[locale] || TRANSLATIONS.en;
  const entry = dict[key] ?? TRANSLATIONS.en[key];
  if (entry === undefined) return key; // missing key entirely — surface it rather than silently rendering blank
  return typeof entry === "function" ? entry(...args) : entry;
}

export const SUPPORTED_LOCALES = Object.keys(TRANSLATIONS);
