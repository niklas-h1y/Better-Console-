(function () {
  if (window.__betterConsoleRelayInstalled) return;
  window.__betterConsoleRelayInstalled = true;
  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data || event.data.source !== "better-console-page") return;
    try {
      chrome.runtime.sendMessage({ type: "better-console-event", entry: event.data.entry });
    } catch (_) {}
  });
})();