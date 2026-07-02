from pathlib import Path
import re

path = Path('simbers.html')
text = path.read_text(encoding='utf-8')

new_style = r'''<style>
:root{
  color-scheme:dark;
  --bg-dark:#121212;
  --bg-panel:#1e1e1e;
  --text:#ffffff;
  --muted:#9a9a9a;
  --primary:#007bff;
  --primary-hover:#0067d8;
  --secondary:#3f464d;
  --secondary-hover:#58616a;
  --border:#333333;
}

*{
  box-sizing:border-box;
  min-width:0;
}

html,
body{
  width:100%;
  height:100%;
  margin:0;
  overflow:hidden;
  background:var(--bg-dark);
  color:var(--text);
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
}

body{
  position:relative;
  line-height:1.5;
}

body::before{display:none}

.app{
  width:100%;
  height:100vh;
  height:100dvh;
  display:grid;
  grid-template-rows:50% 50%;
  overflow:hidden;
  background:var(--bg-dark);
}

.app::before{display:none}

.card{
  position:relative;
  width:100%;
  height:50vh;
  height:50dvh;
  overflow:auto;
  display:flex;
  align-items:center;
  justify-content:center;
  padding:28px 24px;
  border:0;
  border-bottom:2px solid var(--border);
  border-radius:0;
  background:var(--bg-panel);
  box-shadow:none;
}

.card::before{display:none}

.uiCluster{
  position:relative;
  width:min(100%,620px);
  margin:auto;
  opacity:1;
  transform:translate3d(0,0,0);
  will-change:transform,opacity;
}

.titleRow{
  display:flex;
  align-items:center;
  gap:16px;
  margin-bottom:8px;
}

.brandMark{
  flex:0 0 auto;
  display:flex;
  align-items:center;
  gap:6px;
  margin:0;
}

.brandMark span{
  display:block;
  width:12px;
  height:32px;
  border-radius:2px;
  transform:skewX(-15deg);
  box-shadow:none;
}

.brandMark span:first-child{
  background:#ff0055;
}

.brandMark span:last-child{
  margin:0;
  transform:skewX(-15deg);
  background:#0084ff;
}

h1{
  margin:0;
  font-size:clamp(25px,5vw,31px);
  line-height:1;
  font-weight:800;
  letter-spacing:-.02em;
  text-transform:uppercase;
}

.subtitle{
  margin:0 0 22px;
  max-width:none;
  color:var(--muted);
  font-size:14px;
}

.actions{
  width:100%;
  display:grid;
  grid-template-columns:minmax(0,2fr) minmax(0,2fr) minmax(0,1.5fr) 44px;
  grid-template-areas:"upload create export clear";
  gap:8px;
  margin-bottom:18px;
}

.fileInput{
  position:absolute;
  width:1px;
  height:1px;
  opacity:0;
  pointer-events:none;
}

.uploadButton,
button{
  width:100%;
  height:44px;
  min-height:44px;
  display:flex;
  align-items:center;
  justify-content:center;
  padding:0 12px;
  border-radius:4px;
  font:700 13px/1 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  text-align:center;
  text-transform:uppercase;
  white-space:nowrap;
  cursor:pointer;
  user-select:none;
  -webkit-tap-highlight-color:transparent;
  transition:background-color .18s ease,border-color .18s ease,opacity .18s ease;
}

.uploadButton{
  grid-area:upload;
  border:2px solid var(--border);
  background:transparent;
  color:var(--text);
}

.uploadButton:hover{
  background:rgba(255,255,255,.05);
  border-color:#666;
}

button{
  border:0;
  color:#fff;
  background:var(--primary);
  text-shadow:none;
  box-shadow:none;
}

button:hover:not(:disabled){
  background:var(--primary-hover);
}

#analyzeBtn{grid-area:create}

#viewerDownload{
  grid-area:export;
  background:var(--secondary);
}

#viewerDownload:hover:not(:disabled){
  background:var(--secondary-hover);
}

#viewerBack{
  grid-area:clear;
  padding:0;
  background:var(--secondary);
  font-size:21px;
  line-height:1;
}

#viewerBack:hover:not(:disabled){
  background:var(--secondary-hover);
}

button:active,
.uploadButton:active{
  transform:none;
}

button:disabled{
  opacity:.42;
  cursor:not-allowed;
}

.featureToggles{
  width:100%;
  display:flex;
  align-items:center;
  gap:8px;
  margin:0 0 18px;
}

.featureToggle{
  position:relative;
  flex:1 1 0;
  width:auto;
  height:48px;
  cursor:pointer;
  user-select:none;
  -webkit-tap-highlight-color:transparent;
}

.featureToggle input{
  position:absolute;
  width:1px;
  height:1px;
  opacity:0;
  pointer-events:none;
}

.featureIcon{
  width:100%;
  height:100%;
  display:grid;
  place-items:center;
  border:2px solid var(--border);
  border-radius:4px;
  color:var(--muted);
  background:transparent;
  box-shadow:none;
  transform:none;
  transition:color .18s ease,border-color .18s ease,background-color .18s ease,opacity .18s ease;
}

.featureIcon svg{
  width:24px;
  height:24px;
  fill:none;
  stroke:currentColor;
  stroke-width:2;
  stroke-linecap:round;
  stroke-linejoin:round;
}

.featureToggle input:checked + .featureIcon{
  color:#fff;
  border-color:var(--primary);
  background:rgba(0,123,255,.10);
  box-shadow:none;
}

.featureToggle input:focus-visible + .featureIcon{
  outline:2px solid #fff;
  outline-offset:2px;
}

.featureToggle:active .featureIcon{transform:none}
.featureToggle input:disabled + .featureIcon{opacity:.38;cursor:not-allowed}

progress{
  width:100%;
  height:6px;
  display:block;
  margin:0 0 8px;
  overflow:hidden;
  appearance:none;
  border:0;
  border-radius:3px;
  background:var(--border);
  accent-color:var(--primary);
}

progress::-webkit-progress-bar{
  background:var(--border);
  border-radius:3px;
}

progress::-webkit-progress-value{
  background:var(--primary);
  border-radius:3px;
}

progress::-moz-progress-bar{
  background:var(--primary);
  border-radius:3px;
}

.mapStatus{
  width:100%;
  min-height:18px;
  color:var(--muted);
  font:700 11px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  letter-spacing:.04em;
  text-transform:uppercase;
  white-space:normal;
  overflow-wrap:anywhere;
  word-break:break-word;
}

#mapStatus{
  display:-webkit-box;
  -webkit-box-orient:vertical;
  -webkit-line-clamp:2;
  overflow:hidden;
}

#npsNote{
  margin-top:3px;
  color:#cfcfcf;
}

.hidden{display:none!important}

.viewerShell,
.viewerShell.open{
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
  border-top:0;
  border-radius:0;
  background:#000;
}

.viewerStatus{
  position:absolute;
  z-index:3;
  top:0;
  left:0;
  right:0;
  min-height:38px;
  display:flex;
  align-items:center;
  padding:10px 18px;
  color:var(--muted);
  background:rgba(0,0,0,.84);
  border-bottom:1px solid var(--border);
  font-size:10px;
  font-weight:700;
  letter-spacing:.14em;
  text-transform:uppercase;
  text-align:left;
  pointer-events:none;
}

.viewerShell iframe{
  position:absolute;
  inset:0;
  width:100%;
  height:100%;
  min-height:0;
  display:block;
  border:0;
  background:#000;
}

.viewerEmptyState{
  position:absolute;
  z-index:2;
  inset:0;
  display:none;
  align-items:center;
  justify-content:center;
  padding:40px;
  text-align:center;
  color:#454545;
  font-size:16px;
  font-weight:500;
  letter-spacing:.05em;
  text-transform:uppercase;
  background:#000;
  backdrop-filter:none;
  -webkit-backdrop-filter:none;
}

.viewerShell.empty .viewerEmptyState{display:flex}
.viewerShell.empty iframe{filter:none}
.viewerToolbar{display:none!important}
body.viewer-open{align-items:flex-start}

@media(max-width:620px){
  .card{
    align-items:flex-start;
    padding:18px 16px 14px;
  }

  .uiCluster{margin:auto}

  h1{font-size:clamp(22px,7vw,28px)}
  .subtitle{margin-bottom:14px;font-size:12px}

  .actions{
    grid-template-columns:minmax(0,1fr) minmax(0,1fr) 44px;
    grid-template-areas:
      "upload create create"
      "export export clear";
    margin-bottom:12px;
  }

  .uploadButton,
  button{
    height:40px;
    min-height:40px;
    font-size:12px;
  }

  .featureToggles{margin-bottom:12px}
  .featureToggle{height:42px}
  .featureIcon svg{width:22px;height:22px}
  progress{margin-bottom:6px}
}

@media(min-width:900px) and (min-aspect-ratio:4/3){
  .app{
    grid-template-columns:50% 50%;
    grid-template-rows:100%;
  }

  .card{
    width:100%;
    height:100vh;
    height:100dvh;
    padding:40px;
    border-right:2px solid var(--border);
    border-bottom:0;
  }

  .viewerShell,
  .viewerShell.open{
    width:100%;
    height:100vh;
    height:100dvh;
    max-height:100vh;
    max-height:100dvh;
  }
}
</style>'''

text, count = re.subn(r'<style>.*?</style>', new_style, text, count=1, flags=re.S)
if count != 1:
    raise SystemExit(f'Expected one style block, replaced {count}')

old_actions = '''      <div class="actions">
        <input id="file" class="fileInput" type="file" accept="audio/*">
        <label class="uploadButton" for="file">Upload Song</label>
        <button id="analyzeBtn" disabled>Create Map</button>
      </div>'''
new_actions = '''      <div class="actions">
        <input id="file" class="fileInput" type="file" accept="audio/*">
        <label class="uploadButton" for="file">Upload Song</label>
        <button id="analyzeBtn" disabled>Create Map</button>
        <button id="viewerDownload" type="button">Export ZIP</button>
        <button id="viewerBack" type="button" title="Clear map" aria-label="Clear map">×</button>
      </div>'''
if old_actions not in text:
    raise SystemExit('Top actions block not found')
text = text.replace(old_actions, new_actions, 1)

old_toolbar = '''    <div class="viewerToolbar">
      <button id="viewerBack" type="button">Back</button>
      <button id="viewerDownload" type="button">ZIP</button>
    </div>'''
if old_toolbar not in text:
    raise SystemExit('Viewer toolbar block not found')
text = text.replace(old_toolbar, '', 1)

text = text.replace(
    'viewerBack.textContent = "Clear";',
    'viewerBack.textContent = "×";\nviewerBack.setAttribute("aria-label","Clear map");',
    1,
)

text = text.replace(
    'viewerEmptyState.textContent = "Create a map to see it\'s preview here!";',
    'viewerEmptyState.textContent = "Your map preview will appear here.";',
    1,
)
text = text.replace(
    'function setViewerEmpty(isEmpty,message="Create a map to see it\'s preview here!"){',
    'function setViewerEmpty(isEmpty,message="Your map preview will appear here."){',
    1,
)

path.write_text(text, encoding='utf-8')
print('Rebuilt only the visible UI with a flatter dark blue-accent design')
