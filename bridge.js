(function () {
  if (window.__betterConsoleHooked) return;
  window.__betterConsoleHooked = true;
  const methods = ["log", "info", "warn", "error", "debug", "table", "dir", "assert"];
  const serialize = (value) => {
    try {
      if (value instanceof Error) return { type: "Error", name: value.name, message: value.message, stack: value.stack };
      if (value === undefined) return "undefined";
      if (typeof value === "function") return value.toString();
      return JSON.parse(JSON.stringify(value));
    } catch (_) {
      try { return String(value); } catch (_) { return "[Unserializable value]"; }
    }
  };
  const emit = (level, args) => {
    window.postMessage({
      source: "better-console-page",
      entry: { level, args: Array.from(args, serialize), time: Date.now(), url: location.href }
    }, "*");
  };
  methods.forEach((method) => {
    const original = console[method];
    if (typeof original !== "function") return;
    console[method] = function () {
      try { emit(method, arguments); } catch (_) {}
      return original.apply(this, arguments);
    };
  });
  window.addEventListener("error", (event) => emit("error", [event.message || "Script error", event.filename, event.lineno + ":" + event.colno]));
  window.addEventListener("unhandledrejection", (event) => emit("error", ["Unhandled promise rejection", serialize(event.reason)]));
})();