# Better Console

A Chromium DevTools extension inspired by Eruda. It is a browser extension—not a bookmarklet—and adds a dedicated **Better Console** panel to DevTools.

## Features

- Captures page `console.log`, `info`, `warn`, `error`, `debug`, `table`, `dir`, and `assert` calls.
- Captures uncaught errors and unhandled promise rejections.
- Filter messages by text or severity.
- Clear output and preserve logs across navigation.
- Evaluate JavaScript in the inspected page from the command bar.
- No external dependencies or build step.

## Install (Chrome / Edge)

1. Download or clone this repository.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select this project folder.
5. Open DevTools on a page and select the **Better Console** tab.

## Notes

This first version targets Chromium Manifest V3. Console capture starts when the extension is installed/reloaded and a page is loaded or refreshed. Browser-internal pages and some restricted origins cannot be inspected. The extension serializes values for display, so complex objects are snapshots rather than live DevTools object handles.

## Permissions

The extension uses a content script on pages you visit to observe console output and relay it to its DevTools panel. It does not send page data to a remote server.