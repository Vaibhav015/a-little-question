(() => {
  'use strict';

  // Google Apps Script web-app URL (see apps-script/Code.gs for setup).
  // Leave empty to skip saving.
  const SHEET_URL = 'https://script.google.com/macros/s/AKfycbzQB5qs9E5guUDBOjUSe6Q_zuKE0TV1al4X1mZljZcRHcC3KVGT9Tpydb1Sp1746HrjRA/exec';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const FLOW = ['ask', 'date', 'time', 'place', 'lunch', 'done'];
  const STEPS = ['date', 'time', 'place', 'lunch'];
  const state = { date: '', time: '', place: '', venue: '', lunch: '' };

  const backBtn = $('#back');
  const progress = $('#progress');
  const yesBtn = $('#yes');
  const noBtn = $('#no');
  const tease = $('#tease');

  // iOS only applies :active styles when a touch listener exists.
  document.addEventListener('touchstart', () => {}, { passive: true });

  let current = 'ask';
  let busy = false;

  /* ---------- navigation ---------- */

  // Android vibrates; iPhone silently ignores this.
  const buzz = (pattern) => { try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (_) {} };

  // Every screen gets a history entry so the Android back gesture/button
  // steps back through the invitation instead of closing it.
  history.replaceState({ screen: 'ask' }, '');
  window.addEventListener('popstate', (e) => show((e.state && e.state.screen) || 'ask', true));

  function show(name, fromHistory) {
    if (busy) {
      if (fromHistory) setTimeout(() => show(name, true), 300);
      return;
    }
    if (name === current) return;
    if (!fromHistory) history.pushState({ screen: name }, '');
    busy = true;
    const from = $(`[data-screen="${current}"]`);
    const to = $(`[data-screen="${name}"]`);
    from.classList.add('is-leaving');

    setTimeout(() => {
      from.classList.remove('is-active', 'is-leaving');
      to.classList.add('is-active');
      current = name;
      busy = false;
      noBtn.hidden = name !== 'ask';
      updateChrome();
      window.scrollTo({ top: 0 });
      if (name === 'done') finish();
    }, reduceMotion ? 0 : 260);
  }

  function updateChrome() {
    const step = STEPS.indexOf(current);
    progress.hidden = step === -1;
    backBtn.hidden = step < 1;
    $$('li', progress).forEach((li, i) => {
      li.classList.toggle('is-done', i < step);
      li.classList.toggle('is-current', i === step);
    });
  }

  backBtn.addEventListener('click', () => history.back());

  /* ---------- choices ---------- */

  const ownVenue = $('#own-venue');
  const venueInput = $('#venue-input');
  const venueGo = $('.btn-go', ownVenue);

  let choosing = false;
  $$('.choice').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (busy || choosing) return;
      const key = btn.dataset.key;
      $$(`.choice[data-key="${key}"]`).forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      state[key] = btn.dataset.value;

      // "Your Choice" opens a little text box instead of moving on.
      if (key === 'place') {
        const own = btn.dataset.value === 'Your Choice';
        ownVenue.hidden = !own;
        if (own) {
          venueInput.focus(); // must happen inside the tap so the keyboard opens
          setTimeout(() => ownVenue.scrollIntoView({ behavior: 'smooth', block: 'center' }), 350);
          return;
        }
        state.venue = '';
      }

      choosing = true;
      setTimeout(() => {
        choosing = false;
        show(FLOW[FLOW.indexOf(current) + 1]);
      }, reduceMotion ? 150 : 480);
    });
  });

  venueInput.addEventListener('input', () => { venueGo.disabled = !venueInput.value.trim(); });

  ownVenue.addEventListener('submit', (e) => {
    e.preventDefault();
    const venue = venueInput.value.trim().replace(/\s+/g, ' ');
    if (!venue || busy) return;
    state.venue = venue;
    venueInput.blur(); // close the keyboard
    show('lunch');
  });

  /* ---------- the "No" button that never works ---------- */

  const lines = [
    'Hmm… try again 😌',
    'That button seems to be broken 😂',
    'I don’t think that’s an option 🥺',
    'Nice try. ❤️',
    'The other one looks nicer, no? 👀',
    'Okay, now you’re just playing 😄',
  ];
  let tries = 0;

  function pointFrom(e) {
    const t = e && e.touches && e.touches[0];
    if (t) return { x: t.clientX, y: t.clientY };
    if (e && typeof e.clientX === 'number' && (e.clientX || e.clientY)) return { x: e.clientX, y: e.clientY };
    const r = noBtn.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function overlaps(a, b, pad) {
    return !(a.right + pad < b.left || a.left - pad > b.right || a.bottom + pad < b.top || a.top - pad > b.bottom);
  }

  function release() {
    // Pin it where it is, then lift it out of the card so it can roam the whole screen.
    const r = noBtn.getBoundingClientRect();
    noBtn.style.left = `${r.left}px`;
    noBtn.style.top = `${r.top}px`;
    noBtn.classList.add('is-loose');
    document.body.appendChild(noBtn);
    noBtn.getBoundingClientRect(); // commit start position so the first move animates
  }

  function dodge(e) {
    if (e && e.cancelable) e.preventDefault();
    if (current !== 'ask') return;
    if (!noBtn.classList.contains('is-loose')) release();

    tries += 1;
    buzz(12);
    const p = pointFrom(e);
    const w = noBtn.offsetWidth;
    const h = noBtn.offsetHeight;
    const vv = window.visualViewport;
    const vw = vv ? vv.width : window.innerWidth;
    const vh = vv ? vv.height : window.innerHeight;
    const pad = 16;
    const avoid = [yesBtn.getBoundingClientRect(), tease.getBoundingClientRect()];
    const minDist = Math.min(180, Math.max(vw, vh) / 3);

    let best = null;
    let bestDist = -1;
    const good = [];
    for (let i = 0; i < 40; i++) {
      const x = pad + Math.random() * Math.max(0, vw - w - pad * 2);
      const y = pad + Math.random() * Math.max(0, vh - h - pad * 2);
      const box = { left: x, top: y, right: x + w, bottom: y + h };
      if (avoid.some((r) => overlaps(box, r, 14))) continue;
      const d = Math.hypot(x + w / 2 - p.x, y + h / 2 - p.y);
      if (d >= minDist) good.push({ x, y });
      if (d > bestDist) { bestDist = d; best = { x, y }; }
    }
    const spot = good.length ? good[Math.floor(Math.random() * good.length)] : best;
    if (spot) {
      noBtn.style.left = `${spot.x}px`;
      noBtn.style.top = `${spot.y}px`;
    }
    noBtn.style.setProperty('--tilt', `${(Math.random() * 16 - 8).toFixed(1)}deg`);
    noBtn.style.setProperty('--shrink', Math.max(0.78, 1 - tries * 0.03).toFixed(2));
    yesBtn.style.setProperty('--grow', Math.min(1.14, 1 + tries * 0.025).toFixed(3));

    tease.classList.remove('is-on');
    requestAnimationFrame(() => {
      tease.textContent = lines[(tries - 1) % lines.length];
      tease.classList.add('is-on');
    });
  }

  noBtn.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') dodge(e); });
  noBtn.addEventListener('pointerdown', dodge);
  noBtn.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false }); // no ghost click
  noBtn.addEventListener('click', (e) => { e.preventDefault(); dodge(e); });

  window.addEventListener('resize', () => {
    if (!noBtn.classList.contains('is-loose')) return;
    const x = Math.min(parseFloat(noBtn.style.left), window.innerWidth - noBtn.offsetWidth - 16);
    const y = Math.min(parseFloat(noBtn.style.top), window.innerHeight - noBtn.offsetHeight - 16);
    noBtn.style.left = `${Math.max(16, x)}px`;
    noBtn.style.top = `${Math.max(16, y)}px`;
  });

  yesBtn.addEventListener('click', () => {
    buzz(25);
    burst(yesBtn, 14);
    setTimeout(() => show('date'), reduceMotion ? 0 : 350);
  });

  /* ---------- finale ---------- */

  function finish() {
    $('[data-out="date"]').textContent = state.date;
    $('[data-out="time"]').textContent = state.time;
    $('[data-out="place"]').textContent = state.place === 'Your Choice' ? state.venue : state.place;
    $('[data-out="lunch"]').textContent = state.lunch;
    setTimeout(() => {
      burst($('[data-screen="done"] .seal'), 22);
      buzz([30, 70, 30]);
    }, reduceMotion ? 0 : 450);
    save();
  }

  $('#restart').addEventListener('click', () => show('date'));

  function save() {
    if (!SHEET_URL) return;
    const body = new URLSearchParams({
      date: state.date,
      time: state.time,
      place: state.place === 'Your Choice' ? 'Her choice' : state.place,
      venue: state.venue,
      lunch: state.lunch,
      noTries: String(tries),
    });
    // no-cors: Apps Script doesn't send CORS headers; we don't need the reply.
    fetch(SHEET_URL, { method: 'POST', mode: 'no-cors', body, keepalive: true }).catch(() => {});
  }

  /* ---------- little hearts ---------- */

  function burst(el, count) {
    if (reduceMotion || !el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    for (let i = 0; i < count; i++) {
      const s = document.createElement('span');
      s.className = 'burst';
      s.textContent = Math.random() < 0.8 ? '♥' : '♡';
      const size = 10 + Math.random() * 12;
      s.style.fontSize = `${size}px`;
      s.style.left = `${cx - size / 2}px`;
      s.style.top = `${cy - size / 2}px`;
      document.body.appendChild(s);
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const dist = 60 + Math.random() * 90;
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist - 30;
      s.animate(
        [
          { transform: 'translate(0,0) scale(.4)', opacity: 0 },
          { transform: `translate(${dx * 0.6}px, ${dy * 0.6}px) scale(1)`, opacity: 0.9, offset: 0.35 },
          { transform: `translate(${dx}px, ${dy + 40}px) scale(.8) rotate(${dx / 4}deg)`, opacity: 0 },
        ],
        { duration: 1100 + Math.random() * 500, easing: 'cubic-bezier(.2,.7,.3,1)' }
      ).onfinish = () => s.remove();
    }
  }

  (function petals() {
    if (reduceMotion) return;
    const box = $('.petals');
    const n = window.innerWidth < 500 ? 7 : 10;
    for (let i = 0; i < n; i++) {
      const s = document.createElement('span');
      s.textContent = '♥';
      s.style.left = `${Math.random() * 100}%`;
      s.style.fontSize = `${9 + Math.random() * 10}px`;
      s.style.animationDuration = `${16 + Math.random() * 14}s`;
      s.style.animationDelay = `${-Math.random() * 26}s`;
      s.style.setProperty('--dx', `${Math.random() * 80 - 40}px`);
      s.style.setProperty('--o', (0.15 + Math.random() * 0.2).toFixed(2));
      box.appendChild(s);
    }
  })();
})();
