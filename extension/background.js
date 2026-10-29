// SP//ADD — background service worker.
importScripts('icon.js');
// Builds the right-click menus from the startpage's categories, queues pages,
// and hands the queue to an open startpage tab.

const STARTPAGE = 'https://4lt3r3d.github.io/startpage/*';
const WEB = ['http://*/*', 'https://*/*'];
const WIDGETS = [
  { key: 'bookmarks', label: 'Bookmarks' },
  { key: 'osint',     label: 'OSINT' },
];

// ── menus ─────────────────────────────────────────────
// ids: "page|bookmarks|3" / "link|osint|0" — the number is the category's
// position in the synced list, looked up again at click time.
let lastBuilt = null;
let building = Promise.resolve();

function buildMenus(force) {
  building = building.then(async () => {
    const { spadd_cats } = await chrome.storage.local.get('spadd_cats');
    const cats = spadd_cats || { bookmarks: [], osint: [] };
    const sig = JSON.stringify([cats.bookmarks, cats.osint]);
    if (!force && sig === lastBuilt) return;
    lastBuilt = sig;

    await chrome.contextMenus.removeAll();
    const mk = props => new Promise(r => chrome.contextMenus.create(props, () => { void chrome.runtime.lastError; r(); }));

    if (!cats.bookmarks.length && !cats.osint.length) {
      await mk({ id: 'nocats', title: 'Open your startpage once to load categories', contexts: ['page', 'link'], enabled: false });
      return;
    }
    await mk({ id: 'selection|links', title: 'Add links in selection…', contexts: ['selection'], documentUrlPatterns: WEB });
    for (const kind of ['page', 'link']) {
      await mk({
        id: `${kind}|details`,
        title: `Add ${kind} with details…`,
        contexts: [kind],
        ...(kind === 'page' ? { documentUrlPatterns: WEB } : { targetUrlPatterns: WEB }),
      });
      for (const w of WIDGETS) {
        const parentId = `${kind}|${w.key}`;
        await mk({
          id: parentId,
          title: `Add ${kind} to ${w.label}`,
          contexts: [kind],
          ...(kind === 'page' ? { documentUrlPatterns: WEB } : { targetUrlPatterns: WEB }),
        });
        for (let i = 0; i < cats[w.key].length; i++) {
          await mk({ id: `${parentId}|${i}`, parentId, title: cats[w.key][i], contexts: [kind] });
        }
      }
    }
  }).catch(e => console.error('[SP//ADD] menu build failed', e));
  return building;
}

chrome.runtime.onInstalled.addListener(() => buildMenus(true));
chrome.runtime.onStartup.addListener(() => buildMenus(true));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.spadd_cats) buildMenus(false);
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const [kind, widget, idx] = String(info.menuItemId).split('|');
  if (kind === 'selection') {
    // collect every link inside the highlighted part of the page (+ plain-text urls)
    let items = [];
    try {
      const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: linksInSelection });
      items = (res && res.result) || [];
    } catch (e) { console.error('[SP//ADD] could not read selection', e); }
    await chrome.storage.local.set({ spadd_handoff: { items, ts: Date.now() } });
    await openDetailsWindow(tab, 'handoff=1');
    return;
  }
  if (widget === 'details') {
    const url = kind === 'link' ? info.linkUrl : (info.pageUrl || (tab && tab.url));
    const name = kind === 'link' ? (info.selectionText || '') : ((tab && tab.title) || '');
    const q = new URLSearchParams({ url: url || '', name });
    await openDetailsWindow(tab, q.toString());
    return;
  }
  if (idx === undefined) return;
  const { spadd_cats } = await chrome.storage.local.get('spadd_cats');
  const cat = ((spadd_cats || {})[widget] || [])[Number(idx)];
  if (!cat) return;

  const url = kind === 'link' ? info.linkUrl : (info.pageUrl || (tab && tab.url));
  const name = kind === 'link' ? (info.selectionText || '') : ((tab && tab.title) || '');
  await enqueue([{ target: widget, cat, url, name, nick: '', icon: '' }]);
});

// ── queue + delivery ──────────────────────────────────
async function enqueue(items) {
  const ok = items.filter(i => /^https?:\/\//i.test(i.url || ''));
  if (!ok.length) return;
  const { spadd_queue } = await chrome.storage.local.get('spadd_queue');
  const q = (spadd_queue || []).concat(ok.map(i => ({ ...i, id: crypto.randomUUID() })));
  await chrome.storage.local.set({ spadd_queue: q });
  playIconAnim(); // not awaited — runs alongside delivery
  await showQueueBadge();
  await deliver();
}

async function deliver() {
  const tabs = await chrome.tabs.query({ url: STARTPAGE });
  if (!tabs.length) return; // stays queued until the startpage is opened
  // One tab only, so nothing is added twice. Try the active one first; if a tab
  // doesn't answer (its helper went stale when the extension was reloaded), try the next.
  tabs.sort((a, b) => (b.active - a.active) || (b.lastAccessed || 0) - (a.lastAccessed || 0));
  for (const tab of tabs) {
    try { await chrome.tabs.sendMessage(tab.id, { type: 'SPADD_DELIVER' }); return; }
    catch (e) { /* no answer — try the next tab */ }
  }
}

// After install / reload / browser start, put a working helper into startpage
// tabs that were already open (the old one stops working when the extension reloads).
async function reattach() {
  const tabs = await chrome.tabs.query({ url: STARTPAGE });
  for (const t of tabs) {
    try { await chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['content.js'] }); }
    catch (e) { /* tab not ready / discarded — it gets the helper on its next load */ }
  }
}
chrome.runtime.onInstalled.addListener(reattach);
chrome.runtime.onStartup.addListener(reattach);

// ── toolbar badge ─────────────────────────────────────
// number = pages waiting for the startpage · "+N" = just added · "DUP" = already there
async function badgeColor() {
  const { spadd_theme } = await chrome.storage.local.get('spadd_theme');
  const c = spadd_theme && spadd_theme.accent;
  return /^#[0-9a-f]{6}$/i.test(c || '') ? c : '#7ecfb3';
}
async function showQueueBadge() {
  const { spadd_queue } = await chrome.storage.local.get('spadd_queue');
  const n = (spadd_queue || []).length;
  await chrome.action.setBadgeBackgroundColor({ color: await badgeColor() });
  await chrome.action.setBadgeText({ text: n ? String(n) : '' });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'SPADD_ENQUEUE') return;
  enqueue(msg.items || []).then(() => sendResponse({ ok: true }));
  return true; // keep the channel open for the async reply
});

chrome.runtime.onMessage.addListener(msg => {
  if (!msg || msg.type !== 'SPADD_RESULT') return;
  const r = msg.data || {};
  const added = (r.added || []).length, dupes = (r.dupes || []).length;
  (async () => {
    await chrome.action.setBadgeBackgroundColor({ color: added ? await badgeColor() : '#e06c75' });
    await chrome.action.setBadgeText({ text: added ? `+${added}` : (dupes ? 'DUP' : '') });
    setTimeout(showQueueBadge, 3000);
    console.log('[SP//ADD] result', r);
  })();
});

// ── small window for "… with details" / "Add links in selection…" ──
async function openDetailsWindow(tab, query) {
  const W = 440, H = 340; // popup.js shrinks/grows the height to fit once it has drawn
  let pos = {};
  try {
    const cur = await chrome.windows.get(tab.windowId);
    pos = { left: Math.round(cur.left + (cur.width - W) / 2), top: Math.round(cur.top + 90) };
  } catch (e) {}
  chrome.windows.create({ url: chrome.runtime.getURL('popup.html?' + query), type: 'popup', state: 'normal', focused: true, width: W, height: H, ...pos });
}

// Runs inside the page you right-clicked: returns [{url, name}] for every link
// touched by the selection, plus any plain-text web addresses in it.
function linksInSelection() {
  const sel = window.getSelection();
  const out = [], seen = new Set();
  const push = (url, name) => {
    if (!/^https?:\/\//i.test(url) || seen.has(url)) return;
    seen.add(url); out.push({ url, name: (name || '').replace(/\s+/g, ' ').trim().slice(0, 48) });
  };
  for (let i = 0; i < sel.rangeCount; i++) {
    const r = sel.getRangeAt(i);
    const root = r.commonAncestorContainer.nodeType === 1 ? r.commonAncestorContainer : r.commonAncestorContainer.parentElement;
    const up = root && root.closest('a[href]');
    if (up) push(up.href, up.textContent);
    if (root) root.querySelectorAll('a[href]').forEach(a => { if (r.intersectsNode(a)) push(a.href, a.textContent); });
  }
  (sel.toString().match(/https?:\/\/[^\s<>"']+/g) || []).forEach(u => push(u.replace(/[),.;\]]+$/, ''), ''));
  return out;
}

// ── toolbar icon: still "+" in the startpage's accent; plays the
//    favicon-style animation once when a page is added/queued and at browser start ──
async function iconAccent() {
  const { spadd_theme: th } = await chrome.storage.local.get('spadd_theme');
  return (th && th.accent) || '#7ecfb3';
}
async function setIconFrame(frame, accent) {
  const imageData = {};
  for (const s of [16, 32]) {
    const ctx = new OffscreenCanvas(s, s).getContext('2d');
    spaddDrawFrame(ctx, s, frame, accent);
    imageData[s] = ctx.getImageData(0, 0, s, s);
  }
  await chrome.action.setIcon({ imageData });
}

let animToken = 0; // a new animation cancels one that's still running
async function playIconAnim() {
  const my = ++animToken;
  try {
    const accent = await iconAccent();
    for (const step of SPADD_ANIM) {
      if (my !== animToken) return;
      await setIconFrame(step.f, accent);
      if (step.d) await new Promise(r => setTimeout(r, step.d));
    }
  } catch (e) { console.error('[SP//ADD] icon animation failed', e); }
}
async function recolorIcon() {
  animToken++; // stop any running animation, show the still icon
  try { await setIconFrame({ type: 'still' }, await iconAccent()); }
  catch (e) { console.error('[SP//ADD] icon recolor failed', e); }
}
chrome.runtime.onInstalled.addListener(recolorIcon);
chrome.runtime.onStartup.addListener(playIconAnim);
chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch.spadd_theme) recolorIcon(); });
