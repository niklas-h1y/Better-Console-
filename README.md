# Better Console

A Chromium DevTools extension that aims to be a more capable, extension-native alternative to Eruda. It is **not a bookmarklet** and does not require a page overlay.

## Current tools

- **Console:** captures log, info, warn, error, debug, table, dir, trace, assert, groups, counters, timers, uncaught exceptions, and unhandled promise rejections. Includes text/severity filters and JavaScript evaluation in the inspected page.
- **Network:** observes page fetch and XMLHttpRequest activity, with method, URL, status, type, duration, and request detail view.
- **Elements:** query the DOM with CSS selectors, inspect matching element details, and highlight a match in the page.
- **Storage:** inspect, add, and delete localStorage, sessionStorage, and document cookies.
- **Info:** inspect URL, document, browser, viewport, device, connection, and performance basics.
- **Snippets:** save reusable JavaScript snippets locally in the extension and run them against the inspected page.

## Install (Chrome / Edge)

1. Download the repository as a ZIP and extract it, or clone it.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the extracted project folder.
5. Open a normal website, open DevTools, and choose **Better Console**.
6. If the extension was already installed, click **Reload** on its extensions card, then refresh the website and reopen DevTools.

## Important

- Requires Chromium 111+ because it uses Manifest V3's `world: "MAIN"` content-script support.
- Browser-internal pages, extension pages, Chrome Web Store pages, and some restricted origins cannot be inspected.
- The Network tab currently instruments page `fetch` and XHR calls. It is not yet a full replacement for the browser's native Network panel: native resource initiators, request/response bodies, WebSockets, blocking, and HAR export are not implemented.
- Object values in the Console are serialized snapshots, not live remote object handles.
- Storage cookie controls operate on `document.cookie`; HttpOnly cookies are not readable or editable there.
- This is an actively developed toolkit. It has not yet been validated across every Chromium version or site/CSP combination.

## Privacy and permissions

The extension runs its instrumentation locally in pages you visit and relays events to its DevTools panel. It does not transmit page data to a remote server. The broad host permission is required for user-requested inspection across sites; Chrome still blocks restricted browser pages.
