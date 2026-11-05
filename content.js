(function () {
  if (window.__betterConsoleRelayInstalled) return;
  window.__betterConsoleRelayInstalled = true;
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("bridge.js");
  script.onload = () => script.remove();
  (document.documentElement || document).appendChild(script);

  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data || event.data.source !== "better-console-page") return;
    chrome.runtime.sendMessage({ type: "better-console-log", entry: event.data.entry });
  });
})();