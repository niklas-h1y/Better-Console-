(function () {
  if (window.__betterConsoleRelayInstalled) return;
  window.__betterConsoleRelayInstalled = true;
  const relay = (entry) => {
    try { chrome.runtime.sendMessage({ type: "better-console-event", entry }); }
    catch (error) { /* Extension context may have been reloaded. */ }
  };
  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data || event.data.source !== "better-console-page") return;
    relay(event.data.entry);
  });
})();