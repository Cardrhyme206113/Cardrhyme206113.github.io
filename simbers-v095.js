const VERSION="0.9.5";

(async()=>{
  const response=await fetch(`./simbers-v094.js?v=${VERSION}`,{cache:"no-store"});
  if(!response.ok)throw new Error(`Simbers v0.9.4 runtime fetch failed (${response.status})`);

  let previousRuntime=await response.text();
  previousRuntime=previousRuntime.replace('const VERSION="0.9.4";',`const VERSION="${VERSION}";`);

  const axisPatch=String.raw`
  replaceRequired("v0.9.5 axis helpers",'function compoundEntryMatchesPrevious(previous,steps){',\`function axisDirectionOptions(axis){
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
    const beat=Array.isArray(pattern.stepBeats)
      ?pattern.stepBeats[index]
      :index;
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
          direction=resolveCompoundAxisDirection(
            axis,
            state[stateKey],
            key+"|"+cacheKey
          );
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

function compoundEntryMatchesPrevious(previous,steps){\`);

  replaceRequired("v0.9.5 resolve exclusive-flow axes",\`    let pattern=assignedPattern;
    let compoundWindow=null;

    if(pattern?.steps){\`,\`    let pattern=assignedPattern;
    let compoundWindow=null;

    if(pattern?.steps){
      pattern=resolveCompoundAxes(
        pattern,
        previous,
        seed+"|"+config.id+"|"+cluster+"|"+i+"|exclusive-axis"
      );
    }

    if(pattern?.steps){\`);

  replaceRequired("v0.9.5 axis metadata",'        _newAndDiagonalFlowRarity:
          config.id==="expertPlus"?"0.5x previous":"0.2x previous"',\`        _newAndDiagonalFlowRarity:
          config.id==="expertPlus"?"0.5x previous":"0.2x previous",
        _exclusiveFlowDirectionMode:
          "flows 1-19 use V/H axes wherever playable; essential diagonals remain fixed",
        _horizontalExclusiveFlowPlacement:
          "H-axis notes use outer columns 0 and 3"\`);
`;

  const insertion=`
  const axisPatch=${JSON.stringify(axisPatch)};
  runtime=runtime.replace('  document.open();',axisPatch+'\\n  document.open();');
`;

  if(!previousRuntime.includes('  const runtimeUrl=URL.createObjectURL')){
    throw new Error("v0.9.5 runtime insertion point missing");
  }

  previousRuntime=previousRuntime.replace(
    '  const runtimeUrl=URL.createObjectURL',
    insertion+'\n  const runtimeUrl=URL.createObjectURL'
  );

  const runtimeUrl=URL.createObjectURL(
    new Blob([previousRuntime],{type:"text/javascript"})
  );
  await import(runtimeUrl);
})().catch(error=>{
  console.error(error);
  document.body.innerHTML=`<pre style="max-width:900px;padding:24px;color:#ff8293;white-space:pre-wrap">Simbers v${VERSION} failed to load.\n\n${String(error.stack||error)}</pre>`;
});
