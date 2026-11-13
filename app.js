'use strict';
/* =========================================================================
   SlayDesk — showcase MVP
   Everything lives in the browser (localStorage). No backend, no build step.
   Data flow:
     Floor plan  -> desk status indicators + KPI tracking -> insights
     Book desk   -> updates the floor plan (and every open tab, live)
     Hardware    -> sensor status check updates desk status
   ========================================================================= */

const KEY = 'slaydesk:state:v1';
const THEME_KEY = 'slaydesk:theme';
const W = 1000, H = 620;
const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SLOTS = {
  AM: { label: 'Morning', time: '08:00–13:00' },
  PM: { label: 'Afternoon', time: '13:00–18:00' },
  DAY: { label: 'Full day', time: '08:00–18:00' },
};
const EMPLOYEES = ['Alex Morgan', 'Sam Rivera', 'Jordan Lee', 'Taylor Kim', 'Casey Patel', 'Riley Chen',
  'Morgan Diaz', 'Jamie Okafor', 'Avery Novak', 'Quinn Rossi', 'Drew Larsen', 'Robin Silva', 'Parker Ito',
  'Skyler Haddad', 'Reese Becker', 'Charlie Moreau', 'Emerson Ali', 'Hayden Costa', 'Rowan Fischer',
  'Sage Romano', 'Blake Nguyen', 'Kendall Ruiz', 'Finley Shah', 'Dakota Weiss'];

/* ---------- small utils ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = p => p + '_' + Math.random().toString(36).slice(2, 9);
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const isWorkday = d => d.getDay() > 0 && d.getDay() < 6;
const todayStr = () => ymd(new Date());
const nowSlot = () => (new Date().getHours() < 13 ? 'AM' : 'PM');
const overlaps = (a, b) => a === 'DAY' || b === 'DAY' || a === b;
const halves = s => (s === 'DAY' ? ['AM', 'PM'] : [s]);
const pct = (v, d = 0) => (Number.isFinite(v) ? (v * 100).toFixed(d) + '%' : '–');
const fmtDate = (s, o = { weekday: 'short', day: 'numeric', month: 'short' }) => parse(s).toLocaleDateString('en-GB', o);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const snap = v => Math.round(v / 10) * 10;
const isActive = b => b.status === 'booked' || b.status === 'checked-in';
function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  square: '<rect x="4" y="4" width="16" height="16" rx="3" stroke-dasharray="3 3"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  desk: '<rect x="3" y="8" width="18" height="8" rx="2"/><path d="M6 16v4M18 16v4"/>',
  layout: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>',
  up: '<path d="M4 17l6-6 4 4 6-6M14 9h6v6"/>',
  down: '<path d="M4 7l6 6 4-4 6 6M14 15h6V9"/>',
  alert: '<path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/>',
  sensor: '<circle cx="12" cy="16" r="2"/><path d="M8 12a6 6 0 0 1 8 0M5 9a10 10 0 0 1 14 0"/>',
  refresh: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
};
const icon = n => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]}</svg>`;

/* ---------- state ---------- */
let state;
const ui = {
  selected: null,           // admin editor selection id
  liveStatus: true,         // admin editor shows lights
  bookDate: null,
  bookSlot: 'DAY',
  bookDesk: null,
  range: 4,                 // insights weeks
};

function seedState() {
  const r = rng(7);
  const desks = [];
  const pods = [
    { p: 'A', x: 310, y: 100, pop: 1.0, sensor: true },
    { p: 'B', x: 660, y: 100, pop: 0.92, sensor: true },
    { p: 'C', x: 310, y: 400, pop: 0.72, sensor: false },
    { p: 'D', x: 660, y: 400, pop: 0.5, sensor: false },
  ];
  const pop = {};
  for (const pod of pods) {
    for (let i = 0; i < 6; i++) {
      const col = i % 3, row = Math.floor(i / 3);
      const d = { id: uid('dk'), label: `${pod.p}${i + 1}`, x: pod.x + col * 90, y: pod.y + row * 60, w: 80, h: 48, sensor: pod.sensor };
      desks.push(d);
      pop[d.id] = pod.pop * (0.8 + r() * 0.4);
    }
  }
  // a couple of standout desks so "most / least used" has a story
  pop[desks[0].id] = 1.25; pop[desks[1].id] = 1.15;
  pop[desks[22].id] = 0.12; pop[desks[23].id] = 0.08;

  const areas = [
    { id: uid('ar'), label: 'Windows', x: 290, y: 20, w: 680, h: 40 },
    { id: uid('ar'), label: 'Kitchen', x: 30, y: 30, w: 220, h: 160 },
    { id: uid('ar'), label: 'Meeting room', x: 30, y: 220, w: 220, h: 190 },
    { id: uid('ar'), label: 'Reception', x: 30, y: 440, w: 220, h: 150 },
    { id: uid('ar'), label: 'Quiet zone', x: 640, y: 370, w: 320, h: 170 },
  ];

  const bookings = [];
  const today = parse(todayStr());
  const dowF = { 1: 0.62, 2: 0.93, 3: 0.86, 4: 0.8, 5: 0.38 };
  const others = EMPLOYEES.slice(1);
  for (let i = -56; i <= 10; i++) {
    const d = addDays(today, i);
    if (!isWorkday(d)) continue;
    const date = ymd(d);
    const dow = d.getDay();
    const trend = 0.86 + 0.22 * ((i + 56) / 56);
    const pool = others.slice().sort(() => r() - 0.5);
    const take = () => pool.pop();
    const status = () => {
      if (i > 0) return 'booked';
      if (i === 0) return r() < 0.5 ? 'checked-in' : 'booked';
      const ns = dow === 1 || dow === 5 ? 0.17 : 0.09;
      return r() < ns ? 'no-show' : 'checked-in';
    };
    for (const desk of desks) {
      let p = dowF[dow] * pop[desk.id] * Math.min(trend, 1.05);
      if (i > 0) p *= 0.5 - i * 0.03;
      if (r() >= p) continue;
      const roll = r();
      const slot = roll < 0.6 ? 'DAY' : roll < 0.83 ? 'AM' : 'PM';
      const u = take(); if (!u) break;
      bookings.push({ id: uid('bk'), deskId: desk.id, user: u, date, slot, status: status() });
      if (slot !== 'DAY' && r() < (slot === 'AM' ? 0.35 : 0.3)) {
        const u2 = take(); if (!u2) break;
        bookings.push({ id: uid('bk'), deskId: desk.id, user: u2, date, slot: slot === 'AM' ? 'PM' : 'AM', status: status() });
      }
    }
  }
  // give the default employee some history + upcoming bookings on free desks
  const me = EMPLOYEES[0];
  const free = (deskId, date, slot) => !bookings.some(b => b.deskId === deskId && b.date === date && isActive(b) && overlaps(b.slot, slot));
  let added = 0;
  for (let i = -20; i <= 10 && added < 9; i++) {
    const d = addDays(today, i);
    if (!isWorkday(d) || (i < 0 && r() < 0.55) || (i > 0 && r() < 0.5)) continue;
    const date = ymd(d);
    const desk = desks.find(k => free(k.id, date, 'DAY'));
    if (!desk) continue;
    bookings.push({ id: uid('bk'), deskId: desk.id, user: me, date, slot: 'DAY', status: i < 0 ? (r() < 0.12 ? 'no-show' : 'checked-in') : 'booked' });
    added++;
  }

  const sensors = {};
  for (const d of desks) if (d.sensor) sensors[d.id] = { online: true, occupied: false, battery: Math.round(55 + r() * 45), lastSeen: Date.now() };

  const s = { version: 1, office: { name: 'SlayHQ', floor: 'Floor 1' }, desks, areas, bookings, sensors, employees: EMPLOYEES.slice(), me, autoPoll: false, lastPoll: null };
  state = s;
  pollHardware(true);
  return s;
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.version === 1) return resolvePast(s);
    }
  } catch (e) { /* ignore */ }
  const s = seedState();
  save(s);
  return s;
}
function save(s = state) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* private mode etc. — keep working in memory */ }
}
// bookings in the past that were never checked into become no-shows
function resolvePast(s) {
  const t = todayStr();
  for (const b of s.bookings) if (b.status === 'booked' && b.date < t) b.status = 'no-show';
  return s;
}

/* ---------- domain helpers ---------- */
const deskById = id => state.desks.find(d => d.id === id);
const activeBooking = (deskId, date, slot) => state.bookings.find(b => b.deskId === deskId && b.date === date && isActive(b) && overlaps(b.slot, slot));

function deskStatus(deskId, date, slot) {
  const booking = activeBooking(deskId, date, slot);
  const sensor = state.sensors[deskId];
  const sensed = !!(sensor && sensor.online && sensor.occupied && date === todayStr() && overlaps(slot, nowSlot()));
  let st = 'free';
  if (booking) st = 'booked';
  else if (sensed) st = 'occupied';
  return { state: st, booking, sensor, sensed, mine: !!booking && booking.user === state.me };
}

function pollHardware(silent) {
  const t = todayStr(), s = nowSlot(), now = Date.now();
  const officeHours = isWorkday(new Date()); // demo: any time on a workday counts as office hours
  let changes = 0;
  for (const d of state.desks) {
    const sen = state.sensors[d.id];
    if (!sen) continue;
    sen.online = Math.random() > 0.04;
    if (!sen.online) { changes++; continue; }
    const b = activeBooking(d.id, t, s);
    const was = sen.occupied;
    if (!officeHours) sen.occupied = Math.random() < 0.02;
    else if (b) sen.occupied = was ? Math.random() < 0.95 : Math.random() < 0.75;
    else sen.occupied = was ? Math.random() < 0.6 : Math.random() < 0.06;
    sen.lastSeen = now;
    sen.battery = Math.max(5, sen.battery - (Math.random() < 0.1 ? 1 : 0));
    if (sen.occupied && b && b.status === 'booked') { b.status = 'checked-in'; b.checkedInBy = 'sensor'; }
    if (was !== sen.occupied) changes++;
  }
  state.lastPoll = now;
  save();
  if (!silent) toast(`Status check complete · ${changes} desk${changes === 1 ? '' : 's'} changed`);
  return changes;
}

function nextWorkdays(n) {
  const out = [];
  let d = parse(todayStr());
  while (out.length < n) { if (isWorkday(d)) out.push(ymd(d)); d = addDays(d, 1); }
  return out;
}

/* ---------- floor plan SVG ---------- */
function floorSvg({ mode, date, slot, selected, heat }) {
  const parts = [];
  parts.push(`<defs>
    <pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" class="hatch-line"/></pattern>
  </defs>`);
  parts.push(`<rect class="floor-bg" x="0" y="0" width="${W}" height="${H}"/>`);
  if (mode === 'edit') {
    for (let x = 20; x < W; x += 20) parts.push(`<line class="grid-line" x1="${x}" y1="0" x2="${x}" y2="${H}"/>`);
    for (let y = 20; y < H; y += 20) parts.push(`<line class="grid-line" x1="0" y1="${y}" x2="${W}" y2="${y}"/>`);
  }
  for (const a of state.areas) {
    const sel = selected === a.id ? ' selected' : '';
    parts.push(`<g class="area${sel}" data-id="${a.id}" data-kind="area" transform="translate(${a.x},${a.y})">
      <rect class="area-body" width="${a.w}" height="${a.h}" rx="10"/>
      <text class="area-label" x="12" y="${Math.min(24, a.h / 2 + 5)}">${esc(a.label)}</text></g>`);
  }
  for (const d of state.desks) {
    const cls = ['desk'];
    let tip = '', light = '', hatch = '', you = '', fill = '', ink = '', sub = '';
    if (selected === d.id) cls.push('selected');
    if (mode === 'heat') {
      const v = heat[d.id] ?? 0;
      const c = seqColor(v);
      fill = ` style="fill:${c.color}"`;
      ink = ` style="fill:${c.ink}"`;
      sub = `<text class="desk-sub" x="${d.w / 2}" y="${d.h / 2 + 15}"${ink}>${pct(v)}</text>`;
      tip = `<b>${esc(d.label)}</b><br>Utilization ${pct(v)}`;
    } else {
      const st = deskStatus(d.id, date, slot);
      cls.push(st.state);
      const showMine = st.mine && mode === 'book';
      if (showMine) cls.push('mine');
      const free = st.state === 'free';
      light = `<circle class="light ${free ? 'on-free' : 'on-busy'}" cx="${d.w - 10}" cy="10" r="5.5"/>`;
      if (!free) hatch = `<rect class="desk-hatch" width="${d.w}" height="${d.h}" rx="7" fill="url(#hatch)"/>`;
      if (showMine) you = `<text class="you-tag" x="${d.w / 2}" y="${d.h - 6}">YOU</text>`;
      const sensLine = st.sensor ? `<br>Sensor: ${st.sensor.online ? (st.sensor.occupied ? 'someone is sitting here' : 'empty') : 'offline'}` : '';
      if (st.state === 'free') tip = `<b>${esc(d.label)}</b> · Available${sensLine}`;
      else if (st.state === 'booked') tip = `<b>${esc(d.label)}</b> · Booked by ${st.mine ? 'you' : esc(st.booking.user)}<br>${SLOTS[st.booking.slot].label}${st.booking.status === 'checked-in' ? ' · checked in' : ''}${sensLine}`;
      else tip = `<b>${esc(d.label)}</b> · Occupied (walk-in detected by sensor)`;
    }
    const sensor = d.sensor ? `<g class="sensor-ico${state.sensors[d.id] && !state.sensors[d.id].online ? ' off' : ''}" transform="translate(5,4)"><circle cx="6" cy="9" r="1.6"/><path d="M3 6.5a4.2 4.2 0 0 1 6 0M0.8 4a7.5 7.5 0 0 1 10.4 0"/></g>` : '';
    const focus = mode === 'book' ? ' tabindex="0" role="button"' : '';
    parts.push(`<g class="${cls.join(' ')}" data-id="${d.id}" data-kind="desk" transform="translate(${d.x},${d.y})" data-tip="${esc(tip)}" aria-label="${esc(tip.replace(/<[^>]+>/g, ' '))}"${focus}>
      <rect class="desk-body" width="${d.w}" height="${d.h}" rx="7"${fill}/>${hatch}
      <text class="desk-label" x="${d.w / 2}" y="${d.h / 2 + (mode === 'heat' ? 0 : 5)}"${ink}>${esc(d.label)}</text>${sub}${light}${sensor}${you}</g>`);
  }
  return `<svg class="mode-${mode}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Office floor plan">${parts.join('')}</svg>`;
}

/* ---------- color ramps (sequential, one hue) ---------- */
const RAMP_LIGHT = ['#e6f0fc', '#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];
const RAMP_DARK = ['#1f2733', '#16304f', '#184f95', '#1c5cab', '#256abf', '#3987e5', '#6da7ec', '#9ec5f4'];
const isDark = () => {
  const t = document.documentElement.dataset.theme;
  if (t) return t === 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
};
function seqColor(v) {
  const ramp = isDark() ? RAMP_DARK : RAMP_LIGHT;
  const i = clamp(Math.round(clamp(v, 0, 1) * (ramp.length - 1)), 0, ramp.length - 1);
  const darkInk = isDark() ? i >= 6 : i <= 3;
  return { color: ramp[i], ink: darkInk ? '#0b0b0b' : '#ffffff' };
}
const rampCss = () => `linear-gradient(90deg, ${(isDark() ? RAMP_DARK : RAMP_LIGHT).join(',')})`;

/* ---------- KPI engine ---------- */
function computeKpis(weeks) {
  const today = parse(todayStr());
  const start = addDays(today, -weeks * 7);
  const days = [];
  for (let d = new Date(start); d < today; d = addDays(d, 1)) if (isWorkday(d)) days.push(ymd(d));
  const daySet = new Set(days);
  const D = state.desks.length;
  const deskIds = new Set(state.desks.map(d => d.id));
  const perDay = Object.fromEntries(days.map(d => [d, { AM: 0, PM: 0 }]));
  const deskHalves = Object.fromEntries(state.desks.map(d => [d.id, 0]));
  const deskNo = Object.fromEntries(state.desks.map(d => [d.id, 0]));
  const deskAll = Object.fromEntries(state.desks.map(d => [d.id, 0]));
  const dowNo = {}; for (let i = 1; i <= 5; i++) dowNo[i] = { n: 0, t: 0 };
  let checked = 0, noshow = 0;
  for (const b of state.bookings) {
    if (!daySet.has(b.date) || !deskIds.has(b.deskId) || b.status === 'cancelled') continue;
    const dow = parse(b.date).getDay();
    deskAll[b.deskId]++;
    dowNo[dow].t++;
    if (b.status === 'checked-in') {
      checked++;
      for (const h of halves(b.slot)) perDay[b.date][h]++;
      deskHalves[b.deskId] += halves(b.slot).length;
    } else if (b.status === 'no-show') {
      noshow++; deskNo[b.deskId]++; dowNo[dow].n++;
    }
  }
  const dow = {};
  for (let i = 1; i <= 5; i++) dow[i] = { count: 0, AM: 0, PM: 0 };
  let used = 0, amUsed = 0, pmUsed = 0;
  for (const d of days) {
    const k = parse(d).getDay();
    dow[k].count++; dow[k].AM += perDay[d].AM; dow[k].PM += perDay[d].PM;
    used += perDay[d].AM + perDay[d].PM; amUsed += perDay[d].AM; pmUsed += perDay[d].PM;
  }
  const dowUtil = [1, 2, 3, 4, 5].map(k => ({
    dow: k, label: DOW_SHORT[k], name: DOW[k],
    value: (dow[k].AM + dow[k].PM) / (2 * D * dow[k].count),
    AM: dow[k].AM / (D * dow[k].count), PM: dow[k].PM / (D * dow[k].count),
    noShow: dowNo[k].n / dowNo[k].t,
  }));
  const dayUtil = days.map(d => ({ date: d, value: (perDay[d].AM + perDay[d].PM) / (2 * D) }));
  const deskUtil = state.desks.map(d => ({ desk: d, value: deskHalves[d.id] / (2 * days.length), noShow: deskAll[d.id] ? deskNo[d.id] / deskAll[d.id] : NaN, bookings: deskAll[d.id] }))
    .sort((a, b) => b.value - a.value);
  const valid = dowUtil.filter(x => Number.isFinite(x.value));
  const peak = valid.reduce((a, b) => (b.value > a.value ? b : a), valid[0]);
  const low = valid.reduce((a, b) => (b.value < a.value ? b : a), valid[0]);
  let peakCell = null;
  for (const x of valid) for (const s of ['AM', 'PM']) if (!peakCell || x[s] > peakCell.value) peakCell = { dow: x, slot: s, value: x[s] };
  const last = dayUtil.slice(-10), prev = dayUtil.slice(-20, -10);
  const avg = a => a.reduce((s, x) => s + x.value, 0) / a.length;
  return {
    days, D, overall: used / (2 * D * days.length),
    am: amUsed / (D * days.length), pm: pmUsed / (D * days.length),
    noShowRate: noshow / (checked + noshow), noshow, checked,
    dowUtil, dayUtil, deskUtil, peak, low, peakCell,
    trend: prev.length ? avg(last) - avg(prev) : NaN,
  };
}

function buildInsights(k) {
  const out = [];
  if (!k.days.length || !k.D) return [{ tone: 'info', icon: 'bulb', tag: 'Getting started', html: 'Not enough booking history yet. Insights will appear once desks are booked.' }];
  if (k.low && k.peak && k.low !== k.peak) {
    out.push({ tone: 'warn', icon: 'down', tag: 'Weekly pattern', html: `Desk utilization is <b>${pct(k.low.value)} on ${k.low.name}s</b>, compared with <b>${pct(k.peak.value)}</b> on ${k.peak.name}s. Consider a lighter cleaning/catering schedule or closing a pod on ${k.low.name}s.` });
  }
  if (k.peakCell) {
    const full = k.peakCell.value >= 0.85;
    out.push({ tone: full ? 'bad' : 'good', icon: full ? 'alert' : 'up', tag: 'Peak time', html: `${k.peakCell.dow.name} ${SLOTS[k.peakCell.slot].label.toLowerCase()}s are the busiest slot at <b>${pct(k.peakCell.value)}</b>${full ? ' — the office is close to capacity. Nudge teams to spread anchor days.' : '. There is still headroom at peak.'}` });
  }
  if (Number.isFinite(k.am) && Number.isFinite(k.pm)) {
    const diff = Math.round((k.am - k.pm) * 100);
    if (Math.abs(diff) >= 2) out.push({ tone: 'info', icon: 'chart', tag: 'Time of day', html: `${diff > 0 ? 'Mornings' : 'Afternoons'} are <b>${Math.abs(diff)} points busier</b> than ${diff > 0 ? 'afternoons' : 'mornings'} (${pct(k.am)} vs ${pct(k.pm)}).` });
  }
  if (Number.isFinite(k.noShowRate)) {
    const worst = k.dowUtil.filter(x => Number.isFinite(x.noShow)).sort((a, b) => b.noShow - a.noShow)[0];
    const perWeek = (k.noshow / (k.days.length / 5)).toFixed(1);
    out.push({ tone: k.noShowRate > 0.1 ? 'bad' : 'good', icon: k.noShowRate > 0.1 ? 'alert' : 'check', tag: 'No-shows', html: `<b>${pct(k.noShowRate)}</b> of bookings were no-shows (~${perWeek} desk bookings wasted per week)${worst ? `, highest on <b>${worst.name}s (${pct(worst.noShow)})</b>` : ''}. Auto-release unclaimed desks after 30 minutes to recover them.` });
  }
  const cold = k.deskUtil.filter(x => x.value < 0.2);
  if (cold.length) out.push({ tone: 'warn', icon: 'desk', tag: 'Under-used desks', html: `<b>${cold.length} desk${cold.length > 1 ? 's are' : ' is'} used less than 20%</b> of the time (${cold.slice(0, 6).map(x => esc(x.desk.label)).join(', ')}). Consider repurposing that space.` });
  if (k.deskUtil.length) {
    const top = k.deskUtil[0];
    out.push({ tone: 'good', icon: 'up', tag: 'Most popular', html: `<b>${esc(top.desk.label)}</b> is the most used desk at <b>${pct(top.value)}</b>. Desks near the windows consistently fill first.` });
  }
  if (Number.isFinite(k.trend) && Math.abs(k.trend) >= 0.01) {
    out.push({ tone: k.trend > 0 ? 'good' : 'warn', icon: k.trend > 0 ? 'up' : 'down', tag: 'Trend', html: `Utilization is <b>${k.trend > 0 ? 'up' : 'down'} ${Math.abs(Math.round(k.trend * 100))} points</b> over the last two weeks compared with the two weeks before.` });
  }
  const walkins = state.desks.filter(d => { const s = state.sensors[d.id]; return s && s.online && s.occupied && !activeBooking(d.id, todayStr(), nowSlot()); });
  if (walkins.length) out.push({ tone: 'info', icon: 'sensor', tag: 'Hardware', html: `Sensors detect <b>${walkins.length} walk-in${walkins.length > 1 ? 's' : ''}</b> right now (someone sitting at an unbooked desk: ${walkins.map(d => esc(d.label)).join(', ')}).` });
  return out;
}

/* ---------- charts (hand-rolled SVG) ---------- */
function barPath(x, y, w, h, r) {
  r = Math.min(r, w / 2, h);
  if (h <= 0) return '';
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}
function barChart(el, data, { height = 240 } = {}) {
  const width = Math.max(280, el.clientWidth || 560);
  const m = { t: 22, r: 8, b: 26, l: 38 };
  const iw = width - m.l - m.r, ih = height - m.t - m.b;
  const band = iw / data.length, bw = Math.min(56, band * 0.62);
  const vals = data.map(d => d.value).filter(Number.isFinite);
  const max = Math.max(...vals), min = Math.min(...vals);
  let s = '';
  for (const g of [0, 0.25, 0.5, 0.75, 1]) {
    const y = m.t + ih - g * ih;
    s += `<line class="${g === 0 ? 'axis-line' : 'grid-h'}" x1="${m.l}" x2="${width - m.r}" y1="${y}" y2="${y}"/><text class="axis-text" x="${m.l - 8}" y="${y + 4}" text-anchor="end">${g * 100}%</text>`;
  }
  data.forEach((d, i) => {
    const v = Number.isFinite(d.value) ? d.value : 0;
    const x = m.l + i * band + (band - bw) / 2, h = ih * v, y = m.t + ih - h;
    const lab = (d.value === max || d.value === min) ? `<text class="val-text" x="${x + bw / 2}" y="${y - 6}" text-anchor="middle">${pct(d.value)}</text>` : '';
    s += `<g class="bar-group" data-tip="${esc(d.tip)}"><rect class="bar-hit" x="${m.l + i * band}" y="${m.t}" width="${band}" height="${ih}"/><path class="bar" d="${barPath(x, y, bw, h, 4)}"/>${lab}</g>`;
    s += `<text class="axis-text" x="${m.l + i * band + band / 2}" y="${height - 6}" text-anchor="middle">${esc(d.label)}</text>`;
  });
  el.innerHTML = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Bar chart">${s}</svg>`;
}
function heatmap(el, rows, cols, get, { height = 150 } = {}) {
  const width = Math.max(280, el.clientWidth || 480);
  const m = { t: 4, r: 4, b: 24, l: 78 }, gap = 2;
  const iw = width - m.l - m.r, ih = height - m.t - m.b;
  const cw = (iw - gap * (cols.length - 1)) / cols.length, ch = (ih - gap * (rows.length - 1)) / rows.length;
  let s = '';
  rows.forEach((r, ri) => {
    const y = m.t + ri * (ch + gap);
    s += `<text class="axis-text" x="${m.l - 8}" y="${y + ch / 2 + 4}" text-anchor="end">${esc(r.label)}</text>`;
    cols.forEach((c, ci) => {
      const v = get(r, c), x = m.l + ci * (cw + gap), col = seqColor(Number.isFinite(v) ? v : 0);
      s += `<g data-tip="<b>${esc(c.name)} ${esc(r.label.toLowerCase())}</b><br>Utilization ${pct(v)}"><rect x="${x}" y="${y}" width="${cw}" height="${ch}" rx="4" fill="${col.color}"/><text class="cell-text" x="${x + cw / 2}" y="${y + ch / 2 + 5}" fill="${col.ink}">${pct(v)}</text></g>`;
    });
  });
  cols.forEach((c, ci) => { s += `<text class="axis-text" x="${m.l + ci * (cw + gap) + cw / 2}" y="${height - 6}" text-anchor="middle">${esc(c.label)}</text>`; });
  el.innerHTML = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Heatmap">${s}</svg>`;
}
function lineChart(el, pts, { height = 220 } = {}) {
  const width = Math.max(280, el.clientWidth || 800);
  const m = { t: 14, r: 12, b: 26, l: 38 };
  const iw = width - m.l - m.r, ih = height - m.t - m.b;
  const n = pts.length;
  if (!n) { el.innerHTML = '<div class="empty">No data in range</div>'; return; }
  const X = i => m.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const Y = v => m.t + ih - clamp(v, 0, 1) * ih;
  let s = '';
  for (const g of [0, 0.25, 0.5, 0.75, 1]) s += `<line class="${g === 0 ? 'axis-line' : 'grid-h'}" x1="${m.l}" x2="${width - m.r}" y1="${Y(g)}" y2="${Y(g)}"/><text class="axis-text" x="${m.l - 8}" y="${Y(g) + 4}" text-anchor="end">${g * 100}%</text>`;
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.value).toFixed(1)}`).join('');
  s += `<path class="area-fill" d="${line}L${X(n - 1)},${Y(0)}L${X(0)},${Y(0)}Z"/><path class="line" d="${line}"/>`;
  const step = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 90))));
  pts.forEach((p, i) => { if (i % step === 0) s += `<text class="axis-text" x="${X(i)}" y="${height - 6}" text-anchor="middle">${fmtDate(p.date, { day: 'numeric', month: 'short' })}</text>`; });
  s += `<line class="crosshair" y1="${m.t}" y2="${m.t + ih}" visibility="hidden"/><circle class="hover-dot" r="5" visibility="hidden"/>`;
  s += `<rect class="overlay" x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" fill="transparent"/>`;
  el.innerHTML = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Daily utilization line chart">${s}</svg>`;
  const svg = el.firstChild, cross = $('.crosshair', svg), dot = $('.hover-dot', svg), ov = $('.overlay', svg);
  const move = e => {
    const r = svg.getBoundingClientRect();
    const x = (e.clientX - r.left) * (width / r.width);
    const i = clamp(Math.round(((x - m.l) / iw) * (n - 1)), 0, n - 1);
    const p = pts[i];
    cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i)); cross.setAttribute('visibility', 'visible');
    dot.setAttribute('cx', X(i)); dot.setAttribute('cy', Y(p.value)); dot.setAttribute('visibility', 'visible');
    showTip(`<b>${fmtDate(p.date, { weekday: 'long', day: 'numeric', month: 'short' })}</b><br>Utilization ${pct(p.value)}`, e.clientX, e.clientY);
  };
  ov.addEventListener('pointermove', move);
  ov.addEventListener('pointerleave', () => { cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); hideTip(); });
}

/* ---------- tooltip & toast ---------- */
const tipEl = $('#tooltip');
function showTip(html, x, y) {
  tipEl.innerHTML = html; tipEl.hidden = false;
  const r = tipEl.getBoundingClientRect();
  let left = x + 14, top = y + 14;
  if (left + r.width > window.innerWidth - 8) left = x - r.width - 14;
  if (top + r.height > window.innerHeight - 8) top = y - r.height - 14;
  tipEl.style.left = Math.max(8, left) + 'px'; tipEl.style.top = Math.max(8, top) + 'px';
}
function hideTip() { tipEl.hidden = true; }
let dragging = false;
document.addEventListener('pointermove', e => {
  if (dragging || e.pointerType === 'touch') return;
  const t = e.target.closest && e.target.closest('[data-tip]');
  if (t && t.dataset.tip) showTip(t.dataset.tip, e.clientX, e.clientY);
  else if (!(e.target.classList && e.target.classList.contains('overlay'))) hideTip();
});
function toast(msg, tone) {
  const t = document.createElement('div');
  t.className = 'toast' + (tone ? ' ' + tone : '');
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

/* ---------- router ---------- */
const ROUTES = {
  admin: [['floor', 'Floor plan'], ['insights', 'KPIs & insights'], ['hardware', 'Hardware']],
  employee: [['book', 'Book a desk'], ['bookings', 'My bookings'], ['mcp', 'Connect AI (MCP)']],
};
function route() {
  const [, role, tab] = (location.hash || '#/').split('/');
  if (!ROUTES[role]) return { role: null, tab: null };
  const t = ROUTES[role].some(([k]) => k === tab) ? tab : ROUTES[role][0][0];
  return { role, tab: t };
}
function render() {
  hideTip();
  const { role, tab } = route();
  $$('.role-switch a').forEach(a => a.classList.toggle('active', a.dataset.role === role));
  const tabs = $('#tabs');
  if (!role) tabs.innerHTML = '';
  else {
    tabs.innerHTML = ROUTES[role].map(([k, l]) => `<a href="#/${role}/${k}" class="${k === tab ? 'active' : ''}">${l}</a>`).join('') +
      (role === 'employee' ? `<label class="me">Signed in as <select id="meSel">${state.employees.map(n => `<option ${n === state.me ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>` : `<span class="me">${esc(state.office.name)} · ${esc(state.office.floor)}</span>`);
    const sel = $('#meSel');
    if (sel) sel.onchange = () => { state.me = sel.value; ui.bookDesk = null; save(); render(); };
  }
  const app = $('#app');
  const view = !role ? viewLanding : VIEWS[role][tab];
  view(app);
}
window.addEventListener('hashchange', () => { ui.selected = null; ui.bookDesk = null; render(); window.scrollTo(0, 0); });

/* ---------- views ---------- */
function viewLanding(app) {
  const desks = state.desks.length;
  const t = todayStr(), s = nowSlot();
  const busy = state.desks.filter(d => deskStatus(d.id, t, s).state !== 'free').length;
  app.innerHTML = `
  <section class="hero">
    <span class="eyebrow">Showcase MVP</span>
    <h1>Book the desk.<br><em>Read the room.</em></h1>
    <p>SlayDesk is desk booking and workplace analytics in one. Admins design the floor plan and track how the office is really used; employees grab a desk in two clicks.</p>
  </section>
  <div class="role-cards">
    <a class="card role-card" href="#/admin/floor">
      <div class="ico">${icon('layout')}</div>
      <h2>I'm a company admin</h2>
      <p>Set up the office and track usage.</p>
      <ul><li>Draw the floor plan: place, name and number desks</li><li>Live green / red desk status from bookings and sensors</li><li>KPIs: utilization, peak days &amp; times, no-shows, most/least used desks</li></ul>
      <div class="go">Open admin →</div>
    </a>
    <a class="card role-card" href="#/employee/book">
      <div class="ico">${icon('desk')}</div>
      <h2>I'm an employee</h2>
      <p>Book desks and see availability.</p>
      <ul><li>Pick a date and time slot, then a green desk</li><li>Bookings update the floor plan in real time</li><li>Connect your AI assistant via MCP</li></ul>
      <div class="go">Open employee →</div>
    </a>
  </div>
  <div class="flow"><span>Right now:</span><b>${desks} desks</b><b>${busy} busy</b><b>${desks - busy} free</b><span class="spacer"></span><span>Floor plan → status &amp; KPIs → insights · Booking → floor plan · Sensors → status</span></div>`;
}

/* ----- Admin: floor plan editor ----- */
function viewAdminFloor(app) {
  app.innerHTML = `
  <div class="page-head">
    <div><h1>Floor plan</h1><p>The floor plan is the source of truth: desks you place here power booking, status lights and every KPI.</p></div>
  </div>
  <div class="split">
    <div class="card">
      <div class="toolbar">
        <button class="btn primary sm" id="addDesk">${icon('plus')}Desk</button>
        <button class="btn sm" id="addArea">${icon('square')}Area</button>
        <span class="divider"></span>
        <button class="btn sm" id="dupBtn">${icon('copy')}Duplicate</button>
        <button class="btn sm danger" id="delBtn">${icon('trash')}Delete</button>
        <span class="spacer"></span>
        <label class="check small"><input type="checkbox" id="liveChk" ${ui.liveStatus ? 'checked' : ''}/> Live status</label>
      </div>
      <div class="canvas-wrap" id="canvas"></div>
      <div class="row small muted" style="margin-top:10px">
        <span>Drag to move · arrow keys nudge (Shift = 10px steps) · Delete removes</span><span class="spacer"></span>
        <div class="legend"><span><i class="dot good"></i>Available now</span><span><i class="dot bad"></i>Booked / occupied</span></div>
      </div>
    </div>
    <aside class="card side" id="inspector"></aside>
  </div>`;
  const canvas = $('#canvas');
  const draw = () => {
    canvas.innerHTML = floorSvg({ mode: 'edit', date: todayStr(), slot: nowSlot(), selected: ui.selected });
    if (!ui.liveStatus) $$('.light, .desk-hatch', canvas).forEach(n => n.remove());
    $('#dupBtn').disabled = $('#delBtn').disabled = !ui.selected;
  };
  const findItem = id => state.desks.find(d => d.id === id) || state.areas.find(a => a.id === id);
  const select = id => { ui.selected = id; draw(); inspector(); };

  function inspector() {
    const el = $('#inspector');
    const item = ui.selected && findItem(ui.selected);
    if (!item) {
      const t = todayStr(), s = nowSlot();
      const busy = state.desks.filter(d => deskStatus(d.id, t, s).state !== 'free').length;
      const sensors = state.desks.filter(d => d.sensor).length;
      el.innerHTML = `
        <h2>Office</h2><div class="sub">Select a desk or area on the canvas to edit it.</div>
        <div class="field"><label for="oName">Office name</label><input class="input" id="oName" value="${esc(state.office.name)}"/></div>
        <div class="field"><label for="oFloor">Floor</label><input class="input" id="oFloor" value="${esc(state.office.floor)}"/></div>
        <hr class="sep"/>
        <h3 style="margin-bottom:8px">Right now (${SLOTS[s].label.toLowerCase()})</h3>
        <dl class="kv"><dt>Desks</dt><dd>${state.desks.length}</dd><dt>Busy</dt><dd>${busy}</dd><dt>Free</dt><dd>${state.desks.length - busy}</dd><dt>Desks with sensors</dt><dd>${sensors}</dd></dl>`;
      $('#oName').oninput = e => { state.office.name = e.target.value; save(); };
      $('#oFloor').oninput = e => { state.office.floor = e.target.value; save(); };
      return;
    }
    const isDesk = !!state.desks.find(d => d.id === item.id);
    let extra = '';
    if (isDesk) {
      const st = deskStatus(item.id, todayStr(), nowSlot());
      const upcoming = state.bookings.filter(b => b.deskId === item.id && b.date >= todayStr() && isActive(b)).length;
      const dup = state.desks.filter(d => d.label.trim().toLowerCase() === item.label.trim().toLowerCase()).length > 1;
      extra = `
        ${dup ? '<div class="notice">Another desk already uses this name.</div>' : ''}
        <label class="check" style="margin-bottom:14px"><input type="checkbox" id="fSensor" ${item.sensor ? 'checked' : ''}/> Occupancy sensor installed</label>
        <dl class="kv"><dt>Status now</dt><dd>${st.state === 'free' ? '<span class="badge good">Available</span>' : st.state === 'booked' ? '<span class="badge bad">Booked</span>' : '<span class="badge bad">Occupied</span>'}</dd>
        ${st.booking ? `<dt>Booked by</dt><dd>${esc(st.booking.user)}</dd>` : ''}
        <dt>Upcoming bookings</dt><dd>${upcoming}</dd></dl>`;
    }
    el.innerHTML = `
      <h2>${isDesk ? 'Desk' : 'Area'}</h2><div class="sub">${isDesk ? 'Name or number this desk.' : 'Areas are labels for rooms and zones (not bookable).'}</div>
      <div class="field"><label for="fLabel">${isDesk ? 'Desk name / number' : 'Label'}</label><input class="input" id="fLabel" value="${esc(item.label)}" maxlength="24"/></div>
      <div class="fields-2">
        <div class="field"><label for="fX">X</label><input class="input" type="number" id="fX" value="${item.x}" step="10"/></div>
        <div class="field"><label for="fY">Y</label><input class="input" type="number" id="fY" value="${item.y}" step="10"/></div>
        <div class="field"><label for="fW">Width</label><input class="input" type="number" id="fW" value="${item.w}" step="10" min="30"/></div>
        <div class="field"><label for="fH">Height</label><input class="input" type="number" id="fH" value="${item.h}" step="10" min="20"/></div>
      </div>${extra}`;
    $('#fLabel').oninput = e => { item.label = e.target.value || '?'; save(); draw(); };
    $('#fLabel').onchange = () => inspector();
    for (const [id, k, min] of [['fX', 'x', 0], ['fY', 'y', 0], ['fW', 'w', 30], ['fH', 'h', 20]]) {
      $('#' + id).oninput = e => {
        const v = Number(e.target.value); if (!Number.isFinite(v)) return;
        item[k] = k === 'x' || k === 'w' ? clamp(v, min, W - (k === 'x' ? item.w : item.x)) : clamp(v, min, H - (k === 'y' ? item.h : item.y));
        save(); draw();
      };
    }
    const sc = $('#fSensor');
    if (sc) sc.onchange = () => {
      item.sensor = sc.checked;
      if (item.sensor && !state.sensors[item.id]) state.sensors[item.id] = { online: true, occupied: false, battery: 100, lastSeen: Date.now() };
      if (!item.sensor) delete state.sensors[item.id];
      save(); draw(); inspector();
    };
  }

  function nextLabel() {
    const nums = state.desks.map(d => /^D?-?(\d+)$/i.exec(d.label)).filter(Boolean).map(m => +m[1]);
    let n = state.desks.length + 1;
    const used = new Set(state.desks.map(d => d.label.toLowerCase()));
    while (used.has(('desk ' + n).toLowerCase()) || used.has(String(n))) n++;
    return nums.length ? String(Math.max(...nums) + 1) : `Desk ${n}`;
  }
  function freeSpot(w, h) {
    for (let y = 80; y < H - h; y += 20) for (let x = 300; x < W - w; x += 20) {
      const hit = state.desks.some(d => x < d.x + d.w + 10 && x + w + 10 > d.x && y < d.y + d.h + 10 && y + h + 10 > d.y);
      if (!hit) return { x, y };
    }
    return { x: W / 2 - w / 2, y: H / 2 - h / 2 };
  }
  $('#addDesk').onclick = () => {
    const p = freeSpot(80, 48);
    const d = { id: uid('dk'), label: nextLabel(), x: p.x, y: p.y, w: 80, h: 48, sensor: false };
    state.desks.push(d); save(); select(d.id); toast(`Added desk ${d.label}`);
  };
  $('#addArea').onclick = () => {
    const a = { id: uid('ar'), label: 'New area', x: 300, y: 200, w: 200, h: 120 };
    state.areas.push(a); save(); select(a.id);
  };
  const remove = () => {
    if (!ui.selected) return;
    const d = state.desks.find(x => x.id === ui.selected);
    if (d) {
      const fut = state.bookings.filter(b => b.deskId === d.id && b.date >= todayStr() && isActive(b));
      if (fut.length && !confirm(`${d.label} has ${fut.length} upcoming booking(s). Delete the desk and cancel them?`)) return;
      fut.forEach(b => (b.status = 'cancelled'));
      state.desks = state.desks.filter(x => x.id !== d.id);
      delete state.sensors[d.id];
      toast(`Deleted ${d.label}`);
    } else state.areas = state.areas.filter(a => a.id !== ui.selected);
    save(); select(null);
  };
  $('#delBtn').onclick = remove;
  $('#dupBtn').onclick = () => {
    const it = findItem(ui.selected); if (!it) return;
    const isDesk = state.desks.includes(it);
    const copy = { ...it, id: uid(isDesk ? 'dk' : 'ar'), x: clamp(it.x + 20, 0, W - it.w), y: clamp(it.y + 20, 0, H - it.h) };
    if (isDesk) { copy.label = nextLabel(); copy.sensor = false; state.desks.push(copy); } else state.areas.push(copy);
    save(); select(copy.id);
  };
  $('#liveChk').onchange = e => { ui.liveStatus = e.target.checked; draw(); };

  // dragging
  let drag = null;
  canvas.addEventListener('pointerdown', e => {
    const g = e.target.closest('[data-id]');
    if (!g) { select(null); return; }
    const id = g.dataset.id;
    if (ui.selected !== id) select(id);
    const item = findItem(id);
    const pt = toSvg($('svg', canvas), e);
    drag = { id, item, sx: pt.x, sy: pt.y, ox: item.x, oy: item.y, moved: false, pid: e.pointerId };
    dragging = true; hideTip();
    $('svg', canvas).setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.pid) return;
    const svg = $('svg', canvas);
    const pt = toSvg(svg, e);
    const nx = clamp(snap(drag.ox + pt.x - drag.sx), 0, W - drag.item.w);
    const ny = clamp(snap(drag.oy + pt.y - drag.sy), 0, H - drag.item.h);
    if (nx !== drag.item.x || ny !== drag.item.y) {
      drag.item.x = nx; drag.item.y = ny; drag.moved = true;
      const g = svg.querySelector(`[data-id="${drag.id}"]`);
      if (g) g.setAttribute('transform', `translate(${nx},${ny})`);
    }
  });
  const end = () => {
    if (!drag) return;
    if (drag.moved) { save(); inspector(); }
    drag = null; dragging = false;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  keyHandler = e => {
    if (!ui.selected || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    const it = findItem(ui.selected); if (!it) return;
    const step = e.shiftKey ? 10 : 1;
    const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (mv) { e.preventDefault(); it.x = clamp(it.x + mv[0], 0, W - it.w); it.y = clamp(it.y + mv[1], 0, H - it.h); save(); draw(); inspector(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(); }
    else if (e.key === 'Escape') select(null);
  };
  draw(); inspector();
}
function toSvg(svg, e) {
  const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
  return p.matrixTransform(svg.getScreenCTM().inverse());
}
let keyHandler = null;
document.addEventListener('keydown', e => { const { role, tab } = route(); if (role === 'admin' && tab === 'floor' && keyHandler) keyHandler(e); });

/* ----- Admin: insights ----- */
function viewAdminInsights(app) {
  const k = computeKpis(ui.range);
  const ins = buildInsights(k);
  const most = k.deskUtil.slice(0, 5), least = k.deskUtil.slice(-5).reverse();
  const rank = list => `<ol class="rank">${list.map(x => `<li data-tip="<b>${esc(x.desk.label)}</b><br>Utilization ${pct(x.value)}<br>${x.bookings} bookings · no-show ${pct(x.noShow)}"><span class="lbl">${esc(x.desk.label)}</span><span class="track"><i style="width:${(x.value * 100).toFixed(1)}%"></i></span><span class="v">${pct(x.value)}</span></li>`).join('')}</ol>`;
  const heat = Object.fromEntries(k.deskUtil.map(x => [x.desk.id, x.value]));
  app.innerHTML = `
  <div class="page-head">
    <div><h1>KPIs &amp; insights</h1><p>Computed live from the floor plan and booking history (${k.days.length} working days, ${k.D} desks).</p></div>
    <div class="seg" id="rangeSeg"><button data-w="2">2 weeks</button><button data-w="4">4 weeks</button><button data-w="8">8 weeks</button></div>
  </div>
  <div class="kpis">
    <div class="card kpi"><div class="lbl">Utilization rate</div><div class="val">${pct(k.overall)}</div><div class="note">of desk half-days used</div></div>
    <div class="card kpi"><div class="lbl">Peak day</div><div class="val">${k.peak ? k.peak.label : '–'}</div><div class="note">${k.peak ? pct(k.peak.value) + ' utilization' : ''}</div></div>
    <div class="card kpi"><div class="lbl">Peak time</div><div class="val">${k.am >= k.pm ? 'AM' : 'PM'}</div><div class="note">Morning ${pct(k.am)} · Afternoon ${pct(k.pm)}</div></div>
    <div class="card kpi"><div class="lbl">No-show rate</div><div class="val">${pct(k.noShowRate, 1)}</div><div class="note">${k.noshow} of ${k.noshow + k.checked} bookings</div></div>
    <div class="card kpi"><div class="lbl">Most used desk</div><div class="val">${most[0] ? esc(most[0].desk.label) : '–'}</div><div class="note">${most[0] ? pct(most[0].value) : ''}</div></div>
    <div class="card kpi"><div class="lbl">Least used desk</div><div class="val">${least[0] ? esc(least[0].desk.label) : '–'}</div><div class="note">${least[0] ? pct(least[0].value) : ''}</div></div>
  </div>
  <div class="card">
    <div class="card-head"><h2>Insights</h2><p>Plain-language takeaways from the numbers</p></div>
    <ul class="insights">${ins.map(i => `<li class="insight ${i.tone}"><span class="ico">${icon(i.icon)}</span><div><div class="tag">${i.tag}</div><p>${i.html}</p></div></li>`).join('')}</ul>
  </div>
  <div class="grid-2" style="margin-top:16px">
    <div class="card"><div class="card-head"><h2>Utilization by weekday</h2><p>Share of desk half-days used</p></div><div class="chart" id="cDow"></div>
      <details class="table-view"><summary>View as table</summary><table class="tbl"><thead><tr><th>Day</th><th class="num">Utilization</th><th class="num">Morning</th><th class="num">Afternoon</th><th class="num">No-show</th></tr></thead><tbody>${k.dowUtil.map(d => `<tr><td>${d.name}</td><td class="num">${pct(d.value)}</td><td class="num">${pct(d.AM)}</td><td class="num">${pct(d.PM)}</td><td class="num">${pct(d.noShow)}</td></tr>`).join('')}</tbody></table></details>
    </div>
    <div class="card"><div class="card-head"><h2>Peak times</h2><p>Weekday × time slot</p></div><div class="chart" id="cHeat"></div>
      <div class="heat-legend"><span>0%</span><span class="ramp" style="background:${rampCss()}"></span><span>100%</span></div>
    </div>
  </div>
  <div class="card" style="margin-top:16px"><div class="card-head"><h2>Daily utilization</h2><p>Each working day in range</p></div><div class="chart" id="cLine"></div></div>
  <div class="grid-3-1" style="margin-top:16px">
    <div class="card"><div class="card-head"><h2>Desk heatmap</h2><p>Utilization per desk on the floor plan</p></div>
      <div class="canvas-wrap">${floorSvg({ mode: 'heat', heat })}</div>
      <div class="heat-legend"><span>0%</span><span class="ramp" style="background:${rampCss()}"></span><span>100%</span></div>
    </div>
    <div class="card"><h2 style="margin-bottom:12px">Most used</h2>${rank(most)}<h2 style="margin:20px 0 12px">Least used</h2>${rank(least)}
      <details class="table-view"><summary>All desks</summary><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Desk</th><th class="num">Util.</th><th class="num">No-show</th></tr></thead><tbody>${k.deskUtil.map(x => `<tr><td>${esc(x.desk.label)}</td><td class="num">${pct(x.value)}</td><td class="num">${pct(x.noShow)}</td></tr>`).join('')}</tbody></table></div></details>
    </div>
  </div>`;
  $$('#rangeSeg button').forEach(b => { b.classList.toggle('active', +b.dataset.w === ui.range); b.onclick = () => { ui.range = +b.dataset.w; render(); }; });
  barChart($('#cDow'), k.dowUtil.map(d => ({ label: d.label, value: d.value, tip: `<b>${d.name}</b><br>Utilization ${pct(d.value)}<br>Morning ${pct(d.AM)} · Afternoon ${pct(d.PM)}` })));
  heatmap($('#cHeat'), [{ key: 'AM', label: 'Morning' }, { key: 'PM', label: 'Afternoon' }], k.dowUtil.map(d => ({ label: d.label, name: d.name, d })), (r, c) => c.d[r.key], { height: 180 });
  lineChart($('#cLine'), k.dayUtil);
}

/* ----- Admin: hardware ----- */
function viewAdminHardware(app) {
  const t = todayStr(), s = nowSlot();
  const sensed = state.desks.filter(d => d.sensor && state.sensors[d.id]);
  const online = sensed.filter(d => state.sensors[d.id].online).length;
  const occ = sensed.filter(d => state.sensors[d.id].online && state.sensors[d.id].occupied).length;
  const ago = ts => { if (!ts) return 'never'; const m = Math.round((Date.now() - ts) / 60000); return m < 1 ? 'just now' : `${m} min ago`; };
  app.innerHTML = `
  <div class="page-head">
    <div><h1>Hardware</h1><p>Occupancy sensors under desks report whether someone is actually sitting there. A status check updates the desk lights, auto-checks-in booked desks and flags walk-ins. (Simulated in this demo.)</p></div>
    <div class="row"><label class="check small"><input type="checkbox" id="autoChk" ${state.autoPoll ? 'checked' : ''}/> Auto-check every 10s</label><button class="btn primary" id="pollBtn">${icon('refresh')}Run status check</button></div>
  </div>
  <div class="kpis">
    <div class="card kpi"><div class="lbl">Sensors online</div><div class="val">${online}/${sensed.length}</div><div class="note">${sensed.length - online} offline</div></div>
    <div class="card kpi"><div class="lbl">Occupied now</div><div class="val">${occ}</div><div class="note">${SLOTS[s].label} · detected by sensors</div></div>
    <div class="card kpi"><div class="lbl">Last check</div><div class="val" style="font-size:22px">${ago(state.lastPoll)}</div><div class="note">${state.lastPoll ? new Date(state.lastPoll).toLocaleTimeString() : ''}</div></div>
  </div>
  <div class="grid-3-1">
    <div class="card"><div class="card-head"><h2>Live floor</h2><div class="legend"><span><i class="dot good"></i>Available</span><span><i class="dot bad"></i>Booked / occupied</span></div></div>
      <div class="canvas-wrap">${floorSvg({ mode: 'status', date: t, slot: s })}</div></div>
    <div class="card"><h2 style="margin-bottom:8px">No sensor yet?</h2><p class="muted small">Toggle “Occupancy sensor installed” on any desk in the Floor plan editor to add one. Desks without sensors get their status from bookings only.</p></div>
  </div>
  <div class="card" style="margin-top:16px">
    <div class="card-head"><h2>Sensors</h2><p>Use “Simulate” to pretend someone sits down or leaves</p></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Desk</th><th>Connection</th><th>Occupancy</th><th>Booking now</th><th class="num">Battery</th><th>Last seen</th><th></th></tr></thead><tbody>
    ${sensed.length ? sensed.map(d => {
      const sn = state.sensors[d.id]; const b = activeBooking(d.id, t, s);
      return `<tr><td><b>${esc(d.label)}</b></td>
        <td>${sn.online ? '<span class="badge good">Online</span>' : '<span class="badge warn">Offline</span>'}</td>
        <td>${!sn.online ? '<span class="muted">–</span>' : sn.occupied ? '<span class="badge bad">Occupied</span>' : '<span class="badge">Empty</span>'}</td>
        <td>${b ? `${esc(b.user)} ${b.status === 'checked-in' ? '<span class="badge accent plain">checked in</span>' : ''}` : '<span class="muted">none</span>'}</td>
        <td class="num">${sn.battery}%</td><td>${ago(sn.lastSeen)}</td>
        <td><button class="btn sm" data-sim="${d.id}" ${sn.online ? '' : 'disabled'}>${sn.occupied ? 'Simulate leave' : 'Simulate sit'}</button></td></tr>`;
    }).join('') : '<tr><td colspan="7" class="muted">No sensors installed.</td></tr>'}
    </tbody></table></div>
  </div>`;
  $('#pollBtn').onclick = () => { pollHardware(); render(); };
  $('#autoChk').onchange = e => { state.autoPoll = e.target.checked; save(); setupAutoPoll(); };
  $$('[data-sim]').forEach(b => b.onclick = () => {
    const id = b.dataset.sim, sn = state.sensors[id];
    sn.occupied = !sn.occupied; sn.lastSeen = Date.now();
    const bk = activeBooking(id, t, s);
    if (sn.occupied && bk && bk.status === 'booked') { bk.status = 'checked-in'; bk.checkedInBy = 'sensor'; toast(`${bk.user} auto-checked in at ${deskById(id).label}`); }
    save(); render();
  });
}

/* ----- Employee: book ----- */
function viewEmployeeBook(app) {
  const days = nextWorkdays(10);
  if (!ui.bookDate || !days.includes(ui.bookDate)) ui.bookDate = days[0];
  const date = ui.bookDate, slot = ui.bookSlot;
  const statuses = state.desks.map(d => deskStatus(d.id, date, slot));
  const freeCount = statuses.filter(s => s.state === 'free').length;
  app.innerHTML = `
  <div class="page-head">
    <div><h1>Book a desk</h1><p>Pick a day and time, then tap a <b style="color:var(--good)">green</b> desk. Availability updates instantly — try it with the admin view open in another tab.</p></div>
  </div>
  <div class="card">
    <div class="row" style="gap:16px; align-items:flex-end">
      <div style="min-width:0; flex:1 1 380px"><div class="field" style="margin:0"><span class="lbl">Date</span>
        <div class="chips" id="dateChips">${days.map(d => `<button class="chip ${d === date ? 'active' : ''}" data-d="${d}"><span>${d === todayStr() ? 'Today' : fmtDate(d, { weekday: 'short' })}</span><b>${parse(d).getDate()}</b><span>${fmtDate(d, { month: 'short' })}</span></button>`).join('')}</div></div></div>
      <div class="field" style="margin:0"><span class="lbl">Time</span>
        <div class="seg" id="slotSeg">${Object.entries(SLOTS).map(([k, v]) => `<button data-s="${k}" class="${k === slot ? 'active' : ''}">${v.label}<small>${v.time}</small></button>`).join('')}</div></div>
    </div>
  </div>
  <div class="split" style="margin-top:16px">
    <div class="card">
      <div class="card-head"><h2>${esc(state.office.name)} · ${esc(state.office.floor)}</h2><p><b>${freeCount}</b> of ${state.desks.length} desks available · ${fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}, ${SLOTS[slot].label.toLowerCase()}</p></div>
      <div class="canvas-wrap" id="bookCanvas">${floorSvg({ mode: 'book', date, slot, selected: ui.bookDesk })}</div>
      <div class="legend" style="margin-top:10px"><span><i class="dot good"></i>Available</span><span><i class="dot bad"></i>Booked / occupied</span><span><i class="dot mine"></i>Your booking</span><span><svg width="14" height="12" viewBox="0 0 12 11"><g class="sensor-ico"><circle cx="6" cy="9" r="1.6"/><path d="M3 6.5a4.2 4.2 0 0 1 6 0M0.8 4a7.5 7.5 0 0 1 10.4 0"/></g></svg>Has sensor</span></div>
    </div>
    <aside class="card side" id="bookPanel"></aside>
  </div>`;
  $$('#dateChips .chip').forEach(b => b.onclick = () => { ui.bookDate = b.dataset.d; ui.bookDesk = null; render(); });
  $$('#slotSeg button').forEach(b => b.onclick = () => { ui.bookSlot = b.dataset.s; ui.bookDesk = null; render(); });
  const pick = g => { if (!g) return; ui.bookDesk = g.dataset.id; render(); const ng = $(`#bookCanvas [data-id="${ui.bookDesk}"]`); if (ng) ng.focus({ preventScroll: true }); };
  $('#bookCanvas').addEventListener('click', e => pick(e.target.closest('[data-kind="desk"]')));
  $('#bookCanvas').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(e.target.closest('[data-kind="desk"]')); } });

  const panel = $('#bookPanel');
  const desk = ui.bookDesk && deskById(ui.bookDesk);
  const mine = state.bookings.filter(b => b.user === state.me && b.date === date && isActive(b) && overlaps(b.slot, slot));
  const upcoming = state.bookings.filter(b => b.user === state.me && b.date >= todayStr() && isActive(b)).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4);
  const upList = upcoming.length ? `<ul class="list">${upcoming.map(b => `<li><span class="desk-pill">${esc(deskById(b.deskId)?.label ?? '?')}</span><div class="when"><b>${fmtDate(b.date)}</b><span>${SLOTS[b.slot].label}</span></div></li>`).join('')}</ul>` : '<p class="muted small">No upcoming bookings.</p>';
  if (!desk) {
    panel.innerHTML = `<div class="empty">${icon('desk')}<div>Select a desk on the floor plan</div></div>
      ${mine.length ? `<div class="notice info">You already have <b>${esc(deskById(mine[0].deskId)?.label)}</b> for this time.</div>` : ''}
      <hr class="sep"/><h3 style="margin-bottom:4px">Your upcoming bookings</h3>${upList}<a class="btn sm" href="#/employee/bookings" style="margin-top:8px">Manage bookings</a>`;
    return;
  }
  const st = deskStatus(desk.id, date, slot);
  let body = '';
  if (st.state === 'free') {
    const clash = mine[0];
    body = `<span class="badge good">Available</span>
      <dl class="kv" style="margin:14px 0"><dt>Date</dt><dd>${fmtDate(date, { weekday: 'short', day: 'numeric', month: 'short' })}</dd><dt>Time</dt><dd>${SLOTS[slot].label} (${SLOTS[slot].time})</dd><dt>Sensor</dt><dd>${desk.sensor ? 'Yes — auto check-in' : 'No'}</dd></dl>
      ${clash ? `<div class="notice">You already booked <b>${esc(deskById(clash.deskId)?.label)}</b> (${SLOTS[clash.slot].label.toLowerCase()}) for this day. Booking here will switch you.</div>` : ''}
      <button class="btn primary block" id="bookBtn">${icon('check')}${clash ? 'Switch to ' : 'Book '}${esc(desk.label)}</button>`;
  } else if (st.mine) {
    body = `<span class="badge accent">Your booking</span>
      <dl class="kv" style="margin:14px 0"><dt>Date</dt><dd>${fmtDate(date)}</dd><dt>Time</dt><dd>${SLOTS[st.booking.slot].label}</dd><dt>Status</dt><dd>${st.booking.status === 'checked-in' ? 'Checked in' : 'Booked'}</dd></dl>
      <button class="btn danger block" id="cancelBtn">${icon('trash')}Cancel booking</button>`;
  } else if (st.state === 'booked') {
    body = `<span class="badge bad">Booked</span><p style="margin-top:12px">Booked by <b>${esc(st.booking.user)}</b> for the ${SLOTS[st.booking.slot].label.toLowerCase()}.</p><p class="muted small" style="margin-top:6px">Try another time slot or a green desk.</p>`;
  } else {
    body = `<span class="badge bad">Occupied</span><p style="margin-top:12px">Nobody booked this desk, but its sensor detects someone sitting here right now.</p>`;
  }
  panel.innerHTML = `<h2>Desk ${esc(desk.label)}</h2><div class="sub">${esc(state.office.name)} · ${esc(state.office.floor)}</div>${body}<hr class="sep"/><h3 style="margin-bottom:4px">Your upcoming bookings</h3>${upList}`;
  const bb = $('#bookBtn');
  if (bb) bb.onclick = () => {
    if (activeBooking(desk.id, date, slot)) { toast('Someone just booked this desk', 'bad'); render(); return; }
    mine.forEach(b => (b.status = 'cancelled'));
    state.bookings.push({ id: uid('bk'), deskId: desk.id, user: state.me, date, slot, status: 'booked', createdAt: Date.now() });
    save(); toast(`Booked ${desk.label} · ${fmtDate(date)} · ${SLOTS[slot].label}`); render();
  };
  const cb = $('#cancelBtn');
  if (cb) cb.onclick = () => { st.booking.status = 'cancelled'; save(); toast(`Cancelled ${desk.label}`); render(); };
}

/* ----- Employee: my bookings ----- */
function viewEmployeeBookings(app) {
  const t = todayStr();
  const mine = state.bookings.filter(b => b.user === state.me);
  const upcoming = mine.filter(b => b.date >= t && isActive(b)).sort((a, b) => a.date.localeCompare(b.date) || a.slot.localeCompare(b.slot));
  const past = mine.filter(b => b.date < t && b.status !== 'cancelled').sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15);
  const badge = s => ({ 'checked-in': '<span class="badge good">Checked in</span>', 'no-show': '<span class="badge bad">No-show</span>', booked: '<span class="badge accent">Booked</span>' }[s] || `<span class="badge">${esc(s)}</span>`);
  const attended = past.filter(b => b.status === 'checked-in').length;
  app.innerHTML = `
  <div class="page-head"><div><h1>My bookings</h1><p>Signed in as <b>${esc(state.me)}</b>. Check in when you arrive — desks with sensors check you in automatically.</p></div>
  <a class="btn primary" href="#/employee/book">${icon('plus')}New booking</a></div>
  <div class="grid-3-1">
    <div class="card"><div class="card-head"><h2>Upcoming</h2><p>${upcoming.length} booking${upcoming.length === 1 ? '' : 's'}</p></div>
      ${upcoming.length ? `<ul class="list">${upcoming.map(b => `<li>
        <span class="desk-pill">${esc(deskById(b.deskId)?.label ?? '—')}</span>
        <div class="when"><b>${b.date === t ? 'Today' : fmtDate(b.date, { weekday: 'long', day: 'numeric', month: 'short' })}</b><span>${SLOTS[b.slot].label} · ${SLOTS[b.slot].time}</span></div>
        ${badge(b.status)}<span class="spacer"></span>
        ${b.date === t && b.status === 'booked' ? `<button class="btn sm primary" data-checkin="${b.id}">${icon('check')}Check in</button>` : ''}
        <button class="btn sm danger" data-cancel="${b.id}">Cancel</button></li>`).join('')}</ul>` : `<div class="empty">${icon('desk')}<div>No upcoming bookings</div></div>`}
    </div>
    <div class="card"><h2 style="margin-bottom:8px">Your attendance</h2>
      <div class="kpi" style="padding:0"><div class="val">${past.length ? pct(attended / past.length) : '–'}</div><div class="note">of your last ${past.length} bookings were used</div></div>
      <p class="muted small" style="margin-top:10px">Unused bookings count as no-shows and block a desk for a colleague. Cancel if your plans change.</p></div>
  </div>
  <div class="card" style="margin-top:16px"><div class="card-head"><h2>History</h2></div>
    ${past.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Desk</th><th>Time</th><th>Status</th></tr></thead><tbody>${past.map(b => `<tr><td>${fmtDate(b.date)}</td><td><b>${esc(deskById(b.deskId)?.label ?? '—')}</b></td><td>${SLOTS[b.slot].label}</td><td>${badge(b.status)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No past bookings.</p>'}
  </div>`;
  $$('[data-cancel]').forEach(b => b.onclick = () => { const bk = state.bookings.find(x => x.id === b.dataset.cancel); bk.status = 'cancelled'; save(); toast('Booking cancelled'); render(); });
  $$('[data-checkin]').forEach(b => b.onclick = () => { const bk = state.bookings.find(x => x.id === b.dataset.checkin); bk.status = 'checked-in'; save(); toast(`Checked in at ${deskById(bk.deskId)?.label}`); render(); });
}

/* ----- Employee: MCP ----- */
function viewEmployeeMcp(app) {
  const token = state.mcpToken || 'sd_demo_••••••••••••••••';
  const url = 'https://mcp.slaydesk.example/mcp';
  const json = JSON.stringify({ mcpServers: { slaydesk: { type: 'http', url, headers: { Authorization: `Bearer ${token}` } } } }, null, 2);
  const cli = `claude mcp add --transport http slaydesk ${url} \\\n  --header "Authorization: Bearer ${token}"`;
  const tools = [
    ['find_available_desks', 'date, slot, near?', 'List free desks for a day and time slot'],
    ['book_desk', 'desk, date, slot', 'Book a desk for yourself'],
    ['list_my_bookings', '—', 'Your upcoming bookings'],
    ['cancel_booking', 'booking_id', 'Cancel one of your bookings'],
    ['check_in', 'booking_id', 'Check in to today’s booking'],
  ];
  const code = (txt, id) => `<div class="code"><button class="btn sm copy" data-copy="${id}">${icon('copy')}Copy</button><pre id="${id}">${esc(txt)}</pre></div>`;
  app.innerHTML = `
  <div class="page-head"><div><h1>Connect your AI assistant</h1><p>SlayDesk speaks the Model Context Protocol (MCP), so assistants like Claude can find and book desks for you in plain language.</p></div></div>
  <div class="notice info">Preview: this showcase runs entirely in your browser, so the MCP endpoint below is illustrative and not live yet.</div>
  <div class="grid-3-1">
    <div class="card">
      <ol class="steps">
        <li><h3>Create a personal access token</h3><p>Tokens are scoped to your own bookings.</p>
          <div class="row" style="margin-top:8px"><button class="btn sm primary" id="genTok">${icon('plus')}${state.mcpToken ? 'Regenerate token' : 'Generate token'}</button>${state.mcpToken ? `<code>${esc(state.mcpToken)}</code>` : ''}</div></li>
        <li><h3>Claude Desktop (or any MCP client)</h3><p>Add SlayDesk to your client’s MCP config file (in Claude Desktop: Settings → Developer → Edit config), then restart the app.</p>${code(json, 'cfgJson')}</li>
        <li><h3>Claude Code</h3><p>Run this once in your terminal:</p>${code(cli, 'cfgCli')}</li>
        <li><h3>Ask away</h3><p>Your assistant now sees the SlayDesk tools and can act on your behalf.</p>
          <div class="prompts" style="margin-top:8px"><div>Book me a window desk for Thursday morning</div><div>Is anyone sitting near A3 tomorrow?</div><div>Cancel my Friday booking and find me something on Tuesday instead</div></div></li>
      </ol>
    </div>
    <div class="card"><h2 style="margin-bottom:12px">Available tools</h2>
      <ul class="list">${tools.map(([n, a, d]) => `<li style="display:block"><code style="font-weight:600">${n}</code><div class="muted small">${a}</div><div class="small">${d}</div></li>`).join('')}</ul>
    </div>
  </div>`;
  $('#genTok').onclick = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    state.mcpToken = 'sd_demo_' + Array.from({ length: 24 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    save(); render(); toast('Token generated (demo only)');
  };
  $$('[data-copy]').forEach(b => b.onclick = async () => {
    try { await navigator.clipboard.writeText($('#' + b.dataset.copy).textContent); toast('Copied to clipboard'); } catch (e) { toast('Copy failed — select the text manually', 'bad'); }
  });
}

const VIEWS = {
  admin: { floor: viewAdminFloor, insights: viewAdminInsights, hardware: viewAdminHardware },
  employee: { book: viewEmployeeBook, bookings: viewEmployeeBookings, mcp: viewEmployeeMcp },
};

/* ---------- live sync, auto-poll, theme, reset ---------- */
// "Real time": any change in another tab re-renders this one.
window.addEventListener('storage', e => {
  if (e.key !== KEY || dragging) return;
  state = load();
  const active = document.activeElement;
  if (active && /INPUT|SELECT|TEXTAREA/.test(active.tagName) && route().tab === 'floor') return; // don't clobber typing
  render();
});

let pollTimer = null;
function setupAutoPoll() {
  clearInterval(pollTimer);
  if (!state.autoPoll) return;
  pollTimer = setInterval(() => {
    pollHardware(true);
    const { role, tab } = route();
    if (dragging) return;
    if ((role === 'admin' && tab !== 'floor') || (role === 'employee' && tab === 'book') || !role) render();
  }, 10000);
}

function applyTheme(t) {
  if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
}
try { applyTheme(localStorage.getItem(THEME_KEY)); } catch (e) { /* ignore */ }
$('#themeBtn').onclick = () => {
  const next = isDark() ? 'light' : 'dark';
  applyTheme(next);
  try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ }
  render();
};
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => render());
$('#resetBtn').onclick = () => {
  if (!confirm('Reset all demo data? Your floor plan edits and bookings will be replaced with fresh sample data.')) return;
  state = seedState(); save(); ui.selected = null; ui.bookDesk = null; render(); toast('Demo data reset');
};

let resizeT;
window.addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => { if (route().tab === 'insights') render(); }, 150);
});

state = load();
setupAutoPoll();
render();
