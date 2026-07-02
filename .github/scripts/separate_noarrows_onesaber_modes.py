from pathlib import Path

path = Path('simbers.html')
text = path.read_text(encoding='utf-8')

# The two icon toggles now control whether extra characteristics are packaged.
text = text.replace(
    '<label class="featureToggle" title="Dot notes">\n          <input id="featureDots" type="checkbox" aria-label="Dot notes">',
    '<label class="featureToggle" title="Debug: include No Arrows mode">\n          <input id="featureDots" type="checkbox" checked aria-label="Include No Arrows mode">',
    1,
)
text = text.replace(
    '<label class="featureToggle" title="Single saber sections">\n          <input id="featureSingleSaber" type="checkbox" aria-label="Single saber sections">',
    '<label class="featureToggle" title="Debug: include One Saber mode">\n          <input id="featureSingleSaber" type="checkbox" checked aria-label="Include One Saber mode">',
    1,
)

# Standard must stay untouched by the debug toggles.
old_setup = '''  const notationSections=(featureOptions.dots||featureOptions.singleSaber)
    ?buildNotationSections(segments,config,seed)
    :[];
  const notationByEvent=sectionLookup(notationSections,segments.length);
  const previous={left:null,right:null};'''
new_setup = '''  const previous={left:null,right:null};'''
if old_setup not in text:
    raise SystemExit('Standard notation setup block not found')
text = text.replace(old_setup, new_setup, 1)

old_notes = '''    const notationSection=notationByEvent[i];
    const makeDot=featureOptions.dots&&Boolean(notationSection);
    const singleHand=featureOptions.singleSaber&&notationSection
      ?notationSection.hand
      :null;

    if(singleHand===null||singleHand===0){
      generatedNotes.push({
        eventIndex:i,
        time,
        lineIndex:safePattern.l[0],
        lineLayer:safePattern.l[1],
        type:0,
        cutDirection:makeDot?8:CUT[chosen.leftDirection].code,
        flowDifficulty:pattern.difficulty,
        notationSection:notationSection?.peak??null,
        segment
      });
    }

    if(singleHand===null||singleHand===1){
      generatedNotes.push({
        eventIndex:i,
        time,
        lineIndex:safePattern.r[0],
        lineLayer:safePattern.r[1],
        type:1,
        cutDirection:makeDot?8:CUT[chosen.rightDirection].code,
        flowDifficulty:pattern.difficulty,
        notationSection:notationSection?.peak??null,
        segment
      });
    }'''
new_notes = '''    generatedNotes.push({
      eventIndex:i,
      time,
      lineIndex:safePattern.l[0],
      lineLayer:safePattern.l[1],
      type:0,
      cutDirection:CUT[chosen.leftDirection].code,
      flowDifficulty:pattern.difficulty,
      segment
    });
    generatedNotes.push({
      eventIndex:i,
      time,
      lineIndex:safePattern.r[0],
      lineLayer:safePattern.r[1],
      type:1,
      cutDirection:CUT[chosen.rightDirection].code,
      flowDifficulty:pattern.difficulty,
      segment
    });'''
if old_notes not in text:
    raise SystemExit('Standard note generation block not found')
text = text.replace(old_notes, new_notes, 1)

old_mode_metadata = '''        _wallEveryEvents:featureOptions.walls?config.wallEveryEvents:0,
        _dotNoteSections:featureOptions.dots?notationSections.length:0,
        _dotNoteAlgorithm:featureOptions.dots
          ?"directionless notes in musically important sections"
          :"disabled",
        _singleSaberSections:featureOptions.singleSaber?notationSections.length:0,
        _singleSaberAlgorithm:featureOptions.singleSaber
          ?"alternating left/right hands across musically important sections"
          :"disabled",
        _lightingAlgorithm:'''
new_mode_metadata = '''        _wallEveryEvents:featureOptions.walls?config.wallEveryEvents:0,
        _characteristic:"Standard",
        _lightingAlgorithm:'''
if old_mode_metadata not in text:
    raise SystemExit('Old mixed-mode metadata block not found')
text = text.replace(old_mode_metadata, new_mode_metadata, 1)

old_return_tail = '''    usedFlowCount:flowCounts.size,
    usedFlowIds:[...flowCounts.keys()],
    flowTierCounts
  };'''
new_return_tail = '''    characteristic:"Standard",
    usedFlowCount:flowCounts.size,
    usedFlowIds:[...flowCounts.keys()],
    flowTierCounts,
    sourceNotes:generatedNotes
  };'''
if old_return_tail not in text:
    raise SystemExit('Standard return tail not found')
text = text.replace(old_return_tail, new_return_tail, 1)

# Add true characteristic builders before safeBaseName().
marker = '''function safeBaseName(name){'''
helpers = r'''function filenameForCharacteristic(config,characteristic){
  if(characteristic==="Standard")return config.filename;
  if(/Standard\.dat$/i.test(config.filename)){
    return config.filename.replace(/Standard\.dat$/i,`${characteristic}.dat`);
  }
  return `${config.difficulty}${characteristic}.dat`;
}

function cloneJson(value){
  return JSON.parse(JSON.stringify(value));
}

function makeNoArrowsDifficulty(standard){
  const beatmap=cloneJson(standard.beatmap);

  for(const note of beatmap._notes){
    if(note._type===0||note._type===1)note._cutDirection=8;
  }
  for(const slider of beatmap._sliders||[]){
    slider._headCutDirection=8;
    slider._tailCutDirection=8;
  }

  beatmap._customData={
    ...beatmap._customData,
    _characteristic:"NoArrows",
    _dotNoteAlgorithm:"all color notes are directionless",
    _singleSaberAlgorithm:"disabled"
  };

  return {
    ...standard,
    characteristic:"NoArrows",
    filename:filenameForCharacteristic(standard.config,"NoArrows"),
    beatmap,
    sourceNotes:standard.sourceNotes.map(note=>({
      ...note,
      cutDirection:8
    }))
  };
}

function buildOneSaberDifficulty(
  standard,
  seed,
  lightingEvents,
  featureOptions
){
  const config=standard.config;
  const byEvent=new Map();

  for(const note of standard.sourceNotes){
    if(!byEvent.has(note.eventIndex))byEvent.set(note.eventIndex,[]);
    byEvent.get(note.eventIndex).push(note);
  }

  const eventIndices=[...byEvent.keys()].sort((a,b)=>a-b);
  const segments=eventIndices.map(index=>byEvent.get(index)[0].segment);
  const notationSections=buildNotationSections(segments,config,seed);
  const notationByEvent=sectionLookup(notationSections,segments.length);
  const generatedNotes=[];
  let sourceHand=hashString(`${seed}|${config.id}|one-saber-first-side`)%2;
  let activeSectionPeak=null;

  for(let localIndex=0;localIndex<eventIndices.length;localIndex++){
    const eventIndex=eventIndices[localIndex];
    const section=notationByEvent[localIndex];

    if(section&&section.peak!==activeSectionPeak){
      sourceHand=section.hand;
      activeSectionPeak=section.peak;
    }else if(!section){
      activeSectionPeak=null;
    }

    const eventNotes=byEvent.get(eventIndex);
    const source=(
      eventNotes.find(note=>note.type===sourceHand)||
      eventNotes[0]
    );

    generatedNotes.push({
      ...source,
      eventIndex:localIndex,
      type:0,
      oneSaberSourceHand:sourceHand,
      notationSection:section?.peak??null
    });
  }

  const colorNotes=generatedNotes.map(note=>({
    _time:+note.time.toFixed(4),
    _lineIndex:note.lineIndex,
    _lineLayer:note.lineLayer,
    _type:0,
    _cutDirection:note.cutDirection
  }));

  const sliders=featureOptions.arcs
    ?buildArcsForDifficulty(generatedNotes,config,seed)
    :[];
  const bombs=featureOptions.bombs
    ?buildBombsForDifficulty(generatedNotes,sliders,config,seed)
    :[];
  const obstacles=featureOptions.walls
    ?buildWallsForDifficulty(
      generatedNotes,
      sliders,
      bombs,
      config,
      seed
    )
    :[];

  const notes=[...colorNotes,...bombs].sort((a,b)=>
    a._time-b._time||a._type-b._type
  );
  const activeStart=generatedNotes.length?generatedNotes[0].time:0;
  const activeEnd=generatedNotes.length
    ?generatedNotes[generatedNotes.length-1].time
    :0;
  const activeDuration=Math.max(1,activeEnd-activeStart);
  const nps=colorNotes.length/activeDuration;

  return {
    config,
    characteristic:"OneSaber",
    filename:filenameForCharacteristic(config,"OneSaber"),
    beatmap:{
      _version:"2.6.0",
      _notes:notes,
      _obstacles:obstacles,
      _sliders:sliders,
      _events:lightingEvents,
      _waypoints:[],
      _specialEventsKeywordFilters:{_keywords:[]},
      _customData:{
        ...standard.beatmap._customData,
        _characteristic:"OneSaber",
        _dotNoteAlgorithm:"disabled",
        _singleSaberSections:notationSections.length,
        _singleSaberAlgorithm:
          "one saber switches between left-side and right-side source patterns at musically important sections"
      }
    },
    noteCount:colorNotes.length,
    eventCount:eventIndices.length,
    bombCount:bombs.length,
    wallCount:obstacles.length,
    arcCount:sliders.length,
    nps,
    activeDuration,
    usedFlowCount:standard.usedFlowCount,
    usedFlowIds:standard.usedFlowIds,
    flowTierCounts:standard.flowTierCounts,
    sourceNotes:generatedNotes
  };
}

''' + marker
if marker not in text:
    raise SystemExit('safeBaseName insertion marker not found')
text = text.replace(marker, helpers, 1)

# Info.dat now lists every generated characteristic, not only Standard.
old_info = '''function makeInfo(songName,duration){
  return {
    _version:"2.0.0",
    _songName:songName,
    _songSubName:"Multi-Difficulty Signature Flow",
    _songAuthorName:"Unknown",
    _levelAuthorName:"Auto Signature Flow",
    _beatsPerMinute:60,
    _songTimeOffset:0,
    _shuffle:0,
    _shufflePeriod:0,
    _previewStartTime:+Math.min(
      10,
      Math.max(0,duration*.12)
    ).toFixed(3),
    _previewDuration:+Math.min(12,duration).toFixed(3),
    _songFilename:"song.ogg",
    _coverImageFilename:"cover.png",
    _environmentName:"LinkinParkEnvironment",
    _allDirectionsEnvironmentName:"GlassDesertEnvironment",
    _difficultyBeatmapSets:[{
      _beatmapCharacteristicName:"Standard",
      _difficultyBeatmaps:DIFFICULTY_CONFIGS.map(config=>{
        const customData={
          _minimumEventGapMs:config.minimumGapMs,
          _flowWeights:config.weights
        };
        if(config.id==="medium"){
          customData._difficultyLabel="Medium";
        }

        return {
          _difficulty:config.difficulty,
          _difficultyRank:config.rank,
          _beatmapFilename:config.filename,
          _noteJumpMovementSpeed:config.noteJumpMovementSpeed,
          _noteJumpStartBeatOffset:0,
          _customData:customData
        };
      })
    }]
  };
}'''
new_info = '''function makeInfo(songName,duration,characteristicSets){
  return {
    _version:"2.0.0",
    _songName:songName,
    _songSubName:"Multi-Difficulty Signature Flow",
    _songAuthorName:"Unknown",
    _levelAuthorName:"Auto Signature Flow",
    _beatsPerMinute:60,
    _songTimeOffset:0,
    _shuffle:0,
    _shufflePeriod:0,
    _previewStartTime:+Math.min(
      10,
      Math.max(0,duration*.12)
    ).toFixed(3),
    _previewDuration:+Math.min(12,duration).toFixed(3),
    _songFilename:"song.ogg",
    _coverImageFilename:"cover.png",
    _environmentName:"LinkinParkEnvironment",
    _allDirectionsEnvironmentName:"GlassDesertEnvironment",
    _difficultyBeatmapSets:characteristicSets.map(set=>({
      _beatmapCharacteristicName:set.characteristic,
      _difficultyBeatmaps:set.difficulties.map(difficulty=>{
        const config=difficulty.config;
        const customData={
          _minimumEventGapMs:config.minimumGapMs,
          _flowWeights:config.weights
        };
        if(config.id==="medium")customData._difficultyLabel="Medium";

        return {
          _difficulty:config.difficulty,
          _difficultyRank:config.rank,
          _beatmapFilename:difficulty.filename,
          _noteJumpMovementSpeed:config.noteJumpMovementSpeed,
          _noteJumpStartBeatOffset:0,
          _customData:customData
        };
      })
    }))
  };
}'''
if old_info not in text:
    raise SystemExit('Old Info.dat builder not found')
text = text.replace(old_info, new_info, 1)

# Build Standard plus optional NoArrows and OneSaber characteristic sets.
old_options = '''  const featureOptions={
    bombs:els.featureBombs.checked,
    walls:els.featureWalls.checked,
    arcs:els.featureArcs.checked,
    dots:els.featureDots.checked,
    singleSaber:els.featureSingleSaber.checked
  };'''
new_options = '''  const featureOptions={
    bombs:els.featureBombs.checked,
    walls:els.featureWalls.checked,
    arcs:els.featureArcs.checked,
    noArrows:els.featureDots.checked,
    oneSaber:els.featureSingleSaber.checked
  };'''
if old_options not in text:
    raise SystemExit('Old debug option semantics not found')
text = text.replace(old_options, new_options, 1)

old_difficulties = '''  setProgress(
    .855,
    "Building five difficulties with selected objects and lighting…"
  );
  const difficulties=DIFFICULTY_CONFIGS.map(
    config=>buildBeatmap(
      result,
      seed,
      config,
      lightingEvents,
      featureOptions
    )
  );

  const expertPlus=difficulties.find(
    difficulty=>difficulty.config.id==="expertPlus"
  );'''
new_difficulties = '''  const requestedModes=[
    "Standard",
    ...(featureOptions.noArrows?["No Arrows"]:[]),
    ...(featureOptions.oneSaber?["One Saber"]:[])
  ];
  setProgress(
    .855,
    `Building ${requestedModes.join(", ")} difficulties…`
  );

  const standardDifficulties=DIFFICULTY_CONFIGS.map(
    config=>buildBeatmap(
      result,
      seed,
      config,
      lightingEvents,
      featureOptions
    )
  );
  const characteristicSets=[{
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
  }

  const difficulties=characteristicSets.flatMap(set=>set.difficulties);
  const expertPlus=standardDifficulties.find(
    difficulty=>difficulty.config.id==="expertPlus"
  );'''
if old_difficulties not in text:
    raise SystemExit('Old difficulty build block not found')
text = text.replace(old_difficulties, new_difficulties, 1)

text = text.replace(
    'const info=makeInfo(songName,result.duration);',
    'const info=makeInfo(songName,result.duration,characteristicSets);',
    1,
)
text = text.replace(
    'name:`${songName}_SimplifiedSabers_FiveDifficulty.zip`,',
    'name:`${songName}_SimplifiedSabers.zip`,\n    characteristicSets,',
    1,
)

# Keep status concise now that the ZIP can contain 15 beatmaps.
old_summary = '''    const difficultySummary=output.difficulties
      .map(difficulty=>`${difficulty.config.label} ${difficulty.eventCount} events / ${difficulty.arcCount} arcs / ${difficulty.bombCount} bombs / ${difficulty.wallCount} walls`)
      .join(" • ");'''
new_summary = '''    const difficultySummary=output.characteristicSets
      .map(set=>`${set.characteristic} ${set.difficulties.length} difficulties`)
      .join(" • ");'''
if old_summary not in text:
    raise SystemExit('Old status summary not found')
text = text.replace(old_summary, new_summary, 1)

path.write_text(text, encoding='utf-8')
print('Separated NoArrows and OneSaber into real Beat Saber characteristics')
