const output = document.getElementById("output");
const filter = document.getElementById("filter");
const count = document.getElementById("count");
const entries = [];
let activeLevel = "all";
let preserve = true;
const port = chrome.runtime.connect({ name: "better-console-panel" });
port.postMessage({ type: "attach", tabId: chrome.devtools.inspectedWindow.tabId });

const format = (value) => {
  if (typeof value === "string") return value;
  try { return JSON.stringify(value, null, 2); } catch (_) { return String(value); }
};
function render() {
  const query = filter.value.toLowerCase();
  const visible = entries.filter((entry) => {
    const levelMatch = activeLevel === "all" || entry.level === activeLevel ||
      (activeLevel === "info" && ["info", "log", "debug"].includes(entry.level));
    return levelMatch && format(entry.args).toLowerCase().includes(query);
  });
  count.textContent = visible.length + (visible.length === 1 ? " message" : " messages");
  output.replaceChildren();
  if (!visible.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = entries.length ? "No messages match this filter." : "Waiting for page activity…";
    output.append(empty);
    return;
  }
  visible.forEach((entry) => {
    const row = document.createElement("div");
    row.className = "row " + entry.level;
    const time = document.createElement("span"); time.className = "time";
    time.textContent = new Date(entry.time).toLocaleTimeString();
    const badge = document.createElement("span"); badge.className = "badge"; badge.textContent = entry.level;
    const payload = document.createElement("span"); payload.className = "payload";
    payload.textContent = entry.args.map(format).join(" ");
    row.append(time, badge, payload); output.append(row);
  });
  output.scrollTop = output.scrollHeight;
}
port.onMessage.addListener((entry) => {
  if (!entry || !Array.isArray(entry.args)) return;
  entries.push(entry);
  if (entries.length > 2000) entries.shift();
  render();
});
document.getElementById("clear").addEventListener("click", () => { entries.length = 0; render(); });
document.getElementById("preserve").addEventListener("click", (event) => {
  preserve = !preserve;
  event.currentTarget.setAttribute("aria-pressed", String(preserve));
});
filter.addEventListener("input", render);
document.querySelectorAll("[data-level]").forEach((button) => button.addEventListener("click", () => {
  activeLevel = button.dataset.level;
  document.querySelectorAll("[data-level]").forEach((item) => item.classList.toggle("active", item === button));
  render();
}));
document.getElementById("command").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = document.getElementById("expression");
  const expression = input.value.trim();
  if (!expression) return;
  entries.push({ level: "info", args: ["› " + expression], time: Date.now() });
  chrome.devtools.inspectedWindow.eval(expression, (result, exceptionInfo) => {
    if (exceptionInfo && exceptionInfo.isException) {
      entries.push({ level: "error", args: [exceptionInfo.description || "Evaluation failed"], time: Date.now() });
    } else {
      entries.push({ level: "info", args: [result], time: Date.now() });
    }
    render();
  });
  input.value = "";
  render();
});
chrome.devtools.network.onNavigated.addListener(() => { if (!preserve) { entries.length = 0; render(); } });