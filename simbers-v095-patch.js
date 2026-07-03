replaceRequired("v0.9.5 middle-outward safety helper",'function pairComfortPenalty(leftNote,rightNote,leftDir,rightDir){',`function forbiddenMiddleOutwardPair(leftNote,rightNote,leftDir,rightDir){
  return Boolean(
    leftNote&&rightNote&&
    leftNote[0]===1&&rightNote[0]===2&&
    leftNote[1]===rightNote[1]&&
    CUT[leftDir].dx<-.5&&CUT[rightDir].dx>.5
  );
}
function compoundHasForbiddenMiddleOutward(pattern){
  const groups=new Map();
  for(let index=0;index<pattern.steps.length;index++){
    const beat=Array.isArray(pattern.stepBeats)?pattern.stepBeats[index]:index;
    if(!groups.has(beat))groups.set(beat,{left:[],right:[]});
    const group=groups.get(beat),step=pattern.steps[index];
    if(step.l)group.left.push(step.l);
    if(step.r)group.right.push(step.r);
  }
  for(const group of groups.values()){
    for(const left of group.left){
      for(const right of group.right){
        if(forbiddenMiddleOutwardPair(left,right,left[2],right[2]))return true;
      }
    }
  }
  return false;
}
function pairComfortPenalty(leftNote,rightNote,leftDir,rightDir){`);

replaceRequired("v0.9.5 forbid middle outward doubles",'function pairComfortPenalty(leftNote,rightNote,leftDir,rightDir){\n  const l=CUT[leftDir],r=CUT[rightDir],separation=rightNote[0]-leftNote[0];let score=0;',`function pairComfortPenalty(leftNote,rightNote,leftDir,rightDir){
  if(forbiddenMiddleOutwardPair(leftNote,rightNote,leftDir,rightDir))return 1e9;
  const l=CUT[leftDir],r=CUT[rightDir],separation=rightNote[0]-leftNote[0];let score=0;`);

replaceRequired("v0.9.5 flow rarity helpers",'function signatureAssignments(segments,seed,config){',`function classicFlowIsDiagonal(pattern){
  if(pattern.steps)return false;
  return [pattern.l?.[2],pattern.r?.[2]].some(axis=>axis==="D1"||axis==="D2");
}
function choosePatternWithRarity(pool,key,config){
  const factor=config.id==="expertPlus"?.5:.2;
  const compounds=pool.filter(pattern=>Boolean(pattern.steps));
  const classics=pool.filter(pattern=>!pattern.steps);
  let selected=pool;

  if(compounds.length&&classics.length){
    const compoundShare=(compounds.length/pool.length)*factor;
    selected=hashString(key+"|new-flow-rarity")/4294967296<compoundShare
      ?compounds
      :classics;
  }

  if(selected.length&&selected.every(pattern=>!pattern.steps)){
    const diagonal=selected.filter(classicFlowIsDiagonal);
    const straight=selected.filter(pattern=>!classicFlowIsDiagonal(pattern));
    if(diagonal.length&&straight.length){
      const diagonalShare=(diagonal.length/selected.length)*factor;
      selected=hashString(key+"|diagonal-rarity")/4294967296<diagonalShare
        ?diagonal
        :straight;
    }
  }

  return selected[hashString(key+"|flow-choice")%selected.length];
}

function signatureAssignments(segments,seed,config){`);

replaceRequired("v0.9.5 reduced pattern selection",/const chosen=pool\[\s*hashString\([\s\S]*?\)%pool\.length\s*\];/,`const chosen=choosePatternWithRarity(
      pool,
      seed+"|"+config.id+"|"+item.signature+"|"+bestTier,
      config
    );`);

replaceRequired("v0.9.5 reduced fallback selection",/function normalFallbackForCompound\(pattern,seed,config,cluster,index\)\{[\s\S]*?\n\}/,`function normalFallbackForCompound(pattern,seed,config,cluster,index){
  const pool=FLOW_PATTERNS.filter(candidate=>candidate.difficulty===pattern.difficulty);
  return choosePatternWithRarity(
    pool,
    seed+"|"+config.id+"|"+cluster+"|"+index+"|compound-fallback",
    config
  );
}`);

replaceRequired("v0.9.5 axis helpers",'function compoundEntryMatchesPrevious(previous,steps){',`function axisDirectionOptions(axis){
  return AXIS_DIRECTIONS[axis]||[axis];
}
function resolveCompoundAxisDirection(axis,previousDirection,key){
  const options=axisDirectionOptions(axis);
  if(options.length===1)return options[0];

  let legal=options;
  if(previousDirection){
    const rotated=options.filter(direction=>
      angleDistance(CUT[direction].deg,CUT[previousDirection].deg)>=89.5
    );
    if(rotated.length)legal=rotated;

    const reverse=oppositeDirection(previousDirection);
    if(legal.includes(reverse))return reverse;
  }

  return legal[hashString(key)%legal.length];
}
function resolveCompoundAxes(pattern,previous,key){
  const hasFlexibleAxis=pattern.steps.some(step=>
    ["l","r"].some(hand=>step[hand]&&AXIS_DIRECTIONS[step[hand][2]])
  );
  if(!hasFlexibleAxis)return pattern;

  const state={
    left:previous.left?.direction||null,
    right:previous.right?.direction||null
  };
  const beatDirections=new Map();
  const steps=pattern.steps.map((step,index)=>{
    const beat=Array.isArray(pattern.stepBeats)?pattern.stepBeats[index]:index;
    const resolved={};

    for(const [property,stateKey] of [["l","left"],["r","right"]]){
      const note=step[property];
      if(!note)continue;
      const axis=note[2];
      const options=axisDirectionOptions(axis);
      let direction=axis;

      if(options.length>1){
        const cacheKey=beat+"|"+property+"|"+axis;
        direction=beatDirections.get(cacheKey);
        if(!direction){
          direction=resolveCompoundAxisDirection(axis,state[stateKey],key+"|"+cacheKey);
          beatDirections.set(cacheKey,direction);
        }
      }

      resolved[property]=[note[0],note[1],direction];
      state[stateKey]=direction;
    }

    return resolved;
  });

  return {...pattern,steps};
}

function compoundEntryMatchesPrevious(previous,steps){`);

replaceRequired("v0.9.5 resolve exclusive-flow axes",`    let pattern=assignedPattern;
    let compoundWindow=null;

    if(pattern?.steps){`,`    let pattern=assignedPattern;
    let compoundWindow=null;

    if(pattern?.steps){
      pattern=resolveCompoundAxes(
        pattern,
        previous,
        seed+"|"+config.id+"|"+cluster+"|"+i+"|exclusive-axis"
      );
    }

    if(pattern?.steps){`);

replaceRequired("v0.9.5 reject unsafe fixed flows",`      const entryConflict=
        !compoundEntryMatchesPrevious(previous,pattern.steps);
      if(lastWasCompound||entryConflict||!compoundWindow){`,`      const entryConflict=
        !compoundEntryMatchesPrevious(previous,pattern.steps);
      const middleOutwardConflict=compoundHasForbiddenMiddleOutward(pattern);
      if(lastWasCompound||entryConflict||middleOutwardConflict||!compoundWindow){`);

replaceRequired("v0.9.5 safety and rarity metadata",'        _compoundFlowBoundaryRule:\n          "exact reverse cuts immediately before and after explicit flows"',`        _compoundFlowBoundaryRule:
          "safe 90–180 degree resets around explicit flows",
        _middleOutwardDoubleRule:
          "inner columns 1+2 on the same row may not cut outward simultaneously",
        _newAndDiagonalFlowRarity:
          config.id==="expertPlus"?"0.5x previous":"0.2x previous",
        _exclusiveFlowDirectionMode:
          "flows 1-19 use V/H axes wherever playable; essential diagonals remain fixed",
        _horizontalExclusiveFlowPlacement:
          "H-axis notes use outer columns 0 and 3"`);
