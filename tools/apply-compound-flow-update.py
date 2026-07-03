from pathlib import Path
import re
import subprocess
import tempfile

path=Path("simbers.html")
text=path.read_text(encoding="utf-8")

def replace_once(old,new,label):
    global text
    count=text.count(old)
    if count!=1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    text=text.replace(old,new,1)

compound='const COMPOUND_FLOW_PATTERNS=[{"id":"compound_05","name":"Flow 5","difficulty":"medium","beatSpan":1,"steps":[{"l":[0,2,"down"],"r":[3,2,"down"]},{"l":[0,1,"down"],"r":[3,1,"down"]},{"l":[0,0,"down"],"r":[3,0,"down"]}]},{"id":"compound_06","name":"Flow 6","difficulty":"medium","beatSpan":1,"steps":[{"l":[0,0,"up"],"r":[3,0,"up"]},{"l":[0,1,"up"],"r":[3,1,"up"]},{"l":[0,2,"up"],"r":[3,2,"up"]}]},{"id":"compound_13","name":"Flow 13","difficulty":"hard","beatSpan":2,"steps":[{"l":[1,0,"upLeft"],"r":[2,0,"upRight"]},{"l":[0,1,"upLeft"],"r":[3,1,"upRight"]},{"l":[0,2,"upRight"],"r":[3,2,"upLeft"]},{"l":[1,2,"downRight"],"r":[2,2,"downLeft"]},{"l":[1,1,"downLeft"],"r":[2,1,"downRight"]}]},{"id":"compound_14","name":"Flow 14","difficulty":"medium","beatSpan":1,"steps":[{"l":[1,0,"up"],"r":[2,0,"up"]},{"l":[1,1,"up"],"r":[2,1,"up"]},{"l":[1,2,"up"],"r":[2,2,"up"]}]},{"id":"compound_15","name":"Flow 15","difficulty":"medium","beatSpan":1,"steps":[{"l":[0,0,"upRight"],"r":[3,0,"upLeft"]},{"l":[1,1,"upRight"],"r":[2,1,"upLeft"]}]},{"id":"compound_16","name":"Flow 16","difficulty":"medium","beatSpan":1,"steps":[{"l":[0,2,"downRight"],"r":[3,2,"downLeft"]},{"l":[1,1,"down"],"r":[2,1,"down"]},{"l":[1,0,"down"],"r":[2,0,"down"]}]},{"id":"compound_17","name":"Flow 17","difficulty":"medium","beatSpan":1,"steps":[{"l":[1,2,"downLeft"],"r":[2,2,"downRight"]},{"l":[0,1,"down"],"r":[3,1,"down"]},{"l":[0,0,"down"],"r":[3,0,"down"]}]},{"id":"compound_18","name":"Flow 18","difficulty":"medium","beatSpan":1,"steps":[{"l":[0,0,"upRight"],"r":[3,0,"upLeft"]},{"l":[1,1,"up"],"r":[2,1,"up"]},{"l":[1,2,"up"],"r":[2,2,"up"]}]},{"id":"compound_19","name":"Flow 19","difficulty":"medium","beatSpan":1,"steps":[{"l":[1,0,"upLeft"],"r":[2,0,"upRight"]},{"l":[0,1,"up"],"r":[3,1,"up"]},{"l":[0,2,"up"],"r":[3,2,"up"]}]}];\n'
flow_match=re.search(r'(const FLOW_PATTERNS=\[.*?\];\n)',text)
if not flow_match:
    raise RuntimeError("FLOW_PATTERNS block not found")
if "const COMPOUND_FLOW_PATTERNS=" not in text:
    text=text[:flow_match.end()]+compound+text[flow_match.end():]

old_choose=re.search(
    r'function chooseDirections\(pattern,previous,eventSeed,time\)\{.*?\n\}',
    text,
    flags=re.S
)
if not old_choose:
    raise RuntimeError("chooseDirections block not found")
text=text[:old_choose.start()]+'function chooseDirections(\n  pattern,\n  previous,\n  eventSeed,\n  time,\n  boundaryTargets=null\n){\n  const safePattern=ergonomicPattern(pattern);\n  const leftOptions=candidateDirections(\n    "left",\n    safePattern.l,\n    safePattern.r,\n    safePattern.l[2]\n  );\n  const rightOptions=candidateDirections(\n    "right",\n    safePattern.r,\n    safePattern.l,\n    safePattern.r[2]\n  );\n\n  let best=null;\n  for(const leftDirection of leftOptions){\n    for(const rightDirection of rightOptions){\n      let score=\n        parityPenalty(previous.left,leftDirection,time)+\n        parityPenalty(previous.right,rightDirection,time)+\n        handComfortPenalty("left",safePattern.l,leftDirection)+\n        handComfortPenalty("right",safePattern.r,rightDirection)+\n        travelPenalty(previous.left,safePattern.l,leftDirection)+\n        travelPenalty(previous.right,safePattern.r,rightDirection)+\n        pairComfortPenalty(\n          safePattern.l,\n          safePattern.r,\n          leftDirection,\n          rightDirection\n        )+\n        boundaryTargetPenalty(\n          boundaryTargets?.left,\n          leftDirection\n        )+\n        boundaryTargetPenalty(\n          boundaryTargets?.right,\n          rightDirection\n        );\n\n      score+=(\n        hashString(\n          `${eventSeed}|${leftDirection}|${rightDirection}`\n        )%1000\n      )/1e6;\n\n      if(!best||score<best.score){\n        best={\n          pattern:safePattern,\n          leftDirection,\n          rightDirection,\n          score\n        };\n      }\n    }\n  }\n  return best;\n}\n\nconst OPPOSITE_DIRECTION={\n  up:"down",\n  down:"up",\n  left:"right",\n  right:"left",\n  upLeft:"downRight",\n  upRight:"downLeft",\n  downLeft:"upRight",\n  downRight:"upLeft"\n};\n\nfunction oppositeDirection(direction){\n  return OPPOSITE_DIRECTION[direction]||"down";\n}\n\nfunction boundaryTargetPenalty(target,direction){\n  if(!target)return 0;\n  const error=angleDistance(CUT[target].deg,CUT[direction].deg);\n  return direction===target?-8:18+error/4;\n}\n\nfunction normalFallbackForCompound(pattern,seed,config,cluster,index){\n  const pool=FLOW_PATTERNS.filter(\n    candidate=>candidate.difficulty===pattern.difficulty\n  );\n  return pool[\n    hashString(\n      `${seed}|${config.id}|${cluster}|${index}|compound-fallback`\n    )%pool.length\n  ];\n}\n\nfunction compoundFlowWindow(segments,index,pattern,duration){\n  const span=Math.max(1,pattern.beatSpan||1);\n  const endSegment=segments[index+span];\n  if(!endSegment)return null;\n\n  const start=segments[index].start;\n  const end=Math.min(duration-.02,endSegment.start);\n  const total=end-start;\n  if(total<=0)return null;\n\n  const spacing=total/pattern.steps.length;\n  // Do not squeeze dense explicit streams into unreadably tiny gaps.\n  if(spacing<.055)return null;\n\n  return {start,end,total,spacing,span};\n}\n\nfunction retunePreviousForCompound(\n  generatedNotes,\n  previous,\n  firstStep,\n  startTime\n){\n  const hands=[\n    {key:"left",type:0,step:firstStep.l},\n    {key:"right",type:1,step:firstStep.r}\n  ];\n\n  for(const hand of hands){\n    if(!hand.step)continue;\n    const target=oppositeDirection(hand.step[2]);\n\n    for(let i=generatedNotes.length-1;i>=0;i--){\n      const note=generatedNotes[i];\n      if(note.type!==hand.type||note.time>=startTime-.0001)continue;\n      if(note.compoundFlow)break;\n\n      note.cutDirection=CUT[target].code;\n      if(previous[hand.key])previous[hand.key].direction=target;\n      break;\n    }\n  }\n}' + text[old_choose.end():]

replace_once(
    'const pool=FLOW_PATTERNS.filter(\n'
    '      pattern=>pattern.difficulty===bestTier\n'
    '    );',
    'const pool=[...FLOW_PATTERNS,...COMPOUND_FLOW_PATTERNS].filter(\n'
    '      pattern=>pattern.difficulty===bestTier\n'
    '    );',
    "signature flow pool"
)

build_start=text.index(
    "function buildBeatmap(result,seed,config,lightingEvents,featureOptions)"
)
loop_start=text.index(
    "  for(let i=0;i<segments.length;i++){",
    build_start
)
sort_start=text.index("  generatedNotes.sort",loop_start)
text=text[:loop_start]+'  let lastWasCompound=false;\n  let boundaryTargets={left:null,right:null};\n\n  for(let i=0;i<segments.length;i++){\n    const segment=segments[i];\n    const cluster=Number.isFinite(segment.cluster)\n      ?segment.cluster\n      :i;\n    const assignedPattern=assignments.get(cluster);\n    let pattern=assignedPattern;\n    let compoundWindow=null;\n\n    if(pattern?.steps){\n      compoundWindow=compoundFlowWindow(\n        segments,\n        i,\n        pattern,\n        result.duration\n      );\n\n      // Keep explicit streams separated by at least one ordinary flow so the\n      // exit reversal from one stream can become the entry reversal of the next.\n      if(lastWasCompound||!compoundWindow){\n        pattern=normalFallbackForCompound(\n          assignedPattern,\n          seed,\n          config,\n          cluster,\n          i\n        );\n        compoundWindow=null;\n      }\n    }\n\n    if(pattern.steps){\n      const firstStep=pattern.steps[0];\n      retunePreviousForCompound(\n        generatedNotes,\n        previous,\n        firstStep,\n        compoundWindow.start\n      );\n\n      for(\n        let stepIndex=0;\n        stepIndex<pattern.steps.length;\n        stepIndex++\n      ){\n        const step=pattern.steps[stepIndex];\n        const time=+(\n          compoundWindow.start+\n          compoundWindow.spacing*stepIndex\n        ).toFixed(4);\n        const eventIndex=\n          i+\n          compoundWindow.span*\n          stepIndex/\n          pattern.steps.length;\n\n        if(step.l){\n          generatedNotes.push({\n            eventIndex,\n            time,\n            lineIndex:step.l[0],\n            lineLayer:step.l[1],\n            type:0,\n            cutDirection:CUT[step.l[2]].code,\n            flowDifficulty:pattern.difficulty,\n            segment,\n            compoundFlow:pattern.id,\n            compoundStep:stepIndex\n          });\n        }\n\n        if(step.r){\n          generatedNotes.push({\n            eventIndex,\n            time,\n            lineIndex:step.r[0],\n            lineLayer:step.r[1],\n            type:1,\n            cutDirection:CUT[step.r[2]].code,\n            flowDifficulty:pattern.difficulty,\n            segment,\n            compoundFlow:pattern.id,\n            compoundStep:stepIndex\n          });\n        }\n      }\n\n      const lastStep=pattern.steps[pattern.steps.length-1];\n      const lastTime=+(\n        compoundWindow.start+\n        compoundWindow.spacing*(pattern.steps.length-1)\n      ).toFixed(4);\n\n      if(lastStep.l){\n        previous.left={\n          column:lastStep.l[0],\n          row:lastStep.l[1],\n          direction:lastStep.l[2],\n          time:lastTime\n        };\n        boundaryTargets.left=oppositeDirection(lastStep.l[2]);\n      }\n\n      if(lastStep.r){\n        previous.right={\n          column:lastStep.r[0],\n          row:lastStep.r[1],\n          direction:lastStep.r[2],\n          time:lastTime\n        };\n        boundaryTargets.right=oppositeDirection(lastStep.r[2]);\n      }\n\n      flowCounts.set(\n        pattern.id,\n        (flowCounts.get(pattern.id)||0)+1\n      );\n      flowTierCounts[pattern.difficulty]++;\n      lastWasCompound=true;\n\n      // A two-beat compound flow owns the intermediate detected event.\n      i+=compoundWindow.span-1;\n      continue;\n    }\n\n    const time=+segment.start.toFixed(4);\n    const chosen=chooseDirections(\n      pattern,\n      previous,\n      `${seed}|${config.id}|${cluster}|${i}`,\n      time,\n      boundaryTargets\n    );\n    boundaryTargets={left:null,right:null};\n\n    const safePattern=chosen.pattern;\n    generatedNotes.push({\n      eventIndex:i,\n      time,\n      lineIndex:safePattern.l[0],\n      lineLayer:safePattern.l[1],\n      type:0,\n      cutDirection:CUT[chosen.leftDirection].code,\n      flowDifficulty:pattern.difficulty,\n      segment\n    });\n    generatedNotes.push({\n      eventIndex:i,\n      time,\n      lineIndex:safePattern.r[0],\n      lineLayer:safePattern.r[1],\n      type:1,\n      cutDirection:CUT[chosen.rightDirection].code,\n      flowDifficulty:pattern.difficulty,\n      segment\n    });\n\n    previous.left={\n      column:safePattern.l[0],\n      row:safePattern.l[1],\n      direction:chosen.leftDirection,\n      time\n    };\n    previous.right={\n      column:safePattern.r[0],\n      row:safePattern.r[1],\n      direction:chosen.rightDirection,\n      time\n    };\n\n    flowCounts.set(\n      pattern.id,\n      (flowCounts.get(pattern.id)||0)+1\n    );\n    flowTierCounts[pattern.difficulty]++;\n    lastWasCompound=false;\n  }'+'\n\n'+text[sort_start:]

replace_once(
    '_flowPatternCount:FLOW_PATTERNS.length',
    '_flowPatternCount:\n'
    '          FLOW_PATTERNS.length+COMPOUND_FLOW_PATTERNS.length',
    "flow pattern count"
)

required=[
    "compound_05",
    "compound_06",
    "compound_13",
    "compound_14",
    "compound_15",
    "compound_16",
    "compound_17",
    "compound_18",
    "compound_19",
    "compoundFlowWindow",
    "boundaryTargetPenalty"
]
for token in required:
    if token not in text:
        raise RuntimeError(f"missing {token} after patch")

path.write_text(text,encoding="utf-8")

scripts=re.findall(
    r'<script[^>]*type="module"[^>]*>(.*?)</script>',
    text,
    flags=re.S
)
if not scripts:
    raise RuntimeError("module script not found for syntax check")

with tempfile.NamedTemporaryFile(
    "w",
    suffix=".mjs",
    delete=False,
    encoding="utf-8"
) as handle:
    handle.write(scripts[-1])
    check_path=handle.name

subprocess.run(["node","--check",check_path],check=True)
print("Compound flows inserted and JavaScript syntax check passed.")
