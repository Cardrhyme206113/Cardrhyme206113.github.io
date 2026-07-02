from pathlib import Path

path = Path('simbers.html')
text = path.read_text(encoding='utf-8')

# Remove the NoArrows and OneSaber debug controls from the visible UI.
old_mode_toggles = '''
        <label class="featureToggle" title="Debug: include No Arrows mode">
          <input id="featureDots" type="checkbox" checked aria-label="Include No Arrows mode">
          <span class="featureIcon" aria-hidden="true">
            <svg viewBox="0 0 48 48" focusable="false">
              <rect x="10" y="10" width="28" height="28" rx="6"></rect>
              <circle cx="24" cy="24" r="4"></circle>
            </svg>
          </span>
        </label>

        <label class="featureToggle" title="Debug: include One Saber mode">
          <input id="featureSingleSaber" type="checkbox" checked aria-label="Include One Saber mode">
          <span class="featureIcon" aria-hidden="true">
            <svg viewBox="0 0 48 48" focusable="false">
              <path d="M13 35l21-21"></path>
              <path d="M10 38l6-6 4 4-6 6zM31 12l5-2 2 2-2 5"></path>
            </svg>
          </span>
        </label>'''
if old_mode_toggles not in text:
    raise SystemExit('NoArrows / OneSaber toggle markup not found')
text = text.replace(old_mode_toggles, '', 1)

# Remove their DOM references.
old_registry = '''  featureBombs:$("featureBombs"), featureWalls:$("featureWalls"), featureArcs:$("featureArcs"),
  featureDots:$("featureDots"), featureSingleSaber:$("featureSingleSaber"),'''
new_registry = '''  featureBombs:$("featureBombs"), featureWalls:$("featureWalls"), featureArcs:$("featureArcs"),'''
if old_registry not in text:
    raise SystemExit('Mode toggle element registry not found')
text = text.replace(old_registry, new_registry, 1)

# Only bombs, walls, and arcs remain user-toggleable.
old_listener = '''for(const control of [
  els.featureBombs,
  els.featureWalls,
  els.featureArcs,
  els.featureDots,
  els.featureSingleSaber
]){
  control.addEventListener("change",invalidateMapForFeatureChange);
}'''
new_listener = '''for(const control of [
  els.featureBombs,
  els.featureWalls,
  els.featureArcs
]){
  control.addEventListener("change",invalidateMapForFeatureChange);
}'''
if old_listener not in text:
    raise SystemExit('Feature listener list not found')
text = text.replace(old_listener, new_listener, 1)

# Add true 90Degree / 360Degree builders after OneSaber.
marker = '''function safeBaseName(name){'''
rotation_builder = r'''function rotationValue(direction,degrees){
  if(direction<0)return degrees===30?2:3;
  return degrees===30?5:4;
}

function buildRotationDifficulty(standard,seed,characteristic){
  const config=standard.config;
  const beatmap=cloneJson(standard.beatmap);
  const byEvent=new Map();

  for(const note of standard.sourceNotes){
    if(!byEvent.has(note.eventIndex))byEvent.set(note.eventIndex,[]);
    byEvent.get(note.eventIndex).push(note);
  }

  const eventIndices=[...byEvent.keys()].sort((a,b)=>a-b);
  const segments=eventIndices.map(index=>byEvent.get(index)[0].segment);
  const notationSections=buildNotationSections(
    segments,
    config,
    `${seed}|${characteristic}|rotation-sections`
  );

  const rotationEvents=[];
  let cumulativeAngle=0;
  let spinDirection=(hashString(`${seed}|${config.id}|${characteristic}|direction`)%2)?1:-1;
  let previousPeakMelody=null;

  for(const section of notationSections){
    const localIndex=Math.min(
      Math.max(section.peak,0),
      eventIndices.length-1
    );
    const eventIndex=eventIndices[localIndex];
    const notes=byEvent.get(eventIndex)||[];
    const source=notes[0];
    if(!source)continue;

    const melody=source.segment?.melodyValue||0;
    const melodyDelta=previousPeakMelody===null
      ?0
      :melody-previousPeakMelody;
    previousPeakMelody=melody;

    const degrees=section.score>=.82?30:15;
    let direction;

    if(characteristic==="90Degree"){
      direction=Math.abs(melodyDelta)>=.08
        ?(melodyDelta>=0?1:-1)
        :(section.hand?1:-1);

      if(
        cumulativeAngle+direction*degrees>45||
        cumulativeAngle+direction*degrees< -45
      ){
        direction=-direction;
      }
    }else{
      // Keep a readable spin direction, but let major melody changes reverse it.
      if(Math.abs(melodyDelta)>=.32){
        spinDirection=melodyDelta>=0?1:-1;
      }
      direction=spinDirection;
    }

    rotationEvents.push({
      _time:+source.time.toFixed(4),
      _type:15,
      _value:rotationValue(direction,degrees)
    });
    cumulativeAngle+=direction*degrees;
  }

  beatmap._events=[
    ...(beatmap._events||[]),
    ...rotationEvents
  ].sort((a,b)=>
    a._time-b._time||a._type-b._type||a._value-b._value
  );
  beatmap._customData={
    ...beatmap._customData,
    _characteristic:characteristic,
    _rotationEventCount:rotationEvents.length,
    _rotationAlgorithm:
      "late 15/30 degree rotations at the same major song changes used for OneSaber hand switches",
    _rotationRange:characteristic==="90Degree"
      ?"clamped to -45..45 degrees"
      :"continuous 360-degree rotation"
  };

  return {
    ...standard,
    characteristic,
    filename:filenameForCharacteristic(config,characteristic),
    beatmap,
    rotationEventCount:rotationEvents.length
  };
}

''' + marker
if marker not in text:
    raise SystemExit('Rotation builder insertion point not found')
text = text.replace(marker, rotation_builder, 1)

# Modes are always generated; only object types remain optional.
old_options = '''  const featureOptions={
    bombs:els.featureBombs.checked,
    walls:els.featureWalls.checked,
    arcs:els.featureArcs.checked,
    noArrows:els.featureDots.checked,
    oneSaber:els.featureSingleSaber.checked
  };'''
new_options = '''  const featureOptions={
    bombs:els.featureBombs.checked,
    walls:els.featureWalls.checked,
    arcs:els.featureArcs.checked
  };'''
if old_options not in text:
    raise SystemExit('Feature options block not found')
text = text.replace(old_options, new_options, 1)

old_requested = '''  const requestedModes=[
    "Standard",
    ...(featureOptions.noArrows?["No Arrows"]:[]),
    ...(featureOptions.oneSaber?["One Saber"]:[])
  ];'''
new_requested = '''  const requestedModes=[
    "Standard",
    "No Arrows",
    "One Saber",
    "90 Degree",
    "360 Degree"
  ];'''
if old_requested not in text:
    raise SystemExit('Requested mode list not found')
text = text.replace(old_requested, new_requested, 1)

old_characteristics = '''  const characteristicSets=[{
    characteristic:"Standard",
    difficulties:standardDifficulties
  }];

  if(featureOptions.noArrows){
    characteristicSets.push({
      characteristic:"NoArrows",
      difficulties:standardDifficulties.map(makeNoArrowsDifficulty)
    });
  }
  if(featureOptions.oneSaber){
    characteristicSets.push({
      characteristic:"OneSaber",
      difficulties:standardDifficulties.map(difficulty=>
        buildOneSaberDifficulty(
          difficulty,
          seed,
          lightingEvents,
          featureOptions
        )
      )
    });
  }'''
new_characteristics = '''  const characteristicSets=[
    {
      characteristic:"Standard",
      difficulties:standardDifficulties
    },
    {
      characteristic:"NoArrows",
      difficulties:standardDifficulties.map(makeNoArrowsDifficulty)
    },
    {
      characteristic:"OneSaber",
      difficulties:standardDifficulties.map(difficulty=>
        buildOneSaberDifficulty(
          difficulty,
          seed,
          lightingEvents,
          featureOptions
        )
      )
    },
    {
      characteristic:"90Degree",
      difficulties:standardDifficulties.map(difficulty=>
        buildRotationDifficulty(difficulty,seed,"90Degree")
      )
    },
    {
      characteristic:"360Degree",
      difficulties:standardDifficulties.map(difficulty=>
        buildRotationDifficulty(difficulty,seed,"360Degree")
      )
    }
  ];'''
if old_characteristics not in text:
    raise SystemExit('Characteristic set block not found')
text = text.replace(old_characteristics, new_characteristics, 1)

# Remove dead control locking.
text = text.replace(
    '''  els.featureBombs.disabled=true; els.featureWalls.disabled=true; els.featureArcs.disabled=true;
  els.featureDots.disabled=true; els.featureSingleSaber.disabled=true;''',
    '''  els.featureBombs.disabled=true; els.featureWalls.disabled=true; els.featureArcs.disabled=true;''',
    1,
)
text = text.replace(
    '''    els.featureBombs.disabled=false; els.featureWalls.disabled=false; els.featureArcs.disabled=false;
    els.featureDots.disabled=false; els.featureSingleSaber.disabled=false;''',
    '''    els.featureBombs.disabled=false; els.featureWalls.disabled=false; els.featureArcs.disabled=false;''',
    1,
)

# Hard validation: no old mode toggle references may remain.
for stale in ('featureDots','featureSingleSaber','featureOptions.noArrows','featureOptions.oneSaber'):
    if stale in text:
        raise SystemExit(f'Stale mode-toggle reference remains: {stale}')

path.write_text(text, encoding='utf-8')
print('Added always-on NoArrows, OneSaber, 90Degree, and 360Degree characteristics')
