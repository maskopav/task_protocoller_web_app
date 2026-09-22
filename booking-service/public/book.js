(function () {
  const t = window.bookingI18n.t;
  const locale = window.bookingI18n.locale;

  // Contract with the parent frame -- BookingStep.jsx checks event.data
  // against this exact shape before revealing its "Continue" button.
  const COMPLETION_MESSAGE = { source: "booking-service", status: "completed" };

  const slug = window.location.pathname.split("/").filter(Boolean).pop();
  const search = window.location.search; // carries tenant/ref/after/exp/sig verbatim

  const loading = document.getElementById("loading");
  const errorBox = document.getElementById("errorBox");
  const slotStep = document.getElementById("slotStep");
  const slotList = document.getElementById("slotList");
  const contactStep = document.getElementById("contactStep");
  const selectedSlotSummary = document.getElementById("selectedSlotSummary");
  const preferredTimesField = document.getElementById("preferredTimesField");
  const knownContactNotice = document.getElementById("knownContactNotice");
  const emailLabel = document.getElementById("emailLabel");
  const phoneLabel = document.getElementById("phoneLabel");
  const emailInput = document.getElementById("email");
  const phoneInput = document.getElementById("phone");
  const confirmedStep = document.getElementById("confirmedStep");
  const confirmedWhen = document.getElementById("confirmedWhen");
  const whereRow = document.getElementById("whereRow");
  const confirmedWhere = document.getElementById("confirmedWhere");
  const contactError = document.getElementById("contactError");
  const noSlotToggle = document.getElementById("noSlotToggle");
  const nextBtn = document.getElementById("nextBtn");
  const noSlotConfirmedStep = document.getElementById("noSlotConfirmedStep");
  const resourceLocation = document.getElementById("resourceLocation");

  document.documentElement.lang = locale;
  loading.textContent = t("loadingSlots");
  emailLabel.textContent = t("emailLabel");
  phoneLabel.textContent = t("phoneLabel");
  document.getElementById("nextBtn").textContent = t("nextButton");
  document.getElementById("bookedHeading").textContent = t("bookedHeading");
  document.getElementById("bookedNotice").textContent = t("bookedNotice");
  document.getElementById("whenLabel").textContent = t("whenLabel");
  document.getElementById("whereLabel").textContent = t("whereLabel");
  document.getElementById("noSlotToggle").textContent = t("noSlotToggle");
  document.getElementById("preferredTimesLabel").textContent = t("preferredTimesLabel");
  document.getElementById("noSlotConfirmedHeading").textContent = t("noSlotConfirmedHeading");
  document.getElementById("noSlotConfirmedNotice").textContent = t("noSlotConfirmedNotice");

  // nextBtn is hidden by default in book.html because the embedded case
  // (inside BookingStep.jsx's iframe) relies on the parent app's own footer
  // button instead, driven by the next-state/next-click messages below.
  // But this same page is also opened with no parent at all -- an emailed
  // link, or the Fieldwork table's link column (see
  // docs/reservation-links.md) -- where there is no parent to render one.
  // window.parent === window (its own default) is exactly the standalone
  // case; only there does the in-page button need to actually show.
  if (window.self === window.parent) {
    nextBtn.classList.remove("hidden");
  }

  // Exactly one of these is true once the contact form is showing: either a
  // specific slot was picked, or the participant said none of them work
  // (in which case preferredTimes is collected instead). Both paths share
  // the same email/phone fields and the same Next button below.
  let selectedSlot = null;
  let noSlotMode = false;
  let knownContact = null;

  // When the server already has contact info on file for this link (see
  // getPublicSlots' knownContact) there's no need to ask again — prefill it
  // into the shared fields and hide them, leaving just the slot/no-slot
  // choice above the Next button.
  function applyKnownContact() {
    if (!knownContact) return;
    emailInput.value = knownContact.email || "";
    phoneInput.value = knownContact.phone || "";
    emailLabel.classList.add("hidden");
    emailInput.classList.add("hidden");
    phoneLabel.classList.add("hidden");
    phoneInput.classList.add("hidden");
    knownContactNotice.textContent = t("knownContactNotice", knownContact.email);
    knownContactNotice.classList.remove("hidden");
  }

  // Lets the parent app (which embeds this page in an iframe with no other
  // handshake -- see BookingStep.jsx) know a booking outcome was reached,
  // so it can reveal its own "Continue" button. "*" as target origin is
  // fine here: this message carries no sensitive data, just a completion
  // signal, and the parent validates event.origin against the iframe src
  // it set itself before acting on it.
  function notifyParentCompleted() {
    try {
      window.parent.postMessage(COMPLETION_MESSAGE, "*");
    } catch (e) {}
  }

  // Mirrors nextBtn's own visible/enabled/label state to the parent, which
  // renders its own fixed footer button outside this iframe (see
  // BookingStep.jsx) instead of relying on the one in this document --
  // scrolling a tall slot list would otherwise push nextBtn off screen.
  // nextBtn itself stays in the DOM (see book.html's .hidden on it) so all
  // the existing logic below keeps working unchanged; it's just not shown.
  function postNextState() {
    try {
      window.parent.postMessage({
        source: "booking-service",
        type: "next-state",
        visible: !contactStep.classList.contains("hidden"),
        enabled: !nextBtn.disabled,
        label: nextBtn.textContent,
      }, "*");
    } catch (e) {}
  }

  // Once the confirmation screens are showing, BookingStep.jsx shrinks the
  // iframe down from the tall slot-picker height (see its --compact
  // modifier) -- reporting our actual content height lets it size the box
  // to fit instead of guessing a fixed px value that could clip a long,
  // localized address across languages/screen widths.
  function postHeight() {
    try {
      window.parent.postMessage({
        source: "booking-service",
        type: "height",
        height: document.body.scrollHeight,
      }, "*");
    } catch (e) {}
  }
  // ResizeObserver's own initial callback (fired once async after observe())
  // covers the first report; no need to call postHeight() up front here too
  // -- doing so fired an extra message before any real outcome, which broke
  // the "notifies immediately, before anything else" contract other code
  // relies on.
  if (window.ResizeObserver) {
    new ResizeObserver(postHeight).observe(document.body);
  } else {
    window.addEventListener("resize", postHeight);
  }

  // The parent's footer button posts this back to trigger the same submit
  // path nextBtn.click() would.
  window.addEventListener("message", (event) => {
    if (event.data && event.data.source === "task-protocoller" && event.data.type === "next-click") {
      if (!nextBtn.disabled) handleNext();
    }
  });

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
    postNextState();
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
    postNextState();
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
        confirmedWhen.textContent = `${date} at ${time}`;
        if (data.location) {
          confirmedWhere.textContent = data.location;
          whereRow.classList.remove("hidden");
        } else {
          whereRow.classList.add("hidden");
        }
        resourceLocation.classList.add("hidden");
        slotStep.classList.add("hidden");
        contactStep.classList.add("hidden");
        confirmedStep.classList.remove("hidden");
        postNextState();
        notifyParentCompleted();
      } else {
        const preferredTimes = document.getElementById("preferredTimes").value.trim();
        const res = await fetch(`public/no-slot/${encodeURIComponent(slug)}${search}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, phone, preferredTimes, lang: locale }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || t("noSlotFailed"));

        resourceLocation.classList.add("hidden");
        slotStep.classList.add("hidden");
        contactStep.classList.add("hidden");
        noSlotConfirmedStep.classList.remove("hidden");
        postNextState();
        notifyParentCompleted();
      }
    } catch (err) {
      showFieldError(contactError, err.message);
      nextBtn.disabled = false;
      nextBtn.textContent = originalLabel;
      postNextState();
    }
  }

  nextBtn.addEventListener("click", handleNext);

  fetch(`public/slots/${encodeURIComponent(slug)}${search}`)
    .then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("invalidLink"));

      if (data.existingBooking) {
        // This link's participant already has an active appointment --
        // send them straight to the reschedule/cancel view instead of
        // showing the slot picker (and asking for contact info) again.
        const manageUrl = new URL(`manage/${data.existingBooking.manageToken}`, document.baseURI);
        if (locale) manageUrl.searchParams.set("lang", locale);
        notifyParentCompleted();
        window.location.replace(manageUrl.href);
        return;
      }

      knownContact = data.knownContact || null;
      applyKnownContact();
      loading.classList.add("hidden");
      renderSlots(data.resource, data.slots);
    })
    .catch((err) => showError(err.message));
})();
