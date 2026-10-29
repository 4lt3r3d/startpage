// SP//ADD — content script. Runs only on https://4lt3r3d.github.io/startpage/
// Relays messages between the startpage and the extension.

if (!window.__spaddLoaded) {
window.__spaddLoaded = true;

const inflight = new Set(); // queue item ids already handed to the page

function alive() {
  try { return !!chrome.runtime.id; } catch (e) { return false; } // false after the extension is reloaded
}

// Hand any queued items to the page.
function deliverQueue() {
  if (!alive()) return;
  chrome.storage.local.get('spadd_queue', ({ spadd_queue }) => {
    const items = (spadd_queue || []).filter(i => !inflight.has(i.id));
    if (!items.length) return;
    items.forEach(i => inflight.add(i.id));
    window.postMessage({ dir: 'ext->page', type: 'SPADD_ADD', items }, location.origin);
  });
}

window.addEventListener('message', e => {
  if (!alive()) return;
  if (e.source !== window || !e.data || e.data.dir !== 'page->ext') return;

  if (e.data.type === 'SPADD_CATEGORIES') {
    const d = e.data.data || {};
    chrome.storage.local.set({
      spadd_cats: {
        bookmarks: Array.isArray(d.bookmarks) ? d.bookmarks : [],
        osint:     Array.isArray(d.osint)     ? d.osint     : [],
        ts:        d.ts || Date.now(),
      },
      spadd_theme: d.theme || {},
    });
  }

  if (e.data.type === 'SPADD_RESULT') {
    const res = e.data.data || {};
    const done = new Set(res.ids || []);
    // remove only the acknowledged items from the queue
    chrome.storage.local.get('spadd_queue', ({ spadd_queue }) => {
      const left = (spadd_queue || []).filter(i => !done.has(i.id));
      done.forEach(id => inflight.delete(id));
      chrome.storage.local.set({ spadd_queue: left, spadd_last_result: { ...res, ts: Date.now() } });
      chrome.runtime.sendMessage({ type: 'SPADD_RESULT', data: res }).catch(() => {});
    });
  }
});

// Background asks us to deliver right now (something was just added).
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'SPADD_DELIVER') { deliverQueue(); sendResponse({ ok: true }); }
});

// On load: ask the page for its categories, then hand over anything queued.
window.postMessage({ dir: 'ext->page', type: 'SPADD_HELLO' }, location.origin);
deliverQueue();
}
