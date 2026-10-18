'use strict';
/* ==========================================================================
   Spendly — personal expense tracker (vanilla JS, offline-first PWA)
   Data lives in localStorage on the device.
   ========================================================================== */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const KEY = 'spendly:v1';
const TIP_KEY = 'spendly:tip-dismissed';
const DEFAULTS = { name: '', currency: '₹', budget: 10000, theme: 'auto' };

const CATS = {
  expense: [
    { id: 'food',      name: 'Food',      icon: '🍔', color: '#FF9F0A' },
    { id: 'groceries', name: 'Groceries', icon: '🛒', color: '#30D158' },
    { id: 'transport', name: 'Transport', icon: '🚕', color: '#0A84FF' },
    { id: 'shopping',  name: 'Shopping',  icon: '🛍️', color: '#FF375F' },
    { id: 'bills',     name: 'Bills',     icon: '💡', color: '#FFD60A' },
    { id: 'fun',       name: 'Fun',       icon: '🎬', color: '#BF5AF2' },
    { id: 'health',    name: 'Health',    icon: '💊', color: '#FF453A' },
    { id: 'education', name: 'Education', icon: '📚', color: '#5E5CE6' },
    { id: 'travel',    name: 'Travel',    icon: '✈️', color: '#40C8E0' },
    { id: 'other',     name: 'Other',     icon: '📦', color: '#8E8E93' },
  ],
  income: [
    { id: 'salary',    name: 'Salary',    icon: '💼', color: '#30D158' },
    { id: 'pocket',    name: 'Pocket Money', icon: '💰', color: '#FFD60A' },
    { id: 'freelance', name: 'Freelance', icon: '💻', color: '#0A84FF' },
    { id: 'gift',      name: 'Gift',      icon: '🎁', color: '#FF375F' },
    { id: 'other',     name: 'Other',     icon: '✨', color: '#8E8E93' },
  ],
};
const catOf = (type, id) => (CATS[type] || CATS.expense).find(c => c.id === id) || (CATS[type] || CATS.expense).at(-1);
const TABS = ['home', 'activity', 'insights', 'settings'];

/* ---------- State ---------- */
let state = load();
let current = 'home';
let viewMonth = todayISO().slice(0, 7);
let filter = 'all';
let query = '';
let editingId = null;
let selectedCat = 'food';
let lastDeleted = null;
let openRow = null;
let suppressClick = false;

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && Array.isArray(s.tx)) return { settings: { ...DEFAULTS, ...s.settings }, tx: s.tx.filter(validTx) };
  } catch (e) { /* ignore */ }
  return { settings: { ...DEFAULTS }, tx: [] };
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { notify('⚠️ Could not save — export a backup'); }
}
function validTx(t) {
  return t && typeof t.amount === 'number' && t.amount > 0 && CATS[t.type] && /^\d{4}-\d{2}-\d{2}$/.test(t.date);
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- Dates & money ---------- */
function toISO(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function todayISO() { return toISO(new Date()); }
function parseISO(iso) { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); }
function monthLabel(mk, withYear = true) {
  const [y, m] = mk.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', withYear ? { month: 'long', year: 'numeric' } : { month: 'long' });
}
function shiftMonth(mk, n) { const [y, m] = mk.split('-').map(Number); return toISO(new Date(y, m - 1 + n, 1)).slice(0, 7); }
function daysInMonth(mk) { const [y, m] = mk.split('-').map(Number); return new Date(y, m, 0).getDate(); }
function dayLabel(iso) {
  const n = new Date();
  if (iso === toISO(n)) return 'Today';
  if (iso === toISO(new Date(n.getFullYear(), n.getMonth(), n.getDate() - 1))) return 'Yesterday';
  const d = parseISO(iso);
  const opts = { weekday: 'short', day: 'numeric', month: 'short' };
  if (d.getFullYear() !== n.getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('en-IN', opts);
}
function money(n, { sign = false, compact = false } = {}) {
  const cur = state.settings.currency;
  const locale = cur === '₹' ? 'en-IN' : 'en-US';
  const abs = Math.abs(n);
  const s = compact
    ? abs.toLocaleString(locale, { notation: 'compact', maximumFractionDigits: 1 })
    : abs.toLocaleString(locale, { minimumFractionDigits: abs % 1 ? 2 : 0, maximumFractionDigits: 2 });
  const pre = n < 0 ? '−' : (sign && n > 0 ? '+' : '');
  return pre + cur + s;
}
const sorted = () => [...state.tx].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
const inMonth = mk => state.tx.filter(t => t.date.startsWith(mk));
const total = (arr, type) => arr.reduce((a, t) => (t.type === type ? a + t.amount : a), 0);

/* ---------- Animated numbers ---------- */
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
function countUp(el, to) {
  const from = el._v ?? 0;
  el._v = to;
  if (reduceMotion.matches || from === to) { el.textContent = money(to); return; }
  const t0 = performance.now(), dur = 800;
  const step = now => {
    const p = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - p, 4);
    el.textContent = p < 1 ? money(Math.round(from + (to - from) * e)) : money(to);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ---------- Theme ---------- */
const darkMQ = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const t = state.settings.theme === 'auto' ? (darkMQ.matches ? 'dark' : 'light') : state.settings.theme;
  document.documentElement.dataset.theme = t;
  $('meta[name="theme-color"]').content = t === 'dark' ? '#000000' : '#EEF0F7';
}
darkMQ.addEventListener?.('change', applyTheme);

/* ---------- Rendering ---------- */
function rowHTML(t, showDate = true) {
  const c = catOf(t.type, t.category);
  const title = t.note || c.name;
  const sub = [t.note ? c.name : '', showDate ? dayLabel(t.date) : ''].filter(Boolean).join(' · ');
  return `<div class="tx" data-id="${t.id}">
    <button class="tx-del" tabindex="-1"><span>Delete</span></button>
    <div class="tx-main">
      <span class="tx-ico" style="background:${c.color}33">${c.icon}</span>
      <span class="tx-text"><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span>
      <span class="tx-amt ${t.type === 'income' ? 'pos' : ''}">${t.type === 'income' ? money(t.amount, { sign: true }) : money(t.amount)}</span>
    </div>
  </div>`;
}

function emptyHTML(big, title, text, withActions) {
  return `<div class="empty"><div class="big">${big}</div><b>${title}</b>${text}${withActions
    ? `<div><button class="pill-btn" data-action="add">Add Expense</button> <button class="pill-btn ghost" data-action="sample">Try Sample Data</button></div>` : ''}</div>`;
}

function renderHome() {
  const today = todayISO();
  const mk = today.slice(0, 7);
  const list = inMonth(mk);
  const spent = total(list, 'expense');
  const income = total(list, 'income');
  const todaySpent = total(state.tx.filter(t => t.date === today), 'expense');
  const dayNum = new Date().getDate();
  const budget = Number(state.settings.budget) || 0;
  const h = new Date().getHours();

  const hello = h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  $('#greeting').textContent = state.settings.name ? `${hello}, ${state.settings.name}` : hello;
  $('#heroMonth').textContent = monthLabel(mk, false);
  countUp($('#heroSpent'), spent);
  $('#heroIncome').textContent = money(income);
  const net = income - spent;
  $('#heroNet').textContent = money(net, { sign: true });
  $('#heroNet').className = net >= 0 ? 'pos' : 'neg';
  $('#heroToday').textContent = money(todaySpent);

  const pct = budget ? spent / budget : 0;
  const pace = dayNum / daysInMonth(mk);
  const level = !budget ? 'none' : pct > 1 ? 'over' : (pct > .85 || pct > pace + .12) ? 'warn' : 'ok';
  const fill = $('#budgetFill');
  requestAnimationFrame(() => { fill.style.width = `${Math.min(pct, 1) * 100}%`; });
  fill.dataset.s = level;
  const chip = $('#heroChip');
  chip.dataset.s = level;
  chip.textContent = { none: 'No budget', over: 'Over budget', warn: 'Spending fast', ok: 'On track' }[level];

  const heroCard = $('#heroCard');
  if (heroCard) {
    heroCard.classList.remove('glass-tint-green', 'glass-tint-orange', 'glass-tint-red');
    if (level === 'ok') heroCard.classList.add('glass-tint-green');
    else if (level === 'warn') heroCard.classList.add('glass-tint-orange');
    else if (level === 'over') heroCard.classList.add('glass-tint-red');
  }

  $('#budgetLeft').textContent = !budget ? 'Set a monthly budget in Settings'
    : spent <= budget ? `${money(budget - spent)} left` : `${money(spent - budget)} over`;
  $('#budgetOf').textContent = budget ? `of ${money(budget)}` : '';

  $('#tileAvg').textContent = money(Math.round(spent / dayNum));
  const byCat = {};
  list.filter(t => t.type === 'expense').forEach(t => { byCat[t.category] = (byCat[t.category] || 0) + t.amount; });
  const top = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
  $('#tileTop').textContent = top ? `${catOf('expense', top[0]).icon} ${catOf('expense', top[0]).name}` : '—';

  const recent = sorted().slice(0, 5);
  $('#recentList').innerHTML = recent.length
    ? recent.map(t => rowHTML(t)).join('')
    : emptyHTML('🪙', 'No transactions yet', 'Tap + to add your first expense.', true);

  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  let dismissed = false;
  try { dismissed = !!localStorage.getItem(TIP_KEY); } catch (e) { /* ignore */ }
  $('#installTip').hidden = !(isIOS && !standalone && !dismissed);
}

function renderActivity() {
  const q = query.trim().toLowerCase();
  const items = sorted().filter(t => {
    if (filter !== 'all' && t.type !== filter) return false;
    if (!q) return true;
    const c = catOf(t.type, t.category);
    return (t.note || '').toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || String(t.amount).includes(q);
  });
  if (!items.length) {
    $('#activityList').innerHTML = `<div class="glass card">${state.tx.length
      ? emptyHTML('🔍', 'No results', 'Try a different search or filter.', false)
      : emptyHTML('🧾', 'Nothing here yet', 'Your transactions will show up here.', true)}</div>`;
    return;
  }
  const groups = new Map();
  items.forEach(t => { if (!groups.has(t.date)) groups.set(t.date, []); groups.get(t.date).push(t); });
  let html = '';
  for (const [date, txs] of groups) {
    const spent = total(txs, 'expense');
    html += `<div class="group"><div class="group-head"><span>${dayLabel(date)}</span><span>${spent ? money(spent) : ''}</span></div>
      <div class="list glass card">${txs.map(t => rowHTML(t, false)).join('')}</div></div>`;
  }
  $('#activityList').innerHTML = html;
}

function renderInsights() {
  const mk = viewMonth;
  const cur = todayISO().slice(0, 7);
  $('#insMonth').textContent = monthLabel(mk);
  $('#nextMonth').disabled = mk >= cur;

  const exp = inMonth(mk).filter(t => t.type === 'expense');
  const sum = total(exp, 'expense');
  const byCat = {};
  exp.forEach(t => { byCat[t.category] = (byCat[t.category] || 0) + t.amount; });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([id, v]) => ({ ...catOf('expense', id), v }));

  countUp($('#donutTotal'), sum);
  $('#donutCount').textContent = exp.length ? `${exp.length} expense${exp.length > 1 ? 's' : ''}` : 'No expenses';

  // Donut
  const R = 70, C = 2 * Math.PI * R;
  let off = 0;
  let svg = `<circle class="donut-bg" cx="90" cy="90" r="${R}"/>`;
  cats.forEach(c => {
    const len = (c.v / sum) * C;
    const gap = cats.length > 1 ? 2.5 : 0;
    const dash = Math.max(len - gap, .5);
    svg += `<circle class="seg" cx="90" cy="90" r="${R}" stroke="${c.color}" style="stroke-dasharray:0 ${C}" data-dash="${dash} ${C - dash}" stroke-dashoffset="${-off}"/>`;
    off += len;
  });
  const donut = $('#donut');
  donut.innerHTML = svg;

  $('#legend').innerHTML = cats.length ? cats.map(c => `
    <div class="legend-row">
      <span class="tx-ico" style="background:${c.color}33">${c.icon}</span>
      <div><div class="legend-name">${c.name}<span>${Math.round((c.v / sum) * 100)}%</span></div>
      <div class="legend-bar"><i style="background:${c.color}" data-w="${(c.v / cats[0].v) * 100}"></i></div></div>
      <span class="legend-amt">${money(c.v)}</span>
    </div>`).join('') : `<p class="empty">No spending recorded in ${monthLabel(mk, false)}.</p>`;

  requestAnimationFrame(() => requestAnimationFrame(() => {
    $$('.seg', donut).forEach((c, i) => { c.style.transitionDelay = `${i * 70}ms`; c.style.strokeDasharray = c.dataset.dash; });
    $$('.legend-bar i').forEach((b, i) => { b.style.transitionDelay = `${i * 50}ms`; b.style.width = b.dataset.w + '%'; });
  }));

  // Daily bars
  const days = daysInMonth(mk);
  const daily = Array(days).fill(0);
  exp.forEach(t => { daily[Number(t.date.slice(8)) - 1] += t.amount; });
  const max = Math.max(...daily, 1);
  const today = todayISO();
  $('#bars').innerHTML = daily.map((v, i) => {
    const iso = `${mk}-${String(i + 1).padStart(2, '0')}`;
    return `<i class="${v ? '' : 'zero'} ${iso === today ? 'today' : ''}" style="--h:${(v / max) * 100};--d:${i * 14}ms" data-iso="${iso}" data-v="${v}"></i>`;
  }).join('');
  const ticks = [1, 8, 15, 22, days];
  $('#barsAxis').innerHTML = ticks.map(d => `<span>${d}</span>`).join('');
  const peak = daily.indexOf(Math.max(...daily));
  $('#barsMeta').textContent = sum ? `Peak ${money(daily[peak], { compact: true })} on ${peak + 1} ${monthLabel(mk, false).slice(0, 3)}` : '';
}

function syncSettingsUI() {
  const s = state.settings;
  $('#setName').value = s.name;
  $('#setBudget').value = s.budget ? String(s.budget) : '';
  $('#setCurrency').value = s.currency;
  $('#amtCur').textContent = s.currency;
  themeSeg(s.theme, false);
}

function renderAll() {
  openRow = null;
  renderHome();
  renderActivity();
  if (current === 'insights') renderInsights();
}

/* ---------- Segmented controls ---------- */
function setupSeg(el, onChange) {
  const btns = $$('button', el);
  el.style.setProperty('--n', btns.length);
  const set = (v, fire = true) => {
    const i = Math.max(0, btns.findIndex(b => b.dataset.v === v));
    el.style.setProperty('--i', i);
    el.classList.remove('morphing');
    void el.offsetWidth;
    el.classList.add('morphing');
    btns.forEach((b, j) => b.classList.toggle('on', j === i));
    el.dataset.value = btns[i].dataset.v;
    if (fire && navigator.vibrate) navigator.vibrate(6);
    if (fire && onChange) onChange(btns[i].dataset.v);
  };
  btns.forEach(b => b.addEventListener('click', () => set(b.dataset.v)));
  set(btns[0].dataset.v, false);
  return set;
}
const filterSeg = setupSeg($('#filterSeg'), v => { filter = v; renderActivity(); });
const themeSeg = setupSeg($('#themeSeg'), v => { state.settings.theme = v; save(); applyTheme(); });
const typeSeg = setupSeg($('#typeSeg'), v => {
  selectedCat = CATS[v][0].id;
  renderCats(v);
  updateSheetTitle();
});

/* ---------- Navigation ---------- */
function go(tab) {
  if (tab === current) { $(`#view-${tab}`).scrollTo({ top: 0, behavior: 'smooth' }); return; }
  const fromIndex = TABS.indexOf(current);
  const toIndex = TABS.indexOf(tab);
  $(`#view-${current}`).classList.remove('active');
  const to = $(`#view-${tab}`);
  to.classList.add('active');
  to.scrollTop = 0;
  current = tab;
  const bar = $('#tabbar');
  bar.style.setProperty('--i', toIndex);
  bar.classList.remove('morph-right', 'morph-left');
  void bar.offsetWidth;
  bar.classList.add(toIndex > fromIndex ? 'morph-right' : 'morph-left');
  $$('.tab', bar).forEach(t => t.classList.toggle('on', t.dataset.tab === tab));
  if (navigator.vibrate) navigator.vibrate(6);
  if (tab === 'insights') renderInsights();
  if (tab === 'activity') renderActivity();
  updateNav();
}
function updateNav() {
  const v = $(`#view-${current}`);
  $('#navTitle').textContent = v.dataset.title;
  $('#navbar').classList.toggle('show', v.scrollTop > 44);
}
$$('.view').forEach(v => v.addEventListener('scroll', () => { if (v.id === `view-${current}`) updateNav(); }, { passive: true }));
$$('.tab').forEach(t => t.addEventListener('click', () => go(t.dataset.tab)));

/* ---------- Add / edit sheet ---------- */
function renderCats(type) {
  $('#catGrid').innerHTML = CATS[type].map(c => `
    <button class="cat ${c.id === selectedCat ? 'on' : ''}" data-cat="${c.id}" style="--c:${c.color};--cb:${c.color}33">
      <span class="ci">${c.icon}</span><span>${c.name}</span>
    </button>`).join('');
}
$('#catGrid').addEventListener('click', e => {
  const b = e.target.closest('.cat'); if (!b) return;
  selectedCat = b.dataset.cat;
  $$('.cat', $('#catGrid')).forEach(x => x.classList.toggle('on', x === b));
});
function updateSheetTitle() {
  const type = $('#typeSeg').dataset.value;
  $('#sheetTitle').textContent = `${editingId ? 'Edit' : 'New'} ${type === 'income' ? 'Income' : 'Expense'}`;
  $('#sheetSave').textContent = editingId ? 'Save' : 'Add';
}
function sizeAmount() {
  const inp = $('#amount'), mirror = $('#amtMirror');
  mirror.textContent = inp.value || inp.placeholder;
  inp.style.width = `${mirror.offsetWidth + 6}px`;
}
function openSheet(tx = null) {
  editingId = tx ? tx.id : null;
  const type = tx ? tx.type : 'expense';
  typeSeg(type, false);
  selectedCat = tx ? tx.category : CATS[type][0].id;
  renderCats(type);
  $('#amount').value = tx ? String(tx.amount) : '';
  $('#note').value = tx ? (tx.note || '') : '';
  $('#date').value = tx ? tx.date : todayISO();
  $('#sheetDelete').hidden = !tx;
  updateSheetTitle();
  document.body.classList.add('sheet-open');
  $('.sheet-body').scrollTop = 0;
  requestAnimationFrame(sizeAmount);
  if (!tx && matchMedia('(pointer: fine)').matches) setTimeout(() => $('#amount').focus(), 380);
}
function closeSheet() {
  document.activeElement?.blur?.();
  document.body.classList.remove('sheet-open');
  editingId = null;
}
function saveSheet() {
  const amt = parseFloat($('#amount').value.replace(/,/g, ''));
  if (!(amt > 0)) {
    const f = $('#amountField');
    f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake');
    navigator.vibrate?.(30);
    return;
  }
  const type = $('#typeSeg').dataset.value;
  const data = {
    type, amount: Math.round(amt * 100) / 100, category: selectedCat,
    note: $('#note').value.trim(), date: $('#date').value || todayISO(),
  };
  if (editingId) {
    const t = state.tx.find(x => x.id === editingId);
    if (t) Object.assign(t, data);
    notify('✓ Updated');
  } else {
    state.tx.push({ id: uid(), createdAt: Date.now(), ...data });
    notify(type === 'expense' ? `✓ ${money(data.amount)} spent` : `✓ ${money(data.amount)} received`);
  }
  save();
  closeSheet();
  renderAll();
}
$('#amount').addEventListener('input', e => {
  let v = e.target.value.replace(/[^\d.]/g, '');
  const i = v.indexOf('.');
  if (i >= 0) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, '').slice(0, 2);
  if (v.length > 9) v = v.slice(0, 9);
  e.target.value = v;
  sizeAmount();
});
$('#amount').addEventListener('keydown', e => { if (e.key === 'Enter') saveSheet(); });
$('#note').addEventListener('keydown', e => { if (e.key === 'Enter') saveSheet(); });
$('#fab').addEventListener('click', () => (document.body.classList.contains('sheet-open') ? closeSheet() : openSheet()));
$('#sheetCancel').addEventListener('click', closeSheet);
$('#backdrop').addEventListener('click', closeSheet);
$('#sheetSave').addEventListener('click', saveSheet);
$('#sheetDelete').addEventListener('click', async () => {
  const id = editingId;
  if (await confirmIOS('Delete Transaction?', 'This transaction will be removed.', 'Delete')) { closeSheet(); deleteTx(id); }
});

// Drag the sheet down to dismiss
(() => {
  const sheet = $('#sheet'), handle = $('#sheetHandle');
  let y0 = null, dy = 0, t0 = 0;
  handle.addEventListener('pointerdown', e => {
    if (e.target.closest('button')) return;
    y0 = e.clientY; dy = 0; t0 = performance.now();
    sheet.style.transition = 'none';
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener('pointermove', e => {
    if (y0 === null) return;
    dy = Math.max(0, e.clientY - y0);
    sheet.style.transform = `translateY(${dy}px)`;
  });
  const end = () => {
    if (y0 === null) return;
    const v = dy / (performance.now() - t0);
    y0 = null;
    sheet.style.transition = '';
    sheet.style.transform = '';
    if (dy > 120 || (dy > 40 && v > .5)) closeSheet();
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
})();

// Keep the sheet above the on-screen keyboard
if (window.visualViewport) {
  const vv = window.visualViewport;
  const upd = () => {
    const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty('--kb', `${kb}px`);
    document.documentElement.style.setProperty('--vvh', `${vv.height}px`);
  };
  vv.addEventListener('resize', upd);
  vv.addEventListener('scroll', upd);
}

/* ---------- Swipe-to-delete rows ---------- */
const REVEAL = 88;
let sw = null;
function setRow(main, x, animate = true) {
  const row = main.parentElement;
  row.classList.toggle('dragging', !animate);
  main.style.transform = x ? `translateX(${x}px)` : '';
  row.style.setProperty('--rev', `${-x}px`);
}
function closeRow(main) { if (!main) return; setRow(main, 0); main._open = false; if (openRow === main) openRow = null; }
document.addEventListener('pointerdown', e => {
  const main = e.target.closest('.tx-main');
  if (openRow && openRow !== main && !e.target.closest('.tx-del')) closeRow(openRow);
  if (!main || (e.pointerType === 'mouse' && e.button !== 0)) return;
  sw = { main, x0: e.clientX, y0: e.clientY, base: main._open ? -REVEAL : 0, dx: 0, dir: null, id: e.pointerId };
});
document.addEventListener('pointermove', e => {
  if (!sw || e.pointerId !== sw.id) return;
  const dx = e.clientX - sw.x0, dy = e.clientY - sw.y0;
  if (!sw.dir) {
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
    sw.dir = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
    if (sw.dir === 'h') { try { sw.main.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ } }
  }
  if (sw.dir !== 'h') return;
  let x = Math.min(0, sw.base + dx);
  if (sw.base + dx > 0) x = (sw.base + dx) * 0.15; // rubber band
  sw.dx = x;
  setRow(sw.main, x, false);
}, { passive: true });
function endSwipe(e) {
  if (!sw || e.pointerId !== sw.id) return;
  const { main, dx, dir } = sw;
  sw = null;
  if (dir !== 'h') return;
  suppressClick = true;
  setTimeout(() => { suppressClick = false; }, 60);
  const w = main.offsetWidth;
  if (dx < -w * 0.55) { setRow(main, -w); deleteTx(main.parentElement.dataset.id, main.parentElement); return; }
  const open = dx < -REVEAL / 2;
  main._open = open;
  setRow(main, open ? -REVEAL : 0);
  openRow = open ? main : null;
}
document.addEventListener('pointerup', endSwipe);
document.addEventListener('pointercancel', endSwipe);

function deleteTx(id, rowEl) {
  const finish = () => {
    const idx = state.tx.findIndex(t => t.id === id);
    if (idx < 0) return;
    lastDeleted = state.tx.splice(idx, 1)[0];
    save();
    renderAll();
    notify('Deleted', {
      label: 'Undo',
      fn: () => { if (lastDeleted) { state.tx.push(lastDeleted); lastDeleted = null; save(); renderAll(); notify('✓ Restored'); } },
    });
  };
  if (rowEl) {
    rowEl.style.height = `${rowEl.offsetHeight}px`;
    void rowEl.offsetHeight;
    rowEl.classList.add('removing');
    setTimeout(finish, 320);
  } else finish();
}

/* ---------- Global clicks ---------- */
document.addEventListener('click', e => {
  const g = e.target.closest('[data-goto]');
  if (g) { go(g.dataset.goto); return; }
  const act = e.target.closest('[data-action]');
  if (act) { if (act.dataset.action === 'add') openSheet(); else loadSample(); return; }
  const del = e.target.closest('.tx-del');
  if (del) { const row = del.closest('.tx'); deleteTx(row.dataset.id, row); return; }
  const main = e.target.closest('.tx-main');
  if (main) {
    if (suppressClick) return;
    if (main._open) { closeRow(main); return; }
    const t = state.tx.find(x => x.id === main.parentElement.dataset.id);
    if (t) openSheet(t);
    return;
  }
  const bar = e.target.closest('.bars i');
  if (bar) notify(`${dayLabel(bar.dataset.iso)} · ${money(Number(bar.dataset.v))}`);
});

/* ---------- Search & month switch ---------- */
$('#search').addEventListener('input', e => { query = e.target.value; renderActivity(); });
$('#prevMonth').addEventListener('click', () => { viewMonth = shiftMonth(viewMonth, -1); renderInsights(); });
$('#nextMonth').addEventListener('click', () => { viewMonth = shiftMonth(viewMonth, 1); renderInsights(); });

/* ---------- Settings ---------- */
$('#setName').addEventListener('change', e => { state.settings.name = e.target.value.trim(); save(); renderHome(); });
$('#setBudget').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 9); });
$('#setBudget').addEventListener('change', e => { state.settings.budget = Number(e.target.value) || 0; save(); renderHome(); notify('✓ Budget updated'); });
$('#setCurrency').addEventListener('change', e => { state.settings.currency = e.target.value; $('#amtCur').textContent = e.target.value; save(); renderAll(); });
$('#tipClose').addEventListener('click', () => { try { localStorage.setItem(TIP_KEY, '1'); } catch (_) { /* ignore */ } $('#installTip').hidden = true; });

async function shareFile(file) {
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: file.name }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
$('#btnCSV').addEventListener('click', () => {
  if (!state.tx.length) { notify('Nothing to export yet'); return; }
  const rows = [['Date', 'Type', 'Category', 'Note', 'Amount']]
    .concat(sorted().map(t => [t.date, t.type, catOf(t.type, t.category).name, t.note || '', t.amount]));
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  shareFile(new File(['\ufeff' + csv], `spendly-${todayISO()}.csv`, { type: 'text/csv' }));
});
$('#btnBackup').addEventListener('click', () => {
  const data = JSON.stringify({ app: 'spendly', version: 1, exportedAt: new Date().toISOString(), ...state }, null, 2);
  shareFile(new File([data], `spendly-backup-${todayISO()}.json`, { type: 'application/json' }));
});
$('#restoreInput').addEventListener('change', async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (!Array.isArray(data.tx)) throw new Error('bad');
    const tx = data.tx.filter(validTx);
    if (!(await confirmIOS('Restore Backup?', `This replaces your current data with ${tx.length} transactions from the backup.`, 'Restore'))) return;
    state = { settings: { ...DEFAULTS, ...data.settings }, tx };
    save(); applyTheme(); syncSettingsUI(); renderAll();
    notify('✓ Backup restored');
  } catch (_) { notify('⚠️ Not a valid backup file'); }
});
$('#btnErase').addEventListener('click', async () => {
  if (!(await confirmIOS('Erase All Data?', 'All transactions will be permanently deleted from this device. This cannot be undone.', 'Erase'))) return;
  state.tx = [];
  save(); renderAll();
  notify('All data erased');
});
$('#btnSample').addEventListener('click', loadSample);

async function loadSample() {
  if (state.tx.length && !(await confirmIOS('Add Sample Data?', 'About 90 demo transactions will be added alongside your own.', 'Add', false))) return;
  const spec = {
    food: [['Canteen lunch', 'Chai & samosa', 'Pizza night', 'Swiggy order', 'Café with friends'], 40, 450, 9],
    groceries: [['Weekly groceries', 'Fruits & veggies', 'Milk & bread'], 120, 1100, 3],
    transport: [['Auto rickshaw', 'Petrol', 'Bus pass', 'Cab ride'], 30, 600, 5],
    shopping: [['Amazon order', 'New T-shirt', 'Earphones'], 299, 2400, 1],
    bills: [['Mobile recharge', 'Wi-Fi bill', 'Electricity'], 199, 1200, 1],
    fun: [['Movie tickets', 'Spotify', 'Gaming'], 99, 700, 2],
    health: [['Pharmacy', 'Gym'], 80, 900, 1],
    education: [['Books', 'Online course', 'Printouts'], 20, 1500, 2],
    travel: [['Weekend trip', 'Train tickets'], 300, 2500, 1],
  };
  const pool = Object.entries(spec).flatMap(([id, s]) => Array(s[3]).fill(id));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const now = new Date();
  for (let d = 0; d < 50; d++) {
    const date = toISO(new Date(now.getFullYear(), now.getMonth(), now.getDate() - d));
    const n = Math.floor(rnd(0, 3.2));
    for (let k = 0; k < n; k++) {
      const id = pool[Math.floor(Math.random() * pool.length)];
      const [notes, lo, hi] = spec[id];
      state.tx.push({ id: uid(), createdAt: Date.now() - d * 864e5 + k, type: 'expense', category: id,
        note: notes[Math.floor(Math.random() * notes.length)], amount: Math.round(rnd(lo, hi) / 10) * 10, date });
    }
  }
  for (let m = 0; m < 2; m++) {
    const first = new Date(now.getFullYear(), now.getMonth() - m, 1);
    state.tx.push({ id: uid(), createdAt: first.getTime(), type: 'income', category: 'pocket', note: 'Monthly allowance', amount: 8000, date: toISO(first) });
    const mid = new Date(now.getFullYear(), now.getMonth() - m, Math.min(14, now.getDate()));
    state.tx.push({ id: uid(), createdAt: mid.getTime(), type: 'income', category: 'freelance', note: 'Website project', amount: 3500, date: toISO(mid) });
  }
  save(); renderAll();
  notify('✨ Sample data added');
}

/* ---------- iOS alert ---------- */
function confirmIOS(title, msg, okLabel = 'Delete', destructive = true) {
  return new Promise(resolve => {
    $('#alertTitle').textContent = title;
    $('#alertMsg').textContent = msg;
    const ok = $('#alertOk'), cancel = $('#alertCancel'), wrap = $('#alertWrap');
    ok.textContent = okLabel;
    ok.classList.toggle('destructive', destructive);
    wrap.classList.add('show');
    const done = v => { wrap.classList.remove('show'); ok.onclick = cancel.onclick = null; wrap._done = null; resolve(v); };
    ok.onclick = () => done(true);
    cancel.onclick = () => done(false);
    wrap._done = done;
  });
}

/* ---------- Dynamic Island notifications ---------- */
let islandTimer;
function notify(text, action) {
  const el = $('#island'), t = $('.island-text', el);
  t.innerHTML = esc(text) + (action ? `<button class="island-act">${esc(action.label)}</button>` : '');
  el._fn = action ? action.fn : null;
  el.classList.add('show');
  el.style.width = `${Math.ceil(t.getBoundingClientRect().width) + 2}px`;
  clearTimeout(islandTimer);
  islandTimer = setTimeout(hideIsland, action ? 4200 : 2200);
}
function hideIsland() { const el = $('#island'); el.classList.remove('show'); el.style.width = ''; el._fn = null; }
$('#island').addEventListener('click', e => {
  const el = $('#island');
  if (e.target.closest('.island-act') && el._fn) { const fn = el._fn; hideIsland(); fn(); }
});

/* ---------- Apple Liquid Glass: Optical Caustics & 3D Tilt Engine ---------- */
(function setupLiquidGlass() {
  let activeGlass = null;
  let targetX = 50, targetY = 0;
  let currentX = 50, currentY = 0;
  let targetTiltX = 0, targetTiltY = 0;
  let currentTiltX = 0, currentTiltY = 0;
  let rafId = null;

  function update() {
    if (activeGlass) {
      currentX += (targetX - currentX) * 0.18;
      currentY += (targetY - currentY) * 0.18;
      currentTiltX += (targetTiltX - currentTiltX) * 0.18;
      currentTiltY += (targetTiltY - currentTiltY) * 0.18;

      activeGlass.style.setProperty('--mx', `${currentX.toFixed(1)}%`);
      activeGlass.style.setProperty('--my', `${currentY.toFixed(1)}%`);
      activeGlass.style.setProperty('--rx', `${currentTiltX.toFixed(2)}deg`);
      activeGlass.style.setProperty('--ry', `${currentTiltY.toFixed(2)}deg`);

      if (Math.abs(targetX - currentX) > 0.1 || Math.abs(targetTiltX - currentTiltX) > 0.05) {
        rafId = requestAnimationFrame(update);
      } else {
        rafId = null;
      }
    } else {
      rafId = null;
    }
  }

  function onPointerMove(e) {
    const g = e.target.closest?.('.glass');
    if (!g) {
      if (activeGlass) resetGlass(activeGlass);
      activeGlass = null;
      return;
    }
    if (activeGlass !== g) {
      if (activeGlass) resetGlass(activeGlass);
      activeGlass = g;
      const r = g.getBoundingClientRect();
      currentX = targetX = ((e.clientX - r.left) / r.width) * 100;
      currentY = targetY = ((e.clientY - r.top) / r.height) * 100;
    }
    const r = activeGlass.getBoundingClientRect();
    targetX = ((e.clientX - r.left) / r.width) * 100;
    targetY = ((e.clientY - r.top) / r.height) * 100;

    // 3D perspective micro-tilt (subtle and optical, max ±4 degrees)
    const centerX = r.left + r.width / 2;
    const centerY = r.top + r.height / 2;
    const normX = (e.clientX - centerX) / (r.width / 2);
    const normY = (e.clientY - centerY) / (r.height / 2);
    targetTiltX = Math.max(-4, Math.min(4, -normY * 3.5));
    targetTiltY = Math.max(-4, Math.min(4, normX * 3.5));

    if (!rafId) rafId = requestAnimationFrame(update);
  }

  function resetGlass(g) {
    g.style.setProperty('--rx', '0deg');
    g.style.setProperty('--ry', '0deg');
    g.style.removeProperty('--scale');
    g.style.removeProperty('--glass-light-o');
  }

  document.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('pointerdown', e => {
    const g = e.target.closest?.('.glass');
    if (g) {
      g.style.setProperty('--glass-light-o', '0.98');
      g.style.setProperty('--scale', '0.98');
      if (navigator.vibrate) navigator.vibrate(6);
    }
  }, { passive: true });
  document.addEventListener('pointerup', e => {
    const g = e.target.closest?.('.glass');
    if (g) {
      g.style.removeProperty('--scale');
      g.style.removeProperty('--glass-light-o');
    }
  }, { passive: true });

  // Gyroscope / device orientation on mobile
  if (window.DeviceOrientationEvent) {
    window.addEventListener('deviceorientation', e => {
      if (e.gamma == null || e.beta == null) return;
      const tiltX = Math.max(-30, Math.min(30, e.gamma));
      const tiltY = Math.max(-30, Math.min(30, e.beta - 45));
      const mx = 50 + (tiltX / 30) * 35;
      const my = 20 + (tiltY / 30) * 35;
      document.documentElement.style.setProperty('--mx', `${mx.toFixed(1)}%`);
      document.documentElement.style.setProperty('--my', `${my.toFixed(1)}%`);
    }, { passive: true });
  }
})();

/* ---------- Keyboard shortcuts (website) ---------- */
document.addEventListener('keydown', e => {
  const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName);
  if (e.key === 'Escape') {
    if ($('#alertWrap').classList.contains('show')) $('#alertWrap')._done?.(false);
    else if (document.body.classList.contains('sheet-open')) closeSheet();
    return;
  }
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openSheet(); }
  const n = Number(e.key);
  if (n >= 1 && n <= 4 && !document.body.classList.contains('sheet-open')) go(TABS[n - 1]);
});

/* ---------- PWA install (Android / desktop Chrome) ---------- */
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; $('#btnInstall').hidden = false; });
$('#btnInstall').addEventListener('click', async () => {
  if (!installEvt) return;
  installEvt.prompt();
  await installEvt.userChoice;
  installEvt = null;
  $('#btnInstall').hidden = true;
});
window.addEventListener('appinstalled', () => notify('✓ Spendly installed'));

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

/* ---------- Boot ---------- */
applyTheme();
syncSettingsUI();
filterSeg('all', false);
renderAll();
// Re-render when the day changes or the app comes back to the foreground
document.addEventListener('visibilitychange', () => { if (!document.hidden) renderAll(); });
if (new URLSearchParams(location.search).get('add') === '1') setTimeout(() => openSheet(), 400);
