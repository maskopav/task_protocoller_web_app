// src/i18n/emailTranslations.js — server-side copy for the three booking
// emails. Deliberately a plain object, not i18next: booking-service stays
// dependency-light on purpose (see README), and this is a handful of short
// strings, not a full translation pipeline. Add a locale by adding a key
// here; t() falls back to "en" for an unknown locale or a missing key, so a
// partial translation never breaks — it just shows English for what's
// missing.
const TRANSLATIONS = {
  en: {
    confirmationSubject: "Appointment confirmed",
    confirmationHeading: "Your appointment is confirmed",
    rescheduledSubject: "Appointment rescheduled",
    rescheduledHeading: "Your appointment was rescheduled",
    cancelledSubject: "Appointment cancelled",
    cancelledHeading: "Your appointment was cancelled",
    cancelledBody: (s) => `Originally scheduled for ${s}.`,
    whenLabel: "When:",
    whereLabel: "Where:",
    manageNotice: "Need to change it? You can reschedule or cancel up to one day before your appointment:",
    manageButton: "Manage my appointment",
    rebookButton: "Book a new appointment",
    questionsLabel: "Questions?",
    noSlotSubject: "We received your message",
    noSlotHeading: "Thanks for letting us know",
    noSlotBody: "We've noted that none of the currently offered times work for you. We'll be in touch soon to find a suitable time.",
    noSlotLinkButton: "Check available times",
  },
  cs: {
    confirmationSubject: "Termín návštěvy potvrzen",
    confirmationHeading: "Vaše návštěva byla potvrzena",
    rescheduledSubject: "Termín návštěvy přeložen",
    rescheduledHeading: "Vaše návštěva byla přeložena",
    cancelledSubject: "Termín návštěvy zrušen",
    cancelledHeading: "Vaše návštěva byla zrušena",
    cancelledBody: (s) => `Původně naplánováno na ${s}.`,
    whenLabel: "Kdy:",
    whereLabel: "Kde:",
    manageNotice: "Potřebujete termín změnit? Návštěvu můžete přeložit nebo zrušit nejpozději jeden den předem:",
    manageButton: "Spravovat termín návštěvy",
    rebookButton: "Objednat nový termín návštěvy",
    questionsLabel: "Máte dotaz?",
    noSlotSubject: "Obdrželi jsme váš vzkaz",
    noSlotHeading: "Děkujeme za informaci",
    noSlotBody: "Zaznamenali jsme, že vám nevyhovuje žádný z aktuálně nabízených termínů. Brzy se vám ozveme, abychom našli vhodný termín.",
    noSlotLinkButton: "Zobrazit dostupné termíny",
  },
  de: {
    confirmationSubject: "Termin bestätigt",
    confirmationHeading: "Ihr Termin wurde bestätigt",
    rescheduledSubject: "Termin verschoben",
    rescheduledHeading: "Ihr Termin wurde verschoben",
    cancelledSubject: "Termin storniert",
    cancelledHeading: "Ihr Termin wurde storniert",
    cancelledBody: (s) => `Ursprünglich geplant für ${s}.`,
    whenLabel: "Wann:",
    whereLabel: "Wo:",
    manageNotice: "Möchten Sie etwas ändern? Sie können den Termin bis einen Tag vorher verschieben oder stornieren:",
    manageButton: "Termin verwalten",
    rebookButton: "Neuen Termin buchen",
    questionsLabel: "Fragen?",
    noSlotSubject: "Wir haben Ihre Nachricht erhalten",
    noSlotHeading: "Danke für Ihre Rückmeldung",
    noSlotBody: "Wir haben notiert, dass keiner der aktuell angebotenen Termine für Sie passt. Wir melden uns bald, um einen passenden Termin zu finden.",
    noSlotLinkButton: "Verfügbare Termine ansehen",
  },
};

export function t(locale, key, ...args) {
  const dict = TRANSLATIONS[locale] || TRANSLATIONS.en;
  const entry = dict[key] ?? TRANSLATIONS.en[key];
  if (entry === undefined) return key; // missing key entirely — surface it rather than silently rendering blank
  return typeof entry === "function" ? entry(...args) : entry;
}

export const SUPPORTED_LOCALES = Object.keys(TRANSLATIONS);
