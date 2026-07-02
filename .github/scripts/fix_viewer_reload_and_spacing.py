from pathlib import Path
import re

path = Path('simbers.html')
text = path.read_text(encoding='utf-8')

# --- Minimal outer spacing while keeping the content/buttons centered. ---
old_body_padding = '''    padding:
      max(18px,env(safe-area-inset-top))
      max(16px,env(safe-area-inset-right))
      max(18px,env(safe-area-inset-bottom))
      max(16px,env(safe-area-inset-left));'''
if old_body_padding not in text:
    raise SystemExit('Body outer-padding block not found')
text = text.replace(old_body_padding, '    padding:0;', 1)

text = text.replace('''    max-width:540px;
    flex:0 1 540px;
    margin:0 auto;''', '''    max-width:600px;
    flex:0 1 600px;
    margin:0 auto;''', 1)

text = text.replace('''    padding:34px;
    border:1px solid var(--panel-line);
    border-radius:28px;''', '''    padding:22px;
    border:1px solid var(--panel-line);
    border-radius:20px;''', 1)

text = text.replace('''    margin:13px 0 28px;''', '''    margin:9px 0 18px;''', 1)
text = text.replace('''    gap:12px;''', '''    gap:8px;''', 1)
text = text.replace('''    margin:23px 0 12px;''', '''    margin:16px 0 10px;''', 1)

old_mobile = '''  @media(max-width:520px){
    body{
      align-items:center;
      padding-left:12px;
      padding-right:12px;
    }

    .card{
      padding:27px 21px 23px;
      border-radius:24px;
    }

    .app::before{
      border-radius:26px;
    }

    .actions{
      grid-template-columns:1fr;
    }

    .uploadButton,
    button{
      min-height:52px;
    }
  }'''
new_mobile = '''  @media(max-width:520px){
    body{
      align-items:center;
      padding:0;
    }

    .app{
      max-width:none;
      flex-basis:auto;
      margin:0;
    }

    .app::before{
      display:none;
    }

    .card{
      padding:14px;
      border-left:0;
      border-right:0;
      border-radius:0;
    }

    .actions{
      grid-template-columns:1fr;
      justify-items:center;
    }

    .uploadButton,
    button{
      width:min(100%,420px);
      min-height:48px;
      margin-inline:auto;
    }
  }'''
if old_mobile not in text:
    raise SystemExit('Mobile spacing block not found')
text = text.replace(old_mobile, new_mobile, 1)

# --- Viewer lifecycle: fully unload an old map before preparing the next bridge. ---
text = text.replace('''let arcViewerReady = false;
let arcViewerWaiters = [];
let arcViewerPrepared = false;''', '''let arcViewerReady = false;
let arcViewerWaiters = [];
let arcViewerPrepared = false;
let arcViewerSession = 0;
let arcViewerLaunchQueue = Promise.resolve();''', 1)

old_reset = '''function resetArcViewerBridge(){
  arcViewerPrepared = false;
  arcViewerReady = false;
  arcViewerFrame.removeAttribute("src");
}'''
new_reset = '''function rejectArcViewerWaiters(message="ArcViewer was reset."){
  settleArcViewerWaiters(new Error(message));
}

function resetArcViewerBridge(){
  arcViewerSession++;
  arcViewerPrepared = false;
  arcViewerReady = false;
  rejectArcViewerWaiters();
  arcViewerFrame.src = "about:blank";
}

async function unloadArcViewer({collapse=false}={}){
  arcViewerSession++;
  arcViewerPrepared = false;
  arcViewerReady = false;
  rejectArcViewerWaiters("Previous ArcViewer map was unloaded.");
  if(collapse) hideArcViewerPanel();

  if(!arcViewerFrame.getAttribute("src") || arcViewerFrame.src === "about:blank"){
    arcViewerFrame.src = "about:blank";
    await new Promise(resolve=>requestAnimationFrame(resolve));
    return;
  }

  await new Promise(resolve=>{
    let finished=false;
    const done=()=>{
      if(finished) return;
      finished=true;
      arcViewerFrame.removeEventListener("load",done);
      resolve();
    };
    arcViewerFrame.addEventListener("load",done,{once:true});
    arcViewerFrame.src="about:blank";
    setTimeout(done,1200);
  });
}'''
if old_reset not in text:
    raise SystemExit('Viewer reset block not found')
text = text.replace(old_reset, new_reset, 1)

# Ignore stale messages from a previous iframe document.
text = text.replace('''window.addEventListener("message",(event)=>{
  if(event.origin!==ARC_VIEWER_ORIGIN) return;''', '''window.addEventListener("message",(event)=>{
  if(event.origin!==ARC_VIEWER_ORIGIN) return;
  if(event.source!==arcViewerFrame.contentWindow) return;''', 1)

old_launch = '''async function launchArcViewer(blob,filename){
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
}'''
new_launch = '''async function launchArcViewer(blob,filename){
  const queuedLaunch = async()=>{
    showArcViewerPanel("Unloading previous map…");
    await unloadArcViewer();

    const session=arcViewerSession;
    showArcViewerPanel("Loading ArcViewer…");
    prepareArcViewer();
    await waitForArcViewerReady();
    if(session!==arcViewerSession) throw new Error("ArcViewer launch was replaced by a newer map.");

    const bytes=await blob.arrayBuffer();
    if(session!==arcViewerSession) throw new Error("ArcViewer launch was replaced by a newer map.");
    viewerStatus.textContent="Sending generated map…";
    arcViewerFrame.contentWindow.postMessage({
      type:"SIMPLIFIED_SABERS_LOAD_MAP",
      bytes,
      filename,
      mode:"Standard",
      difficulty:"ExpertPlus",
      uiOff:true
    },ARC_VIEWER_ORIGIN,[bytes]);
  };

  const result=arcViewerLaunchQueue.then(queuedLaunch,queuedLaunch);
  arcViewerLaunchQueue=result.catch(()=>{});
  return result;
}'''
if old_launch not in text:
    raise SystemExit('Viewer launch block not found')
text = text.replace(old_launch, new_launch, 1)

# Selecting a new song immediately unloads the currently running map.
old_set_source_start = '''function setSource(blob){
  sourceBlob = blob;
  lastMapZip=null;'''
new_set_source_start = '''function setSource(blob){
  unloadArcViewer({collapse:true}).catch(console.warn);
  viewerStatus.textContent="Preview will appear here after the map is created.";
  sourceBlob = blob;
  lastMapZip=null;'''
if old_set_source_start not in text:
    raise SystemExit('setSource block not found')
text = text.replace(old_set_source_start, new_set_source_start, 1)

# Do not preload/reuse an old bridge at the start of analysis; launchArcViewer now
# owns the unload -> fresh bridge -> send sequence after the ZIP is complete.
text = text.replace('''  prepareArcViewer();
  runAnalysis();''', '''  runAnalysis();''', 1)

path.write_text(text,encoding='utf-8')
print('Patched viewer reload lifecycle and compact edge spacing')
