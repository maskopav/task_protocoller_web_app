// src/components/Booking/BookingStep.jsx — the last synthetic step in
// runtimeTasks when protocolData.enable_followup_booking is on (see
// ParticipantInterfacePage.jsx). Embeds booking-service's own hosted
// booking page in an iframe. booking-service posts a `{ source:
// "booking-service", status: "completed" }` message (see book.js's
// notifyParentCompleted) once a booking is confirmed, a no-slot request is
// sent, or the participant already had a booking -- Continue only appears
// once that lands, so there's no way to advance without actually reaching
// one of those outcomes inside the widget.
import React, { useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { getBookingLink } from "../../api/booking";
import { markSessionCompleted } from "../../api/sessions";
import "./BookingStep.css";

export default function BookingStep({ sessionId, onComplete, testingMode = false }) {
  const { t, i18n } = useTranslation("common");
  const [bookingUrl, setBookingUrl] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(!testingMode);
  const [completed, setCompleted] = useState(false);
  // Mirrors book.js's own nextBtn state -- that button is hidden inside the
  // iframe (see book.html) and this is rendered instead, in a fixed footer
  // outside the iframe's box, so it stays visible while a tall slot list
  // scrolls inside the iframe.
  const [nextState, setNextState] = useState({ visible: false, enabled: false, label: "" });
  // Reported by book.js's own ResizeObserver once the confirmation screens
  // are showing, so the compact iframe (see .booking-step-iframe--compact)
  // can size itself to the actual content instead of a guessed fixed
  // height that would clip a long, localized address.
  const [contentHeight, setContentHeight] = useState(null);
  const iframeRef = useRef(null);

  useEffect(() => {
    // Testing mode has no real sessionId (protocol is only being previewed,
    // not run through protocolManager), and must never mark a session
    // completed or mint a real booking-service link — see BookingStep's
    // testing-mode branch below for the view-only placeholder shown instead.
    if (testingMode) return;

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
  }, [sessionId, i18n.language, testingMode]);

  useEffect(() => {
    if (!bookingUrl) return;
    const expectedOrigin = new URL(bookingUrl).origin;

    function handleMessage(event) {
      if (event.origin !== expectedOrigin) return;
      if (event.data?.source !== "booking-service") return;
      if (event.data.status === "completed") {
        setCompleted(true);
      } else if (event.data.type === "next-state") {
        setNextState({
          visible: !!event.data.visible,
          enabled: !!event.data.enabled,
          label: event.data.label || "",
        });
      } else if (event.data.type === "height") {
        setContentHeight(event.data.height);
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [bookingUrl]);

  function handleNextClick() {
    if (!nextState.enabled || !bookingUrl) return;
    iframeRef.current?.contentWindow?.postMessage(
      { source: "task-protocoller", type: "next-click" },
      new URL(bookingUrl).origin
    );
  }

  const showNextBar = !testingMode && !completed && nextState.visible;

  return (
    <div className={`booking-step${showNextBar ? " has-next-bar" : ""}`}>
      {!completed && (
        <>
          <h2 className="booking-step-heading">{t("booking.heading")}</h2>
        </>
      )}

      {testingMode ? (
        <div className="booking-step-preview" role="img" aria-label={t("booking.testingPreviewLabel")}>
          <span className="booking-step-preview-badge">{t("booking.testingPreviewBadge")}</span>
          <p className="booking-step-preview-note">{t("booking.testingPreviewLabel")}</p>
        </div>
      ) : (
        <>
          {loading && <p className="booking-step-loading">{t("booking.loading")}</p>}
          {error && <p className="booking-step-error">{t("booking.errorLoading")}</p>}

          {bookingUrl && (
            <iframe
              ref={iframeRef}
              src={bookingUrl}
              className={`booking-step-iframe${completed ? " booking-step-iframe--compact" : ""}`}
              style={completed && contentHeight ? { height: `${contentHeight}px` } : undefined}
              title="Appointment scheduling"
            />
          )}
        </>
      )}

      {(testingMode || completed) && (
        <button className="booking-step-continue" onClick={onComplete}>
          {t("booking.continueButton")}
        </button>
      )}

      {showNextBar && (
        <div className="booking-step-next-bar">
          <button
            className="booking-step-next-btn"
            disabled={!nextState.enabled}
            onClick={handleNextClick}
          >
            {nextState.label}
          </button>
        </div>
      )}
    </div>
  );
}
