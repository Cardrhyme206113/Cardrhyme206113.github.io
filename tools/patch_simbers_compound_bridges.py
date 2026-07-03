from pathlib import Path

path = Path("simbers.html")
text = path.read_text(encoding="utf-8")

if "function compoundEntryMatchesPrevious" not in text:
    marker = '''function retunePreviousForCompound(
  generatedNotes,
  previous,
  steps,
  startTime
){'''
    helper = '''function compoundEntryMatchesPrevious(previous,steps){
  const hands=[
    {key:"left",step:explicitHandStep(steps,"l")},
    {key:"right",step:explicitHandStep(steps,"r")}
  ];
  for(const hand of hands){
    if(!hand.step)continue;
    const target=oppositeDirection(hand.step.note[2]);
    if(!previous[hand.key]||previous[hand.key].direction!==target){
      return false;
    }
  }
  return true;
}

''' + marker
    if marker not in text:
        raise RuntimeError("Could not insert compound bridge helper")
    text = text.replace(marker, helper, 1)

old = '''  let lastWasCompound=false;
  let boundaryTargets={left:null,right:null};'''
new = '''  let lastWasCompound=false;
  let lastNormalBridgesCompound=false;
  let boundaryTargets={left:null,right:null};'''
if old in text:
    text = text.replace(old, new, 1)
elif "let lastNormalBridgesCompound=false;" not in text:
    raise RuntimeError("Could not add compound bridge state")

old = '''      // Keep explicit streams separated by at least one ordinary flow so the
      // exit reversal from one stream can become the entry reversal of the next.
      if(lastWasCompound||!compoundWindow){'''
new = '''      // One normal note may bridge two explicit flows only when it is the
      // exact reverse of the previous exit and the next entry for both hands.
      const bridgeConflict=
        lastNormalBridgesCompound &&
        !compoundEntryMatchesPrevious(previous,pattern.steps);
      if(lastWasCompound||bridgeConflict||!compoundWindow){'''
if old in text:
    text = text.replace(old, new, 1)
elif "const bridgeConflict=" not in text:
    raise RuntimeError("Could not add compound bridge guard")

old = '''      flowTierCounts[pattern.difficulty]++;
      lastWasCompound=true;'''
new = '''      flowTierCounts[pattern.difficulty]++;
      lastWasCompound=true;
      lastNormalBridgesCompound=false;'''
if old in text:
    text = text.replace(old, new, 1)
elif "lastWasCompound=true;\n      lastNormalBridgesCompound=false;" not in text:
    raise RuntimeError("Could not reset bridge state after compound")

old = '''    const chosen=chooseDirections(
      pattern,
      previous,
      `${seed}|${config.id}|${cluster}|${i}`,
      time,
      boundaryTargets
    );
    boundaryTargets={left:null,right:null};'''
new = '''    const usedBoundaryBridge=Boolean(
      boundaryTargets.left||boundaryTargets.right
    );
    const chosen=chooseDirections(
      pattern,
      previous,
      `${seed}|${config.id}|${cluster}|${i}`,
      time,
      boundaryTargets
    );
    boundaryTargets={left:null,right:null};'''
if old in text:
    text = text.replace(old, new, 1)
elif "const usedBoundaryBridge=Boolean(" not in text:
    raise RuntimeError("Could not capture bridge note")

old = '''    flowTierCounts[pattern.difficulty]++;
    lastWasCompound=false;'''
new = '''    flowTierCounts[pattern.difficulty]++;
    lastWasCompound=false;
    lastNormalBridgesCompound=usedBoundaryBridge;'''
if old in text:
    text = text.replace(old, new, 1)
elif "lastNormalBridgesCompound=usedBoundaryBridge;" not in text:
    raise RuntimeError("Could not store bridge state")

text = text.replace(
    "// A two-beat compound flow owns the intermediate detected event.",
    "// A multi-beat compound flow owns its intermediate detected events.",
)
path.write_text(text, encoding="utf-8")
