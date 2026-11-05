const $ = id => document.getElementById(id);
const entries = [], requests = [];
let activeLevel = "all", paused = false, storeType = "localStorage", selectedRequest = null;
let activeTabId = null;
const pendingEvaluations = new Map();
const port = chrome.runtime.connect({ name: "better-console-panel" });
const requestedTabId = Number(new URLSearchParams(location.search).get("tabId"));
function attachToTab(tabId) {
  if (!Number.isInteger(tabId)) { addConsole("error", ["Could not determine the page tab."]); return; }
  activeTabId = tabId;
  port.postMessage({ type: "attach", tabId: activeTabId });
  addConsole("info", ["Page console connected."]);
}
if (Number.isInteger(requestedTabId) && requestedTabId > 0) attachToTab(requestedTabId);
else chrome.tabs.query({ active: true, currentWindow: true }, tabs => attachToTab(tabs && tabs[0] && tabs[0].id));
addConsole("info", ["Better Console attached to this webpage."]);
let pageHookSeen = false;
setTimeout(() => { if (!pageHookSeen) addConsole("warn", ["No page instrumentation handshake yet. Refresh this webpage and reopen the console."]); }, 1800);
const fmt = v => typeof v === "string" ? v : JSON.stringify(v, null, 2) ?? String(v);
const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function evaluate(code, cb) {
  if (!Number.isInteger(activeTabId)) { cb({error:"No active tab is connected."}); return; }
  const id = "bc-" + Date.now() + "-" + Math.random().toString(36).slice(2);
  const timeout = setTimeout(() => {
    if (!pendingEvaluations.has(id)) return;
    pendingEvaluations.delete(id);
    cb({error:"The page did not answer the command. Refresh the page and try again; some pages block script execution."});
  }, 10000);
  pendingEvaluations.set(id, result => { clearTimeout(timeout); cb(result); });
  try {
    chrome.tabs.sendMessage(activeTabId, {type:"better-console-eval", id, code}, () => {
      if (chrome.runtime.lastError) {
        pendingEvaluations.delete(id);
        cb({error:"Cannot reach this page. Refresh the webpage, then reopen Better Console. " + chrome.runtime.lastError.message});
      }
    });
  } catch (error) {
    pendingEvaluations.delete(id);
    cb({error:String(error)});
  }
}
function addConsole(level,args,time=Date.now()) { if(paused)return; entries.push({level,args,time}); if(entries.length>5000) entries.shift(); renderConsole(); }
function renderConsole() {
 const q=$("filter").value.toLowerCase();
 const list=entries.filter(e=>(activeLevel==="all"||e.level===activeLevel||(activeLevel==="info"&&["info","log","debug"].includes(e.level)))&&fmt(e.args).toLowerCase().includes(q));
 $("count").textContent=list.length+" messages"; $("output").replaceChildren();
 if(!list.length){const d=document.createElement("div");d.className="empty";d.textContent=entries.length?"No messages match this filter.":"Waiting for page activity…";$("output").append(d);return;}
 list.forEach(e=>{const row=document.createElement("div");row.className="row "+e.level;const t=document.createElement("span");t.className="time";t.textContent=new Date(e.time).toLocaleTimeString();const b=document.createElement("span");b.className="badge";b.textContent=e.level;const p=document.createElement("pre");p.className="payload";p.textContent=e.args.map(fmt).join(" ");row.append(t,b,p);$("output").append(row);});$("output").scrollTop=$("output").scrollHeight;
}
port.onMessage.addListener(e=>{if(!e)return;if(e.kind==="eval-result"){const cb=pendingEvaluations.get(e.id);if(cb){pendingEvaluations.delete(e.id);cb(e.error?{error:e.error}:e.result);}return;}if(e.kind==="status"){pageHookSeen=true;addConsole("info",e.args||["Page instrumentation connected"],e.time);return;}if(e.kind==="network"){requests.push(e);renderNetwork();}else if(e.kind==="console"){if(e.level==="clear")entries.length=0;else addConsole(e.level,e.args,e.time);}});
$("clear").onclick=()=>{entries.length=0;renderConsole();};
$("close-console").onclick=()=>{if(window.parent!==window)window.parent.postMessage({source:"better-console-ui",action:"close"},"*");};
$("pause").onclick=e=>{paused=!paused;e.currentTarget.setAttribute("aria-pressed",String(paused));e.currentTarget.textContent=paused?"Resume":"Pause";};
$("filter").oninput=renderConsole;
document.querySelectorAll("[data-level]").forEach(b=>b.onclick=()=>{activeLevel=b.dataset.level;document.querySelectorAll("[data-level]").forEach(x=>x.classList.toggle("active",x===b));renderConsole();});
$("command").onsubmit=e=>{e.preventDefault();const code=$("expression").value.trim();if(!code)return;addConsole("debug",["> "+code]);evaluate(code,r=>addConsole(r&&r.error?"error":"result",[r]));$("expression").value="";};
function activateTab(name) {
  const selectedView = $("view-" + name);
  if (!selectedView) {
    addConsole("error", ["Tab target not found: view-" + name]);
    return false;
  }
  document.querySelectorAll(".tab[data-tab]").forEach(tab => {
    const selected = tab.dataset.tab === name;
    tab.classList.toggle("active", selected);
    tab.setAttribute("aria-selected", selected ? "true" : "false");
    tab.setAttribute("tabindex", selected ? "0" : "-1");
  });
  document.querySelectorAll(".view[id^='view-']").forEach(view => {
    const selected = view === selectedView;
    view.classList.toggle("active", selected);
    view.hidden = !selected;
    // Inline display is intentional: it avoids a stale/unsupported CSS class
    // state in embedded Android browser webviews.
    view.style.display = selected ? "flex" : "none";
  });
  if (name === "storage") refreshStorage();
  if (name === "info") refreshInfo();
  return true;
}
document.querySelectorAll(".tab[data-tab]").forEach(tab => {
  tab.type = "button";
  tab.setAttribute("role", "tab");
  tab.setAttribute("aria-controls", "view-" + tab.dataset.tab);
  tab.addEventListener("click", event => {
    event.preventDefault();
    activateTab(tab.dataset.tab);
  });
});
activateTab("console");
function renderNetwork(){ $("network-count").textContent=requests.length;$("network-total").textContent=requests.length+" requests";const q=$("network-filter").value.toLowerCase();$("network-rows").replaceChildren();requests.filter(r=>(r.url||"").toLowerCase().includes(q)||(r.method||"").toLowerCase().includes(q)).forEach(r=>{const tr=document.createElement("tr");tr.innerHTML="<td>"+esc(r.method||"")+"</td><td>"+esc(r.status||"—")+"</td><td>"+esc(r.type||"")+"</td><td>"+esc(r.url||"")+"</td><td>"+esc((r.duration||0)+" ms")+"</td>";tr.onclick=()=>{$("network-detail").textContent=JSON.stringify(r,null,2);};$("network-rows").append(tr);});}
$("network-filter").oninput=renderNetwork;$("network-clear").onclick=()=>{requests.length=0;renderNetwork();$("network-detail").textContent="Select a request to inspect its details.";};
$("inspect-selector").onclick=()=>{const s=$("selector").value;evaluate("(()=>{try{return [...document.querySelectorAll("+JSON.stringify(s)+")].slice(0,100).map((e,i)=>({index:i,tag:e.tagName,id:e.id,classes:e.className,text:(e.innerText||e.textContent||'').slice(0,500),html:e.outerHTML.slice(0,2000),rect:(()=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()}))}catch(e){return {error:e.message}}})()",r=>$("element-result").textContent=JSON.stringify(r,null,2));};
$("highlight").onclick=()=>evaluate("(()=>{document.querySelectorAll('[data-bc-highlight]').forEach(e=>{e.style.outline=e.dataset.bcOldOutline||'';delete e.dataset.bcHighlight;delete e.dataset.bcOldOutline});try{const e=document.querySelector("+JSON.stringify($("selector").value)+");if(!e)return 'No match';e.dataset.bcOldOutline=e.style.outline;e.dataset.bcHighlight='1';e.style.outline='3px solid #ff4d8d';return e.tagName+' highlighted'}catch(e){return e.message}})()",r=>addConsole("info",[r]));
document.querySelectorAll("[data-store]").forEach(b=>b.onclick=()=>{storeType=b.dataset.store;document.querySelectorAll("[data-store]").forEach(x=>x.classList.toggle("active",x===b));refreshStorage();});
function refreshStorage(){evaluate("(()=>{const t="+JSON.stringify(storeType)+";if(t==='cookies')return document.cookie.split(';').filter(Boolean).map(x=>{const i=x.indexOf('=');return {key:x.slice(0,i).trim(),value:x.slice(i+1).trim()}});const s=window[t];return Object.keys(s).map(key=>({key,value:s.getItem(key)}))})()",r=>{const root=$("storage-rows");root.replaceChildren();if(r&&r.error){root.textContent=r.error;return;} (r||[]).forEach(item=>{const row=document.createElement("div");row.className="storage-row";const k=document.createElement("code");k.textContent=item.key;const v=document.createElement("span");v.textContent=item.value;const edit=document.createElement("button");edit.textContent="Edit";edit.onclick=()=>{const next=prompt("Edit value for "+item.key,item.value);if(next===null)return;const code=storeType==="cookies"?"document.cookie="+JSON.stringify(item.key+"="+next+"; path=/; SameSite=Lax"):"window["+JSON.stringify(storeType)+"].setItem("+JSON.stringify(item.key)+","+JSON.stringify(next)+")";evaluate(code,refreshStorage);};const copy=document.createElement("button");copy.textContent="Copy";copy.onclick=()=>copyText(item.value);const del=document.createElement("button");del.textContent="Delete";del.onclick=()=>evaluate(storeType==="cookies"?"document.cookie="+JSON.stringify(item.key+"=; Max-Age=0; path=/"):"window["+JSON.stringify(storeType)+"].removeItem("+JSON.stringify(item.key)+")",refreshStorage);row.append(k,v,edit,copy,del);root.append(row);});});}
$("storage-refresh").onclick=refreshStorage;$("storage-save").onclick=()=>{const k=$("storage-key").value,v=$("storage-value").value;if(!k)return;const code=storeType==="cookies"?"document.cookie="+JSON.stringify(k+"="+v+"; path=/; SameSite=Lax"):"window["+JSON.stringify(storeType)+"].setItem("+JSON.stringify(k)+","+JSON.stringify(v)+")";evaluate(code,refreshStorage);};
function refreshInfo(){evaluate("(()=>({url:location.href,title:document.title,origin:location.origin,referrer:document.referrer,readyState:document.readyState,userAgent:navigator.userAgent,language:navigator.language,languages:navigator.languages,platform:navigator.platform,online:navigator.onLine,cookieEnabled:navigator.cookieEnabled,screen:{width:screen.width,height:screen.height,depth:screen.colorDepth},viewport:{width:innerWidth,height:innerHeight,devicePixelRatio},memory:navigator.deviceMemory||'unknown',cores:navigator.hardwareConcurrency||'unknown',connection:navigator.connection?{effectiveType:navigator.connection.effectiveType,downlink:navigator.connection.downlink}:null,performance:{load:Math.round(performance.now()),resources:performance.getEntriesByType('resource').length}}))()",r=>$("info-result").textContent=JSON.stringify(r,null,2));}
$("info-refresh").onclick=refreshInfo;
const snippetsKey="betterConsoleSnippets";
function loadSnippets(){chrome.storage.local.get([snippetsKey],o=>{const list=$( "snippet-list");list.replaceChildren(new Option("Saved snippets…",""));(o[snippetsKey]||[]).forEach((s,i)=>list.add(new Option(s.name,i)));});}
$("snippet-save").onclick=()=>{const name=$("snippet-name").value.trim(),code=$("snippet-code").value;if(!name||!code)return;chrome.storage.local.get([snippetsKey],o=>{const a=o[snippetsKey]||[];a.push({name,code});chrome.storage.local.set({[snippetsKey]:a},loadSnippets);});};
$("snippet-list").onchange=e=>{chrome.storage.local.get([snippetsKey],o=>{const s=(o[snippetsKey]||[])[Number(e.target.value)];if(s){$("snippet-name").value=s.name;$("snippet-code").value=s.code;}});};
$("snippet-run").onclick=()=>evaluate($("snippet-code").value,r=>addConsole(r&&r.error?"error":"result",[r]));
$("snippet-delete").onclick=()=>{const i=Number($("snippet-list").value);if(!Number.isInteger(i)||$("snippet-list").value==="")return;chrome.storage.local.get([snippetsKey],o=>{const a=o[snippetsKey]||[];a.splice(i,1);chrome.storage.local.set({[snippetsKey]:a},loadSnippets);});};

loadSnippets();

// Advanced utilities and previously missing toolbar actions.
function downloadText(filename, text, type="application/json") {
  const blob=new Blob([text],{type}), url=URL.createObjectURL(blob), a=document.createElement("a");
  a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
async function copyText(value) {
  try { await navigator.clipboard.writeText(String(value)); addConsole("info",["Copied to clipboard."]); }
  catch (_) { const t=document.createElement("textarea");t.value=String(value);document.body.append(t);t.select();try{document.execCommand("copy");addConsole("info",["Copied to clipboard."]);}catch(e){addConsole("error",["Clipboard copy failed",String(e)]);}t.remove(); }
}
$("console-export").onclick=()=>downloadText("better-console-log-"+Date.now()+".json",JSON.stringify(entries,null,2));
$("network-export").onclick=()=>downloadText("better-console-network-"+Date.now()+".har",JSON.stringify({log:{version:"1.2",creator:{name:"Better Console",version:"3.1"},entries:requests.map(r=>({startedDateTime:new Date(r.time||Date.now()).toISOString(),time:r.duration||0,request:{method:r.method||"GET",url:r.url||"",headers:r.requestHeaders||[]},response:{status:r.status||0,statusText:r.statusText||"",headers:r.responseHeaders||[],content:{size:r.responseSize||0,mimeType:r.mimeType||""}},_type:r.type||"",_error:r.error||null}))}},null,2),"application/json");
$("storage-export").onclick=()=>evaluate("(()=>{const t="+JSON.stringify(storeType)+";if(t==='cookies')return {type:t,items:document.cookie};const s=window[t];return {type:t,items:Object.fromEntries(Object.keys(s).map(k=>[k,s.getItem(k)]))}})()",r=>downloadText("better-console-"+storeType+".json",JSON.stringify(r,null,2)));
$("info-copy").onclick=()=>copyText($("info-result").textContent);
function selectedElementAction(action) {
 const selector=JSON.stringify($("selector").value||"body");
 const scripts={
  hide:"(()=>{const e=document.querySelector("+selector+");if(!e)return 'No matching element';e.dataset.bcPreviousDisplay=e.style.display;e.style.display='none';return 'Element hidden (refresh page to restore)'})()",
  text:"(()=>{const e=document.querySelector("+selector+");if(!e)return 'No matching element';const v=prompt('New text content:',e.innerText||e.textContent||'');if(v===null)return 'Cancelled';e.textContent=v;return 'Text updated'})()",
  copy:"(()=>{const e=document.querySelector("+selector+");if(!e)return null;let s=e.tagName.toLowerCase();if(e.id)return s+'#'+CSS.escape(e.id);if(e.classList.length)s+='.'+[...e.classList].map(CSS.escape).join('.');return s})()",
  tree:"(()=>{const root=document.querySelector("+selector+");if(!root)return 'No matching element';const walk=(e,d)=>({tag:e.tagName.toLowerCase(),id:e.id||undefined,classes:typeof e.className==='string'?e.className:undefined,attributes:[...e.attributes].slice(0,30).map(a=>[a.name,a.value]),children:d<5?[...e.children].slice(0,80).map(c=>walk(c,d+1)):('[depth limit]')});return walk(root,0)})()"
 };
 evaluate(scripts[action],r=>{if(action==="copy"&&r&&!r.error)copyText(r);else $("element-result").textContent=JSON.stringify(r,null,2);});
}
$("element-hide").onclick=()=>selectedElementAction("hide");
$("element-text").onclick=()=>selectedElementAction("text");
$("element-copy").onclick=()=>selectedElementAction("copy");
$("element-tree").onclick=()=>selectedElementAction("tree");


// Reliability layer: make tab navigation resilient to touch events and surface
// exceptions from any control instead of leaving the user with a silent no-op.
document.querySelectorAll("button").forEach(button => {
  if (button.closest("#command")) button.type = "submit";
  else button.type = "button";
  const handler = button.onclick;
  if (typeof handler === "function") {
    button.onclick = function(event) {
      try { return handler.call(this, event); }
      catch (error) {
        addConsole("error", ["Button action failed: " + (this.textContent || this.id), String(error && error.stack || error)]);
        const target = $("element-result");
        if (target) target.textContent = "Action failed: " + String(error && error.message || error);
      }
    };
  }
});

window.addEventListener("error", event => {
  try { addConsole("error", ["Console UI error", event.message || "Unknown UI error", event.filename || "", event.lineno || ""]); } catch (_) {}
});
window.addEventListener("unhandledrejection", event => {
  try { addConsole("error", ["Console UI promise rejected", String(event.reason && (event.reason.stack || event.reason) || "Unknown rejection")]); } catch (_) {}
});
