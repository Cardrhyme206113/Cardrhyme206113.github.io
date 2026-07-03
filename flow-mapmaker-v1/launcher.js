import {EXCLUSIVE_FLOW_LIBRARY} from "./flow-library-data.js";

const COPY_VERSION="1.0.0";
const SOURCE_URL="./mapmaker.html";
const ERROR_STYLE="max-width:980px;padding:24px;color:#ff8293;background:#111;white-space:pre-wrap;font:13px/1.5 ui-monospace,monospace";

function fail(message,error){
  console.error(message,error);
  document.body.innerHTML=`<pre style="${ERROR_STYLE}">${message}\n\n${String(error?.stack||error||"")}</pre>`;
}

function replaceRequired(source,label,search,replacement){
  const next=source.replace(search,replacement);
  if(next===source)throw new Error(`Patch target missing: ${label}`);
  return next;
}

(async()=>{
  const response=await fetch(`${SOURCE_URL}?copy=${COPY_VERSION}`,{cache:"no-store"});
  if(!response.ok)throw new Error(`Copied mapmaker fetch failed (${response.status})`);
  let source=await response.text();

  source=replaceRequired(source,"document title","<title>Simplified Sabers</title>",`<title>Simplified Sabers · Flow Library Edition v${COPY_VERSION}</title>`);
  source=replaceRequired(source,"logo library link",'href="./simbers-flow-library.html" aria-label="Open the original 30-flow library" title="Open flow library"','href="./flow-library.html" aria-label="Open the expanded flow library" title="Open expanded flow library"');
  source=replaceRequired(source,"heading","<h1>Simplified Sabers</h1>",`<h1>Simplified Sabers <small style="font-size:.34em;color:#7db9ff;white-space:nowrap">FLOW COPY v${COPY_VERSION}</small></h1>`);
  source=replaceRequired(source,"subtitle","Upload a song and create a complete five-difficulty Beat Saber map.",`Upload a song and generate five difficulties using the original 30 classics plus ${EXCLUSIVE_FLOW_LIBRARY.flowCount} multi-beat flows / ${EXCLUSIVE_FLOW_LIBRARY.variantCount} safe alternatives.`);

  const flowDeclaration=/const FLOW_PATTERNS=\[[\s\S]*?\];/;
  if(!flowDeclaration.test(source))throw new Error("Base FLOW_PATTERNS declaration missing.");
  source=source.replace(flowDeclaration,match=>`${match}
const EXCLUSIVE_FLOW_LIBRARY=${JSON.stringify(EXCLUSIVE_FLOW_LIBRARY)};
const SEQUENCE_FLOW_PATTERNS=EXCLUSIVE_FLOW_LIBRARY.flows.map(flow=>({
  id:flow.id,
  name:flow.name,
  sourceName:flow.sourceName,
  difficulty:flow.difficulty,
  kind:"sequence",
  added:flow.added,
  variants:flow.variants
}));
`);

  const oldPool=`    const pool=FLOW_PATTERNS.filter(
      pattern=>pattern.difficulty===bestTier
    );
    const chosen=pool[
      hashString(
        \`${seed}|${config.id}|${item.signature}|${bestTier}|flow\`
      )%pool.length
    ];`;

  const newPool=`    const classicPool=FLOW_PATTERNS.filter(
      pattern=>pattern.difficulty===bestTier
    );
    const sequencePool=SEQUENCE_FLOW_PATTERNS.filter(
      pattern=>pattern.difficulty===bestTier
    );
    const sequenceChance=(
      config.id==="expertPlus"?.46:
      config.id==="expert"?.38:
      config.id==="hard"?.31:
      config.id==="medium"?.23:.14
    );
    const sequenceRoll=hashString(
      \`${seed}|${config.id}|${item.signature}|${bestTier}|sequence-roll\`
    )/4294967296;
    const pool=(
      sequencePool.length&&sequenceRoll<sequenceChance
    )?sequencePool:classicPool;
    const chosen=pool[
      hashString(
        \`${seed}|${config.id}|${item.signature}|${bestTier}|flow\`
      )%pool.length
    ];`;
  source=replaceRequired(source,"sequence selection pool",oldPool,newPool);

  const helpers=String.raw`
function directArrowDifference(firstDirection,secondDirection){
  return angleDistance(CUT[firstDirection].deg,CUT[secondDirection].deg);
}
function wristResetDegrees(previousDirection,nextDirection){
  return angleDistance((CUT[previousDirection].deg+180)%360,CUT[nextDirection].deg);
}
function sequenceCutTravel(previous,note){
  const previousCut=CUT[previous.direction],nextCut=CUT[note.direction];
  const previousEndX=previous.column+previousCut.dx*.72,previousEndY=previous.row+previousCut.dy*.72;
  const nextStartX=note.x-nextCut.dx*.72,nextStartY=note.y-nextCut.dy*.72;
  return Math.hypot(nextStartX-previousEndX,nextStartY-previousEndY);
}
function sequenceInternalSafe(variant){
  const previous={left:null,right:null};
  for(let beatIndex=0;beatIndex<variant.beats.length;beatIndex++){
    const beat=variant.beats[beatIndex],left=beat.left,right=beat.right;
    if(left&&right){
      if(left.x===right.x&&left.y===right.y)return false;
      if(left.x>right.x)return false;
      const leftCut=CUT[left.direction],rightCut=CUT[right.direction];
      const close=Math.abs(left.x-right.x)<=1&&Math.abs(left.y-right.y)<=1;
      const outward=leftCut.dx<-.25&&rightCut.dx>.25;
      if(close&&outward)return false;
    }
    for(const [hand,note] of [["left",left],["right",right]]){
      if(!note)continue;
      const last=previous[hand];
      if(last){
        const beatGap=Math.max(1,beatIndex-last.beatIndex);
        if(wristResetDegrees(last.direction,note.direction)>90.001)return false;
        if(sequenceCutTravel(last,note)>1.60*beatGap+.001)return false;
      }
      previous[hand]={column:note.x,row:note.y,direction:note.direction,beatIndex};
    }
  }
  return true;
}
function firstSequenceNote(variant,hand){
  for(let beatIndex=0;beatIndex<variant.beats.length;beatIndex++){
    const note=variant.beats[beatIndex][hand];
    if(note)return {note,beatIndex};
  }
  return null;
}
function sequenceWindowSafe(variant,segments,startIndex,previous,config){
  if(startIndex+variant.beats.length>segments.length)return null;
  if(!sequenceInternalSafe(variant))return null;
  for(let offset=1;offset<variant.beats.length;offset++){
    const gap=segments[startIndex+offset].start-segments[startIndex+offset-1].start;
    if(gap<Math.max(.115,config.minimumGapMs/1000*.82))return null;
  }
  let score=0;
  for(const hand of ["left","right"]){
    const first=firstSequenceNote(variant,hand),last=previous[hand];
    if(!first||!last)continue;
    const reset=wristResetDegrees(last.direction,first.note.direction),travel=sequenceCutTravel(last,first.note);
    const gap=segments[startIndex+first.beatIndex].start-last.time;
    const travelAllowance=1.60*Math.max(1,gap/.28);
    if(reset>90.001||travel>travelAllowance+.001)return null;
    score+=reset/90+travel*.62;
  }
  return score;
}
function chooseSequenceVariant(pattern,previous,segments,startIndex,seed,config){
  const candidates=[];
  for(let index=0;index<pattern.variants.length;index++){
    const variant=pattern.variants[index];
    const score=sequenceWindowSafe(variant,segments,startIndex,previous,config);
    if(score===null)continue;
    candidates.push({variant,score:score+(hashString(\`${seed}|${pattern.id}|${index}|variant-tie\`)%1000)/1000000});
  }
  candidates.sort((a,b)=>a.score-b.score);
  return candidates[0]?.variant||null;
}
function classicFallbackPattern(difficulty,seed){
  const pool=FLOW_PATTERNS.filter(pattern=>pattern.difficulty===difficulty);
  return pool[hashString(seed)%pool.length];
}
function placeSequenceVariant({variant,pattern,segments,startIndex,generatedNotes,previous,config}){
  for(let offset=0;offset<variant.beats.length;offset++){
    const beat=variant.beats[offset],segment=segments[startIndex+offset],time=+segment.start.toFixed(4);
    for(const [hand,type] of [["left",0],["right",1]]){
      const note=beat[hand];if(!note)continue;
      generatedNotes.push({eventIndex:startIndex+offset,time,lineIndex:note.x,lineLayer:note.y,type,cutDirection:CUT[note.direction].code,flowDifficulty:pattern.difficulty,segment,exclusiveFlowId:pattern.id,exclusiveVariant:variant.name});
      previous[hand]={column:note.x,row:note.y,direction:note.direction,time};
    }
  }
}
`;
  source=replaceRequired(source,"sequence helper insertion","function buildBeatmap(result,seed,config,lightingEvents,featureOptions){",`${helpers}
function buildBeatmap(result,seed,config,lightingEvents,featureOptions){`);

  const buildStart=source.indexOf("function buildBeatmap(result,seed,config,lightingEvents,featureOptions){");
  const loopStart=source.indexOf("  for(let i=0;i<segments.length;i++){",buildStart);
  const loopEnd=source.indexOf("\n\n  generatedNotes.sort(",loopStart);
  if(buildStart<0||loopStart<0||loopEnd<0)throw new Error("Could not isolate the map generation loop.");

  const newLoop=String.raw`  for(let i=0;i<segments.length;i++){
    const segment=segments[i];
    const cluster=Number.isFinite(segment.cluster)?segment.cluster:i;
    const assignedPattern=assignments.get(cluster);
    if(assignedPattern?.kind==="sequence"){
      const variant=chooseSequenceVariant(assignedPattern,previous,segments,i,\`${seed}|${config.id}|${cluster}|${i}\`,config);
      if(variant){
        placeSequenceVariant({variant,pattern:assignedPattern,segments,startIndex:i,generatedNotes,previous,config});
        const flowKey=\`${assignedPattern.id}|${variant.name}\`;
        flowCounts.set(flowKey,(flowCounts.get(flowKey)||0)+1);
        flowTierCounts[assignedPattern.difficulty]+=variant.beats.length;
        i+=variant.beats.length-1;
        continue;
      }
    }
    const pattern=assignedPattern?.kind==="sequence"?classicFallbackPattern(assignedPattern.difficulty,\`${seed}|${config.id}|${cluster}|${i}|fallback\`):assignedPattern;
    const time=+segment.start.toFixed(4);
    const chosen=chooseDirections(pattern,previous,\`${seed}|${config.id}|${cluster}|${i}\`,time);
    const safePattern=chosen.pattern;
    generatedNotes.push({eventIndex:i,time,lineIndex:safePattern.l[0],lineLayer:safePattern.l[1],type:0,cutDirection:CUT[chosen.leftDirection].code,flowDifficulty:pattern.difficulty,segment});
    generatedNotes.push({eventIndex:i,time,lineIndex:safePattern.r[0],lineLayer:safePattern.r[1],type:1,cutDirection:CUT[chosen.rightDirection].code,flowDifficulty:pattern.difficulty,segment});
    previous.left={column:safePattern.l[0],row:safePattern.l[1],direction:chosen.leftDirection,time};
    previous.right={column:safePattern.r[0],row:safePattern.r[1],direction:chosen.rightDirection,time};
    flowCounts.set(pattern.id,(flowCounts.get(pattern.id)||0)+1);
    flowTierCounts[pattern.difficulty]++;
  }`;
  source=source.slice(0,loopStart)+newLoop+source.slice(loopEnd);

  source=replaceRequired(source,"generator metadata",'"Beat Signature Natural Arc Multi-Difficulty HTML"','"Beat Signature Flow Library Copy v1.0.0"');
  source=replaceRequired(source,"library metadata","_minimumEventGapMs:config.minimumGapMs,",`_minimumEventGapMs:config.minimumGapMs,
        _exclusiveFlowLibraryVersion:"${EXCLUSIVE_FLOW_LIBRARY.version}",
        _exclusiveFlowCount:${EXCLUSIVE_FLOW_LIBRARY.flowCount},
        _exclusiveVariantCount:${EXCLUSIVE_FLOW_LIBRARY.variantCount},`);
  source=source.replace("</body>",`<div id="flowCopyBadge" style="position:fixed;right:8px;top:8px;z-index:9999;padding:5px 7px;border:1px solid #31557d;border-radius:6px;background:rgba(8,17,29,.86);color:#8fc8ff;font:700 9px ui-monospace,monospace;pointer-events:none">FLOW COPY v${COPY_VERSION} · ${EXCLUSIVE_FLOW_LIBRARY.flowCount} FLOWS</div></body>`);

  document.open();document.write(source);document.close();
})().catch(error=>fail(`Flow Mapmaker Copy v${COPY_VERSION} failed to initialize.`,error));
