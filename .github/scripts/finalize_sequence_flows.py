from pathlib import Path
import re

path = Path("simbers.html")
text = path.read_text(encoding="utf-8")


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    text = text.replace(old, new, 1)


# Load the complete uploaded 19-flow library from its own module.
replace_once(
    'import { encodeOggVorbis } from "./simbers-ogg-encoder.js";',
    'import { encodeOggVorbis } from "./simbers-ogg-encoder.js";\n'
    'import { SEQUENCE_FLOW_PATTERNS } from "./simbers-flow-library.js";',
    "flow library import",
)

# Remove the temporary inline subset (flows 5, 6, and 13-19).
text, count = re.subn(
    r'\nconst COMPOUND_FLOW_PATTERNS=\[.*?\];\n',
    '\n',
    text,
    count=1,
    flags=re.S,
)
if count != 1:
    raise RuntimeError(f"inline compound flow removal: expected one match, found {count}")

# Adapt the external module's spanBeats property to the existing generator name.
flow_declaration = re.search(r'const FLOW_PATTERNS=\[.*?\];\n', text, flags=re.S)
if not flow_declaration:
    raise RuntimeError("base FLOW_PATTERNS declaration not found")
external_declaration = '''
const COMPOUND_FLOW_PATTERNS=SEQUENCE_FLOW_PATTERNS.map(flow=>({
  ...flow,
  beatSpan:flow.spanBeats
}));
'''
text = (
    text[:flow_declaration.end()]
    + external_declaration
    + text[flow_declaration.end():]
)

# Exact boundary parity: after an explicit flow, the next normal swing for
# each hand is forced to the reverse cut direction rather than merely scored
# as a preference.
replace_once(
    '''  const leftOptions=candidateDirections(
    "left",
    safePattern.l,
    safePattern.r,
    safePattern.l[2]
  );
  const rightOptions=candidateDirections(
    "right",
    safePattern.r,
    safePattern.l,
    safePattern.r[2]
  );

  let best=null;''',
    '''  let leftOptions=candidateDirections(
    "left",
    safePattern.l,
    safePattern.r,
    safePattern.l[2]
  );
  let rightOptions=candidateDirections(
    "right",
    safePattern.r,
    safePattern.l,
    safePattern.r[2]
  );

  if(boundaryTargets?.left){
    leftOptions=[boundaryTargets.left];
  }
  if(boundaryTargets?.right){
    rightOptions=[boundaryTargets.right];
  }

  let best=null;''',
    "exact post-flow reverse",
)

# Find the first/last explicit note for each hand. This matters for flows 7
# and 11, where one hand enters or exits earlier than the other.
old_retune = '''function retunePreviousForCompound(
  generatedNotes,
  previous,
  firstStep,
  startTime
){
  const hands=[
    {key:"left",type:0,step:firstStep.l},
    {key:"right",type:1,step:firstStep.r}
  ];

  for(const hand of hands){
    if(!hand.step)continue;
    const target=oppositeDirection(hand.step[2]);

    for(let i=generatedNotes.length-1;i>=0;i--){
      const note=generatedNotes[i];
      if(note.type!==hand.type||note.time>=startTime-.0001)continue;
      if(note.compoundFlow)break;

      note.cutDirection=CUT[target].code;
      if(previous[hand.key])previous[hand.key].direction=target;
      break;
    }
  }
}'''
new_retune = '''function explicitHandStep(steps,key,fromEnd=false){
  if(fromEnd){
    for(let i=steps.length-1;i>=0;i--){
      if(steps[i][key])return {note:steps[i][key],index:i};
    }
    return null;
  }

  for(let i=0;i<steps.length;i++){
    if(steps[i][key])return {note:steps[i][key],index:i};
  }
  return null;
}

function retunePreviousForCompound(
  generatedNotes,
  previous,
  steps,
  startTime
){
  const hands=[
    {key:"left",type:0,step:explicitHandStep(steps,"l")},
    {key:"right",type:1,step:explicitHandStep(steps,"r")}
  ];

  for(const hand of hands){
    if(!hand.step)continue;
    const target=oppositeDirection(hand.step.note[2]);

    for(let i=generatedNotes.length-1;i>=0;i--){
      const note=generatedNotes[i];
      if(note.type!==hand.type||note.time>=startTime-.0001)continue;
      if(note.compoundFlow)break;

      note.cutDirection=CUT[target].code;
      if(previous[hand.key])previous[hand.key].direction=target;
      break;
    }
  }
}'''
replace_once(old_retune, new_retune, "per-hand compound entry")

replace_once(
    '''      const firstStep=pattern.steps[0];
      retunePreviousForCompound(
        generatedNotes,
        previous,
        firstStep,
        compoundWindow.start
      );''',
    '''      retunePreviousForCompound(
        generatedNotes,
        previous,
        pattern.steps,
        compoundWindow.start
      );''',
    "compound entry call",
)

# Apply exact reverse exits independently for both hands, using each hand's
# actual final note instead of assuming both exist in the final sequence step.
old_exit = '''      const lastStep=pattern.steps[pattern.steps.length-1];
      const lastTime=+(
        compoundWindow.start+
        compoundWindow.spacing*(pattern.steps.length-1)
      ).toFixed(4);

      if(lastStep.l){
        previous.left={
          column:lastStep.l[0],
          row:lastStep.l[1],
          direction:lastStep.l[2],
          time:lastTime
        };
        boundaryTargets.left=oppositeDirection(lastStep.l[2]);
      }

      if(lastStep.r){
        previous.right={
          column:lastStep.r[0],
          row:lastStep.r[1],
          direction:lastStep.r[2],
          time:lastTime
        };
        boundaryTargets.right=oppositeDirection(lastStep.r[2]);
      }'''
new_exit = '''      const leftExit=explicitHandStep(pattern.steps,"l",true);
      const rightExit=explicitHandStep(pattern.steps,"r",true);

      if(leftExit){
        const lastTime=+(
          compoundWindow.start+
          compoundWindow.spacing*leftExit.index
        ).toFixed(4);
        previous.left={
          column:leftExit.note[0],
          row:leftExit.note[1],
          direction:leftExit.note[2],
          time:lastTime
        };
        boundaryTargets.left=oppositeDirection(leftExit.note[2]);
      }

      if(rightExit){
        const lastTime=+(
          compoundWindow.start+
          compoundWindow.spacing*rightExit.index
        ).toFixed(4);
        previous.right={
          column:rightExit.note[0],
          row:rightExit.note[1],
          direction:rightExit.note[2],
          time:lastTime
        };
        boundaryTargets.right=oppositeDirection(rightExit.note[2]);
      }'''
replace_once(old_exit, new_exit, "per-hand compound exit")

# Add clear generation metadata for the expanded library and parity rule.
replace_once(
    '''        _flowPatternCount:
          FLOW_PATTERNS.length+COMPOUND_FLOW_PATTERNS.length''',
    '''        _flowPatternCount:
          FLOW_PATTERNS.length+COMPOUND_FLOW_PATTERNS.length,
        _compoundFlowPatternCount:COMPOUND_FLOW_PATTERNS.length,
        _compoundFlowBoundaryRule:
          "exact reverse cuts immediately before and after explicit flows"''',
    "compound flow metadata",
)

required = [
    'import { SEQUENCE_FLOW_PATTERNS }',
    'COMPOUND_FLOW_PATTERNS=SEQUENCE_FLOW_PATTERNS.map',
    'leftOptions=[boundaryTargets.left]',
    'rightOptions=[boundaryTargets.right]',
    'explicitHandStep(pattern.steps,"l",true)',
    'explicitHandStep(pattern.steps,"r",true)',
    '_compoundFlowPatternCount:COMPOUND_FLOW_PATTERNS.length',
]
for token in required:
    if token not in text:
        raise RuntimeError(f"missing required final code: {token}")

if 'const COMPOUND_FLOW_PATTERNS=[{' in text:
    raise RuntimeError("inline compound flow subset still exists")

path.write_text(text, encoding="utf-8")
print("Integrated all 19 external sequence flows with exact per-hand reverse boundaries.")
