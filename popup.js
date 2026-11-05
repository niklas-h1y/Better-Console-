const title = document.getElementById("page-title");
const status = document.getElementById("page-status");
const dot = document.querySelector(".status-dot");

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (!tab) {
    title.textContent = "No active tab";
    status.textContent = "Open a webpage, then open this popup again.";
    return;
  }

  title.textContent = tab.title || "Current tab";
  const url = tab.url || "";

  if (/^(chrome|edge|about|devtools|chrome-extension):\/\//i.test(url) ||
      url.startsWith("https://chrome.google.com/webstore")) {
    status.textContent = "This browser page cannot be inspected by extensions.";
    dot.style.background = "#e66b75";
  } else {
    status.textContent = "Ready to inspect. Open DevTools and choose Better Console.";
    dot.style.background = "#69d7a8";
  }
});
