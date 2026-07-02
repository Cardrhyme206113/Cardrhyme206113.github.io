from pathlib import Path

path = Path('simbers.html')
text = path.read_text(encoding='utf-8')

# Put the logo to the left of the title.
old_header = '''      <div class="brandMark" aria-hidden="true">
        <span></span><span></span>
      </div>
      <h1>Simplified Sabers</h1>'''
new_header = '''      <div class="titleRow">
        <div class="brandMark" aria-hidden="true">
          <span></span><span></span>
        </div>
        <h1>Simplified Sabers</h1>
      </div>'''
if old_header not in text:
    raise SystemExit('Header markup not found')
text = text.replace(old_header, new_header, 1)

# Keep the viewer visible from first paint.
text = text.replace(
    '<section id="viewerShell" class="viewerShell" aria-hidden="true">',
    '<section id="viewerShell" class="viewerShell open empty" aria-hidden="false">',
    1,
)

# Wider, cleaner margins in the control half.
text = text.replace(
    'padding:12px max(14px,env(safe-area-inset-right)) 12px max(14px,env(safe-area-inset-left));',
    'padding:16px max(28px,env(safe-area-inset-right)) 16px max(28px,env(safe-area-inset-left));',
    1,
)

# Title row and logo placement.
old_brand_css = '''  .brandMark{
    display:flex;
    align-items:center;
    gap:10px;
    margin-bottom:18px;
  }'''
new_brand_css = '''  .titleRow{
    display:flex;
    align-items:center;
    justify-content:flex-start;
    gap:14px;
  }

  .brandMark{
    flex:0 0 auto;
    display:flex;
    align-items:center;
    gap:10px;
    margin:0;
  }'''
if old_brand_css not in text:
    raise SystemExit('Brand CSS not found')
text = text.replace(old_brand_css, new_brand_css, 1)

# Make the bottom viewer permanently occupy its half; empty state is an overlay.
old_viewer_open = '''  .viewerShell{
    position:relative;
    width:100%;
    height:0;
    max-height:0;
    margin:0;
    overflow:hidden;
    opacity:0;
    border:0;
    border-radius:0;
    background:#08090d;
    transition:opacity .16s ease;
  }

  .viewerShell.open{
    height:50vh;
    height:50dvh;
    max-height:50vh;
    max-height:50dvh;
    margin:0;
    opacity:1;
    border-top:1px solid rgba(255,255,255,.12);
  }'''
new_viewer_open = '''  .viewerShell{
    position:relative;
    width:100%;
    height:50vh;
    height:50dvh;
    max-height:50vh;
    max-height:50dvh;
    margin:0;
    overflow:hidden;
    opacity:1;
    border:0;
    border-top:1px solid rgba(255,255,255,.12);
    border-radius:0;
    background:#08090d;
  }

  .viewerShell.open{
    height:50vh;
    height:50dvh;
    max-height:50vh;
    max-height:50dvh;
    margin:0;
    opacity:1;
  }'''
if old_viewer_open not in text:
    raise SystemExit('Viewer sizing CSS not found')
text = text.replace(old_viewer_open, new_viewer_open, 1)

# Insert persistent empty overlay styles after iframe CSS.
iframe_css = '''  .viewerShell iframe{
    position:absolute;
    inset:0;
    width:100%;
    height:100%;
    min-height:0;
    display:block;
    border:0;
    background:#08090d;
  }'''
empty_css = iframe_css + '''

  .viewerEmptyState{
    position:absolute;
    z-index:2;
    inset:0;
    display:none;
    align-items:center;
    justify-content:center;
    padding:24px;
    text-align:center;
    color:rgba(255,255,255,.92);
    font-size:clamp(17px,3vw,24px);
    font-weight:800;
    letter-spacing:-.02em;
    background:rgba(7,8,12,.42);
    backdrop-filter:blur(4px);
    -webkit-backdrop-filter:blur(4px);
  }

  .viewerShell.empty .viewerEmptyState{display:flex}
  .viewerShell.empty iframe{filter:brightness(.45)}'''
if iframe_css not in text:
    raise SystemExit('Viewer iframe CSS not found')
text = text.replace(iframe_css, empty_css, 1)

# Mobile gets double the previous horizontal inset (10px -> 20px).
text = text.replace(
    '''    .card{
      justify-content:flex-start;
      padding:10px 10px 8px;
    }''',
    '''    .card{
      justify-content:flex-start;
      padding:12px 20px 10px;
    }''',
    1,
)
text = text.replace('    .brandMark{margin-bottom:10px}\n', '', 1)

# Wide screens switch to left/right, each exactly half the viewport.
responsive_css = '''

  @media(min-width:900px) and (min-aspect-ratio:4/3){
    .app{
      display:grid;
      grid-template-columns:50% 50%;
      grid-template-rows:100%;
    }

    .card{
      width:100%;
      height:100vh;
      height:100dvh;
      padding:28px max(36px,env(safe-area-inset-right)) 28px max(36px,env(safe-area-inset-left));
      border-right:1px solid rgba(255,255,255,.14);
      border-bottom:0;
      justify-content:center;
    }

    .viewerShell,
    .viewerShell.open{
      width:100%;
      height:100vh;
      height:100dvh;
      max-height:100vh;
      max-height:100dvh;
      border-top:0;
    }

    .card > *{width:min(100%,620px)}
  }
'''
marker = '  .viewerToolbar button:active{transform:translateY(1px)}\n  body.viewer-open{align-items:flex-start}\n'
if marker not in text:
    raise SystemExit('Responsive CSS insertion marker not found')
text = text.replace(marker, marker + responsive_css, 1)

# Build the persistent empty-state overlay and keep the viewer open.
old_viewer_setup = '''const viewerStatus = document.createElement("div");
viewerStatus.className = "viewerStatus";
viewerStatus.textContent = "Preview will appear here after the map is created.";
viewerShell.insertBefore(viewerStatus, arcViewerFrame);
document.querySelector(".app").appendChild(viewerShell);
viewerBack.textContent = "Hide";'''
new_viewer_setup = '''const viewerStatus = document.createElement("div");
viewerStatus.className = "viewerStatus";
viewerStatus.textContent = "ArcViewer ready.";
viewerShell.insertBefore(viewerStatus, arcViewerFrame);
const viewerEmptyState = document.createElement("div");
viewerEmptyState.className = "viewerEmptyState";
viewerEmptyState.textContent = "Create a map to see its preview here!";
viewerShell.insertBefore(viewerEmptyState, arcViewerFrame.nextSibling);
document.querySelector(".app").appendChild(viewerShell);
viewerBack.textContent = "Clear";'''
if old_viewer_setup not in text:
    raise SystemExit('Viewer setup block not found')
text = text.replace(old_viewer_setup, new_viewer_setup, 1)

# Empty-state helpers.
insert_after = '''let arcViewerPrepared = false;
let arcViewerSession = 0;
let arcViewerLaunchQueue = Promise.resolve();'''
helpers = insert_after + '''

function setViewerEmpty(isEmpty,message="Create a map to see its preview here!"){
  viewerShell.classList.toggle("empty",isEmpty);
  viewerEmptyState.textContent=message;
  viewerShell.classList.add("open");
  viewerShell.setAttribute("aria-hidden","false");
}'''
if insert_after not in text:
    raise SystemExit('Viewer state variables not found')
text = text.replace(insert_after, helpers, 1)

# Never collapse the permanent viewer.
old_hide = '''function hideArcViewerPanel(){
  viewerShell.classList.remove("open");
  viewerShell.setAttribute("aria-hidden","true");
  document.body.classList.remove("viewer-open");
}'''
new_hide = '''function hideArcViewerPanel(){
  setViewerEmpty(true);
  document.body.classList.remove("viewer-open");
}'''
if old_hide not in text:
    raise SystemExit('hideArcViewerPanel block not found')
text = text.replace(old_hide, new_hide, 1)

# When the viewer accepts a map, uncover it. Errors return to the placeholder.
text = text.replace(
    '''  }else if(data.type==="SIMPLIFIED_ARCVIEWER_MAP_ACCEPTED"){
    showArcViewerPanel("Map received. Starting Expert+ preview…");''',
    '''  }else if(data.type==="SIMPLIFIED_ARCVIEWER_MAP_ACCEPTED"){
    setViewerEmpty(false);
    showArcViewerPanel("Map received. Starting Expert+ preview…");''',
    1,
)
text = text.replace(
    '''  }else if(data.type==="SIMPLIFIED_ARCVIEWER_ERROR"){
    const message=data.message||"ArcViewer failed to load.";
    showArcViewerPanel(`Preview unavailable: ${message}`);''',
    '''  }else if(data.type==="SIMPLIFIED_ARCVIEWER_ERROR"){
    const message=data.message||"ArcViewer failed to load.";
    setViewerEmpty(true);
    showArcViewerPanel(`Preview unavailable: ${message}`);''',
    1,
)

# Clear button resets to an always-ready empty viewer instead of hiding it.
old_back = '''viewerBack.addEventListener("click",()=>{
  hideArcViewerPanel();
  resetArcViewerBridge();
});'''
new_back = '''viewerBack.addEventListener("click",async()=>{
  setViewerEmpty(true);
  viewerStatus.textContent="ArcViewer ready.";
  await unloadArcViewer();
  prepareArcViewer();
});'''
if old_back not in text:
    raise SystemExit('Viewer clear handler not found')
text = text.replace(old_back, new_back, 1)

# Reuse the already-ready empty bridge; only unload when replacing a real map.
text = text.replace(
    '''  const queuedLaunch = async()=>{
    showArcViewerPanel("Unloading previous map…");
    await unloadArcViewer();

    const session=arcViewerSession;
    showArcViewerPanel("Loading ArcViewer…");
    prepareArcViewer();''',
    '''  const queuedLaunch = async()=>{
    if(!viewerShell.classList.contains("empty")){
      showArcViewerPanel("Unloading previous map…");
      setViewerEmpty(true,"Loading new map preview…");
      await unloadArcViewer();
    }else{
      setViewerEmpty(true,"Loading map preview…");
    }

    const session=arcViewerSession;
    showArcViewerPanel("Loading ArcViewer…");
    prepareArcViewer();''',
    1,
)

# Selecting a new song clears the old preview but immediately prepares ArcViewer again.
old_set_source = '''function setSource(blob){
  unloadArcViewer({collapse:true}).catch(console.warn);
  viewerStatus.textContent="Preview will appear here after the map is created.";'''
new_set_source = '''function setSource(blob){
  setViewerEmpty(true);
  viewerStatus.textContent="ArcViewer ready.";
  unloadArcViewer().then(()=>prepareArcViewer()).catch(console.warn);'''
if old_set_source not in text:
    raise SystemExit('setSource viewer reset block not found')
text = text.replace(old_set_source, new_set_source, 1)

# Prepare ArcViewer immediately on page load.
startup_marker = 'let arcViewerLaunchQueue = Promise.resolve();\n\nfunction setViewerEmpty'
if startup_marker not in text:
    raise SystemExit('Startup marker not found after helper insertion')
# Call is added after the message listener and handlers are registered, before regular controls bind.
call_marker = '''viewerDownload.addEventListener("click",()=>{
  if(lastMapZip) downloadBlob(lastMapZip,lastMapZipName);
});'''
call_replacement = call_marker + '''

setViewerEmpty(true);
prepareArcViewer();'''
if call_marker not in text:
    raise SystemExit('Viewer startup call marker not found')
text = text.replace(call_marker, call_replacement, 1)

path.write_text(text, encoding='utf-8')
print('Applied persistent blurred viewer, corrected title row, larger insets, and wide-screen split layout')
