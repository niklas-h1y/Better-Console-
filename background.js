const panels = new Map();
const pending = new Map();
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "better-console-panel") return;
  let tabId = null;
  port.onMessage.addListener((message) => {
    if (message.type !== "attach" || !Number.isInteger(message.tabId)) return;
    tabId = message.tabId;
    panels.set(tabId, port);
    for (const entry of pending.get(tabId) || []) port.postMessage(entry);
    pending.delete(tabId);
  });
  port.onDisconnect.addListener(() => {
    if (tabId !== null && panels.get(tabId) === port) panels.delete(tabId);
  });
});
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type !== "better-console-event" || !message.entry) return;
  const tabId = sender.tab && sender.tab.id;
  if (tabId == null) return;
  const panel = panels.get(tabId);
  if (panel) {
    try { panel.postMessage(message.entry); } catch (_) { panels.delete(tabId); }
  } else {
    const queue = pending.get(tabId) || [];
    queue.push(message.entry);
    pending.set(tabId, queue.slice(-1000));
  }
});