# SP//ADD

Browser extension (Chromium / Thorium, Manifest V3) that adds pages to the startpage's **Bookmarks** and **OSINT** widgets.

## Install / update
1. `chrome://extensions` → turn on **Developer mode**.
2. **Load unpacked** → pick this `extension` folder.
3. After changing any file here: click the circular **reload** arrow on the SP//ADD card. No push needed for the extension itself to update — it runs from this folder.

## What it does
- Right-click a page / link → add it to any Bookmarks or OSINT category, or **… with details** to edit first.
- Right-click highlighted text → **Add links in selection…**
- Toolbar popup → add current page / selected tabs / current window / all windows, or **bulk paste**
  (`url` · `domain.com` · `Name - url` · `Name | url | nick` · `Name url nick`), with a **+ create new category** option.
- Duplicate URLs are skipped; icons are auto-picked by the startpage's `EMOJI_RULES` unless you type one.
- If the startpage isn't open, pages wait in a queue and are added the next time it loads.
- Toolbar icon: still **SP**; plays the favicon-style animation when something is added. Follows the startpage's accent color.

## How it talks to the startpage
The startpage (`index.html`) has two blocks near the end of the main script:
**SP//ADD EXTENSION BRIDGE** (sends category lists + accent/font) and **SP//ADD EXTENSION RECEIVER** (adds incoming pages through the normal save functions, so cloud sync works as usual).
`content.js` relays messages between that page and the extension via `window.postMessage`.

## Files
- `manifest.json` — permissions, popup, icons
- `background.js` — right-click menus, queue + delivery, toolbar badge, icon animation
- `content.js` — runs only on https://4lt3r3d.github.io/startpage/
- `popup.html` / `popup.css` / `popup.js` — toolbar popup, review list, bulk paste
- `icon.js` — pixel icon + animation frames
- `icons/` — still icons (16/32/48/128)
