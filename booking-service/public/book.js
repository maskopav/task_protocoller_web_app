(function () {
  const t = window.bookingI18n.t;
  const locale = window.bookingI18n.locale;

  const slug = window.location.pathname.split("/").filter(Boolean).pop();
  const search = window.location.search; // carries tenant/ref/after/exp/sig verbatim

  const loading = document.getElementById("loading");
  const errorBox = document.getElementById("errorBox");
  const slotStep = document.getElementById("slotStep");
  const slotList = document.getElementById("slotList");
  const contactStep = document.getElementById("contactStep");
  const selectedSlotSummary = document.getElementById("selectedSlotSummary");
  const confirmedStep = document.getElementById("confirmedStep");
  const confirmedSummary = document.getElementById("confirmedSummary");
  const contactError = document.getElementById("contactError");

  document.documentElement.lang = locale;
  loading.textContent = t("loadingSlots");
  document.getElementById("emailLabel").textContent = t("emailLabel");
  document.getElementById("phoneLabel").textContent = t("phoneLabel");
  document.getElementById("confirmBtn").textContent = t("confirmButton");
  document.getElementById("bookedHeading").textContent = t("bookedHeading");
  document.getElementById("bookedNotice").textContent = t("bookedNotice");

  let selectedSlot = null;

  function showError(message) {
    loading.classList.add("hidden");
    errorBox.textContent = message;
    errorBox.classList.remove("hidden");
  }

  function formatSlotTime(startsAt) {
    // "YYYY-MM-DD HH:MM:SS" -> readable local label, no timezone conversion
    // (these are already the room's local wall-clock time).
    const [date, time] = startsAt.split(" ");
    return { date, time: time.slice(0, 5) };
  }

  function renderSlots(resource, slots) {
    document.getElementById("resourceName").textContent = resource.name;
    document.getElementById("resourceLocation").textContent = resource.defaultLocation || "";

    if (slots.length === 0) {
      slotList.innerHTML = `<p class="notice">${t("noSlots")}</p>`;
      slotStep.classList.remove("hidden");
      return;
    }

    const byDay = {};
    for (const slot of slots) {
      const { date } = formatSlotTime(slot.starts_at);
      (byDay[date] = byDay[date] || []).push(slot);
    }

    slotList.innerHTML = "";
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
        btn.addEventListener("click", () => selectSlot(slot, btn));
        grid.appendChild(btn);
      }
      group.appendChild(grid);
      slotList.appendChild(group);
    }

    slotStep.classList.remove("hidden");
  }

  function selectSlot(slot, btn) {
    document.querySelectorAll(".slot-btn.selected").forEach((el) => el.classList.remove("selected"));
    btn.classList.add("selected");
    selectedSlot = slot;

    const { date, time } = formatSlotTime(slot.starts_at);
    selectedSlotSummary.innerHTML = `<strong>${t("selectedPrefix")}</strong> ${date} at ${time}${slot.location ? ` — ${slot.location}` : ""}`;
    contactStep.classList.remove("hidden");
    contactStep.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function confirmBooking() {
    const email = document.getElementById("email").value.trim();
    const phone = document.getElementById("phone").value.trim();
    contactError.classList.add("hidden");

    if (!selectedSlot) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      contactError.textContent = t("invalidEmail");
      contactError.classList.remove("hidden");
      return;
    }
    if (!/^[0-9+()\-\s]{6,20}$/.test(phone)) {
      contactError.textContent = t("invalidPhone");
      contactError.classList.remove("hidden");
      return;
    }

    const btn = document.getElementById("confirmBtn");
    const originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = t("confirmingButton");
    try {
      const res = await fetch(`public/bookings/${encodeURIComponent(slug)}${search}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId: selectedSlot.id, email, phone, lang: locale }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("bookingFailed"));

      const { date, time } = formatSlotTime(data.startsAt);
      confirmedSummary.textContent = `${date} at ${time}${data.location ? ` — ${data.location}` : ""}`;
      slotStep.classList.add("hidden");
      contactStep.classList.add("hidden");
      confirmedStep.classList.remove("hidden");
    } catch (err) {
      contactError.textContent = err.message;
      contactError.classList.remove("hidden");
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  }

  document.getElementById("confirmBtn").addEventListener("click", confirmBooking);

  fetch(`public/slots/${encodeURIComponent(slug)}${search}`)
    .then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("invalidLink"));
      loading.classList.add("hidden");
      renderSlots(data.resource, data.slots);
    })
    .catch((err) => showError(err.message));
})();
