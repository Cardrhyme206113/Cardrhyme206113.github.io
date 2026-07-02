from pathlib import Path

path = Path('simbers.html')
text = path.read_text(encoding='utf-8')

# Icon-only checkbox controls beneath the primary actions.
old_actions = '''      <div class="actions">
        <input id="file" class="fileInput" type="file" accept="audio/*">
        <label class="uploadButton" for="file">Upload Song</label>
        <button id="analyzeBtn" disabled>Create Map</button>
      </div>

      <progress id="progress" max="1" value="0"></progress>'''
new_actions = '''      <div class="actions">
        <input id="file" class="fileInput" type="file" accept="audio/*">
        <label class="uploadButton" for="file">Upload Song</label>
        <button id="analyzeBtn" disabled>Create Map</button>
      </div>

      <div class="featureToggles" role="group" aria-label="Map objects">
        <label class="featureToggle" title="Bombs">
          <input id="featureBombs" type="checkbox" checked aria-label="Bombs">
          <span class="featureIcon" aria-hidden="true">
            <svg viewBox="0 0 48 48" focusable="false">
              <circle cx="24" cy="25" r="11"></circle>
              <path d="M24 9v5M24 36v5M8 25h5M35 25h5M13 14l4 4M31 32l4 4M35 14l-4 4M17 32l-4 4"></path>
              <path d="M29 16c2-5 7-6 10-3"></path>
            </svg>
          </span>
        </label>

        <label class="featureToggle" title="Walls">
          <input id="featureWalls" type="checkbox" checked aria-label="Walls">
          <span class="featureIcon" aria-hidden="true">
            <svg viewBox="0 0 48 48" focusable="false">
              <rect x="10" y="9" width="28" height="30" rx="3"></rect>
              <path d="M10 20h28M10 30h28M19 9v11M29 20v10M19 30v9"></path>
            </svg>
          </span>
        </label>

        <label class="featureToggle" title="Arcs">
          <input id="featureArcs" type="checkbox" checked aria-label="Arcs">
          <span class="featureIcon" aria-hidden="true">
            <svg viewBox="0 0 48 48" focusable="false">
              <rect x="7" y="28" width="9" height="9" rx="2"></rect>
              <rect x="32" y="11" width="9" height="9" rx="2"></rect>
              <path d="M14 30C19 17 25 14 34 17"></path>
            </svg>
          </span>
        </label>
      </div>

      <progress id="progress" max="1" value="0"></progress>'''
if old_actions not in text:
    raise SystemExit('Primary actions block not found')
text = text.replace(old_actions, new_actions, 1)

# Toggle visuals: no visible text, just compact icons with clear checked state.
css_marker = '''  progress{
    width:100%;'''
feature_css = '''  .featureToggles{
    width:100%;
    display:flex;
    align-items:center;
    justify-content:center;
    gap:10px;
    margin:12px auto 0;
  }

  .featureToggle{
    position:relative;
    display:block;
    width:48px;
    height:44px;
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
    border:1px solid rgba(255,255,255,.17);
    border-radius:14px;
    color:rgba(255,255,255,.44);
    background:rgba(255,255,255,.045);
    box-shadow:inset 0 1px 0 rgba(255,255,255,.05);
    transform:translateY(0) scale(1);
    transition:
      color .18s ease,
      border-color .18s ease,
      background .18s ease,
      box-shadow .18s ease,
      transform .16s ease,
      opacity .18s ease;
  }

  .featureIcon svg{
    width:28px;
    height:28px;
    fill:none;
    stroke:currentColor;
    stroke-width:2.5;
    stroke-linecap:round;
    stroke-linejoin:round;
  }

  .featureToggle input:checked + .featureIcon{
    color:#fff;
    border-color:rgba(255,134,199,.66);
    background:linear-gradient(145deg,rgba(255,91,167,.24),rgba(139,78,255,.22));
    box-shadow:
      0 5px 16px rgba(71,18,81,.22),
      inset 0 1px 0 rgba(255,255,255,.14);
  }

  .featureToggle input:focus-visible + .featureIcon{
    outline:2px solid rgba(130,180,255,.95);
    outline-offset:2px;
  }

  .featureToggle:active .featureIcon{
    transform:translateY(1px) scale(.96);
  }

  .featureToggle input:disabled + .featureIcon{
    opacity:.38;
    cursor:not-allowed;
  }

'''
if css_marker not in text:
    raise SystemExit('Progress CSS marker not found')
text = text.replace(css_marker, feature_css + css_marker, 1)

# Slightly tighter toggle spacing on phones.
mobile_marker = '''    progress{margin:10px auto 7px}
  }'''
mobile_replacement = '''    .featureToggles{margin-top:9px;gap:8px}
    .featureToggle{width:46px;height:40px}
    .featureIcon svg{width:25px;height:25px}
    progress{margin:9px auto 7px}
  }'''
if mobile_marker not in text:
    raise SystemExit('Mobile progress marker not found')
text = text.replace(mobile_marker, mobile_replacement, 1)

# Add the three controls to the element registry.
els_marker = '''  file:$("file"), demoBtn:$("demoBtn"), analyzeBtn:$("analyzeBtn"),'''
els_replacement = '''  file:$("file"), demoBtn:$("demoBtn"), analyzeBtn:$("analyzeBtn"),
  featureBombs:$("featureBombs"), featureWalls:$("featureWalls"), featureArcs:$("featureArcs"),'''
if els_marker not in text:
    raise SystemExit('Element registry marker not found')
text = text.replace(els_marker, els_replacement, 1)

# Feature selection is captured once per build and passed into every difficulty.
old_build_signature = '''function buildBeatmap(result,seed,config,lightingEvents){'''
new_build_signature = '''function buildBeatmap(result,seed,config,lightingEvents,featureOptions){'''
if old_build_signature not in text:
    raise SystemExit('buildBeatmap signature not found')
text = text.replace(old_build_signature, new_build_signature, 1)

old_objects = '''  const sliders=buildArcsForDifficulty(
    generatedNotes,
    config,
    seed
  );

  const bombs=buildBombsForDifficulty(
    generatedNotes,
    sliders,
    config,
    seed
  );

  const obstacles=buildWallsForDifficulty(
    generatedNotes,
    sliders,
    bombs,
    config,
    seed
  );'''
new_objects = '''  const sliders=featureOptions.arcs
    ?buildArcsForDifficulty(
      generatedNotes,
      config,
      seed
    )
    :[];

  const bombs=featureOptions.bombs
    ?buildBombsForDifficulty(
      generatedNotes,
      sliders,
      config,
      seed
    )
    :[];

  const obstacles=featureOptions.walls
    ?buildWallsForDifficulty(
      generatedNotes,
      sliders,
      bombs,
      config,
      seed
    )
    :[];'''
if old_objects not in text:
    raise SystemExit('Generated object block not found')
text = text.replace(old_objects, new_objects, 1)

# Keep custom metadata truthful when a feature is disabled.
text = text.replace(
    '''        _arcEveryEvents:config.arcEveryEvents,
        _arcAlgorithm:"movement+timing+melody continuity",
        _bombAlgorithm:config.bombEveryEvents
          ?"strong attack + follow-through space + next-note safety"
          :"disabled",
        _bombEveryEvents:config.bombEveryEvents,
        _wallAlgorithm:config.wallEveryEvents
          ?"strong accent + open gap + arc/bomb safety"
          :"disabled",
        _wallEveryEvents:config.wallEveryEvents,''',
    '''        _arcEveryEvents:featureOptions.arcs?config.arcEveryEvents:0,
        _arcAlgorithm:featureOptions.arcs
          ?"movement+timing+melody continuity"
          :"disabled",
        _bombAlgorithm:featureOptions.bombs&&config.bombEveryEvents
          ?"strong attack + follow-through space + next-note safety"
          :"disabled",
        _bombEveryEvents:featureOptions.bombs?config.bombEveryEvents:0,
        _wallAlgorithm:featureOptions.walls&&config.wallEveryEvents
          ?"strong accent + open gap + arc/bomb safety"
          :"disabled",
        _wallEveryEvents:featureOptions.walls?config.wallEveryEvents:0,''',
    1,
)

# Capture checked states at build start, update progress copy, and pass them through.
old_build_start = '''async function buildMapZip(result,monoSamples,sampleRate){
  const seed=await songSeed(sourceBlob);
  const songName=safeBaseName(sourceBlob.name);'''
new_build_start = '''async function buildMapZip(result,monoSamples,sampleRate){
  const seed=await songSeed(sourceBlob);
  const songName=safeBaseName(sourceBlob.name);
  const featureOptions={
    bombs:els.featureBombs.checked,
    walls:els.featureWalls.checked,
    arcs:els.featureArcs.checked
  };'''
if old_build_start not in text:
    raise SystemExit('buildMapZip start not found')
text = text.replace(old_build_start, new_build_start, 1)

text = text.replace(
    '"Building five difficulties with arcs, bombs, walls, and lighting…"',
    '"Building five difficulties with selected objects and lighting…"',
    1,
)

old_build_call = '''      config,
      lightingEvents
    )'''
new_build_call = '''      config,
      lightingEvents,
      featureOptions
    )'''
if old_build_call not in text:
    raise SystemExit('buildBeatmap call not found')
text = text.replace(old_build_call, new_build_call, 1)

# Changing a checkbox invalidates the old ZIP/preview so Open Map cannot reopen
# a map generated with stale options.
listener_marker = '''els.file.addEventListener("change", ()=>{
  if(!els.file.files[0]) return;
  setSource(els.file.files[0]);
});'''
listener_replacement = listener_marker + '''

function invalidateMapForFeatureChange(){
  lastMapZip=null;
  lastMapZipName="";
  els.npsNote.textContent="";
  els.analyzeBtn.textContent="Create Map";
  els.mapStatus.textContent=sourceBlob
    ?"Map options changed. Create the map again."
    :"Select a song.";
  setViewerEmpty(true);
  viewerStatus.textContent="ArcViewer ready.";
  unloadArcViewer().then(()=>prepareArcViewer()).catch(console.warn);
  scheduleUiCenterMotion(true);
}

for(const control of [els.featureBombs,els.featureWalls,els.featureArcs]){
  control.addEventListener("change",invalidateMapForFeatureChange);
}'''
if listener_marker not in text:
    raise SystemExit('File input listener marker not found')
text = text.replace(listener_marker, listener_replacement, 1)

# Lock options while a map is being generated, then restore them.
run_start = '''  els.analyzeBtn.disabled=true; els.demoBtn.disabled=true; els.file.disabled=true;
  els.jsonBtn.disabled=true; els.csvBtn.disabled=true;'''
run_start_new = '''  els.analyzeBtn.disabled=true; els.demoBtn.disabled=true; els.file.disabled=true;
  els.featureBombs.disabled=true; els.featureWalls.disabled=true; els.featureArcs.disabled=true;
  els.jsonBtn.disabled=true; els.csvBtn.disabled=true;'''
if run_start not in text:
    raise SystemExit('runAnalysis disable block not found')
text = text.replace(run_start, run_start_new, 1)

run_finally = '''    els.analyzeBtn.disabled=false; els.demoBtn.disabled=false; els.file.disabled=false;
    if(!lastMapZip&&els.analyzeBtn.textContent!=="Try Again")els.analyzeBtn.textContent="Create Map";'''
run_finally_new = '''    els.analyzeBtn.disabled=false; els.demoBtn.disabled=false; els.file.disabled=false;
    els.featureBombs.disabled=false; els.featureWalls.disabled=false; els.featureArcs.disabled=false;
    if(!lastMapZip&&els.analyzeBtn.textContent!=="Try Again")els.analyzeBtn.textContent="Create Map";'''
if run_finally not in text:
    raise SystemExit('runAnalysis finally block not found')
text = text.replace(run_finally, run_finally_new, 1)

path.write_text(text, encoding='utf-8')
print('Added icon-only checkbox toggles for bombs, walls, and arcs')
