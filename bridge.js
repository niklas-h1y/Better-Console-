(() => {
  if (window.__betterConsoleHooked) return;
  Object.defineProperty(window, "__betterConsoleHooked", { value: true });
  const send = (kind, data) => {
    try {
      window.postMessage({ source: "better-console-page", entry: {
        kind, ...data, time: Date.now(), url: location.href
      } }, "*");
    } catch (_) {}
  };
  const safe = (value, depth = 0, seen = new WeakSet()) => {
    if (value === null || ["string", "number", "boolean", "undefined"].includes(typeof value)) return value;
    if (typeof value === "bigint") return value.toString() + "n";
    if (typeof value === "symbol") return String(value);
    if (typeof value === "function") return "[Function " + (value.name || "anonymous") + "]";
    if (value instanceof Error) return { __type: "Error", name: value.name, message: value.message, stack: value.stack };
    if (depth > 4) return "[Max depth]";
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    if (Array.isArray(value)) return value.slice(0, 200).map(v => safe(v, depth + 1, seen));
    const out = {};
    try { Object.keys(value).slice(0, 200).forEach(k => { try { out[k] = safe(value[k], depth + 1, seen); } catch (_) { out[k] = "[Getter threw]"; } }); }
    catch (_) { return String(value); }
    return out;
  };
  window.addEventListener("message", event => {
    const data = event.data;
    if (event.source !== window || !data || data.source !== "better-console-extension" || data.action !== "eval") return;
    try {
      const result = (0, eval)(String(data.code || ""));
      send("eval-result", { id: data.id, result: safe(result) });
    } catch (error) {
      send("eval-result", { id: data.id, error: error && (error.stack || error.message) || String(error) });
    }
  });
  const methods = ["log", "info", "warn", "error", "debug", "table", "dir", "trace", "assert", "group", "groupCollapsed", "groupEnd", "count", "time", "timeEnd", "timeLog", "clear"];
  const originals = {};
  methods.forEach(method => {
    const original = console[method];
    if (typeof original !== "function") return;
    originals[method] = original;
    console[method] = function (...args) {
      if (method === "assert" && args[0]) return original.apply(this, args);
      if (method === "groupEnd" || method === "clear") send("console", { level: method, args: [] });
      else send("console", { level: method, args: args.map(v => safe(v)) });
      return original.apply(this, args);
    };
  });
  setTimeout(() => send("status", { args: ["Page instrumentation connected"] }), 100);
  window.addEventListener("error", e => send("console", { level: "error", args: [e.message || "Script error", e.filename, e.lineno + ":" + e.colno] }));
  window.addEventListener("unhandledrejection", e => send("console", { level: "error", args: ["Unhandled promise rejection", safe(e.reason)] }));
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const started = performance.now(), input = args[0], url = typeof input === "string" ? input : input && input.url;
    try {
      const response = await originalFetch.apply(this, args);
      send("network", { method: (args[1] && args[1].method) || (input && input.method) || "GET", url: String(url || ""), status: response.status, ok: response.ok, duration: Math.round(performance.now() - started), type: "fetch" });
      return response;
    } catch (error) {
      send("network", { method: (args[1] && args[1].method) || "GET", url: String(url || ""), status: 0, error: String(error), duration: Math.round(performance.now() - started), type: "fetch" });
      throw error;
    }
  };
  const XHR = window.XMLHttpRequest;
  if (XHR) {
    const open = XHR.prototype.open, sendXhr = XHR.prototype.send;
    XHR.prototype.open = function (method, url, ...rest) { this.__bcMeta = { method, url, started: 0 }; return open.call(this, method, url, ...rest); };
    XHR.prototype.send = function (...args) {
      if (this.__bcMeta) {
        this.__bcMeta.started = performance.now();
        this.addEventListener("loadend", () => send("network", { ...this.__bcMeta, status: this.status, duration: Math.round(performance.now() - this.__bcMeta.started), type: "xhr" }), { once: true });
      }
      return sendXhr.apply(this, args);
    };
  }
})();