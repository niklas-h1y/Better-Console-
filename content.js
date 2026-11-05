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
  let overlay = null;
  const closeOverlay = () => { if (overlay) overlay.remove(); overlay = null; };
  const openOverlay = (tabId) => {
    if (overlay) { overlay.__bcResize && overlay.__bcResize(); closeOverlay(); return; }
    const host = document.createElement("div");
    host.id = "better-console-overlay-host";
    host.style.cssText = "all:initial;position:fixed;z-index:2147483647;inset:auto 0 0 0;width:100vw;height:54dvh;margin:0;padding:0;border:0;background:#10151d;box-shadow:0 -10px 35px rgba(0,0,0,.45);";
    const frame = document.createElement("iframe");
    frame.title = "Better Console";
    frame.src = chrome.runtime.getURL("popup.html") + "?tabId=" + encodeURIComponent(String(tabId));
    frame.style.cssText = "display:block;position:absolute;inset:0;width:100%;height:100%;border:0;margin:0;padding:0;background:#10151d;";
    frame.setAttribute("allow", "clipboard-read; clipboard-write");
    host.appendChild(frame);
    const applyOrientation = () => {
      const landscape = window.matchMedia("(orientation: landscape)").matches;
      host.style.inset = landscape ? "0 0 0 auto" : "auto 0 0 0";
      host.style.width = landscape ? "46vw" : "100vw";
      host.style.height = landscape ? "100dvh" : "54dvh";
      host.style.boxShadow = landscape ? "-10px 0 35px rgba(0,0,0,.45)" : "0 -10px 35px rgba(0,0,0,.45)";
    };
    applyOrientation();
    window.addEventListener("resize", applyOrientation);
    host.__bcResize = () => window.removeEventListener("resize", applyOrientation);
    document.documentElement.appendChild(host);
    overlay = host;
  };
  window.addEventListener("message", event => {
    if (!overlay || !event.data || event.data.source !== "better-console-ui" || event.data.action !== "close") return;
    if (event.source !== overlay.querySelector("iframe").contentWindow) return;
    overlay.__bcResize && overlay.__bcResize();
    closeOverlay();
  });
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message) return false;
    // tabs.sendMessage can reach every frame. Only the top frame handles
    // commands, but it must send an acknowledgement: some Android Chromium
    // builds report "message port closed" when a listener sends no response.
    if (window !== window.top) return false;
    if (message.type === "better-console-toggle-overlay") {
      openOverlay(message.tabId);
      try { sendResponse({ ok: true }); } catch (_) {}
      return false;
    }
    if (message.type === "better-console-export-html") {
      try {
        const root = document.documentElement.cloneNode(true);
        root.querySelectorAll("#better-console-overlay-host").forEach(node => node.remove());
        const doctype = document.doctype ? new XMLSerializer().serializeToString(document.doctype) + "\\n" : "";
        sendResponse({ ok: true, html: doctype + root.outerHTML, title: document.title || "page" });
      } catch (error) {
        sendResponse({ ok: false, error: String(error && error.message || error) });
      }
      return false;
    }
    if (message.type === "better-console-eval") {
      window.postMessage({ source: "better-console-extension", action: "eval", id: message.id, code: message.code }, "*");
    }
    try { sendResponse({ ok: true }); } catch (_) {}
    return false;
  });
})();