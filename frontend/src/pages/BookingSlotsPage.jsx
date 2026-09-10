import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import DashboardTopBar from "../components/DashboardTopBar/DashboardTopBar";
import { bulkCreateSlots, fetchSlots, deleteSlot, fetchBookings, downloadBookingsCsv } from "../api/adminBooking";
import "./Pages.css";
import "./BookingSlotsPage.css";

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun, matching Date.getDay()

// Locale-aware short weekday label, e.g. "Mon"/"po" -- 2023-01-01 was a
// Sunday (value 0), so value days after it lands on the matching weekday.
function weekdayLabel(value, locale) {
  return new Date(Date.UTC(2023, 0, 1 + value)).toLocaleDateString(locale, {
    weekday: "short", timeZone: "UTC",
  });
}

// slots.starts_at/ends_at are naive local wall-clock time (the room's own
// clock, per booking-service's documented convention) — display as-is, no
// timezone conversion.
function formatLocalDateTime(value) {
  if (!value) return "—";
  const d = new Date(String(value).replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

// bookings.created_at is a real UTC instant (DB default CURRENT_TIMESTAMP
// under booking-service's UTC session timezone) — unlike starts_at/ends_at,
// this one does need converting to the viewer's own local time to display
// correctly.
function formatUtcDateTime(value) {
  if (!value) return "—";
  const d = new Date(`${String(value).replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

export default function BookingSlotsPage() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation("admin");

  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    startDate: today, endDate: today, weekdays: [1, 2, 3, 4, 5],
    startTime: "09:00", endTime: "16:00", durationMin: 45, location: "",
  });
  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState(null);
  const [formError, setFormError] = useState(null);

  const [slots, setSlots] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [slotsData, bookingsData] = await Promise.all([
        fetchSlots({ activeOnly: true }),
        fetchBookings(),
      ]);
      setSlots(slotsData.slots);
      setBookings(bookingsData.bookings);
    } catch (err) {
      setError(err.message || t("bookingSlotsPage.loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const toggleWeekday = (value) => {
    setForm((prev) => ({
      ...prev,
      weekdays: prev.weekdays.includes(value)
        ? prev.weekdays.filter((d) => d !== value)
        : [...prev.weekdays, value].sort(),
    }));
  };

  const handleGenerate = async (e) => {
    e.preventDefault();
    setCreating(true);
    setFormError(null);
    setCreateResult(null);
    try {
      const result = await bulkCreateSlots({ ...form, durationMin: Number(form.durationMin), location: form.location || undefined });
      setCreateResult(result);
      await load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteSlot = async (slotId) => {
    try {
      await deleteSlot(slotId);
      await load();
    } catch (err) {
      setError(err.message || t("bookingSlotsPage.deleteError"));
    }
  };

  return (
    <div className="dashboard-page">
      <DashboardTopBar onBack={() => navigate("/admin")} />

      <div className="page-header">
        <h1 className="page-title">{t("bookingSlotsPage.title")}</h1>
        <p className="project-description">{t("bookingSlotsPage.description")}</p>
      </div>

      {error && <p className="bs-error">{error}</p>}

      <section className="bs-section">
        <h2 className="bs-section-heading">{t("bookingSlotsPage.generateHeading")}</h2>
        <form className="bs-generate-form" onSubmit={handleGenerate}>
          <label className="bs-field">
            {t("bookingSlotsPage.startDate")}
            <input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} required />
          </label>
          <label className="bs-field">
            {t("bookingSlotsPage.endDate")}
            <input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} required />
          </label>
          <label className="bs-field">
            {t("bookingSlotsPage.startTime")}
            <input type="time" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} required />
          </label>
          <label className="bs-field">
            {t("bookingSlotsPage.endTime")}
            <input type="time" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} required />
          </label>
          <label className="bs-field">
            {t("bookingSlotsPage.duration")}
            <input type="number" min="5" step="5" value={form.durationMin} onChange={(e) => setForm((f) => ({ ...f, durationMin: e.target.value }))} required />
          </label>
          <label className="bs-field">
            {t("bookingSlotsPage.location")}
            <input type="text" value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} placeholder={t("bookingSlotsPage.locationPlaceholder")} />
          </label>

          <div className="bs-field bs-weekdays">
            {t("bookingSlotsPage.weekdays")}
            <div className="bs-weekday-checks">
              {WEEKDAYS.map((value) => (
                <label key={value} className="bs-weekday-check">
                  <input type="checkbox" checked={form.weekdays.includes(value)} onChange={() => toggleWeekday(value)} />
                  {weekdayLabel(value, i18n.language)}
                </label>
              ))}
            </div>
          </div>

          <button type="submit" disabled={creating || form.weekdays.length === 0}>
            {creating ? t("bookingSlotsPage.generatingButton") : t("bookingSlotsPage.generateButton")}
          </button>
        </form>

        {formError && <p className="bs-error">{formError}</p>}
        {createResult && (
          <p className="bs-notice">
            {t("bookingSlotsPage.createdNotice", { count: createResult.created })}
            {createResult.skipped > 0 && ` ${t("bookingSlotsPage.skippedNote", { count: createResult.skipped })}`}
          </p>
        )}
      </section>

      <section className="bs-section">
        <div className="bs-section-header-row">
          <h2 className="bs-section-heading">{t("bookingSlotsPage.upcomingSlotsHeading", { count: slots.length })}</h2>
        </div>
        <div className="bs-table-wrapper">
          {!loading && slots.length === 0 && <p className="bs-empty">{t("bookingSlotsPage.noSlots")}</p>}
          {slots.length > 0 && (
            <table className="bs-table">
              <thead>
                <tr>
                  <th>{t("bookingSlotsPage.colStarts")}</th>
                  <th>{t("bookingSlotsPage.colEnds")}</th>
                  <th>{t("bookingSlotsPage.colLocation")}</th>
                  <th>{t("bookingSlotsPage.colStatus")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {slots.map((s) => (
                  <tr key={s.id}>
                    <td>{formatLocalDateTime(s.starts_at)}</td>
                    <td>{formatLocalDateTime(s.ends_at)}</td>
                    <td>{s.location || "—"}</td>
                    <td>{s.booking_status ? t("bookingSlotsPage.statusBooked") : t("bookingSlotsPage.statusOpen")}</td>
                    <td>
                      {!s.booking_status && (
                        <button type="button" className="bs-btn-link" onClick={() => handleDeleteSlot(s.id)}>
                          {t("bookingSlotsPage.deleteAction")}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="bs-section">
        <div className="bs-section-header-row">
          <h2 className="bs-section-heading">{t("bookingSlotsPage.reservationsHeading", { count: bookings.length })}</h2>
          <button type="button" className="bs-btn-secondary" disabled={bookings.length === 0} onClick={() => downloadBookingsCsv().catch((err) => setError(err.message))}>
            {t("bookingSlotsPage.exportCsv")}
          </button>
        </div>
        <div className="bs-table-wrapper">
          {!loading && bookings.length === 0 && <p className="bs-empty">{t("bookingSlotsPage.noReservations")}</p>}
          {bookings.length > 0 && (
            <table className="bs-table">
              <thead>
                <tr>
                  <th>{t("bookingSlotsPage.colWhen")}</th>
                  <th>{t("bookingSlotsPage.colEmail")}</th>
                  <th>{t("bookingSlotsPage.colPhone")}</th>
                  <th>{t("bookingSlotsPage.colStatus")}</th>
                  <th>{t("bookingSlotsPage.colBookedAt")}</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => (
                  <tr key={b.id}>
                    <td>{formatLocalDateTime(b.starts_at)}</td>
                    <td>{b.contact_email}</td>
                    <td>{b.contact_phone}</td>
                    <td>{b.status}</td>
                    <td>{formatUtcDateTime(b.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
