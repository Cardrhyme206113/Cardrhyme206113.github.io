from pathlib import Path
import re

path = Path("simbers-flow-library.html")
text = path.read_text(encoding="utf-8")

specs = {
    "compound_05": "[0,0,0]",
    "compound_06": "[0,0,0]",
    "compound_13": "[0,0,0,1,1]",
    "compound_14": "[0,0,0]",
    "compound_15": "[0,0]",
    "compound_16": "[0,0,0]",
    "compound_17": "[0,0,0]",
    "compound_18": "[0,0,0]",
    "compound_19": "[0,0,0]",
}
for flow_id, beats in specs.items():
    if re.search(rf'"id":"{flow_id}".*?"stepBeats":', text):
        continue
    text, count = re.subn(
        rf'("id":"{flow_id}".*?"beatSpan":\d+)(,"steps":)',
        rf'\1,"stepBeats":{beats}\2',
        text,
        count=1,
    )
    if count != 1:
        raise RuntimeError(flow_id)

pattern = re.compile(
    r'function beatHtml\(step,index,total,span\)\{.*?\n\}\nfunction render\(filter="all"\)\{.*?\n\}',
    re.S,
)
replacement = '''function beatGroupHtml(steps,label){
  let cells="";
  for(let i=0;i<12;i++)cells+='<span class="cell"></span>';
  const notes=steps.flatMap(step=>[
    noteHtml(step.l,"left"),
    noteHtml(step.r,"right")
  ]).join("");
  return `<div class="beat"><div class="beatLabel">${label}</div><div class="miniGrid">${cells}${notes}</div></div>`;
}
function flowBeatGroups(flow){
  if(!Array.isArray(flow.stepBeats)){
    return flow.steps.map((step,index)=>({
      steps:[step],
      label:flow.steps.length===1?"Pattern":`Note ${index+1}/${flow.steps.length}`
    }));
  }
  const groups=new Map();
  flow.steps.forEach((step,index)=>{
    const beat=flow.stepBeats[index]??0;
    if(!groups.has(beat))groups.set(beat,[]);
    groups.get(beat).push(step);
  });
  return [...groups.entries()].map(([beat,steps])=>({
    steps,
    label:`Beat ${beat+1} · same timestamp`
  }));
}
function render(filter="all"){
  grid.innerHTML=FLOWS.filter(f=>filter==="all"||f.difficulty===filter).map(f=>{
    const groups=flowBeatGroups(f);
    const timing=Array.isArray(f.stepBeats)
      ?(groups.length===1
        ?`${f.steps.length} note rows at one exact timestamp`
        :`${f.steps.length} note rows on ${groups.length} exact beat timestamps`)
      :(f.steps.length===1
        ?"single detected event"
        :`${f.steps.length} notes across ${f.beatSpan} beat${f.beatSpan===1?"":"s"}`);
    return `<article class="card" data-difficulty="${f.difficulty}">
      <div class="cardHead"><div><h2>#${f.index} · ${f.name}</h2>
      <div class="meta">${f.source} · ${timing}</div></div>
      <span class="badge ${f.difficulty}">${f.difficulty}</span></div>
      <div class="timeline">${groups.map(group=>beatGroupHtml(group.steps,group.label)).join("")}</div>
    </article>`;
  }).join("");
}'''
text, count = pattern.subn(replacement, text, count=1)
if count != 1 and "function flowBeatGroups" not in text:
    raise RuntimeError("render")

path.write_text(text, encoding="utf-8")
