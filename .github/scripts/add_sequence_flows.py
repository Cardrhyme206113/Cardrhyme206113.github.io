from pathlib import Path
import re

path=Path('simbers.html')
text=path.read_text(encoding='utf-8')

# Import the separate built-in sequence library beside the encoder module.
old_import='import { encodeOggVorbis } from "./simbers-ogg-encoder.js";'
new_import='''import { encodeOggVorbis } from "./simbers-ogg-encoder.js";
import { SEQUENCE_FLOW_PATTERNS } from "./simbers-flow-library.js";'''
if old_import not in text:
    raise SystemExit('Main module import marker not found')
text=text.replace(old_import,new_import,1)

# Keep the original 30 single-event patterns, then append the 19 uploaded
# explicit sequence flows to the same built-in selection pool.
if 'const FLOW_PATTERNS=[' not in text:
    raise SystemExit('FLOW_PATTERNS declaration not found')
text=text.replace('const FLOW_PATTERNS=[','const BASE_FLOW_PATTERNS=[',1)
marker='];\n\nconst AXIS_DIRECTIONS={'
replacement='''];

const FLOW_PATTERNS=[
  ...BASE_FLOW_PATTERNS,
  ...SEQUENCE_FLOW_PATTERNS
];

const AXIS_DIRECTIONS={'''
if marker not in text:
    raise SystemExit('Pattern/axis insertion marker not found')
text=text.replace(marker,replacement,1)

cut_marker='''const CUT={
  up:{code:0,deg:0,dx:0,dy:1},
  down:{code:1,deg:180,dx:0,dy:-1},
  left:{code:2,deg:270,dx:-1,dy:0},
  right:{code:3,deg:90,dx:1,dy:0},
  upLeft:{code:4,deg:315,dx:-.707,dy:.707},
  upRight:{code:5,deg:45,dx:.707,dy:.707},
  downLeft:{code:6,deg:225,dx:-.707,dy:-.707},
  downRight:{code:7,deg:135,dx:.707,dy:-.707}
};'''
cut_replacement=cut_marker+'''

const REVERSE_DIRECTIONS={
  up:"down",
  down:"up",
  left:"right",
  right:"left",
  upLeft:"downRight",
  downRight:"upLeft",
  upRight:"downLeft",
  downLeft:"upRight"
};

const DIRECTION_AXES={
  up:"V",down:"V",
  left:"H",right:"H",
  upLeft:"D1",downRight:"D1",
  upRight:"D2",downLeft:"D2"
};'''
if cut_marker not in text:
    raise SystemExit('CUT declaration not found')
text=text.replace(cut_marker,cut_replacement,1)

old_choose='''function chooseDirections(pattern,previous,eventSeed,time){
  const safePattern=ergonomicPattern(pattern);
  const leftOptions=candidateDirections("left",safePattern.l,safePattern.r,safePattern.l[2]);
  const rightOptions=candidateDirections("right",safePattern.r,safePattern.l,safePattern.r[2]);
  let best=null;
  for(const leftDirection of leftOptions)for(const rightDirection of rightOptions){
    let score=parityPenalty(previous.left,leftDirection,time)+parityPenalty(previous.right,rightDirection,time)+handComfortPenalty("left",safePattern.l,leftDirection)+handComfortPenalty("right",safePattern.r,rightDirection)+travelPenalty(previous.left,safePattern.l,leftDirection)+travelPenalty(previous.right,safePattern.r,rightDirection)+pairComfortPenalty(safePattern.l,safePattern.r,leftDirection,rightDirection);
    score+=(hashString(`${eventSeed}|${leftDirection}|${rightDirection}`)%1000)/1e6;
    if(!best||score<best.score)best={pattern:safePattern,leftDirection,rightDirection,score};
  }
  return best;
}'''
new_choose='''function requiredReverseDirection(previousHand){
  if(!previousHand?.forceReverseNext)return null;
  return REVERSE_DIRECTIONS[previousHand.direction]||null;
}

function chooseDirections(pattern,previous,eventSeed,time){
  const safePattern=ergonomicPattern(pattern);
  let leftOptions=candidateDirections(
    "left",safePattern.l,safePattern.r,safePattern.l[2]
  );
  let rightOptions=candidateDirections(
    "right",safePattern.r,safePattern.l,safePattern.r[2]
  );

  // A sequence flow has fixed directions. Its first and following outside
  // swings must be exact parity returns, not merely soft preferences.
  const forcedLeft=requiredReverseDirection(previous.left);
  const forcedRight=requiredReverseDirection(previous.right);
  if(forcedLeft){
    leftOptions=leftOptions.includes(forcedLeft)?[forcedLeft]:[];
  }
  if(forcedRight){
    rightOptions=rightOptions.includes(forcedRight)?[forcedRight]:[];
  }
  if(!leftOptions.length||!rightOptions.length)return null;

  let best=null;
  for(const leftDirection of leftOptions){
    for(const rightDirection of rightOptions){
      let score=
        parityPenalty(previous.left,leftDirection,time)+
        parityPenalty(previous.right,rightDirection,time)+
        handComfortPenalty("left",safePattern.l,leftDirection)+
        handComfortPenalty("right",safePattern.r,rightDirection)+
        travelPenalty(previous.left,safePattern.l,leftDirection)+
        travelPenalty(previous.right,safePattern.r,rightDirection)+
        pairComfortPenalty(
          safePattern.l,safePattern.r,leftDirection,rightDirection
        );
      score+=(hashString(
        `${eventSeed}|${leftDirection}|${rightDirection}`
      )%1000)/1e6;
      if(!best||score<best.score){
        best={pattern:safePattern,leftDirection,rightDirection,score};
      }
    }
  }
  return best;
}

function firstSequenceDirection(pattern,key){
  for(const step of pattern.steps||[]){
    if(step[key])return step[key][2];
  }
  return null;
}

function sequenceEntryIsParitySafe(pattern,previous){
  for(const [key,hand] of [["l","left"],["r","right"]]){
    const firstDirection=firstSequenceDirection(pattern,key);
    const previousHand=previous[hand];
    if(!firstDirection||!previousHand)continue;
    if(firstDirection!==REVERSE_DIRECTIONS[previousHand.direction]){
      return false;
    }
  }
  return true;
}

function flowBeatTime(segments,startIndex,beatOffset){
  const whole=Math.floor(beatOffset);
  const fraction=beatOffset-whole;
  const aIndex=Math.min(segments.length-1,startIndex+whole);
  const bIndex=Math.min(segments.length-1,aIndex+1);
  const a=segments[aIndex].start;
  let b=segments[bIndex].start;

  if(bIndex===aIndex){
    const previous=segments[Math.max(0,aIndex-1)];
    b=a+Math.max(.05,a-previous.start);
  }
  return a+(b-a)*fraction;
}

function flowStepSegment(segments,startIndex,beatOffset){
  return segments[
    Math.min(
      segments.length-1,
      startIndex+Math.floor(beatOffset)
    )
  ];
}

function fallbackBasePattern(pattern,eventSeed){
  const pool=BASE_FLOW_PATTERNS.filter(
    candidate=>candidate.difficulty===pattern.difficulty
  );
  return pool[
    hashString(`${eventSeed}|${pattern.id}|base-fallback`)%pool.length
  ];
}

function chooseCompatibleBasePattern(pattern,previous,eventSeed,time){
  const pool=BASE_FLOW_PATTERNS.filter(
    candidate=>candidate.difficulty===pattern.difficulty
  );
  const ordered=[pattern,...pool.filter(candidate=>candidate.id!==pattern.id)]
    .sort((a,b)=>{
      if(a.id===pattern.id)return -1;
      if(b.id===pattern.id)return 1;
      return hashString(`${eventSeed}|${a.id}|boundary-order`)-
        hashString(`${eventSeed}|${b.id}|boundary-order`);
    });

  for(const candidate of ordered){
    const chosen=chooseDirections(
      candidate,previous,`${eventSeed}|${candidate.id}`,time
    );
    if(chosen)return {...chosen,sourcePattern:candidate};
  }

  // Outer-lane bridge guarantees an exact reverse swing even when the
  // assigned pattern's positions reject the required boundary directions.
  const forcedLeft=
    requiredReverseDirection(previous.left)||"down";
  const forcedRight=
    requiredReverseDirection(previous.right)||"down";
  const bridge={
    id:"sequence_boundary_bridge",
    name:"Sequence boundary bridge",
    difficulty:pattern.difficulty,
    l:[0,1,DIRECTION_AXES[forcedLeft]],
    r:[3,1,DIRECTION_AXES[forcedRight]]
  };
  return {
    pattern:ergonomicPattern(bridge),
    leftDirection:forcedLeft,
    rightDirection:forcedRight,
    score:0,
    sourcePattern:pattern
  };
}'''
if old_choose not in text:
    raise SystemExit('chooseDirections block not found')
text=text.replace(old_choose,new_choose,1)

loop_pattern=re.compile(
    r'''  const previous=\{left:null,right:null\};\n'''
    r'''  const generatedNotes=\[\];\n'''
    r'''  const flowCounts=new Map\(\);\n'''
    r'''  const flowTierCounts=\{\n'''
    r'''    easy:0,\n'''
    r'''    medium:0,\n'''
    r'''    hard:0\n'''
    r'''  \};\n\n'''
    r'''  for\(let i=0;i<segments\.length;i\+\+\)\{.*?'''
    r'''    flowTierCounts\[pattern\.difficulty\]\+\+;\n'''
    r'''  \}''',
    re.S
)
new_loop='''  const previous={left:null,right:null};
  const generatedNotes=[];
  const flowCounts=new Map();
  const flowTierCounts={
    easy:0,
    medium:0,
    hard:0
  };
  let nextEventIndex=0;
  let i=0;

  while(i<segments.length){
    const segment=segments[i];
    const cluster=Number.isFinite(segment.cluster)
      ?segment.cluster
      :i;
    const assignedPattern=assignments.get(cluster);
    const eventSeed=`${seed}|${config.id}|${cluster}|${i}`;

    if(assignedPattern.kind==="sequence"){
      const spanBeats=Math.max(
        1,
        Math.round(assignedPattern.spanBeats||assignedPattern.steps.length)
      );
      const hasRoom=i+spanBeats<segments.length;

      if(
        hasRoom&&
        sequenceEntryIsParitySafe(assignedPattern,previous)
      ){
        const lastByHand={left:null,right:null};

        for(
          let stepIndex=0;
          stepIndex<assignedPattern.steps.length;
          stepIndex++
        ){
          const step=assignedPattern.steps[stepIndex];
          const beatOffset=
            stepIndex*spanBeats/assignedPattern.steps.length;
          const time=+flowBeatTime(
            segments,i,beatOffset
          ).toFixed(4);
          const stepSegment=flowStepSegment(
            segments,i,beatOffset
          );
          const eventIndex=nextEventIndex++;

          for(const [key,type,hand] of [
            ["l",0,"left"],
            ["r",1,"right"]
          ]){
            const note=step[key];
            if(!note)continue;
            const [lineIndex,lineLayer,direction]=note;

            generatedNotes.push({
              eventIndex,
              time,
              lineIndex,
              lineLayer,
              type,
              cutDirection:CUT[direction].code,
              flowDifficulty:assignedPattern.difficulty,
              flowId:assignedPattern.id,
              segment:stepSegment
            });
            lastByHand[hand]={
              column:lineIndex,
              row:lineLayer,
              direction,
              time,
              forceReverseNext:true
            };
          }
        }

        if(lastByHand.left)previous.left=lastByHand.left;
        if(lastByHand.right)previous.right=lastByHand.right;

        flowCounts.set(
          assignedPattern.id,
          (flowCounts.get(assignedPattern.id)||0)+1
        );
        flowTierCounts[assignedPattern.difficulty]+=
          assignedPattern.steps.length;
        i+=spanBeats;
        continue;
      }
    }

    const basePattern=assignedPattern.kind==="sequence"
      ?fallbackBasePattern(assignedPattern,eventSeed)
      :assignedPattern;
    const time=+segment.start.toFixed(4);
    const chosen=chooseCompatibleBasePattern(
      basePattern,
      previous,
      eventSeed,
      time
    );
    const safePattern=chosen.pattern;
    const sourcePattern=chosen.sourcePattern||basePattern;
    const eventIndex=nextEventIndex++;

    generatedNotes.push({
      eventIndex,
      time,
      lineIndex:safePattern.l[0],
      lineLayer:safePattern.l[1],
      type:0,
      cutDirection:CUT[chosen.leftDirection].code,
      flowDifficulty:sourcePattern.difficulty,
      flowId:sourcePattern.id,
      segment
    });
    generatedNotes.push({
      eventIndex,
      time,
      lineIndex:safePattern.r[0],
      lineLayer:safePattern.r[1],
      type:1,
      cutDirection:CUT[chosen.rightDirection].code,
      flowDifficulty:sourcePattern.difficulty,
      flowId:sourcePattern.id,
      segment
    });

    previous.left={
      column:safePattern.l[0],
      row:safePattern.l[1],
      direction:chosen.leftDirection,
      time,
      forceReverseNext:false
    };
    previous.right={
      column:safePattern.r[0],
      row:safePattern.r[1],
      direction:chosen.rightDirection,
      time,
      forceReverseNext:false
    };

    flowCounts.set(
      sourcePattern.id,
      (flowCounts.get(sourcePattern.id)||0)+1
    );
    flowTierCounts[sourcePattern.difficulty]++;
    i++;
  }'''
text,count=loop_pattern.subn(new_loop,text,count=1)
if count!=1:
    raise SystemExit(f'Build loop replacement count was {count}')

# Record the expanded library and its strict boundary-parity behavior.
text=text.replace(
    '_flowPatternCount:FLOW_PATTERNS.length',
    '''_flowPatternCount:FLOW_PATTERNS.length,
        _sequenceFlowPatternCount:SEQUENCE_FLOW_PATTERNS.length,
        _sequenceBoundaryRule:
          "explicit flow starts and exits use exact reverse directions"''',
    1
)

# Remove the temporary audit artifacts in the same one-shot commit.
for stale in (
    Path('flow-system-audit.txt'),
    Path('.github/workflows/audit-flow-system.yml')
):
    if stale.exists():stale.unlink()

for required in (
    'SEQUENCE_FLOW_PATTERNS',
    'sequenceEntryIsParitySafe',
    'forceReverseNext:true',
    '_sequenceFlowPatternCount'
):
    if required not in text:
        raise SystemExit(f'Missing sequence-flow code: {required}')

path.write_text(text,encoding='utf-8')
print('Added 19 sequence flows with compressed timing and exact boundary reversals')
