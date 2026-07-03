from pathlib import Path
import re
p=Path('simbers.html'); s=p.read_text()
css='''.rotationAudit{position:fixed;z-index:80;left:8px;bottom:6px;color:#888;font:600 10px monospace}.rotationAudit.fail{color:#ff6b7f}.flowLib{position:fixed;z-index:70;inset:0;overflow:auto;padding:16px;background:#101010;color:#fff}.flowLib.hidden{display:none!important}.flowHead{position:sticky;top:-16px;display:flex;align-items:center;background:#101010;padding:16px 0}.flowHead button{width:auto;margin-left:auto}.flowGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:8px}.flowCard{padding:10px;border:1px solid #333;background:#1b1b1b}.flowCard h3{margin:0;font-size:13px}.flowStep{margin-top:5px;color:#bbb;font:10px monospace}.easy{color:#8cffb2}.medium{color:#ffe08b}.hard{color:#ff9cab}\n'''
if '.rotationAudit{' not in s:s=s.replace('.subtitle{',css+'.subtitle{',1)
markup='''<body>\n<div id="rotationAudit" class="rotationAudit">Failed rotations: 0</div>\n<section id="flowLib" class="flowLib hidden"><div class="flowHead"><div><h2>50 Flow Library</h2><small id="flowStats"></small></div><button id="flowClose">Close</button></div><div id="flowGrid" class="flowGrid"></div></section>'''
if 'id="rotationAudit"' not in s:s=s.replace('<body>',markup,1)
s,n=re.subn(r'<a class="brandMark" href="\./simbers-flow-library\.html"','<a class="brandMark" id="flowOpen" href="#flows"',s,count=1)
if n!=1 and 'id="flowOpen"' not in s:raise RuntimeError('logo')
if 'rotationAudit:$("rotationAudit")' not in s:
 old='mapStatus:$("mapStatus"), npsNote:$("npsNote"),'
 if old not in s:raise RuntimeError('els')
 s=s.replace(old,old+' rotationAudit:$("rotationAudit"),',1)
if 'function setFailedRotations' not in s:
 s=s.replace('function setProgress(v, text){','''function setFailedRotations(n){n=Math.max(0,Math.floor(+n||0));els.rotationAudit.textContent=`Failed rotations: ${n}`;els.rotationAudit.classList.toggle("fail",n>0)}\nfunction setProgress(v, text){''',1)
s=s.replace('  els.npsNote.textContent="";\n  els.analyzeBtn.textContent="Create Map";','  els.npsNote.textContent="";\n  setFailedRotations(0);\n  els.analyzeBtn.textContent="Create Map";')
js=r'''
const FO=document.getElementById("flowOpen"),FL=document.getElementById("flowLib"),FC=document.getElementById("flowClose"),FG=document.getElementById("flowGrid"),FS=document.getElementById("flowStats");
const FA={up:"↑",down:"↓",left:"←",right:"→",upLeft:"↖",upRight:"↗",downLeft:"↙",downRight:"↘",V:"↕",H:"↔",D1:"↖↘",D2:"↗↙"};
function showFlows(){const a=FLOW_PATTERNS.map((f,i)=>({...f,n:i+1,steps:[{l:f.l,r:f.r}]})),b=COMPOUND_FLOW_PATTERNS.map((f,i)=>({...f,n:i+31})),x=[...a,...b],c=t=>x.filter(f=>f.difficulty===t).length;FS.textContent=`Easy ${c("easy")} (${Math.round(c("easy")/50*100)}%) · Medium ${c("medium")} (${Math.round(c("medium")/50*100)}%) · Hard ${c("hard")} (${Math.round(c("hard")/50*100)}%)`;FG.innerHTML=x.map(f=>`<article class="flowCard"><h3>#${f.n} ${f.name} <b class="${f.difficulty}">${f.difficulty}</b></h3>${f.steps.map((q,i)=>`<div class="flowStep">Beat ${f.stepBeats?f.stepBeats[i]+1:i+1} · ${q.l?`L ${q.l[0]},${q.l[1]} ${FA[q.l[2]]||q.l[2]}`:""} ${q.r?`R ${q.r[0]},${q.r[1]} ${FA[q.r[2]]||q.r[2]}`:""}</div>`).join("")}</article>`).join("");FL.classList.remove("hidden")}
FO.onclick=e=>{e.preventDefault();showFlows()};FC.onclick=()=>FL.classList.add("hidden");
'''
if 'function showFlows' not in s:
 close='\n</script>\n</body>'
 if close not in s:raise RuntimeError('close')
 s=s.replace(close,'\n'+js+close,1)
p.write_text(s)
