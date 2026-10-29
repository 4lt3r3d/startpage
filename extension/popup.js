// SP//ADD — popup. Collects pages from tabs, lets you edit them, then hands
// them to the background worker, which queues them for the startpage.

const STARTPAGE_PREFIX = 'https://4lt3r3d.github.io/startpage';
const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
// opened as its own window from the right-click menu ("… with details" / "Add links in selection…")
const detached = params.has('url') || params.has('handoff');

let cats = { bookmarks: [], osint: [] };
let rows = [];   // { url, name, nick, icon, on }
const NEW_CAT = '__new__';

// ── helpers ───────────────────────────────────────────
const addable = t => t && /^https?:\/\//i.test(t.url || '') && !t.url.startsWith(STARTPAGE_PREFIX);

function ago(ts) {
  if (!ts) return 'never';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.round(s / 60) + 'm ago';
  if (s < 86400) return Math.round(s / 3600) + 'h ago';
  return Math.round(s / 86400) + 'd ago';
}

function scopeQuery(scope) {
  if (scope === 'current')  return { active: true, currentWindow: true };
  if (scope === 'selected') return { highlighted: true, currentWindow: true };
  if (scope === 'window')   return { currentWindow: true };
  return {};
}

async function tabsFor(scope) {
  const tabs = (await chrome.tabs.query(scopeQuery(scope))).filter(addable);
  const seen = new Set();
  return tabs.filter(t => !seen.has(t.url) && seen.add(t.url)); // drop exact duplicate tabs
}

// ── theme: follow the startpage's current accent + font ──
async function applyTheme() {
  const { spadd_theme: th } = await chrome.storage.local.get('spadd_theme');
  if (!th) return;
  const r = document.documentElement.style;
  ['accent', 'accent2', 'accent3', 'mono'].forEach(k => { if (th[k]) r.setProperty('--' + k, th[k]); });
}

// ── status line ───────────────────────────────────────
async function renderStatus() {
  const { spadd_cats, spadd_queue, spadd_last_result: r } =
    await chrome.storage.local.get(['spadd_cats', 'spadd_queue', 'spadd_last_result']);

  $('stSync').innerHTML = '';
  if (!spadd_cats || (!spadd_cats.bookmarks.length && !spadd_cats.osint.length)) {
    $('stSync').innerHTML = '<span class="warn">no categories yet — open your startpage once</span>';
  } else {
    $('stSync').append('categories synced ', Object.assign(document.createElement('span'), { className: 'hl', textContent: ago(spadd_cats.ts) }));
  }

  const q = (spadd_queue || []).length;
  $('stQueue').textContent = q ? `${q} waiting — opens on the startpage next time it's open` : '';

  $('stResult').textContent = '';
  $('stFailed').hidden = true;
  if (r && r.ts) {
    const a = (r.added || []).length, d = (r.dupes || []).length, f = (r.failedIcons || []).length;
    const parts = [`last: ${a} added`];
    if (d) parts.push(`${d} already there`);
    if (r.nickSkipped) parts.push(`${r.nickSkipped} nick${r.nickSkipped === 1 ? '' : 's'} taken`);
    if (f) parts.push(`${f} without an icon match`);
    $('stResult').textContent = parts.join(' · ') + ` · ${ago(r.ts)}`;
    if (f) {
      $('failedList').textContent = r.failedIcons.map(x => `${x.name} - ${x.url}`).join('\n');
      $('stFailed').hidden = false;
    }
  }
}

$('copyFailed').addEventListener('click', async () => {
  await navigator.clipboard.writeText($('failedList').textContent);
  $('copyFailed').textContent = 'copied!';
  setTimeout(() => { $('copyFailed').textContent = 'copy'; }, 900);
});

// ── menu ──────────────────────────────────────────────
async function renderMenu() {
  for (const scope of ['current', 'selected', 'window', 'all']) {
    const n = (await tabsFor(scope)).length;
    $('cnt-' + scope).textContent = n;
    document.querySelector(`.row-btn[data-scope="${scope}"]`).disabled = n === 0;
  }
}

document.querySelectorAll('.row-btn').forEach(btn => btn.addEventListener('click', async () => {
  const tabs = await tabsFor(btn.dataset.scope);
  openReview(tabs.map(t => ({ url: t.url, name: t.title || '' })));
}));

// ── review ────────────────────────────────────────────
async function fillCategories() {
  const target = $('target').value;
  document.body.classList.toggle('osint', target === 'osint');
  const sel = $('category');
  const prev = sel.dataset.target === target ? sel.value : null;
  sel.dataset.target = target;
  sel.innerHTML = '';
  (cats[target] || []).forEach(c => sel.appendChild(new Option(c, c)));
  sel.appendChild(new Option('+ create new category', NEW_CAT));
  const { spadd_last_pick: last } = await chrome.storage.local.get('spadd_last_pick');
  if (prev && (prev === NEW_CAT || cats[target].includes(prev))) sel.value = prev;
  else if (last && last.target === target && cats[target].includes(last.cat)) sel.value = last.cat;
  else if (!cats[target].length) sel.value = NEW_CAT;
  showNewCat();
}

// "+ create new category" → show a name field under the dropdowns
function showNewCat() {
  const on = $('category').value === NEW_CAT;
  $('newCatWrap').hidden = !on;
  if (on) setTimeout(() => $('newCat').focus(), 0);
  updateAddBtn();
  fitWindow();
}

// the category the pages will go to (typed name when creating a new one)
function chosenCat() {
  const v = $('category').value;
  if (v !== NEW_CAT) return v;
  let name = $('newCat').value.trim();
  if ($('target').value === 'bookmarks') name = name.toLowerCase().replace(/\s+/g, '-'); // same rule as the startpage
  return name;
}

function updateAddBtn() {
  const n = rows.filter(r => r.on).length;
  $('addBtn').textContent = `add ${n} page${n === 1 ? '' : 's'}`;
  $('addBtn').disabled = n === 0 || !chosenCat();
  $('listCount').textContent = `${n} / ${rows.length} selected`;
  $('checkAll').checked = n === rows.length && n > 0;
}

function renderList() {
  const list = $('list');
  list.innerHTML = '';
  if (!rows.length) { list.innerHTML = '<div class="empty">no addable pages here</div>'; updateAddBtn(); return; }
  rows.forEach(r => {
    const item = document.createElement('div');
    item.className = 'item' + (r.on ? '' : ' off');

    const line = document.createElement('div'); line.className = 'line';
    const cb = Object.assign(document.createElement('input'), { type: 'checkbox', checked: r.on });
    cb.addEventListener('change', () => { r.on = cb.checked; item.classList.toggle('off', !r.on); updateAddBtn(); });

    const mk = (cls, key, ph, max) => {
      const i = Object.assign(document.createElement('input'), { type: 'text', className: cls, value: r[key], placeholder: ph });
      if (max) i.maxLength = max;
      i.addEventListener('input', () => { r[key] = i.value; });
      return i;
    };
    line.append(cb, mk('f-icon', 'icon', 'icon', 4), mk('f-name', 'name', 'name'), mk('f-nick', 'nick', 'nick'));

    const url = Object.assign(document.createElement('div'), { className: 'url', textContent: r.url, title: r.url });
    item.append(line, url);
    list.appendChild(item);
  });
  updateAddBtn();
  fitWindow();
}

async function openReview(pages, preset) {
  rows = pages.map(p => ({ url: p.url, name: (p.name || '').slice(0, 48), nick: '', icon: '', on: true }));
  $('viewMenu').hidden = true;
  $('viewReview').hidden = false;
  $('titleSub').textContent = 'review';
  renderList();
  if (preset) $('target').value = preset.target;
  await fillCategories();
  if (preset) {
    $('category').value = preset.cat;
    if (preset.cat === NEW_CAT) $('newCat').value = preset.newCat || '';
    showNewCat();
  }
}

$('target').addEventListener('change', fillCategories);
$('category').addEventListener('change', showNewCat);
$('newCat').addEventListener('input', updateAddBtn);
$('newCat').addEventListener('keydown', e => { if (e.key === 'Enter' && !$('addBtn').disabled) $('addBtn').click(); });
$('checkAll').addEventListener('change', () => { rows.forEach(r => { r.on = $('checkAll').checked; }); renderList(); });

$('backBtn').addEventListener('click', () => {
  if (detached) { window.close(); return; }
  fromBulk = false;
  $('viewReview').hidden = true;
  $('viewMenu').hidden = false;
  $('titleSub').textContent = '';
});

$('addBtn').addEventListener('click', async () => {
  const target = $('target').value, cat = chosenCat();
  const items = rows.filter(r => r.on).map(r => ({
    target, cat, url: r.url, name: r.name.trim(),
    nick: target === 'osint' ? '' : r.nick.trim(), icon: r.icon.trim(),
  }));
  if (!items.length || !cat) return;
  $('addBtn').disabled = true;
  await chrome.storage.local.set({ spadd_last_pick: { target, cat } });
  await chrome.runtime.sendMessage({ type: 'SPADD_ENQUEUE', items });
  if (fromBulk) { $('bulkText').value = ''; await chrome.storage.local.remove('spadd_bulk_draft'); updateBulk(); }
  $('addBtn').textContent = 'sent ✓';
  setTimeout(() => {
    if (detached) { window.close(); return; }
    $('backBtn').click();
    renderMenu();
  }, 700);
});

// ── bulk paste ────────────────────────────────────────
// Accepts, one per line: full URLs · bare domains (shodan.io) · "Name - url" ·
// "Name | url | nick" (the startpage's own bulk format). A line with several
// links becomes several rows. The box is saved as you type, because the
// toolbar popup closes whenever you click outside it.
let fromBulk = false;

const URL_RX = /(?:https?:\/\/[^\s<>"'|]+|(?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:\/[^\s<>"'|]*)?)/gi;

function niceName(url) {
  try {
    const base = new URL(url).hostname.replace(/^www\./, '').split('.')[0];
    return base.charAt(0).toUpperCase() + base.slice(1);
  } catch (e) { return ''; }
}

function parseBulk(text) {
  const out = [], bad = [], seen = new Set();
  text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).forEach(line => {
    // "name | url | nick"
    if (line.includes('|')) {
      const [a, b, c] = line.split('|').map(x => x.trim());
      const u = b && b.match(URL_RX) ? b : (a && a.match(URL_RX) ? a : '');
      if (!u) { bad.push(line); return; }
      const url = /^https?:\/\//i.test(u) ? u : 'https://' + u;
      if (seen.has(url)) return; seen.add(url);
      out.push({ url, name: b && u === b ? a : '', nick: c || '' });
      return;
    }
    const found = line.match(URL_RX);
    if (!found) { bad.push(line); return; }
    // text before the first link (minus a trailing " - " / ":") is the name — only for single-link lines
    // and a single word after the link is its nick ("Shodan https://shodan.io sh")
    let name = '', nick = '';
    if (found.length === 1) {
      const at = line.indexOf(found[0]);
      name = line.slice(0, at).replace(/[\s\-–—:·]+$/, '').trim();
      const after = line.slice(at + found[0].length).trim();
      if (/^[a-z0-9_-]+$/i.test(after)) nick = after;
    }
    found.forEach(u => {
      u = u.replace(/[),.;\]]+$/, '');
      const url = /^https?:\/\//i.test(u) ? u : 'https://' + u;
      if (seen.has(url)) return; seen.add(url);
      out.push({ url, name: name || niceName(url), nick });
    });
  });
  return { items: out, bad };
}

async function fillBulkCats() {
  const target = $('bTarget').value;
  const sel = $('bCategory');
  const prev = sel.dataset.target === target ? sel.value : null;
  sel.dataset.target = target;
  sel.innerHTML = '';
  (cats[target] || []).forEach(c => sel.appendChild(new Option(c, c)));
  sel.appendChild(new Option('+ create new category', NEW_CAT));
  const { spadd_last_pick: last } = await chrome.storage.local.get('spadd_last_pick');
  if (prev && (prev === NEW_CAT || cats[target].includes(prev))) sel.value = prev;
  else if (last && last.target === target && cats[target].includes(last.cat)) sel.value = last.cat;
  else if (!cats[target].length) sel.value = NEW_CAT;
  $('bNewCatWrap').hidden = sel.value !== NEW_CAT;
}

function updateBulk() {
  const { items, bad } = parseBulk($('bulkText').value);
  const needName = $('bCategory').value === NEW_CAT && !$('bNewCat').value.trim();
  $('bulkReview').disabled = !items.length || needName;
  $('bulkReview').textContent = items.length ? `review ${items.length}` : 'review';
  const info = $('bulkInfo');
  info.classList.toggle('warn', bad.length > 0);
  info.textContent = bad.length ? `${bad.length} line${bad.length === 1 ? '' : 's'} with no link — skipped` : '';
}

let draftTimer = null;
function saveDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => chrome.storage.local.set({ spadd_bulk_draft: {
    text: $('bulkText').value, target: $('bTarget').value, cat: $('bCategory').value, newCat: $('bNewCat').value,
  } }), 200);
}

$('bulkText').addEventListener('input', () => { updateBulk(); saveDraft(); });
$('bTarget').addEventListener('change', async () => { await fillBulkCats(); updateBulk(); saveDraft(); });
$('bCategory').addEventListener('change', () => {
  $('bNewCatWrap').hidden = $('bCategory').value !== NEW_CAT;
  if (!$('bNewCatWrap').hidden) $('bNewCat').focus();
  updateBulk(); saveDraft();
});
$('bNewCat').addEventListener('input', () => { updateBulk(); saveDraft(); });

$('bulkReview').addEventListener('click', () => {
  const { items } = parseBulk($('bulkText').value);
  if (!items.length) return;
  fromBulk = true;
  openReview(items, { target: $('bTarget').value, cat: $('bCategory').value, newCat: $('bNewCat').value })
    .then(() => rows.forEach((r, i) => { r.nick = items[i].nick || ''; }))
    .then(renderList);
});

async function initBulk() {
  const { spadd_bulk_draft: d, spadd_last_pick: last } = await chrome.storage.local.get(['spadd_bulk_draft', 'spadd_last_pick']);
  if (d) { $('bulkText').value = d.text || ''; $('bTarget').value = d.target || 'bookmarks'; $('bNewCat').value = d.newCat || ''; }
  else if (last && cats[last.target]) $('bTarget').value = last.target;
  await fillBulkCats();
  if (d && d.cat && (d.cat === NEW_CAT || (cats[$('bTarget').value] || []).includes(d.cat))) {
    $('bCategory').value = d.cat;
    $('bNewCatWrap').hidden = d.cat !== NEW_CAT;
  }
  updateBulk();
}

// ── details window: size the window to the popup's content ──
let fitTimer = null;
function fitWindow() {
  if (!detached) return;
  clearTimeout(fitTimer);
  fitTimer = setTimeout(async () => {
    try {
      const w = await chrome.windows.getCurrent();
      const frameW = window.outerWidth - window.innerWidth;
      const frameH = window.outerHeight - window.innerHeight;
      const h = Math.min(document.body.scrollHeight + frameH, screen.availHeight - 40);
      await chrome.windows.update(w.id, { width: 420 + frameW, height: h });
    } catch (e) {}
  }, 30);
}

// ── live updates ──────────────────────────────────────
chrome.storage.onChanged.addListener((ch, area) => {
  if (area !== 'local') return;
  if (ch.spadd_theme) applyTheme();
  if (ch.spadd_cats) { chrome.storage.local.get('spadd_cats').then(({ spadd_cats }) => { cats = spadd_cats || cats; if (!$('viewReview').hidden) fillCategories(); fillBulkCats().then(updateBulk); }); }
  if (ch.spadd_cats || ch.spadd_queue || ch.spadd_last_result) renderStatus().then(fitWindow);
});

// ── start ─────────────────────────────────────────────
(async () => {
  await applyTheme();
  const { spadd_cats, spadd_last_pick } = await chrome.storage.local.get(['spadd_cats', 'spadd_last_pick']);
  cats = spadd_cats || cats;
  if (spadd_last_pick && cats[spadd_last_pick.target]) $('target').value = spadd_last_pick.target;
  await renderStatus();
  if (params.has('handoff')) {
    const { spadd_handoff: h } = await chrome.storage.local.get('spadd_handoff');
    await chrome.storage.local.remove('spadd_handoff');
    openReview(((h && h.items) || []).map(i => ({ url: i.url, name: i.name || niceName(i.url) })));
  } else if (detached) {
    openReview([{ url: params.get('url'), name: params.get('name') || '' }]);
  } else {
    renderMenu();
    initBulk();
  }
})();
