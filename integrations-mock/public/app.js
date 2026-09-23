// Fake CPR / אנשים בדיגיטל UI. Talks only to its own server (same origin), which adds the
// integration key and relays to Doch1. Every DOM node is built with createElement/textContent —
// never innerHTML — because soldier names and error messages come from another system.

const $ = (id) => document.getElementById(id);

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  return node;
}

// ---------- dates (ISO YYYY-MM-DD; "today" always comes from the server, in Asia/Jerusalem) ----------

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const daysInclusive = (a, b) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000) + 1;
const fmt = (iso) => iso.split('-').reverse().join('/');
const daysText = (n) => (n === 1 ? 'יום אחד' : `${n} ימים`);
const isIso = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v);

// ---------- server calls ----------

const NETWORK_ERROR = 'אין חיבור לשרת ההדמיה, נסו שוב';

async function call(path, body) {
  try {
    const res = await fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: { accept: 'application/json', ...(body && { 'content-type': 'application/json' }) },
      body: body && JSON.stringify(body),
      credentials: 'same-origin',
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      // non-JSON: handled as an error below
    }
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}
const errorOf = (r) => ({
  message: typeof r.data?.error?.message === 'string' ? r.data.error.message : NETWORK_ERROR,
  code: typeof r.data?.error?.code === 'string' ? r.data.error.code : '',
});

// ---------- soldier picker ----------

const soldierName = (s) => `${s.firstName} ${s.lastName}`;

// The directory endpoint returns at most this many (INTEGRATION_SOLDIERS_LIMIT in @doch1/shared).
const SOLDIERS_LIMIT = 50;

// A plain <select> of every active soldier, grouped by unit. Loaded once and shared by both tabs.
function createPicker(container, selectId, directory, onChange) {
  const select = el('select', { id: selectId, name: 'soldier' });
  select.append(el('option', { value: '' }, directory.ok ? 'בחרו חייל/ת…' : 'לא ניתן לטעון חיילים'));
  const byNumber = new Map();
  if (directory.ok) {
    const groups = new Map();
    for (const s of directory.soldiers) {
      byNumber.set(s.personalNumber, s);
      const g = s.groupName ?? 'ללא קבוצה';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(s);
    }
    for (const [label, soldiers] of [...groups].sort(([a], [b]) => a.localeCompare(b, 'he'))) {
      select.append(
        el(
          'optgroup',
          { label },
          ...soldiers.map((s) =>
            el('option', { value: s.personalNumber }, `${soldierName(s)} · מ״א ${s.personalNumber}`),
          ),
        ),
      );
    }
  }
  select.disabled = !directory.ok || byNumber.size === 0;
  container.append(select);

  const hint = directory.ok
    ? byNumber.size === 0
      ? 'אין חיילים פעילים במערכת'
      : byNumber.size >= SOLDIERS_LIMIT
        ? `מוצגים ${SOLDIERS_LIMIT} החיילים הראשונים`
        : ''
    : directory.message;
  if (hint) container.append(el('p', { class: 'hint', 'aria-live': 'polite' }, hint));

  select.addEventListener('change', onChange);
  return { get: () => byNumber.get(select.value) ?? null };
}

async function loadDirectory() {
  const r = await call(`/api/soldiers?${new URLSearchParams({ limit: String(SOLDIERS_LIMIT) })}`);
  return r.ok && Array.isArray(r.data?.soldiers)
    ? { ok: true, soldiers: r.data.soldiers }
    : { ok: false, message: errorOf(r).message };
}

// ---------- result panel + recent sends ----------

function showResult(panel, r) {
  panel.hidden = false;
  panel.className = `card result ${r.ok ? 'ok' : 'err'}`;
  if (!r.ok) {
    const { message, code } = errorOf(r);
    panel.replaceChildren(el('h3', {}, 'הבקשה נדחתה'), el('p', { class: 'err-msg' }, message));
    if (code) panel.append(el('p', { class: 'hint code', dir: 'ltr' }, code));
    return;
  }
  const d = r.data;
  const stat = (label, n) =>
    el('div', { class: 'stat' }, el('span', { class: 'num' }, String(n)), el('span', {}, label));
  panel.replaceChildren(
    el('h3', {}, 'התקבל בדוח 1'),
    el(
      'div',
      { class: 'stats' },
      stat('נוצרו', d.created),
      stat('עודכנו', d.updated),
      stat('ללא שינוי', d.unchanged),
    ),
    el('ul', { class: 'dates' }, ...d.dates.map((iso) => el('li', {}, fmt(iso)))),
  );
}

const LOG_MAX = 20;
function addLog(list, soldier, what, r) {
  const time = new Date().toLocaleTimeString('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jerusalem',
  });
  const outcome = r.ok
    ? `✓ נוצרו ${r.data.created} · עודכנו ${r.data.updated} · ללא שינוי ${r.data.unchanged}`
    : `✕ ${errorOf(r).message}`;
  list.prepend(
    el(
      'li',
      { class: r.ok ? 'ok' : 'err' },
      el('span', { class: 'when' }, time),
      el('span', {}, `${soldierName(soldier)} · ${what}`),
      el('span', { class: 'outcome' }, outcome),
    ),
  );
  while (list.children.length > LOG_MAX) list.lastElementChild.remove();
}

// ---------- one tab = picker + fields + send ----------

function setupTab({ prefix, directory, endpoint, read, preview, describe }) {
  const form = $(`${prefix}-form`);
  const send = $(`${prefix}-send`);
  const spinner = send.querySelector('.spinner');
  const previewEl = $(`${prefix}-preview`);
  let sending = false;

  const refresh = () => {
    const soldier = picker.get();
    const values = read();
    previewEl.textContent = values ? preview(values) : '';
    send.disabled = sending || !soldier || !values;
  };
  const picker = createPicker($(`${prefix}-picker`), `${prefix}-soldier`, directory, refresh);
  form.addEventListener('input', refresh);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const soldier = picker.get();
    const values = read();
    if (sending || !soldier || !values) return;
    sending = true;
    spinner.hidden = false;
    refresh();
    const r = await call(endpoint, { personalNumber: soldier.personalNumber, ...values });
    sending = false;
    spinner.hidden = true;
    refresh();
    showResult($(`${prefix}-result`), r);
    addLog($(`${prefix}-log`), soldier, describe(values), r);
  });
  return refresh;
}

function setupCpr(cfg, directory) {
  const days = $('cpr-days');
  days.max = String(cfg.cprMaxDays);
  days.placeholder = `1–${cfg.cprMaxDays}`;
  $('cpr-issue').textContent = fmt(cfg.today);
  return setupTab({
    prefix: 'cpr',
    directory,
    endpoint: '/api/cpr',
    read: () => {
      const n = Number(days.value);
      return days.value !== '' && Number.isInteger(n) && n >= 1 && n <= cfg.cprMaxDays
        ? { days: n }
        : null;
    },
    preview: ({ days: n }) =>
      `גימלים יוזנו מ-${fmt(addDays(cfg.today, 1))} עד ${fmt(addDays(cfg.today, n))} (${daysText(n)})`,
    describe: ({ days: n }) => `${daysText(n)} גימלים`,
  });
}

function setupPeople(cfg, directory) {
  const start = $('people-start');
  const end = $('people-end');
  start.min = end.min = cfg.today;
  start.max = end.max = cfg.maxDate;
  start.addEventListener('change', () => {
    end.min = isIso(start.value) ? start.value : cfg.today;
    if (isIso(start.value) && (!isIso(end.value) || end.value < start.value))
      end.value = start.value;
  });
  return setupTab({
    prefix: 'people',
    directory,
    endpoint: '/api/people-digital',
    read: () => {
      const [s, e] = [start.value, end.value];
      const ok = isIso(s) && isIso(e) && cfg.today <= s && s <= e && e <= cfg.maxDate;
      return ok ? { startDate: s, endDate: e } : null;
    },
    preview: ({ startDate, endDate }) =>
      `חופשה שנתית תוזן ל-${daysText(daysInclusive(startDate, endDate))}: ${fmt(startDate)} – ${fmt(endDate)}`,
    describe: ({ startDate, endDate }) => `חופשה ${fmt(startDate)} – ${fmt(endDate)}`,
  });
}

// ---------- tabs (active tab lives in the URL hash) ----------

const TABS = ['cpr', 'people'];
function showTab() {
  const active = TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'cpr';
  for (const t of TABS) {
    $(`panel-${t}`).hidden = t !== active;
    $(`tab-${t}`).setAttribute('aria-selected', String(t === active));
  }
}

async function main() {
  window.addEventListener('hashchange', showTab);
  showTab();
  const r = await call('/api/config');
  if (!r.ok) {
    document
      .querySelector('main')
      .prepend(el('div', { class: 'card result err' }, errorOf(r).message));
    return;
  }
  const directory = await loadDirectory();
  setupCpr(r.data, directory)();
  setupPeople(r.data, directory)();
}

main();
