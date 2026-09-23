// public/i18n.js — plain-JS translations for the hosted book/manage pages.
// No build step here (see server.js's comment on public/), so this can't
// share code with src/i18n/emailTranslations.js across the Node/browser
// boundary — the locale set (en/cs/de) is deliberately kept identical to
// that file by convention; update both together.
//
// Locale is resolved once per page load: an explicit ?lang= query param
// (the calling app can set this from the participant's known language)
// wins, falling back to the browser's own language, falling back to "en".
(function () {
  const TRANSLATIONS = {
    en: {
      studyIntro: "This visit is the second part of the neuroSHARE study and takes place at ČVUT in Prague-Dejvice.",
      loadingSlots: "Loading available times…",
      noSlots: "No times are available right now — please check back later.",
      invalidLink: "This booking link is invalid or has expired.",
      emailLabel: "Email",
      phoneLabel: "Phone",
      knownContactNotice: (email) => `We'll use the contact details you already gave us (${email}).`,
      nextButton: "Next",
      confirmingButton: "Booking…",
      invalidEmail: "Please enter a valid email address.",
      invalidPhone: "Please enter a valid phone number.",
      bookingFailed: "Booking failed",
      bookedHeading: "You're booked",
      bookedNotice: "Check your email for a link to reschedule or cancel.",
      whenLabel: "When:",
      whereLabel: "Where:",
      noSlotToggle: "None of these times work for me",
      preferredTimesLabel: "When would work for you?",
      sendingButton: "Sending…",
      noSlotFailed: "Failed to send",
      noSlotConfirmedHeading: "Thanks — we'll be in touch",
      noSlotConfirmedNotice: "We'll contact you to schedule a time.",
      manageHeading: "Manage your appointment",
      manageLoading: "Loading…",
      bookingNotFound: "Booking not found",
      cancelledNotice: "This appointment has been cancelled.",
      cutoffNotice: "This appointment is less than a day away, so it can no longer be changed online here — please contact us directly.",
      rescheduleButton: "Reschedule",
      cancelButton: "Cancel appointment",
      noOtherSlots: "No other times are available right now.",
      loadSlotsFailed: "Failed to load available times",
      rescheduleFailed: "Failed to reschedule",
      rescheduledNotice: "Rescheduled. A confirmation email is on its way.",
      confirmCancelPrompt: "Cancel this appointment?",
      cancelFailed: "Failed to cancel",
      cancelledDone: "Your appointment has been cancelled.",
      slotNotAvailable: "This time is no longer available. Please choose another.",
      slotAlreadyBooked: "This time was just booked by someone else. Please choose another.",
      activeBookingExists: "You already have an active appointment. Use the link in your confirmation email to reschedule or cancel it first.",
      missingFields: "Email and phone are required.",
    },
    cs: {
      studyIntro: "Tato návštěva je druhou částí studie neuroSHARE a proběhne na ČVUT v Praze-Dejvicích.",
      loadingSlots: "Načítání dostupných termínů…",
      noSlots: "Momentálně nejsou k dispozici žádné termíny — zkuste to prosím později.",
      invalidLink: "Tento odkaz na rezervaci je neplatný nebo vypršel.",
      emailLabel: "E-mail",
      phoneLabel: "Telefon",
      knownContactNotice: (email) => `Použijeme kontaktní údaje, které jste nám již poskytli (${email}).`,
      nextButton: "Další",
      confirmingButton: "Rezervuji…",
      invalidEmail: "Zadejte prosím platnou e-mailovou adresu.",
      invalidPhone: "Zadejte prosím platné telefonní číslo.",
      bookingFailed: "Rezervace se nezdařila",
      bookedHeading: "Termín je rezervován",
      bookedNotice: "Potvrzovací email je na cestě. Odkaz pro přeložení nebo zrušení najdete v e-mailu.",
      whenLabel: "Kdy:",
      whereLabel: "Kde:",
      noSlotToggle: "Žádný z těchto termínů mi nevyhovuje",
      preferredTimesLabel: "Kdy by se vám to hodilo?",
      sendingButton: "Odesílám…",
      noSlotFailed: "Odeslání se nezdařilo",
      noSlotConfirmedHeading: "Děkujeme — ozveme se vám",
      noSlotConfirmedNotice: "Ozveme se vám a domluvíme vhodný termín.",
      manageHeading: "Správa termínu",
      manageLoading: "Načítání…",
      bookingNotFound: "Rezervace nebyla nalezena",
      cancelledNotice: "Tento termín byl zrušen.",
      cutoffNotice: "Do tohoto termínu zbývá méně než den, proto už jej zde online nelze změnit — kontaktujte prosím agenturu.",
      rescheduleButton: "Přeložit termín",
      cancelButton: "Zrušit termín",
      noOtherSlots: "Momentálně nejsou k dispozici žádné jiné termíny.",
      loadSlotsFailed: "Nepodařilo se načíst dostupné termíny",
      rescheduleFailed: "Přeložení termínu se nezdařilo",
      rescheduledNotice: "Termín přeložen. Potvrzovací e-mail je na cestě.",
      confirmCancelPrompt: "Zrušit tento termín?",
      cancelFailed: "Zrušení se nezdařilo",
      cancelledDone: "Váš termín byl zrušen.",
      slotNotAvailable: "Tento termín již není k dispozici. Vyberte prosím jiný.",
      slotAlreadyBooked: "Tento termín si právě rezervoval někdo jiný. Vyberte prosím jiný.",
      activeBookingExists: "Již máte aktivní rezervaci. Pro její přeložení nebo zrušení použijte odkaz z potvrzovacího e-mailu.",
      missingFields: "E-mail a telefon jsou povinné údaje.",
    },
    de: {
      studyIntro: "Dieser Termin ist der zweite Teil der neuroSHARE-Studie und findet an der ČVUT in Prag-Dejvice statt.",
      loadingSlots: "Verfügbare Termine werden geladen…",
      noSlots: "Derzeit sind keine Termine verfügbar — bitte später erneut versuchen.",
      invalidLink: "Dieser Buchungslink ist ungültig oder abgelaufen.",
      emailLabel: "E-Mail",
      phoneLabel: "Telefon",
      knownContactNotice: (email) => `Wir verwenden die Kontaktdaten, die Sie uns bereits gegeben haben (${email}).`,
      nextButton: "Weiter",
      confirmingButton: "Wird gebucht…",
      invalidEmail: "Bitte geben Sie eine gültige E-Mail-Adresse ein.",
      invalidPhone: "Bitte geben Sie eine gültige Telefonnummer ein.",
      bookingFailed: "Buchung fehlgeschlagen",
      bookedHeading: "Termin gebucht",
      bookedNotice: "Den Link zum Verschieben oder Stornieren finden Sie in Ihrer E-Mail.",
      whenLabel: "Wann:",
      whereLabel: "Wo:",
      noSlotToggle: "Keiner dieser Termine passt mir",
      preferredTimesLabel: "Wann würde es Ihnen passen?",
      sendingButton: "Wird gesendet…",
      noSlotFailed: "Senden fehlgeschlagen",
      noSlotConfirmedHeading: "Danke — wir melden uns",
      noSlotConfirmedNotice: "Wir melden uns, um einen Termin zu vereinbaren.",
      manageHeading: "Termin verwalten",
      manageLoading: "Wird geladen…",
      bookingNotFound: "Termin nicht gefunden",
      cancelledNotice: "Dieser Termin wurde storniert.",
      cutoffNotice: "Dieser Termin liegt weniger als einen Tag entfernt und kann hier online nicht mehr geändert werden — bitte kontaktieren Sie uns direkt.",
      rescheduleButton: "Verschieben",
      cancelButton: "Termin stornieren",
      noOtherSlots: "Derzeit sind keine anderen Termine verfügbar.",
      loadSlotsFailed: "Verfügbare Termine konnten nicht geladen werden",
      rescheduleFailed: "Verschieben fehlgeschlagen",
      rescheduledNotice: "Verschoben. Eine Bestätigungs-E-Mail ist unterwegs.",
      confirmCancelPrompt: "Diesen Termin stornieren?",
      cancelFailed: "Stornierung fehlgeschlagen",
      cancelledDone: "Ihr Termin wurde storniert.",
      slotNotAvailable: "Dieser Termin ist nicht mehr verfügbar. Bitte wählen Sie einen anderen.",
      slotAlreadyBooked: "Dieser Termin wurde soeben von jemand anderem gebucht. Bitte wählen Sie einen anderen.",
      activeBookingExists: "Sie haben bereits einen aktiven Termin. Verwenden Sie den Link in Ihrer Bestätigungs-E-Mail, um ihn zu verschieben oder zu stornieren.",
      missingFields: "E-Mail und Telefon sind erforderlich.",
    },
  };

  // Maps the stable `code` a booking-service API error response carries
  // (see src/utils/httpErrors.js) to a translation key here — lets the UI
  // show a localized message instead of the English-only `error` string,
  // which is meant for logs/admins, not respondents. An unrecognized or
  // missing code falls back to the caller's own generic message key.
  const ERROR_CODE_KEYS = {
    MISSING_LINK_PARAMS: "invalidLink",
    INVALID_LINK: "invalidLink",
    INVALID_OR_EXPIRED_LINK: "invalidLink",
    UNKNOWN_RESOURCE: "invalidLink",
    INVALID_EMAIL: "invalidEmail",
    INVALID_PHONE: "invalidPhone",
    MISSING_CONTACT_FIELDS: "missingFields",
    MISSING_REQUIRED_FIELDS: "missingFields",
    SLOT_NOT_AVAILABLE: "slotNotAvailable",
    SLOT_ALREADY_BOOKED: "slotAlreadyBooked",
    SLOT_BEFORE_ELIGIBLE: "slotNotAvailable",
    ACTIVE_BOOKING_EXISTS: "activeBookingExists",
    BOOKING_NOT_FOUND: "bookingNotFound",
    RESCHEDULE_CUTOFF: "cutoffNotice",
    CANCEL_CUTOFF: "cutoffNotice",
  };

  function resolveLocale() {
    const requested = new URLSearchParams(window.location.search).get("lang");
    if (requested && TRANSLATIONS[requested]) return requested;
    const browserLang = (navigator.language || "en").split("-")[0];
    return TRANSLATIONS[browserLang] ? browserLang : "en";
  }

  const locale = resolveLocale();

  window.bookingI18n = {
    locale,
    t(key, ...args) {
      const entry = TRANSLATIONS[locale][key] ?? TRANSLATIONS.en[key];
      if (entry === undefined) return key;
      return typeof entry === "function" ? entry(...args) : entry;
    },
    // Translates an API error response body (`{ error, code }` — see
    // src/utils/httpErrors.js): `error` itself is English-only and never
    // shown as-is. `fallbackKey` covers a response with no `code` at all
    // (a thrown error the server didn't tag) or one this table doesn't
    // recognize yet.
    tForApiError(data, fallbackKey) {
      const key = (data && ERROR_CODE_KEYS[data.code]) || fallbackKey;
      return this.t(key);
    },
  };
})();
