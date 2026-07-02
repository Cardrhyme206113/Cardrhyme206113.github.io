from pathlib import Path

path = Path('simbers.html')
text = path.read_text(encoding='utf-8')

# Make the Info.dat manifest explicit and self-validating.
old_make_info_end = '''    _allDirectionsEnvironmentName:"GlassDesertEnvironment",
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
  };'''
new_make_info_end = '''    _allDirectionsEnvironmentName:"GlassDesertEnvironment",
    _customData:{
      _simplifiedSabersCharacteristics:characteristicSets.map(set=>set.characteristic)
    },
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
  };'''
if old_make_info_end not in text:
    raise SystemExit('makeInfo characteristic block not found')
text = text.replace(old_make_info_end, new_make_info_end, 1)

# Add a strict check against the exact Info.dat object that is serialized.
marker = '''function canvasBlob(canvas,type="image/png",quality){'''
validator = '''function validateInfoCharacteristics(info,characteristicSets){
  const expected=characteristicSets.map(set=>set.characteristic);
  const actual=(info._difficultyBeatmapSets||[])
    .map(set=>set._beatmapCharacteristicName);

  if(JSON.stringify(actual)!==JSON.stringify(expected)){
    throw new Error(
      `Info.dat mode manifest mismatch. Expected ${expected.join(", ")}; got ${actual.join(", ")||"none"}.`
    );
  }

  const filenames=new Set();
  for(const set of info._difficultyBeatmapSets){
    if(set._difficultyBeatmaps.length!==DIFFICULTY_CONFIGS.length){
      throw new Error(
        `Info.dat ${set._beatmapCharacteristicName} mode has ${set._difficultyBeatmaps.length} difficulties instead of ${DIFFICULTY_CONFIGS.length}.`
      );
    }
    for(const difficulty of set._difficultyBeatmaps){
      if(!difficulty._beatmapFilename){
        throw new Error(`Info.dat contains a mode difficulty without a filename.`);
      }
      filenames.add(difficulty._beatmapFilename);
    }
  }

  return {expected,actual,filenames};
}

''' + marker
if marker not in text:
    raise SystemExit('canvasBlob insertion marker not found')
text = text.replace(marker, validator, 1)

# Build beatmap entries first, then verify every Info.dat filename exists.
old_entries = '''  const cover=await createCover(songName,seed);
  const info=makeInfo(songName,result.duration,characteristicSets);
  const encoder=new TextEncoder();

  const entries=[
    {
      name:"Info.dat",
      data:encoder.encode(JSON.stringify(info,null,2))
    },
    ...difficulties.map(difficulty=>({
      name:difficulty.filename,
      data:encoder.encode(JSON.stringify(difficulty.beatmap))
    })),
    {name:"song.ogg",data:oggBytes},
    {name:"cover.png",data:await bytesFromBlob(cover)}
  ];'''
new_entries = '''  const cover=await createCover(songName,seed);
  const info=makeInfo(songName,result.duration,characteristicSets);
  const manifest=validateInfoCharacteristics(info,characteristicSets);
  const encoder=new TextEncoder();
  const beatmapEntries=difficulties.map(difficulty=>({
    name:difficulty.filename,
    data:encoder.encode(JSON.stringify(difficulty.beatmap))
  }));
  const packagedFilenames=new Set(beatmapEntries.map(entry=>entry.name));

  for(const filename of manifest.filenames){
    if(!packagedFilenames.has(filename)){
      throw new Error(`Info.dat references missing beatmap file: ${filename}`);
    }
  }

  const entries=[
    {
      name:"Info.dat",
      data:encoder.encode(JSON.stringify(info,null,2))
    },
    ...beatmapEntries,
    {name:"song.ogg",data:oggBytes},
    {name:"cover.png",data:await bytesFromBlob(cover)}
  ];'''
if old_entries not in text:
    raise SystemExit('ZIP entries block not found')
text = text.replace(old_entries, new_entries, 1)

# Return the manifest that was actually serialized, not just the intended sets.
old_return = '''    characteristicSets,
    difficulties,
    usedFlowCount:allFlowIds.size,'''
new_return = '''    characteristicSets,
    packagedCharacteristics:manifest.actual,
    difficulties,
    usedFlowCount:allFlowIds.size,'''
if old_return not in text:
    raise SystemExit('ZIP return characteristic block not found')
text = text.replace(old_return, new_return, 1)

# Show the exact modes found in Info.dat in the visible status.
old_summary = '''    const difficultySummary=output.characteristicSets
      .map(set=>`${set.characteristic} ${set.difficulties.length} difficulties`)
      .join(" • ");'''
new_summary = '''    const difficultySummary=output.packagedCharacteristics
      .map(characteristic=>`${characteristic} ${DIFFICULTY_CONFIGS.length} difficulties`)
      .join(" • ");'''
if old_summary not in text:
    raise SystemExit('Visible mode summary block not found')
text = text.replace(old_summary, new_summary, 1)

# Do not force Standard in ArcViewer. Leave its mode selector visible.
old_launch_payload = '''      filename,
      mode:"Standard",
      difficulty:"ExpertPlus",
      uiOff:true'''
new_launch_payload = '''      filename,
      difficulty:"ExpertPlus",
      uiOff:false'''
if old_launch_payload not in text:
    raise SystemExit('ArcViewer launch payload not found')
text = text.replace(old_launch_payload, new_launch_payload, 1)

text = text.replace(
    'viewerStatus.textContent="Playing Expert+ • Standard";',
    'viewerStatus.textContent="Playing Expert+ • choose a mode below";',
    1,
)

path.write_text(text, encoding='utf-8')
print('Made Info.dat characteristics explicit, validated, and visible')
