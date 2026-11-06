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
      (async () => {
        try {
          const root = document.documentElement.cloneNode(true);
          root.querySelectorAll("#better-console-overlay-host").forEach(node => node.remove());
          const warnings = [];
          const stats = { stylesheetsInlined: 0, scriptsInlined: 0, assetsEmbedded: 0, jsonCaptured: 0, framesCaptured: 0, bytesEmbedded: 0, warnings };
          const MAX_RESOURCE = 3 * 1024 * 1024;
          const MAX_TOTAL = 24 * 1024 * 1024;
          const absolute = value => { try { return new URL(value, document.baseURI).href; } catch (_) { return ""; } };
          const bytesToBase64 = bytes => {
            let binary = "";
            const chunk = 0x8000;
            for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunk, bytes.length)));
            return btoa(binary);
          };
          const fetchAsset = async (url, asText) => {
            if (!url || /^(data:|blob:|javascript:|mailto:|tel:|#)/i.test(url)) return null;
            const response = await fetch(url, { credentials: "include", cache: "no-store" });
            if (!response.ok) throw new Error("HTTP " + response.status);
            const blob = await response.blob();
            if (blob.size > MAX_RESOURCE) throw new Error("Resource exceeds 3 MB export limit");
            if (stats.bytesEmbedded + blob.size > MAX_TOTAL) throw new Error("Total embedded resource limit reached");
            stats.bytesEmbedded += blob.size;
            if (asText) return await blob.text();
            const bytes = new Uint8Array(await blob.arrayBuffer());
            const mime = blob.type || response.headers.get("content-type") || "application/octet-stream";
            return "data:" + mime + ";base64," + bytesToBase64(bytes);
          };
          const rewriteCss = async (css, baseUrl, depth) => {
            if (depth > 3) return css;
            // Resolve and inline CSS @import rules before rewriting url() assets.
            const importPattern = /@import\s+(?:url\(\s*)?(['"])([^'"]+)\1\s*\)?\s*([^;]*);/gi;
            let match, imports = [];
            while ((match = importPattern.exec(css)) !== null) imports.push({ full: match[0], url: match[2], media: match[3] });
            for (const item of imports) {
              const url = absoluteFrom(item.url, baseUrl);
              try {
                const imported = await fetchAsset(url, true);
                if (imported !== null) {
                  const rewritten = await rewriteCss(imported, url, depth + 1);
                  css = css.replace(item.full, item.media ? "@media " + item.media + "{" + rewritten + "}" : rewritten);
                  stats.stylesheetsInlined++;
                }
              } catch (error) { warnings.push("CSS import not embedded: " + url + " (" + String(error.message || error) + ")"); }
            }
            const urlPattern = /url\(\s*(['"]?)(.*?)\1\s*\)/gi;
            let urls = [], m;
            while ((m = urlPattern.exec(css)) !== null) {
              const raw = m[2].trim();
              if (raw && !/^(data:|blob:|#)/i.test(raw)) urls.push({ full: m[0], raw });
            }
            for (const item of urls) {
              const url = absoluteFrom(item.raw, baseUrl);
              try {
                const dataUrl = await fetchAsset(url, false);
                if (dataUrl) { css = css.replace(item.full, "url('" + dataUrl + "')"); stats.assetsEmbedded++; }
              } catch (error) { warnings.push("CSS asset not embedded: " + url + " (" + String(error.message || error) + ")"); }
            }
            return css;
          };
          const absoluteFrom = (value, base) => { try { return new URL(value, base).href; } catch (_) { return ""; } };

          // Preserve the original URL as the base for navigation and any resources
          // that cannot be embedded.
          const oldBase = root.querySelector("base");
          const target = oldBase && oldBase.getAttribute("target");
          root.querySelectorAll("base").forEach(node => node.remove());
          const baseNode = document.createElement("base");
          baseNode.href = document.baseURI;
          if (target) baseNode.target = target;
          root.querySelector("head")?.prepend(baseNode);

          // Sensitive form state is included only after the user completes
          // the guarded opt-in confirmation in Better Console.
          if (message.includeSensitive === true) {
            const liveControls = Array.from(document.querySelectorAll("input,textarea,select"));
            const clonedControls = Array.from(root.querySelectorAll("input,textarea,select"));
            liveControls.forEach((live, i) => {
              const clone = clonedControls[i];
              if (!clone) return;
              if (live instanceof HTMLInputElement) {
                if (live.type === "checkbox" || live.type === "radio") clone.toggleAttribute("checked", live.checked);
                else clone.setAttribute("value", live.value);
              } else if (live instanceof HTMLTextAreaElement) clone.textContent = live.value;
              else if (live instanceof HTMLSelectElement) {
                Array.from(clone.options).forEach((option, j) => option.toggleAttribute("selected", !!live.options[j]?.selected));
              }
            });
          } else {
            root.querySelectorAll("input").forEach(input => {
              input.removeAttribute("value");
              input.removeAttribute("checked");
              if (input.type === "password" || input.type === "hidden") input.removeAttribute("name");
            });
            root.querySelectorAll("textarea").forEach(textarea => { textarea.textContent = ""; });
            root.querySelectorAll("select option").forEach(option => option.removeAttribute("selected"));
          }
          // Capture canvas pixels as images when the browser allows it.
          const liveCanvases = Array.from(document.querySelectorAll("canvas"));
          const cloneCanvases = Array.from(root.querySelectorAll("canvas"));
          liveCanvases.forEach((canvas, i) => {
            try {
              const image = document.createElement("img");
              image.src = canvas.toDataURL("image/png");
              image.setAttribute("data-better-console-canvas-snapshot", "true");
              if (cloneCanvases[i]) cloneCanvases[i].replaceWith(image);
            } catch (_) { warnings.push("A canvas could not be captured (possibly cross-origin content)."); }
          });
          // Include accessible same-origin frame markup as srcdoc.
          const liveFrames = Array.from(document.querySelectorAll("iframe"));
          const cloneFrames = Array.from(root.querySelectorAll("iframe"));
          liveFrames.forEach((frame, i) => {
            try {
              const frameDoc = frame.contentDocument;
              if (!frameDoc || !cloneFrames[i]) return;
              const dt = frameDoc.doctype ? new XMLSerializer().serializeToString(frameDoc.doctype) + "\n" : "";
              cloneFrames[i].setAttribute("srcdoc", dt + frameDoc.documentElement.outerHTML);
              cloneFrames[i].removeAttribute("src");
              stats.framesCaptured++;
            } catch (_) { warnings.push("A cross-origin iframe could not be captured."); }
          });

          // Inline stylesheets and recursively embed CSS imports/background assets.
          for (const link of Array.from(root.querySelectorAll('link[rel~="stylesheet"][href]'))) {
            const url = absoluteFrom(link.getAttribute("href"), document.baseURI);
            try {
              const css = await fetchAsset(url, true);
              if (css !== null) {
                const style = document.createElement("style");
                for (const attr of ["media", "title"]) if (link.hasAttribute(attr)) style.setAttribute(attr, link.getAttribute(attr));
                style.textContent = await rewriteCss(css, url, 0);
                link.replaceWith(style);
                stats.stylesheetsInlined++;
              }
            } catch (error) { warnings.push("Stylesheet not embedded: " + url + " (" + String(error.message || error) + ")"); }
          }
          // Rewrite inline style attributes and style blocks too.
          for (const style of Array.from(root.querySelectorAll("style"))) {
            style.textContent = await rewriteCss(style.textContent || "", document.baseURI, 0);
          }
          for (const element of Array.from(root.querySelectorAll("[style]"))) {
            element.setAttribute("style", await rewriteCss(element.getAttribute("style") || "", document.baseURI, 0));
          }

          // Embed images, icons, media, posters and other common URL-bearing assets.
          const assetAttrs = [
            ["img", "src"], ["source", "src"], ["video", "poster"], ["audio", "src"],
            ["track", "src"], ["input[type=image]", "src"], ['link[rel~="icon"]', "href"],
            ['link[rel="preload"][as="image"]', "href"]
          ];
          for (const [selector, attr] of assetAttrs) {
            for (const element of Array.from(root.querySelectorAll(selector + "[" + attr + "]"))) {
              const original = element.getAttribute(attr);
              const url = absoluteFrom(original, document.baseURI);
              try {
                const dataUrl = await fetchAsset(url, false);
                if (dataUrl) { element.setAttribute(attr, dataUrl); stats.assetsEmbedded++; }
              } catch (error) { warnings.push("Asset not embedded: " + url + " (" + String(error.message || error) + ")"); }
            }
          }
          // Capture srcset candidates individually.
          for (const element of Array.from(root.querySelectorAll("[srcset]"))) {
            const candidates = (element.getAttribute("srcset") || "").split(",").map(s => s.trim()).filter(Boolean);
            const rewritten = [];
            for (const candidate of candidates) {
              const parts = candidate.split(/\s+/), url = absoluteFrom(parts.shift(), document.baseURI);
              try {
                const dataUrl = await fetchAsset(url, false);
                rewritten.push((dataUrl || url) + (parts.length ? " " + parts.join(" ") : ""));
                if (dataUrl) stats.assetsEmbedded++;
              } catch (error) { rewritten.push(url); warnings.push("Responsive image not embedded: " + url); }
            }
            element.setAttribute("srcset", rewritten.join(", "));
          }

          // Inline external scripts. Module imports may still require their original
          // URL tree, so failures are reported rather than silently discarded.
          for (const script of Array.from(root.querySelectorAll("script[src]"))) {
            const url = absoluteFrom(script.getAttribute("src"), document.baseURI);
            // Keep module entry points linked because flattening them breaks
            // their relative import graph. The base URL preserves resolution.
            if ((script.getAttribute("type") || "").toLowerCase() === "module") {
              warnings.push("Module script left linked so its import graph can resolve: " + url);
              continue;
            }
            try {
              const source = await fetchAsset(url, true);
              if (source !== null) {
                script.removeAttribute("src"); script.removeAttribute("integrity");
                script.removeAttribute("crossorigin"); script.removeAttribute("referrerpolicy");
                script.removeAttribute("async"); script.removeAttribute("defer");
                script.textContent = source; stats.scriptsInlined++;
              }
            } catch (error) { warnings.push("Script not embedded: " + url + " (" + String(error.message || error) + ")"); }
          }

          // Private browsing data is excluded by default. The explicit,
          // challenge-confirmed opt-in allows page-readable cookies, Web Storage
          // and form values to be packaged as inert JSON in this same HTML file.
          if (message.includeSensitive === true) {
            const archive = {
              capturedAt: new Date().toISOString(),
              page: { url: location.href, title: document.title },
              cookies: document.cookie,
              storage: { localStorage: {}, sessionStorage: {} },
              forms: Array.from(document.querySelectorAll("input,textarea,select")).map((el, index) => ({
                index, tag: el.tagName.toLowerCase(), type: el.type || "",
                name: el.name || "", id: el.id || "", value: el.value,
                checked: "checked" in el ? el.checked : undefined
              }))
            };
            try { for (const key of Object.keys(localStorage)) archive.storage.localStorage[key] = localStorage.getItem(key); } catch (_) { archive.storage.localStorage = "[unavailable]"; }
            try { for (const key of Object.keys(sessionStorage)) archive.storage.sessionStorage[key] = sessionStorage.getItem(key); } catch (_) { archive.storage.sessionStorage = "[unavailable]"; }
            const dataBlock = document.createElement("script");
            dataBlock.type = "application/json";
            dataBlock.id = "better-console-private-page-data";
            dataBlock.textContent = JSON.stringify(archive).replace(/</g, "\\u003c");
            root.querySelector("body")?.appendChild(dataBlock);
          }
          // Keep the exported copy renderable when embedded inline resources
          // would otherwise be blocked by the original site's CSP meta policy.
          root.querySelectorAll('meta[http-equiv="Content-Security-Policy" i]').forEach(node => node.remove());
          const doctype = document.doctype ? new XMLSerializer().serializeToString(document.doctype) + "\n" : "";
          sendResponse({ ok: true, html: doctype + root.outerHTML, title: document.title || "page", stats });
        } catch (error) {
          sendResponse({ ok: false, error: String(error && error.message || error) });
        }
      })();
      return true;
    }
    if (message.type === "better-console-eval") {
      window.postMessage({ source: "better-console-extension", action: "eval", id: message.id, code: message.code }, "*");
    }
    try { sendResponse({ ok: true }); } catch (_) {}
    return false;
  });
})();