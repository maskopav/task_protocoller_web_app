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
  const preferredTimesField = document.getElementById("preferredTimesField");
  const emailInput = document.getElementById("email");
  const phoneInput = document.getElementById("phone");
  const confirmedStep = document.getElementById("confirmedStep");
  const confirmedSummary = document.getElementById("confirmedSummary");
  const contactError = document.getElementById("contactError");
  const noSlotToggle = document.getElementById("noSlotToggle");
  const nextBtn = document.getElementById("nextBtn");
  const noSlotConfirmedStep = document.getElementById("noSlotConfirmedStep");

  document.documentElement.lang = locale;
  loading.textContent = t("loadingSlots");
  document.getElementById("emailLabel").textContent = t("emailLabel");
  document.getElementById("phoneLabel").textContent = t("phoneLabel");
  document.getElementById("nextBtn").textContent = t("nextButton");
  document.getElementById("bookedHeading").textContent = t("bookedHeading");
  document.getElementById("bookedNotice").textContent = t("bookedNotice");
  document.getElementById("noSlotToggle").textContent = t("noSlotToggle");
  document.getElementById("preferredTimesLabel").textContent = t("preferredTimesLabel");
  document.getElementById("noSlotConfirmedHeading").textContent = t("noSlotConfirmedHeading");
  document.getElementById("noSlotConfirmedNotice").textContent = t("noSlotConfirmedNotice");

  // Exactly one of these is true once the contact form is showing: either a
  // specific slot was picked, or the participant said none of them work
  // (in which case preferredTimes is collected instead). Both paths share
  // the same email/phone fields and the same Next button below.
  let selectedSlot = null;
  let noSlotMode = false;

  function showError(message) {
    loading.classList.add("hidden");
    errorBox.textContent = message;
    errorBox.classList.remove("hidden");
  }

  function showFieldError(box, message) {
    box.textContent = message;
    box.classList.remove("hidden");
  }

  // Mirrors booking-service's own server-side check (publicController.js's
  // contactFormatError) -- this copy is only a UX nicety, the server
  // re-validates regardless.
  function contactFormatErrorKey(email, phone) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "invalidEmail";
    if (!/^[0-9+()\-\s]{6,20}$/.test(phone)) return "invalidPhone";
    return null;
  }

  function formatSlotTime(startsAt) {
    // "YYYY-MM-DD HH:MM:SS" -> readable local label, no timezone conversion
    // (these are already the room's local wall-clock time).
    const [date, time] = startsAt.split(" ");
    return { date, time: time.slice(0, 5) };
  }

  function renderSlots(resource, slots) {
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

  // Enabled only once the participant has made a choice (a slot, or "none
  // of these work") and filled in both contact fields -- shared by both
  // paths, since the button and the fields underneath it are shared too.
  function updateNextButtonState() {
    const hasChoice = !!selectedSlot || noSlotMode;
    nextBtn.disabled = !(hasChoice && emailInput.value.trim() && phoneInput.value.trim());
  }
  emailInput.addEventListener("input", updateNextButtonState);
  phoneInput.addEventListener("input", updateNextButtonState);

  function selectSlot(slot, btn) {
    document.querySelectorAll(".selected").forEach((el) => el.classList.remove("selected"));
    btn.classList.add("selected");
    selectedSlot = slot;
    noSlotMode = false;
    preferredTimesField.classList.add("hidden");

    const { date, time } = formatSlotTime(slot.starts_at);
    selectedSlotSummary.textContent = "";
    const prefix = document.createElement("strong");
    prefix.textContent = t("selectedPrefix");
    selectedSlotSummary.appendChild(prefix);
    selectedSlotSummary.appendChild(
      document.createTextNode(` ${date} at ${time}${slot.location ? ` — ${slot.location}` : ""}`)
    );
    contactStep.classList.remove("hidden");
    contactStep.scrollIntoView({ behavior: "smooth", block: "nearest" });
    updateNextButtonState();
  }

  function selectNoSlot() {
    document.querySelectorAll(".selected").forEach((el) => el.classList.remove("selected"));
    noSlotToggle.classList.add("selected");
    selectedSlot = null;
    noSlotMode = true;

    selectedSlotSummary.textContent = "";
    preferredTimesField.classList.remove("hidden");
    contactStep.classList.remove("hidden");
    contactStep.scrollIntoView({ behavior: "smooth", block: "nearest" });
    updateNextButtonState();
  }

  noSlotToggle.addEventListener("click", selectNoSlot);

  // One submit path for both cases -- which endpoint it calls, and which
  // confirmation screen it shows, depends on whichever choice (slot vs.
  // no-slot) is currently selected.
  async function handleNext() {
    const email = emailInput.value.trim();
    const phone = phoneInput.value.trim();
    contactError.classList.add("hidden");

    const formatErrorKey = contactFormatErrorKey(email, phone);
    if (formatErrorKey) return showFieldError(contactError, t(formatErrorKey));

    const originalLabel = nextBtn.textContent;
    nextBtn.disabled = true;
    nextBtn.textContent = t(selectedSlot ? "confirmingButton" : "sendingButton");
    try {
      if (selectedSlot) {
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
      } else {
        const preferredTimes = document.getElementById("preferredTimes").value.trim();
        const res = await fetch(`public/no-slot/${encodeURIComponent(slug)}${search}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, phone, preferredTimes, lang: locale }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || t("noSlotFailed"));

        slotStep.classList.add("hidden");
        contactStep.classList.add("hidden");
        noSlotConfirmedStep.classList.remove("hidden");
      }
    } catch (err) {
      showFieldError(contactError, err.message);
      nextBtn.disabled = false;
      nextBtn.textContent = originalLabel;
    }
  }

  nextBtn.addEventListener("click", handleNext);

  fetch(`public/slots/${encodeURIComponent(slug)}${search}`)
    .then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("invalidLink"));
      loading.classList.add("hidden");
      renderSlots(data.resource, data.slots);
    })
    .catch((err) => showError(err.message));
})();
