from pathlib import Path
import re

path = Path("simbers.html")
text = path.read_text(encoding="utf-8")

if 'body.viewer-open{align-items:flex-start}' in text:
    print("simbers.html is already patched")
    raise SystemExit(0)

css_start = text.index("  .viewerShell{")
css_end = text.index("\n</style>", css_start)
new_css = r'''  .viewerShell{
    width:100%;
    max-height:0;
    margin-top:0;
    overflow:hidden;
    opacity:0;
    border:0 solid rgba(255,255,255,.16);
    border-radius:20px;
    background:#101116;
    transition:max-height .34s ease,margin-top .34s ease,opacity .18s ease,border-width .18s ease;
  }
  .viewerShell.open{
    max-height:540px;
    margin-top:18px;
    opacity:1;
    border-width:1px;
  }
  .viewerStatus{
    min-height:34px;
    display:flex;
    align-items:center;
    padding:7px 12px;
    color:rgba(255,255,255,.78);
    background:rgba(255,255,255,.045);
    font-size:12px;
    text-align:left;
  }
  .viewerShell iframe{
    width:100%;
    height:min(56vh,430px);
    min-height:330px;
    display:block;
    border:0;
    background:#101116;
  }
  .viewerToolbar{
    min-height:48px;
    display:flex;
    align-items:center;
    justify-content:flex-end;
    gap:8px;
    padding:6px 8px;
    background:rgba(15,8,24,.96);
  }
  .viewerToolbar button{
    width:auto;
    min-width:62px;
    min-height:36px;
    padding:0 13px;
    border:1px solid rgba(255,255,255,.18);
    border-radius:12px;
    background:rgba(255,255,255,.08);
    color:#fff;
    box-shadow:none;
    font-size:13px;
  }
  .viewerToolbar button:active{transform:translateY(1px)}
  body.viewer-open{align-items:flex-start}

  @media(max-width:520px){
    .viewerShell.open{max-height:470px}
    .viewerShell iframe{height:360px;min-height:360px}
  }
'''
text = text[:css_start] + new_css + text[css_end:]

js_start = text.index('const ARC_VIEWER_URL = "https://cardrhyme206113.github.io/ArcViewer-simtest/";')
js_end = text.index('function bindPair(range, num){', js_start)
new_js = r'''const ARC_VIEWER_URL = "https://cardrhyme206113.github.io/ArcViewer-simtest/";
const ARC_VIEWER_ORIGIN = new URL(ARC_VIEWER_URL).origin;
const viewerShell = document.getElementById("viewerShell");
const arcViewerFrame = document.getElementById("arcViewerFrame");
const viewerBack = document.getElementById("viewerBack");
const viewerDownload = document.getElementById("viewerDownload");
const viewerStatus = document.createElement("div");
viewerStatus.className = "viewerStatus";
viewerStatus.textContent = "Preview will appear here after the map is created.";
viewerShell.insertBefore(viewerStatus, arcViewerFrame);
document.querySelector(".card").appendChild(viewerShell);
viewerBack.textContent = "Hide";
let arcViewerReady = false;
let arcViewerWaiters = [];
let arcViewerPrepared = false;

function showArcViewerPanel(message="Preparing ArcViewer…"){
  viewerStatus.textContent=message;
  viewerShell.classList.add("open");
  viewerShell.setAttribute("aria-hidden","false");
  document.body.classList.add("viewer-open");
  requestAnimationFrame(()=>viewerShell.scrollIntoView({behavior:"smooth",block:"nearest"}));
}

function hideArcViewerPanel(){
  viewerShell.classList.remove("open");
  viewerShell.setAttribute("aria-hidden","true");
  document.body.classList.remove("viewer-open");
}

function prepareArcViewer(){
  if(arcViewerPrepared) return;
  arcViewerPrepared = true;
  arcViewerReady = false;
  arcViewerFrame.src = ARC_VIEWER_URL + "?bridge=1&v=" + Date.now();
}

function resetArcViewerBridge(){
  arcViewerPrepared = false;
  arcViewerReady = false;
  arcViewerFrame.removeAttribute("src");
}

function waitForArcViewerReady(timeoutMs=30000){
  if(arcViewerReady) return Promise.resolve();
  return new Promise((resolve,reject)=>{
    const waiter={resolve,reject};
    arcViewerWaiters.push(waiter);
    const timer=setTimeout(()=>{
      arcViewerWaiters=arcViewerWaiters.filter(item=>item!==waiter);
      reject(new Error("ArcViewer did not become ready."));
    },timeoutMs);
    waiter.resolve=()=>{clearTimeout(timer);resolve();};
    waiter.reject=(error)=>{clearTimeout(timer);reject(error);};
  });
}

function settleArcViewerWaiters(error=null){
  const waiters=arcViewerWaiters.splice(0);
  for(const waiter of waiters){
    if(error) waiter.reject(error);
    else waiter.resolve();
  }
}

window.addEventListener("message",(event)=>{
  if(event.origin!==ARC_VIEWER_ORIGIN) return;
  const data=event.data||{};
  if(data.type==="SIMPLIFIED_ARCVIEWER_READY"){
    arcViewerReady=true;
    viewerStatus.textContent="ArcViewer ready. Sending generated map…";
    settleArcViewerWaiters();
  }else if(data.type==="SIMPLIFIED_ARCVIEWER_MAP_ACCEPTED"){
    showArcViewerPanel("Map received. Starting Expert+ preview…");
  }else if(data.type==="SIMPLIFIED_ARCVIEWER_STARTED"){
    viewerStatus.textContent="Playing Expert+ • Standard";
    els.mapStatus.textContent="Map ready in ArcViewer.";
  }else if(data.type==="SIMPLIFIED_ARCVIEWER_ERROR"){
    const message=data.message||"ArcViewer failed to load.";
    showArcViewerPanel(`Preview unavailable: ${message}`);
    els.mapStatus.textContent=`Map created. Preview unavailable: ${message}`;
    settleArcViewerWaiters(new Error(message));
  }
});

viewerBack.addEventListener("click",()=>{
  hideArcViewerPanel();
  resetArcViewerBridge();
});

viewerDownload.addEventListener("click",()=>{
  if(lastMapZip) downloadBlob(lastMapZip,lastMapZipName);
});

async function launchArcViewer(blob,filename){
  showArcViewerPanel("Loading ArcViewer…");
  prepareArcViewer();
  await waitForArcViewerReady();
  const bytes=await blob.arrayBuffer();
  viewerStatus.textContent="Sending generated map…";
  arcViewerFrame.contentWindow.postMessage({
    type:"SIMPLIFIED_SABERS_LOAD_MAP",
    bytes,
    filename,
    mode:"Standard",
    difficulty:"ExpertPlus",
    uiOff:true
  },ARC_VIEWER_ORIGIN,[bytes]);
}

'''
text = text[:js_start] + new_js + text[js_end:]

old_click = '''els.analyzeBtn.addEventListener("click", ()=>{
  if(lastMapZip){
    downloadBlob(lastMapZip,lastMapZipName);
    return;
  }
  prepareArcViewer();
  runAnalysis();
});'''
new_click = '''els.analyzeBtn.addEventListener("click", ()=>{
  if(lastMapZip){
    launchArcViewer(lastMapZip,lastMapZipName).catch(error=>{
      console.warn(error);
      showArcViewerPanel("Preview unavailable. Use ZIP to download the map.");
    });
    return;
  }
  prepareArcViewer();
  runAnalysis();
});'''
if old_click not in text:
    raise SystemExit("Analyze button block was not found")
text = text.replace(old_click, new_click, 1)
text = text.replace('els.analyzeBtn.textContent="Download Map";', 'els.analyzeBtn.textContent="Open Map";', 1)

path.write_text(text, encoding="utf-8")

scripts = [m.group(1) for m in re.finditer(r'<script(?:\s+[^>]*)?>(.*?)</script>', text, re.S) if m.group(1).strip()]
Path('/tmp/simbers-check.js').write_text('\n'.join(scripts), encoding='utf-8')
print("Patched simbers.html")
