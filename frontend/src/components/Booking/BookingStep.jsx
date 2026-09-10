// src/components/Booking/BookingStep.jsx — the last synthetic step in
// runtimeTasks when protocolData.enable_followup_booking is on (see
// ParticipantInterfacePage.jsx). Embeds booking-service's own hosted
// booking page in an iframe -- there's no postMessage handshake between
// this app and booking-service, so completion isn't auto-detected; the
// participant clicks Continue themselves when done (or if they'd rather
// skip and be followed up by email instead).
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getBookingLink } from "../../api/booking";
import { markSessionCompleted } from "../../api/sessions";
import "./BookingStep.css";

export default function BookingStep({ sessionId, onComplete }) {
  const { t, i18n } = useTranslation("common");
  const [bookingUrl, setBookingUrl] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        // Booking-service's eligibility gate requires sessions.completed_at
        // to already be set (GET /sessions/:id/booking-link 409s otherwise).
        // markSessionCompleted (not trackProgress, which is fire-and-forget
        // and doesn't return its request promise) genuinely waits for that
        // write to land before the link fetch below runs — and must live
        // here, not in a sibling effect on the parent: React fires a
        // child's own effects before its parent's, so a separate effect on
        // ParticipantInterfacePage would race this fetch and could lose.
        await markSessionCompleted(sessionId);
        const data = await getBookingLink(sessionId, i18n.language);
        if (!cancelled) setBookingUrl(data.bookingUrl);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionId, i18n.language]);

  return (
    <div className="booking-step">
      <h2 className="booking-step-heading">{t("booking.heading")}</h2>
      <p className="booking-step-instructions">{t("booking.instructions")}</p>

      {loading && <p className="booking-step-loading">{t("booking.loading")}</p>}
      {error && <p className="booking-step-error">{t("booking.errorLoading")}</p>}

      {bookingUrl && (
        <iframe
          src={bookingUrl}
          className="booking-step-iframe"
          title="Appointment scheduling"
        />
      )}

      <button className="booking-step-continue" onClick={onComplete}>
        {t("booking.continueButton")}
      </button>
    </div>
  );
}
