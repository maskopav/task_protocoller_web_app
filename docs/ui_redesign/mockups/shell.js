// docs/ui_redesign/mockups/shell.js
//
// Mockup-only glue: icon sprite, sidebar, language toggle, menus, modals,
// confirm-on-switch, toasts, clickable rows. Pages stay plain HTML and declare
// <body data-active="recordings" data-persona="master|clinician">.
(function () {
  const ICONS = {
    inbox: '<path d="M3 13h4l2 3h6l2-3h4"/><path d="M5 5h14l2 8v6H3v-6z"/>',
    study: '<path d="M9 3h6"/><path d="M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/><path d="M7.5 15h9"/>',
    clinic: '<path d="M4 21V7l8-4 8 4v14"/><path d="M9 21v-5h6v5"/><path d="M12 8v4M10 10h4"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    download: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>',
    more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="m5 12 4.5 4.5L19 7"/>',
    alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17.5v.01"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    computer: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    play: '<path d="M7 4v16l13-8z"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    logout: '<path d="M15 4h4v16h-4"/><path d="M10 8l-4 4 4 4M6 12h10"/>',
    grip: '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
    left: '<path d="m15 6-6 6 6 6"/>',
    video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    file: '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 15.4H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 9 4.6V4a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    wave: '<path d="M3 12h2M7 8v8M11 5v14M15 9v6M19 11v2M21 12h0"/>',
    library: '<path d="M5 19.5V5a2 2 0 0 1 2-2h12v14H7a2 2 0 0 0-2 2.5 2 2 0 0 0 2 1.5h12"/><path d="M9 7h6"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.9-3M4 13a8 8 0 0 0 14.9 3"/><path d="M4 4v4h4M20 20v-4h-4"/>',
  };

  const sprite = document.createElement('div');
  sprite.style.display = 'none';
  sprite.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg">' +
    Object.entries(ICONS).map(([k, v]) => `<symbol id="i-${k}" viewBox="0 0 24 24">${v}</symbol>`).join('') + '</svg>';
  document.body.prepend(sprite);
  window.icon = (n) => `<svg class="i"><use href="#i-${n}"/></svg>`;
  document.querySelectorAll('i[data-icon]').forEach((el) => { el.outerHTML = window.icon(el.dataset.icon); });

  // ── i18n (sidebar + any [data-i18n] on the page) ──
  const NAV = {
    en: { recordings: 'Recordings', studies: 'Studies', clinics: 'Clinics', myclinic: 'My clinic', library: 'Library', users: 'Users', admin: 'Administration', logout: 'Log out' },
    cs: { recordings: 'Záznamy', studies: 'Studie', clinics: 'Kliniky', myclinic: 'Moje klinika', library: 'Knihovna', users: 'Uživatelé', admin: 'Správa', logout: 'Odhlásit' },
    de: { recordings: 'Aufnahmen', studies: 'Studien', clinics: 'Kliniken', myclinic: 'Meine Klinik', library: 'Bibliothek', users: 'Benutzer', admin: 'Verwaltung', logout: 'Abmelden' },
  };
  const page = window.PAGE_I18N || {};
  let lang = 'en';
  try { lang = localStorage.getItem('mock-lang') || 'en'; } catch (e) { /* file:// may block */ }

  const persona = document.body.dataset.persona || 'master';
  const active = document.body.dataset.active || '';
  const P = {
    master: { name: 'Eva Horáková', role: 'Master', initials: 'EH', recCount: 7, home: 'recordings.html', clinicsLabel: 'clinics', clinicsHref: 'clinics.html', master: true },
    clinician: { name: 'Petr Svoboda', role: 'Prague General Hospital', initials: 'PS', recCount: 3, home: 'clinician-home.html', clinicsLabel: 'myclinic', clinicsHref: 'clinic-studies.html', master: false },
  }[persona];

  const sb = document.getElementById('sidebar');
  if (sb) {
    sb.className = 'sidebar';
    sb.innerHTML = `
      <div class="brand"><span class="brand-mark">${icon('wave')}</span>Task Protocoller</div>
      <nav class="nav">
        <a href="${P.home}" class="${active === 'recordings' ? 'active' : ''}">${icon('inbox')}<span data-nav="recordings"></span><span class="count">${P.recCount}</span></a>
        <a href="studies.html" class="${active === 'studies' ? 'active' : ''}">${icon('study')}<span data-nav="studies"></span></a>
        <a href="${P.clinicsHref}" class="${active === 'clinics' ? 'active' : ''}">${icon('clinic')}<span data-nav="${P.clinicsLabel}"></span></a>
        <a href="library.html" class="${active === 'library' ? 'active' : ''}">${icon('library')}<span data-nav="library"></span></a>
        ${P.master ? `<div class="nav-sep"></div><div class="nav-label" data-nav="admin"></div>
        <a href="users.html" class="${active === 'users' ? 'active' : ''}">${icon('users')}<span data-nav="users"></span></a>` : ''}
      </nav>
      <div class="user-menu">
        <div class="user-row"><span class="avatar">${P.initials}</span>
          <div><div class="user-name">${P.name}</div><div class="user-role">${P.role}</div></div></div>
        <div class="user-actions">
          <select id="lang-select" aria-label="Language"><option value="en">English</option><option value="cs">Čeština</option><option value="de">Deutsch</option></select>
          <a class="btn btn-quiet btn-sm" href="login.html" title="Log out">${icon('logout')}</a>
        </div>
      </div>`;
  }

  function applyLang(l) {
    lang = l;
    document.documentElement.lang = l;
    document.querySelectorAll('[data-nav]').forEach((el) => { el.textContent = (NAV[l] || NAV.en)[el.dataset.nav]; });
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      if (!el.dataset.en) el.dataset.en = el.innerHTML;
      const t = page[l] && page[l][el.dataset.i18n];
      el.innerHTML = t || el.dataset.en;
    });
    const s = document.getElementById('lang-select');
    if (s) s.value = l;
    try { localStorage.setItem('mock-lang', l); } catch (e) { /* ignore */ }
  }
  applyLang(lang);
  document.addEventListener('change', (e) => { if (e.target.id === 'lang-select') applyLang(e.target.value); });

  // Live file-name form under a clinic name field (spec §6.7, F-008).
  const slugify = (v) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9_-]/g, ''); // same rule as the desktop app's PatientFieldCatalogue.sanitize
  document.addEventListener('input', (e) => {
    const f = e.target.closest('input[data-slug]');
    if (f) document.getElementById(f.dataset.slug).textContent = slugify(f.value) || 'OlomoucUniversityHospital';
  });

  // ── menus, modals, toasts, clickable rows, confirm switches ──
  document.addEventListener('click', (e) => {
    const menuBtn = e.target.closest('.menu > button');
    document.querySelectorAll('.menu.open').forEach((m) => { if (!menuBtn || m !== menuBtn.parentElement) m.classList.remove('open'); });
    if (menuBtn) { menuBtn.parentElement.classList.toggle('open'); e.stopPropagation(); return; }

    const opener = e.target.closest('[data-open]');
    if (opener) { e.preventDefault(); document.getElementById(opener.dataset.open).classList.add('open'); return; }
    if (e.target.closest('[data-close]') || e.target.classList.contains('modal-back')) {
      const m = e.target.closest('.modal-back'); if (m) m.classList.remove('open');
      if (pendingSwitch && e.target.closest('[data-close]') && !e.target.closest('[data-ok]')) { pendingSwitch.checked = !pendingSwitch.checked; }
      pendingSwitch = null;
    }
    const t = e.target.closest('[data-toast]');
    if (t) { e.preventDefault(); toast(t.dataset.toast); }

    const row = e.target.closest('tr[data-href]');
    if (row && !e.target.closest('input,button,a,.menu')) location.href = row.dataset.href;

    const chip = e.target.closest('.chip[data-toggle], .kpi[data-toggle]');
    if (chip) chip.classList.toggle('on');
    const seg = e.target.closest('.seg button, .choice button');
    if (seg) {
      seg.parentElement.querySelectorAll('button').forEach((b) => b.classList.remove('on')); seg.classList.add('on');
      // Segmented controls with data-pane switch sibling [data-pane-id] blocks in the same modal/card.
      if (seg.dataset.pane) {
        const scope = seg.closest('.modal, .card, main') || document;
        scope.querySelectorAll('[data-pane-id]').forEach((el) => { el.hidden = el.dataset.paneId !== seg.dataset.pane; });
      }
    }
    const pick = e.target.closest('.pick-list .pick');
    if (pick) { pick.parentElement.querySelectorAll('.pick').forEach((b) => b.classList.remove('on')); pick.classList.add('on'); }
  });

  let pendingSwitch = null;
  const confirmModal = document.createElement('div');
  confirmModal.className = 'modal-back';
  confirmModal.id = 'confirm-modal';
  confirmModal.innerHTML = `<div class="modal"><div class="modal-head"><h2 id="cf-title"></h2><p id="cf-body"></p></div>
    <div class="modal-foot"><button class="btn" data-close>Cancel</button><button class="btn btn-primary" data-close data-ok>Confirm</button></div></div>`;
  document.body.appendChild(confirmModal);
  document.addEventListener('change', (e) => {
    const sw = e.target.closest('input[data-confirm-off]');
    if (sw && !sw.checked) {
      pendingSwitch = sw;
      document.getElementById('cf-title').textContent = sw.dataset.confirmTitle || 'Are you sure?';
      document.getElementById('cf-body').textContent = sw.dataset.confirmOff;
      confirmModal.classList.add('open');
    } else if (sw) { toast(sw.dataset.toastOn || 'Saved'); }
  });

  const toastEl = document.createElement('div');
  toastEl.className = 'toast';
  document.body.appendChild(toastEl);
  let tt;
  function toast(msg) {
    toastEl.innerHTML = icon('check') + '<span>' + msg + '</span>';
    toastEl.classList.add('show');
    clearTimeout(tt); tt = setTimeout(() => toastEl.classList.remove('show'), 2200);
  }
  window.toast = toast;

  const flag = document.createElement('div');
  flag.className = 'mock-flag';
  flag.innerHTML = 'Mockup · <a href="index.html">all screens</a>';
  document.body.appendChild(flag);
})();
