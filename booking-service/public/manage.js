(function () {
  const t = window.bookingI18n.t;
  const locale = window.bookingI18n.locale;

  const token = window.location.pathname.split("/").filter(Boolean).pop();

  const loading = document.getElementById("loading");
  const errorBox = document.getElementById("errorBox");
  const currentCard = document.getElementById("currentCard");
  const currentSummary = document.getElementById("currentSummary");
  const cutoffNotice = document.getElementById("cutoffNotice");
  const actions = document.getElementById("actions");
  const rescheduleStep = document.getElementById("rescheduleStep");
  const rescheduleList = document.getElementById("rescheduleList");
  const doneCard = document.getElementById("doneCard");
  const doneMessage = document.getElementById("doneMessage");
  const rescheduleBtn = document.getElementById("rescheduleBtn");
  const cancelBtn = document.getElementById("cancelBtn");

  document.documentElement.lang = locale;
  document.getElementById("pageHeading").textContent = t("manageHeading");
  loading.textContent = t("manageLoading");
  cutoffNotice.textContent = t("cutoffNotice");
  rescheduleBtn.textContent = t("rescheduleButton");
  cancelBtn.textContent = t("cancelButton");

  function showError(message) {
    loading.classList.add("hidden");
    errorBox.textContent = message;
    errorBox.classList.remove("hidden");
  }

  function formatSlotTime(startsAt) {
    const [date, time] = startsAt.split(" ");
    return { date, time: time.slice(0, 5) };
  }

  // Client-side only — a UX hint to hide the buttons early. The server is
  // the real authority and re-checks this on every reschedule/cancel call.
  function isPastCutoffClientSide(startsAt) {
    const slotDate = new Date(startsAt.replace(" ", "T"));
    const cutoff = new Date(slotDate.getTime() - 24 * 60 * 60 * 1000);
    return new Date() > cutoff;
  }

  function showDone(message) {
    currentCard.classList.add("hidden");
    rescheduleStep.classList.add("hidden");
    doneMessage.textContent = message;
    doneCard.classList.remove("hidden");
  }

  async function loadBooking() {
    try {
      const res = await fetch(`public/bookings/manage/${encodeURIComponent(token)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("bookingNotFound"));

      loading.classList.add("hidden");
      const booking = data.booking;

      if (booking.status === "cancelled") {
        showDone(t("cancelledNotice"));
        return;
      }

      const { date, time } = formatSlotTime(booking.starts_at);
      currentSummary.innerHTML = `<strong>${booking.resource_name}</strong><br/>${date} at ${time}${booking.location ? ` — ${booking.location}` : ""}`;
      currentCard.classList.remove("hidden");

      if (isPastCutoffClientSide(booking.starts_at)) {
        cutoffNotice.classList.remove("hidden");
      } else {
        actions.classList.remove("hidden");
      }
    } catch (err) {
      showError(err.message);
    }
  }

  async function loadRescheduleSlots() {
    rescheduleStep.classList.remove("hidden");
    rescheduleList.innerHTML = `<p>${t("loadingSlots")}</p>`;

    const res = await fetch(`public/bookings/manage/${encodeURIComponent(token)}/available-slots`);
    const data = await res.json();
    if (!res.ok) {
      rescheduleList.innerHTML = `<p class="error">${data.error || t("loadSlotsFailed")}</p>`;
      return;
    }

    if (data.slots.length === 0) {
      rescheduleList.innerHTML = `<p class="notice">${t("noOtherSlots")}</p>`;
      return;
    }

    const byDay = {};
    for (const slot of data.slots) {
      const { date } = formatSlotTime(slot.starts_at);
      (byDay[date] = byDay[date] || []).push(slot);
    }

    rescheduleList.innerHTML = "";
    for (const date of Object.keys(byDay).sort()) {
      const group = document.createElement("div");
      group.className = "day-group";
      const heading = document.createElement("div");
      heading.className = "day-heading";
      heading.textContent = new Date(`${date}T00:00:00`).toLocaleDateString(locale, {
        weekday: "long", year: "numeric", month: "long", day: "numeric",
      });
      group.appendChild(heading);

      const grid = document.createElement("div");
      grid.className = "slot-grid";
      for (const slot of byDay[date]) {
        const { time } = formatSlotTime(slot.starts_at);
        const btn = document.createElement("button");
        btn.className = "slot-btn";
        btn.textContent = time;
        btn.addEventListener("click", () => submitReschedule(slot.id, btn));
        grid.appendChild(btn);
      }
      group.appendChild(grid);
      rescheduleList.appendChild(group);
    }
  }

  async function submitReschedule(newSlotId, btn) {
    // Immediate feedback before the network round-trip — without this the
    // click looked like nothing happened while the request was pending.
    document.querySelectorAll(".slot-btn").forEach((el) => { el.disabled = true; });
    const originalLabel = btn.textContent;
    btn.classList.add("selected");
    btn.textContent = "…";

    try {
      const res = await fetch(`public/bookings/manage/${encodeURIComponent(token)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newSlotId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("rescheduleFailed"));

      const { date, time } = formatSlotTime(data.startsAt);
      showDone(t("rescheduledNotice", `${date} at ${time}${data.location ? ` — ${data.location}` : ""}`));
    } catch (err) {
      document.querySelectorAll(".slot-btn").forEach((el) => { el.disabled = false; });
      btn.classList.remove("selected");
      btn.textContent = originalLabel;
      rescheduleList.insertAdjacentHTML("beforeend", `<p class="error">${err.message}</p>`);
    }
  }

  async function cancelBooking() {
    if (!confirm(t("confirmCancelPrompt"))) return;
    try {
      const res = await fetch(`public/bookings/manage/${encodeURIComponent(token)}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || t("cancelFailed"));
      }
      showDone(t("cancelledDone"));
    } catch (err) {
      alert(err.message);
    }
  }

  rescheduleBtn.addEventListener("click", loadRescheduleSlots);
  cancelBtn.addEventListener("click", cancelBooking);

  loadBooking();
})();
