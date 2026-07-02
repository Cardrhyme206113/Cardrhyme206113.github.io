from pathlib import Path
import re

path = Path('simbers.html')
text = path.read_text(encoding='utf-8')

# Replace the thin progress line + separate debug text with one taller,
# clearly visible status/progress bar.
pattern = re.compile(
    r'progress\{.*?#npsNote\{.*?\n\}',
    re.S,
)
replacement = r'''.statusBar{
  position:relative;
  width:100%;
  height:38px;
  overflow:hidden;
  border:1px solid #2b2b2b;
  border-radius:4px;
  background:#101010;
}

.statusBar progress{
  position:absolute;
  inset:0;
  width:100%;
  height:100%;
  margin:0;
  appearance:none;
  border:0;
  border-radius:0;
  background:#101010;
  accent-color:var(--primary);
}

.statusBar progress::-webkit-progress-bar{
  background:#101010;
}

.statusBar progress::-webkit-progress-value{
  background:var(--primary);
}

.statusBar progress::-moz-progress-bar{
  background:var(--primary);
}

.mapStatus{
  position:absolute;
  z-index:1;
  inset:0;
  display:flex;
  align-items:center;
  justify-content:center;
  padding:0 12px;
  color:#fff;
  font:700 11px/1.2 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  letter-spacing:.05em;
  text-align:center;
  text-transform:uppercase;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
  pointer-events:none;
  text-shadow:0 1px 2px rgba(0,0,0,.95);
}

#mapStatus{
  display:flex;
}

#npsNote{
  display:none!important;
}'''
text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit(f'Status CSS replacement count was {count}')

# Remove the ArcViewer title/status strip entirely.
text, count = re.subn(
    r'\n\.viewerStatus\{.*?\n\}\n',
    '\n',
    text,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit(f'Viewer status CSS removal count was {count}')

text = text.replace(
    '  progress{margin-bottom:6px}',
    '  .statusBar{height:36px}',
    1,
)

old_html = '''      <progress id="progress" max="1" value="0"></progress>
        <div id="mapStatus" class="mapStatus">Select a song.</div>
        <div id="npsNote" class="mapStatus"></div>'''
new_html = '''      <div class="statusBar" role="status" aria-live="polite">
        <progress id="progress" max="1" value="0"></progress>
        <div id="mapStatus" class="mapStatus">Ready. Select a song file.</div>
      </div>
      <div id="npsNote" class="mapStatus"></div>'''
if old_html not in text:
    raise SystemExit('Status HTML block not found')
text = text.replace(old_html, new_html, 1)

# Route all viewer lifecycle messages into the main status bar instead of
# creating a title strip over ArcViewer.
old_viewer_status = '''const viewerStatus = document.createElement("div");
viewerStatus.className = "viewerStatus";
viewerStatus.textContent = "ArcViewer ready.";
viewerShell.insertBefore(viewerStatus, arcViewerFrame);'''
new_viewer_status = '''const viewerStatus = els.mapStatus;'''
if old_viewer_status not in text:
    raise SystemExit('Viewer status creation block not found')
text = text.replace(old_viewer_status, new_viewer_status, 1)

# Preserve useful status text when object toggles change.
text = text.replace(
    '''  setViewerEmpty(true);
  viewerStatus.textContent="ArcViewer ready.";
  unloadArcViewer().then(()=>prepareArcViewer()).catch(console.warn);''',
    '''  setViewerEmpty(true);
  unloadArcViewer().then(()=>prepareArcViewer()).catch(console.warn);''',
    1,
)

# Keep startup wording concise in the new shared status bar.
text = text.replace(
    '''    viewerStatus.textContent=viewerShell.classList.contains("empty")?"ArcViewer ready.":"ArcViewer ready. Sending generated map…";''',
    '''    viewerStatus.textContent=viewerShell.classList.contains("empty")
      ?(sourceBlob?"Ready. Create map.":"Ready. Select a song file.")
      :"Sending map to preview…";''',
    1,
)

# Once ArcViewer starts, the only success text is Done.
old_started = '''  }else if(data.type==="SIMPLIFIED_ARCVIEWER_STARTED"){
    viewerStatus.textContent="Playing Expert+ • choose a mode below";
    els.mapStatus.textContent="Map ready in ArcViewer.";'''
new_started = '''  }else if(data.type==="SIMPLIFIED_ARCVIEWER_STARTED"){
    setProgress(1,"Done");'''
if old_started not in text:
    raise SystemExit('ArcViewer started block not found')
text = text.replace(old_started, new_started, 1)

# Clearing the preview should leave a simple actionable state.
text = text.replace(
    '''  setViewerEmpty(true);
  viewerStatus.textContent="ArcViewer ready.";
  await unloadArcViewer();''',
    '''  setViewerEmpty(true);
  viewerStatus.textContent=sourceBlob?"Ready. Create map.":"Ready. Select a song file.";
  await unloadArcViewer();''',
    1,
)

# Remove the end-of-build NPS/object debug line.
text = re.sub(
    r'''  els\.npsNote\.textContent=\n    `Expert\+ NPS: \$\{expertPlusNps\.toFixed\(2\)\} • \$\{expertPlus\?\.noteCount\|\|0\} notes • \$\{expertPlus\?\.bombCount\|\|0\} bombs • \$\{expertPlus\?\.wallCount\|\|0\} walls`;''',
    '  els.npsNote.textContent="";',
    text,
    count=1,
)

# Remove the long final diagnostics summary and show only Done.
old_final = '''    const difficultySummary=output.packagedCharacteristics
      .map(characteristic=>`${characteristic} ${DIFFICULTY_CONFIGS.length} difficulties`)
      .join(" • ");
    setProgress(
      1,
      `Ready: ${difficultySummary} • ${output.lightingEventCount} light events • Expert+ ${output.expertPlusNps.toFixed(2)} NPS • ${output.usedFlowCount}/30 flows • ${(output.blob.size/1048576).toFixed(1)} MB`
    );'''
new_final = '''    setProgress(1,"Done");'''
if old_final not in text:
    raise SystemExit('Long final status block not found')
text = text.replace(old_final, new_final, 1)

# Outdated comment referenced the now-removed long result summary.
text = text.replace(
    '''    // Keep mobile/landscape browsers centered even after a long result
    // summary changes intrinsic text measurements.''',
    '''    // Keep mobile/landscape browsers centered after status changes.''',
    1,
)

path.write_text(text, encoding='utf-8')
print('Moved all statuses into a taller centered progress bar and removed viewer/debug status clutter')
