const $ = id => document.getElementById(id);
const entries = [], requests = [];
let activeLevel = "all", preserve = true, storeType = "localStorage", selectedRequest = null;
const port = chrome.runtime.connect({ name: "better-console-panel" });
port.postMessage({ type: "attach", tabId: chrome.devtools.inspectedWindow.tabId });
addConsole("info", ["Better Console panel connected. Waiting for page instrumentation…"]);
let pageHookSeen = false;
setTimeout(() => { if (!pageHookSeen) addConsole("warn", ["No page-hook handshake received. Reload the extension at chrome://extensions, refresh this website, and reopen DevTools. Restricted pages (chrome://, Web Store, extension pages) cannot be inspected."]); }, 1800);
const fmt = v => typeof v === "string" ? v : JSON.stringify(v, null, 2) ?? String(v);
const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function evaluate(code, cb) { chrome.devtools.inspectedWindow.eval(code, (result, exception) => cb(exception && exception.isException ? {error: exception.description || "Evaluation failed"} : result)); }
function addConsole(level,args,time=Date.now()) { entries.push({level,args,time}); if(entries.length>5000) entries.shift(); renderConsole(); }
function renderConsole() {
 const q=$("filter").value.toLowerCase();
 const list=entries.filter(e=>(activeLevel==="all"||e.level===activeLevel||(activeLevel==="info"&&["info","log","debug"].includes(e.level)))&&fmt(e.args).toLowerCase().includes(q));
 $("count").textContent=list.length+" messages"; $("output").replaceChildren();
 if(!list.length){const d=document.createElement("div");d.className="empty";d.textContent=entries.length?"No messages match this filter.":"Waiting for page activity…";$("output").append(d);return;}
 list.forEach(e=>{const row=document.createElement("div");row.className="row "+e.level;const t=document.createElement("span");t.className="time";t.textContent=new Date(e.time).toLocaleTimeString();const b=document.createElement("span");b.className="badge";b.textContent=e.level;const p=document.createElement("pre");p.className="payload";p.textContent=e.args.map(fmt).join(" ");row.append(t,b,p);$("output").append(row);});$("output").scrollTop=$("output").scrollHeight;
}
port.onMessage.addListener(e=>{if(!e)return;if(e.kind==="status"){pageHookSeen=true;addConsole("info",e.args||["Page instrumentation connected"],e.time);return;}if(e.kind==="network"){requests.push(e);renderNetwork();}else if(e.kind==="console"){if(e.level==="clear")entries.length=0;else addConsole(e.level,e.args,e.time);}});
$("clear").onclick=()=>{entries.length=0;renderConsole();};
$("preserve").onclick=e=>{preserve=!preserve;e.currentTarget.setAttribute("aria-pressed",String(preserve));};
$("filter").oninput=renderConsole;
document.querySelectorAll("[data-level]").forEach(b=>b.onclick=()=>{activeLevel=b.dataset.level;document.querySelectorAll("[data-level]").forEach(x=>x.classList.toggle("active",x===b));renderConsole();});
$("command").onsubmit=e=>{e.preventDefault();const code=$("expression").value.trim();if(!code)return;addConsole("debug",["> "+code]);evaluate(code,r=>addConsole(r&&r.error?"error":"result",[r]));$("expression").value="";};
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{document.querySelectorAll(".tab,.view").forEach(x=>x.classList.remove("active"));b.classList.add("active");$("view-"+b.dataset.tab).classList.add("active");if(b.dataset.tab==="storage")refreshStorage();if(b.dataset.tab==="info")refreshInfo();});
function renderNetwork(){ $("network-count").textContent=requests.length;$("network-total").textContent=requests.length+" requests";const q=$("network-filter").value.toLowerCase();$("network-rows").replaceChildren();requests.filter(r=>(r.url||"").toLowerCase().includes(q)||(r.method||"").toLowerCase().includes(q)).forEach(r=>{const tr=document.createElement("tr");tr.innerHTML="<td>"+esc(r.method||"")+"</td><td>"+esc(r.status||"—")+"</td><td>"+esc(r.type||"")+"</td><td>"+esc(r.url||"")+"</td><td>"+esc((r.duration||0)+" ms")+"</td>";tr.onclick=()=>{$("network-detail").textContent=JSON.stringify(r,null,2);};$("network-rows").append(tr);});}
$("network-filter").oninput=renderNetwork;$("network-clear").onclick=()=>{requests.length=0;renderNetwork();$("network-detail").textContent="Select a request to inspect its details.";};
$("inspect-selector").onclick=()=>{const s=$("selector").value;evaluate("(()=>{try{return [...document.querySelectorAll("+JSON.stringify(s)+")].slice(0,100).map((e,i)=>({index:i,tag:e.tagName,id:e.id,classes:e.className,text:(e.innerText||e.textContent||'').slice(0,500),html:e.outerHTML.slice(0,2000),rect:(()=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()}))}catch(e){return {error:e.message}}})()",r=>$("element-result").textContent=JSON.stringify(r,null,2));};
$("highlight").onclick=()=>evaluate("(()=>{document.querySelectorAll('[data-bc-highlight]').forEach(e=>{e.style.outline=e.dataset.bcOldOutline||'';delete e.dataset.bcHighlight;delete e.dataset.bcOldOutline});try{const e=document.querySelector("+JSON.stringify($("selector").value)+");if(!e)return 'No match';e.dataset.bcOldOutline=e.style.outline;e.dataset.bcHighlight='1';e.style.outline='3px solid #ff4d8d';return e.tagName+' highlighted'}catch(e){return e.message}})()",r=>addConsole("info",[r]));
document.querySelectorAll("[data-store]").forEach(b=>b.onclick=()=>{storeType=b.dataset.store;document.querySelectorAll("[data-store]").forEach(x=>x.classList.toggle("active",x===b));refreshStorage();});
function refreshStorage(){evaluate("(()=>{const t="+JSON.stringify(storeType)+";if(t==='cookies')return document.cookie.split(';').filter(Boolean).map(x=>{const i=x.indexOf('=');return {key:x.slice(0,i).trim(),value:x.slice(i+1).trim()}});const s=window[t];return Object.keys(s).map(key=>({key,value:s.getItem(key)}))})()",r=>{const root=$("storage-rows");root.replaceChildren();if(r&&r.error){root.textContent=r.error;return;} (r||[]).forEach(item=>{const row=document.createElement("div");row.className="storage-row";const k=document.createElement("code");k.textContent=item.key;const v=document.createElement("span");v.textContent=item.value;const del=document.createElement("button");del.textContent="Delete";del.onclick=()=>evaluate(storeType==="cookies"?"document.cookie="+JSON.stringify(item.key+"=; Max-Age=0; path=/"):"window["+JSON.stringify(storeType)+"].removeItem("+JSON.stringify(item.key)+")",refreshStorage);row.append(k,v,del);root.append(row);});});}
$("storage-refresh").onclick=refreshStorage;$("storage-save").onclick=()=>{const k=$("storage-key").value,v=$("storage-value").value;if(!k)return;const code=storeType==="cookies"?"document.cookie="+JSON.stringify(k+"="+v+"; path=/; SameSite=Lax"):"window["+JSON.stringify(storeType)+"].setItem("+JSON.stringify(k)+","+JSON.stringify(v)+")";evaluate(code,refreshStorage);};
function refreshInfo(){evaluate("(()=>({url:location.href,title:document.title,origin:location.origin,referrer:document.referrer,readyState:document.readyState,userAgent:navigator.userAgent,language:navigator.language,languages:navigator.languages,platform:navigator.platform,online:navigator.onLine,cookieEnabled:navigator.cookieEnabled,screen:{width:screen.width,height:screen.height,depth:screen.colorDepth},viewport:{width:innerWidth,height:innerHeight,devicePixelRatio},memory:navigator.deviceMemory||'unknown',cores:navigator.hardwareConcurrency||'unknown',connection:navigator.connection?{effectiveType:navigator.connection.effectiveType,downlink:navigator.connection.downlink}:null,performance:{load:Math.round(performance.now()),resources:performance.getEntriesByType('resource').length}}))()",r=>$("info-result").textContent=JSON.stringify(r,null,2));}
$("info-refresh").onclick=refreshInfo;
const snippetsKey="betterConsoleSnippets";
function loadSnippets(){chrome.storage.local.get([snippetsKey],o=>{const list=$( "snippet-list");list.replaceChildren(new Option("Saved snippets…",""));(o[snippetsKey]||[]).forEach((s,i)=>list.add(new Option(s.name,i)));});}
$("snippet-save").onclick=()=>{const name=$("snippet-name").value.trim(),code=$("snippet-code").value;if(!name||!code)return;chrome.storage.local.get([snippetsKey],o=>{const a=o[snippetsKey]||[];a.push({name,code});chrome.storage.local.set({[snippetsKey]:a},loadSnippets);});};
$("snippet-list").onchange=e=>{chrome.storage.local.get([snippetsKey],o=>{const s=(o[snippetsKey]||[])[Number(e.target.value)];if(s){$("snippet-name").value=s.name;$("snippet-code").value=s.code;}});};
$("snippet-run").onclick=()=>evaluate($("snippet-code").value,r=>addConsole(r&&r.error?"error":"result",[r]));
$("snippet-delete").onclick=()=>{const i=Number($("snippet-list").value);if(!Number.isInteger(i)||$("snippet-list").value==="")return;chrome.storage.local.get([snippetsKey],o=>{const a=o[snippetsKey]||[];a.splice(i,1);chrome.storage.local.set({[snippetsKey]:a},loadSnippets);});};
chrome.devtools.network.onNavigated.addListener(()=>{if(!preserve){entries.length=0;requests.length=0;renderConsole();renderNetwork();}});
loadSnippets();

// Live Elements panel: a DOM snapshot is refreshed while this tab is visible.
let domRefreshTimer = null, domSnapshot = [], selectedDomPath = null;
const domTree = $("dom-tree");
const domEscape = value => String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function readDomTree() {
 const code = `(()=>{const walk=(node,path,depth)=>{const item={type:node.nodeType, name:node.nodeType===1?node.tagName.toLowerCase():node.nodeType===3?"#text":node.nodeType===8?"#comment":"#document", path, text:node.nodeType===3?(node.nodeValue||"").trim().slice(0,120):"", attrs:node.nodeType===1?Array.from(node.attributes).slice(0,40).map(a=>[a.name,a.value]):[], children:[]};if(depth<7&&node.childNodes){for(let i=0;i<Math.min(node.childNodes.length,150);i++){const child=node.childNodes[i];if(child.nodeType===1||child.nodeType===3||child.nodeType===8)item.children.push(walk(child,path.concat(i),depth+1));}}return item;};return walk(document.documentElement,[],0)})()`;
 evaluate(code, result => {
  if (!result || result.error) { domTree.textContent = result?.error || "Unable to inspect this page."; return; }
  domSnapshot = result; renderDomTree();
 });
}
function renderDomTree() {
 const query = ($("dom-filter").value||"").toLowerCase();
 domTree.replaceChildren();
 const makeNode = node => {
  const wrap=document.createElement("div"); wrap.className="dom-node";
  const row=document.createElement("div"); row.className="dom-node-row";
  const hasChildren=node.children&&node.children.length;
  const toggle=document.createElement("button"); toggle.className="dom-toggle"; toggle.textContent=hasChildren?"▾":"·"; toggle.disabled=!hasChildren;
  const label=document.createElement("button"); label.className="dom-label"+(JSON.stringify(node.path)===JSON.stringify(selectedDomPath)?" selected":"");
  const id=(node.attrs||[]).find(a=>a[0]==="id"), cls=(node.attrs||[]).find(a=>a[0]==="class");
  label.innerHTML=node.type===3?"<span class='dom-text'>"+domEscape("#text "+node.text)+"</span>":"<span class='dom-tag'>&lt;"+domEscape(node.name)+"&gt;</span>"+(id?" <span class='dom-id'>#"+domEscape(id[1])+"</span>":"")+(cls?" <span class='dom-class'>."+domEscape(cls[1].trim().split(/\\s+/).slice(0,3).join("."))+"</span>":"");
  label.onclick=()=>{selectedDomPath=node.path;inspectDomNode(node.path);renderDomTree();};
  toggle.onclick=()=>{const children=wrap.querySelector(":scope > .dom-children");if(children){children.hidden=!children.hidden;toggle.textContent=children.hidden?"▸":"▾";}};
  row.append(toggle,label);wrap.append(row);
  if(hasChildren){const children=document.createElement("div");children.className="dom-children";node.children.forEach(child=>{const childEl=makeNode(child);if(query&&!JSON.stringify(child).toLowerCase().includes(query))childEl.hidden=true;children.append(childEl);});wrap.append(children);}
  return wrap;
 };
 if(!domSnapshot){domTree.textContent="Waiting for page DOM…";return;}
 domTree.append(makeNode(domSnapshot));
 if(query){domTree.querySelectorAll(".dom-node").forEach(el=>{if(el.textContent.toLowerCase().includes(query)){el.hidden=false;let p=el.parentElement;while(p&&p!==domTree){if(p.classList.contains("dom-node"))p.hidden=false;p=p.parentElement;}}});}
 $("dom-status").textContent="Updated "+new Date().toLocaleTimeString();
}
function inspectDomNode(path) {
 const pathLiteral=JSON.stringify(path);
 evaluate("(()=>{let n=document.documentElement;for(const i of "+pathLiteral+")n=n&&n.childNodes[i];if(!n)return null;const r=n.nodeType===1?n.getBoundingClientRect():null;return {nodeType:n.nodeType,nodeName:n.nodeName, text:n.nodeType===3?n.nodeValue:n.textContent?.slice(0,2000), outerHTML:n.nodeType===1?n.outerHTML.slice(0,12000):null, attributes:n.nodeType===1?Array.from(n.attributes).map(a=>({name:a.name,value:a.value})):[], children:n.childNodes?.length||0, rect:r?{x:r.x,y:r.y,width:r.width,height:r.height}:null}})()",r=>$("element-result").textContent=JSON.stringify(r,null,2));
}
$("dom-refresh").onclick=readDomTree;
$("dom-filter").oninput=renderDomTree;
const originalTabClick = document.querySelector('[data-tab="elements"]');
if(originalTabClick) originalTabClick.addEventListener("click",()=>{readDomTree();if(domRefreshTimer)clearInterval(domRefreshTimer);domRefreshTimer=setInterval(()=>{if($("view-elements").classList.contains("active"))readDomTree();},1500);});
