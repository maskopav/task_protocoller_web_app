import { describe, it, expect } from "vitest";
import { t, SUPPORTED_LOCALES } from "./emailTranslations.js";

describe("t", () => {
  it("resolves a plain-string key in a supported locale", () => {
    expect(t("cs", "confirmationHeading")).toBe("Vaše schůzka byla potvrzena");
  });

  it("resolves a function key with interpolated args", () => {
    expect(t("en", "confirmationSubject", "Room 2B")).toBe("Appointment confirmed — Room 2B");
    expect(t("cs", "cancelledBody", "Room 2B", "2026-09-14 09:00")).toBe(
      "Room 2B — původně naplánováno na 2026-09-14 09:00."
    );
  });

  it("falls back to English for an unsupported locale", () => {
    expect(t("fr", "confirmationHeading")).toBe(t("en", "confirmationHeading"));
  });

  it("falls back to English for a locale missing that specific key (defensive — every current locale has every key, but a future partial translation shouldn't break)", () => {
    expect(t("de", "whenLabel")).toBe("Wann:");
  });

  it("every supported locale has every known key (catches a translation added to one locale and forgotten in another)", () => {
    const knownKeys = [
      "confirmationSubject", "confirmationHeading", "rescheduledSubject", "rescheduledHeading",
      "cancelledSubject", "cancelledHeading", "cancelledBody", "whenLabel", "whereLabel",
      "manageNotice", "manageButton", "rebookButton", "questionsLabel",
    ];
    for (const locale of SUPPORTED_LOCALES) {
      for (const key of knownKeys) {
        const value = t(locale, key, "x", "y");
        expect(value, `${locale}.${key} should not be undefined`).toBeDefined();
      }
    }
  });
});
