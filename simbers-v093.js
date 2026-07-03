const VERSION="0.9.3";
const BASE_URL="https://raw.githubusercontent.com/Cardrhyme206113/Cardrhyme206113.github.io/20dff9dbb794c4f240454c7a82c784b8102a104c/simbers.html";

(async()=>{
  const [baseResponse,flowResponse]=await Promise.all([
    fetch(`${BASE_URL}?v=${VERSION}`,{cache:"no-store"}),
    fetch(`./simbers-flow-library.js?v=${VERSION}`,{cache:"no-store"})
  ]);
  if(!baseResponse.ok)throw new Error(`Base app fetch failed (${baseResponse.status})`);
  if(!flowResponse.ok)throw new Error(`Flow data fetch failed (${flowResponse.status})`);

  let source=await baseResponse.text();
  let flowSource=await flowResponse.text();
  flowSource=flowSource.replace(/\nif\(location\.pathname[\s\S]*$/,"\n");
  const flowUrl=URL.createObjectURL(new Blob([flowSource],{type:"text/javascript"}));

  const replaceRequired=(label,pattern,replacement)=>{
    const next=source.replace(pattern,replacement);
    if(next===source)throw new Error(`Patch failed: ${label}`);
    source=next;
  };

  replaceRequired("version meta",/<meta name="simbers-version" content="[^"]+"\s*\/>/,`<meta name="simbers-version" content="${VERSION}" />`);
  replaceRequired("page title",/<title>Simplified Sabers v[^<]+<\/title>/,`<title>Simplified Sabers v${VERSION}</title>`);
  replaceRequired("visible version",/<span class="appVersion"([^>]*)>v[^<]+<\/span>/,`<span class="appVersion"$1>v${VERSION}</span>`);
  replaceRequired("runtime version",/const SIMBERS_VERSION="[^"]+";/,`const SIMBERS_VERSION="${VERSION}";`);
  replaceRequired("flow import",/import \{ SEQUENCE_FLOW_PATTERNS \} from "[^"]+";/,`import { SEQUENCE_FLOW_PATTERNS } from "${flowUrl}";`);
  replaceRequired("logo link",/<a class="brandMark" href="\.\/simbers-flow-library\.html"/,`<a class="brandMark" id="flowLibraryOpen" href="#flow-library"`);

  replaceRequired("extra CSS",'.subtitle{',`.rotationAudit{position:fixed;z-index:90;left:8px;bottom:6px;color:#858585;font:600 10px/1.2 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;pointer-events:none;user-select:none}.rotationAudit.fail{color:#ff657a}.flowLibraryPanel{position:fixed;z-index:80;inset:0;overflow:auto;padding:18px;background:#101010;color:#fff}.flowLibraryPanel.hidden{display:none!important}.flowLibraryHead{position:sticky;top:-18px;z-index:2;display:flex;align-items:center;gap:12px;padding:18px 0 12px;background:#101010}.flowLibraryHead h2{margin:0}.flowLibraryHead button{width:auto;margin-left:auto;padding:0 18px;background:#3f464d}.flowLibraryStats{color:#999;font-size:12px}.flowLibraryGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px}.flowCard{padding:12px;border:1px solid #333;background:#1b1b1b}.flowCardTop{display:flex;justify-content:space-between;gap:10px}.flowCard h3{margin:0;font-size:14px}.flowBadge{font-size:10px;font-weight:800;text-transform:uppercase}.flowBadge.easy{color:#8cffb2}.flowBadge.medium{color:#ffe08b}.flowBadge.hard{color:#ff9cab}.flowStep{margin-top:7px;padding:6px;background:#111;color:#ccc;font:11px/1.35 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}.flowBeat{color:#7dafff}\n\n.subtitle{`);

  replaceRequired("extra markup",'<body>',`<body>\n  <div id="rotationAudit" class="rotationAudit">Failed rotations: 0</div>\n  <section id="flowLibraryPanel" class="flowLibraryPanel hidden" aria-hidden="true">\n    <div class="flowLibraryHead"><div><h2>50 Flow Library</h2><div id="flowLibraryStats" class="flowLibraryStats"></div></div><button id="flowLibraryClose" type="button">Close</button></div>\n    <div id="flowLibraryGrid" class="flowLibraryGrid"></div>\n  </section>`);

  replaceRequired("audit element",'mapStatus:$("mapStatus"), npsNote:$("npsNote"),','mapStatus:$("mapStatus"), npsNote:$("npsNote"), rotationAudit:$("rotationAudit"),');
  replaceRequired("audit setter",'function setProgress(v, text){',`function setFailedRotations(count){\n  const safe=Math.max(0,Math.floor(Number(count)||0));\n  els.rotationAudit.textContent=\`Failed rotations: \${safe}\`;\n  els.rotationAudit.classList.toggle("fail",safe>0);\n}\n\nfunction setProgress(v, text){`);
  source=source.replaceAll('  els.npsNote.textContent="";\n  els.analyzeBtn.textContent="Create Map";','  els.npsNote.textContent="";\n  setFailedRotations(0);\n  els.analyzeBtn.textContent="Create Map";');

  replaceRequired("rotation selection",/function parityFilteredOptions\(options,previous,boundaryTarget\)\{[\s\S]*?\n\}/,`function parityFilteredOptions(options,previous,boundaryTarget,eventSeed,hand){\n  if(boundaryTarget)return [boundaryTarget];\n  if(!previous)return options;\n\n  const legal=options.filter(direction=>\n    direction!==previous.direction &&\n    angleDistance(CUT[direction].deg,CUT[previous.direction].deg)>=89.5\n  );\n  if(!legal.length)return [oppositeDirection(previous.direction)];\n\n  const reverse=oppositeDirection(previous.direction);\n  const reverseOptions=legal.filter(direction=>direction===reverse);\n  const perpendicular=legal.filter(direction=>\n    Math.abs(angleDistance(CUT[direction].deg,CUT[previous.direction].deg)-90)<1\n  );\n  const wideTurns=legal.filter(direction=>\n    Math.abs(angleDistance(CUT[direction].deg,CUT[previous.direction].deg)-135)<1\n  );\n  const roll=hashString(\`\${eventSeed}|\${hand}|turn-style\`)%100;\n\n  if(roll<52&&reverseOptions.length)return reverseOptions;\n  if(roll<82&&perpendicular.length)return perpendicular;\n  if(wideTurns.length)return wideTurns;\n  if(perpendicular.length)return perpendicular;\n  if(reverseOptions.length)return reverseOptions;\n  return legal;\n}`);

  replaceRequired("rotation scoring",/function parityPenalty\(previous,direction,time\)\{[\s\S]*?\n\}/,`function parityPenalty(previous,direction,time){\n  const d=CUT[direction];\n  if(!previous)return d.dy<-.15?0:(Math.abs(d.dx)>.9?2.2:1.2);\n  const turn=angleDistance(d.deg,CUT[previous.direction].deg);\n  if(direction===previous.direction||turn<89.5)return 1e9;\n  const dt=Math.max(.05,time-previous.time);\n  return (180-turn)/150+(dt<.30&&turn<134.5?.35:0);\n}`);

  replaceRequired("left rotation seed",`    boundaryTargets?.left\n  );`,`    boundaryTargets?.left,\n    eventSeed,\n    "left"\n  );`);
  replaceRequired("right rotation seed",`    boundaryTargets?.right\n  );`,`    boundaryTargets?.right,\n    eventSeed,\n    "right"\n  );`);

  replaceRequired("compound entry",/function compoundEntryMatchesPrevious\(previous,steps\)\{[\s\S]*?\n\}/,`function compoundEntryMatchesPrevious(previous,steps){\n  const hands=[\n    {key:"left",step:explicitHandStep(steps,"l")},\n    {key:"right",step:explicitHandStep(steps,"r")}\n  ];\n  for(const hand of hands){\n    if(!hand.step||!previous[hand.key])continue;\n    const turn=angleDistance(\n      CUT[previous[hand.key].direction].deg,\n      CUT[hand.step.note[2]].deg\n    );\n    if(turn<89.5)return false;\n  }\n  return true;\n}`);

  replaceRequired("compound guard",`      const bridgeConflict=\n        lastNormalBridgesCompound &&\n        !compoundEntryMatchesPrevious(previous,pattern.steps);\n      if(lastWasCompound||bridgeConflict||!compoundWindow){`,`      const entryConflict=\n        !compoundEntryMatchesPrevious(previous,pattern.steps);\n      if(lastWasCompound||entryConflict||!compoundWindow){`);
  source=source.replace(/\n\s*retunePreviousForCompound\(\n\s*generatedNotes,\n\s*previous,\n\s*pattern\.steps,\n\s*compoundWindow\.start\n\s*\);\n/,'\n');

  replaceRequired("rotation auditor",'function explicitHandStep(steps,key,fromEnd=false){',`function directionNameFromCode(code){\n  for(const [name,value] of Object.entries(CUT))if(value.code===code)return name;\n  return null;\n}\nfunction countFailedRotations(notes){\n  let failures=0;\n  for(const type of [0,1]){\n    const handNotes=notes.filter(note=>note.type===type).slice().sort((a,b)=>\n      a.time-b.time||(a.compoundStep??0)-(b.compoundStep??0)\n    );\n    const groups=[];\n    for(const note of handNotes){\n      const last=groups[groups.length-1];\n      if(last&&Math.abs(last.time-note.time)<=.00001)last.notes.push(note);\n      else groups.push({time:note.time,notes:[note]});\n    }\n    for(let index=1;index<groups.length;index++){\n      const before=groups[index-1],after=groups[index];\n      const a=before.notes[0],b=after.notes[0];\n      const internal=Boolean(\n        a.compoundFlow&&b.compoundFlow&&\n        a.compoundFlow===b.compoundFlow&&\n        a.compoundStartIndex===b.compoundStartIndex\n      );\n      if(internal)continue;\n      const beforeDirections=new Set(before.notes.map(note=>directionNameFromCode(note.cutDirection)));\n      const afterDirections=new Set(after.notes.map(note=>directionNameFromCode(note.cutDirection)));\n      if(beforeDirections.size!==1||afterDirections.size!==1){failures++;continue;}\n      const beforeDirection=[...beforeDirections][0];\n      const afterDirection=[...afterDirections][0];\n      if(!beforeDirection||!afterDirection||angleDistance(CUT[beforeDirection].deg,CUT[afterDirection].deg)<89.5)failures++;\n    }\n  }\n  return failures;\n}\n\nfunction explicitHandStep(steps,key,fromEnd=false){`);

  replaceRequired("failure calculation",`  generatedNotes.sort(\n    (a,b)=>a.time-b.time||a.type-b.type\n  );\n\n  validateExplicitFlowTiming(generatedNotes);`,`  generatedNotes.sort(\n    (a,b)=>a.time-b.time||a.type-b.type\n  );\n\n  const failedRotations=countFailedRotations(generatedNotes);\n  validateExplicitFlowTiming(generatedNotes);`);
  replaceRequired("map audit metadata",'        _simbersVersion:SIMBERS_VERSION,','        _simbersVersion:SIMBERS_VERSION,\n        _failedRotations:failedRotations,\n        _rotationPolicy:"turns of 90–180 degrees; identical and 45-degree continuations prohibited",');
  replaceRequired("difficulty audit result",'    noteCount:colorNotes.length,','    failedRotations,\n    noteCount:colorNotes.length,');
  replaceRequired("aggregate audit",'  const characteristicSets=[','  const failedRotationTotal=standardDifficulties.reduce((sum,difficulty)=>sum+(difficulty.failedRotations||0),0);\n  setFailedRotations(failedRotationTotal);\n\n  const characteristicSets=[');
  replaceRequired("package audit",'    usedFlowCount:allFlowIds.size,','    failedRotations:failedRotationTotal,\n    usedFlowCount:allFlowIds.size,');
  replaceRequired("Info audit metadata",'    _customData:{\n      _simplifiedSabersCharacteristics:','    _customData:{\n      _simbersVersion:SIMBERS_VERSION,\n      _failedRotations:characteristicSets.find(set=>set.characteristic==="Standard")?.difficulties.reduce((sum,difficulty)=>sum+(difficulty.failedRotations||0),0)||0,\n      _simplifiedSabersCharacteristics:');

  replaceRequired("embedded library",'\n</script>\n</body>',`\n\nconst flowLibraryOpen=document.getElementById("flowLibraryOpen");\nconst flowLibraryPanel=document.getElementById("flowLibraryPanel");\nconst flowLibraryClose=document.getElementById("flowLibraryClose");\nconst flowLibraryGrid=document.getElementById("flowLibraryGrid");\nconst flowLibraryStats=document.getElementById("flowLibraryStats");\nconst FLOW_ARROWS={up:"↑",down:"↓",left:"←",right:"→",upLeft:"↖",upRight:"↗",downLeft:"↙",downRight:"↘",V:"↕",H:"↔",D1:"↖↘",D2:"↗↙"};\nfunction flowNoteText(note,label){return note?\`\${label} \${note[0]},\${note[1]} \${FLOW_ARROWS[note[2]]||note[2]}\`:"";}\nfunction renderEmbeddedFlowLibrary(){\n  const classic=FLOW_PATTERNS.map((flow,index)=>({...flow,index:index+1,steps:[{l:flow.l,r:flow.r}]}));\n  const explicit=COMPOUND_FLOW_PATTERNS.map((flow,index)=>({...flow,index:index+31}));\n  const flows=[...classic,...explicit];\n  const count=tier=>flows.filter(flow=>flow.difficulty===tier).length;\n  const percentage=tier=>Math.round(count(tier)/flows.length*100);\n  flowLibraryStats.textContent=\`\${flows.length} total · Easy \${count("easy")} (\${percentage("easy")}%) · Medium \${count("medium")} (\${percentage("medium")}%) · Hard \${count("hard")} (\${percentage("hard")}%)\`;\n  flowLibraryGrid.innerHTML=flows.map(flow=>{\n    const steps=flow.steps.map((step,index)=>{\n      const beat=Array.isArray(flow.stepBeats)?flow.stepBeats[index]+1:index+1;\n      return \`<div class="flowStep"><span class="flowBeat">Beat \${beat}</span> · \${flowNoteText(step.l,"L")} \${flowNoteText(step.r,"R")}</div>\`;\n    }).join("");\n    return \`<article class="flowCard"><div class="flowCardTop"><h3>#\${flow.index} · \${flow.name}</h3><span class="flowBadge \${flow.difficulty}">\${flow.difficulty}</span></div>\${steps}</article>\`;\n  }).join("");\n}\nflowLibraryOpen.addEventListener("click",event=>{event.preventDefault();renderEmbeddedFlowLibrary();flowLibraryPanel.classList.remove("hidden");flowLibraryPanel.setAttribute("aria-hidden","false");});\nflowLibraryClose.addEventListener("click",()=>{flowLibraryPanel.classList.add("hidden");flowLibraryPanel.setAttribute("aria-hidden","true");});\n\n</script>\n</body>`);

  document.open();
  document.write(source);
  document.close();
})().catch(error=>{
  console.error(error);
  document.body.innerHTML=`<pre style="max-width:900px;padding:24px;color:#ff8293;white-space:pre-wrap">Simbers v${VERSION} failed to load.\n\n${String(error.stack||error)}</pre>`;
});
