from pathlib import Path
import re

p=Path('simbers.html')
s=p.read_text(encoding='utf-8')
v='0.9.1'
s=re.sub(r'<meta name="simbers-version" content="[^"]+"\s*/?>',f'<meta name="simbers-version" content="{v}" />',s,count=1)
s=re.sub(r'<title>Simplified Sabers v[^<]+</title>',f'<title>Simplified Sabers v{v}</title>',s,count=1)
s=re.sub(r'<span class="appVersion"([^>]*)>v[^<]+</span>',rf'<span class="appVersion"\1>v{v}</span>',s,count=1)
s=re.sub(r'const SIMBERS_VERSION="[^"]+";',f'const SIMBERS_VERSION="{v}";',s,count=1)
s=re.sub(r'simbers-flow-library\.js\?v=[^"]+',f'simbers-flow-library.js?v={v}',s,count=1)
if '.rotationAudit{' not in s:
    s=s.replace('.subtitle{\n','.rotationAudit{position:fixed;z-index:40;left:8px;bottom:6px;color:#8b8b8b;font:600 10px/1.2 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;pointer-events:none}.rotationAudit.fail{color:#ff6b7f}\n\n.subtitle{\n',1)
if 'id="rotationAudit"' not in s:
    s=s.replace('<body>','<body>\n  <div id="rotationAudit" class="rotationAudit">Failed rotations: 0</div>',1)
if 'rotationAudit:$("rotationAudit")' not in s:
    s=s.replace('mapStatus:$("mapStatus"), npsNote:$("npsNote"),','mapStatus:$("mapStatus"), npsNote:$("npsNote"), rotationAudit:$("rotationAudit"),',1)
if 'function setFailedRotations' not in s:
    s=s.replace('function setProgress(v, text){','function setFailedRotations(count){\n  const safe=Math.max(0,Math.floor(Number(count)||0));\n  els.rotationAudit.textContent=`Failed rotations: ${safe}`;\n  els.rotationAudit.classList.toggle("fail",safe>0);\n}\n\nfunction setProgress(v, text){',1)
s=s.replace('  els.npsNote.textContent="";\n  els.analyzeBtn.textContent="Create Map";','  els.npsNote.textContent="";\n  setFailedRotations(0);\n  els.analyzeBtn.textContent="Create Map";')
p.write_text(s,encoding='utf-8')
