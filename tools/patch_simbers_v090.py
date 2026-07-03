from pathlib import Path
import re

VERSION = "0.9.0"

# Flow data: Flow 13 is five distinct beats; requested single-beat flows retain one timestamp.
js_path = Path("simbers-flow-library.js")
js = js_path.read_text(encoding="utf-8")
old = '"id":"library_13","name":"Flow 13","difficulty":"hard","kind":"sequence","spanBeats":2,"stepBeats":[0,0,0,1,1]'
new = '"id":"library_13","name":"Flow 13","difficulty":"hard","kind":"sequence","spanBeats":5,"stepBeats":[0,1,2,3,4]'
if old in js:
    js = js.replace(old, new, 1)
elif new not in js:
    raise RuntimeError("Could not update Flow 13 in JS library")
js_path.write_text(js, encoding="utf-8")

# Visual flow library must match generator timing.
lib_path = Path("simbers-flow-library.html")
lib = lib_path.read_text(encoding="utf-8")
old = '"id":"compound_13","name":"Flow 13","difficulty":"hard","source":"Explicit directions","explicit":true,"beatSpan":2,"stepBeats":[0,0,0,1,1]'
new = '"id":"compound_13","name":"Flow 13","difficulty":"hard","source":"Explicit directions","explicit":true,"beatSpan":5,"stepBeats":[0,1,2,3,4]'
if old in lib:
    lib = lib.replace(old, new, 1)
elif new not in lib:
    raise RuntimeError("Could not update Flow 13 in HTML library")
lib_path.write_text(lib, encoding="utf-8")

html_path = Path("simbers.html")
html = html_path.read_text(encoding="utf-8")

# Embed and display the application version.
meta = f'<meta name="simbers-version" content="{VERSION}" />'
if 'name="simbers-version"' not in html:
    html = html.replace(
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />',
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />\n' + meta,
        1,
    )
else:
    html = re.sub(
        r'<meta name="simbers-version" content="[^"]+"\s*/?>',
        meta,
        html,
        count=1,
    )

html = re.sub(
    r'<title>Simplified Sabers(?: v[^<]+)?</title>',
    f'<title>Simplified Sabers v{VERSION}</title>',
    html,
    count=1,
)

# Cache-bust the separate flow module so GitHub Pages cannot serve stale timing data.
html = re.sub(
    r'import \{ SEQUENCE_FLOW_PATTERNS \} from "\./simbers-flow-library\.js(?:\?v=[^"]+)?";',
    f'import {{ SEQUENCE_FLOW_PATTERNS }} from "./simbers-flow-library.js?v={VERSION}";',
    html,
    count=1,
)
if f'simbers-flow-library.js?v={VERSION}' not in html:
    raise RuntimeError("Could not version the flow-library import")

if 'const SIMBERS_VERSION=' not in html:
    html = html.replace(
        '"use strict";',
        f'"use strict";\n\nconst SIMBERS_VERSION="{VERSION}";',
        1,
    )
else:
    html = re.sub(
        r'const SIMBERS_VERSION="[^"]+";',
        f'const SIMBERS_VERSION="{VERSION}";',
        html,
        count=1,
    )

if '.appVersion{' not in html:
    html = html.replace(
        'h1{\n  margin:0;',
        'h1{\n  margin:0;',
        1,
    )
    css_anchor = '.subtitle{\n'
    version_css = '.appVersion{margin-left:auto;color:var(--muted);font:700 12px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:nowrap}\n\n'
    if css_anchor not in html:
        raise RuntimeError("Could not add version CSS")
    html = html.replace(css_anchor, version_css + css_anchor, 1)

version_badge = f'<span class="appVersion" title="Simbers version">v{VERSION}</span>'
if 'class="appVersion"' not in html:
    html = html.replace(
        '<h1>Simplified Sabers</h1>',
        '<h1>Simplified Sabers</h1>\n        ' + version_badge,
        1,
    )
else:
    html = re.sub(
        r'<span class="appVersion"[^>]*>v[^<]+</span>',
        version_badge,
        html,
        count=1,
    )

# Add a strict runtime validator. This checks the actual generated timestamps,
# not merely spanBeats metadata, before the map can be exported.
if 'function validateExplicitFlowTiming' not in html:
    marker = 'function explicitHandStep(steps,key,fromEnd=false){'
    validator = '''function validateExplicitFlowTiming(notes){
  const patternById=new Map(
    COMPOUND_FLOW_PATTERNS.map(pattern=>[pattern.id,pattern])
  );
  const instances=new Map();

  for(const note of notes){
    if(!note.compoundFlow||note.compoundStartIndex==null)continue;
    const key=`${note.compoundFlow}|${note.compoundStartIndex}`;
    if(!instances.has(key))instances.set(key,[]);
    instances.get(key).push(note);
  }

  for(const instanceNotes of instances.values()){
    const pattern=patternById.get(instanceNotes[0].compoundFlow);
    if(!pattern||!Array.isArray(pattern.stepBeats))continue;

    const timeByStep=new Map();
    for(const note of instanceNotes){
      const existing=timeByStep.get(note.compoundStep);
      if(existing!=null&&Math.abs(existing-note.time)>.00001){
        throw new Error(`Simbers v${SIMBERS_VERSION}: split timestamp inside ${pattern.name}`);
      }
      timeByStep.set(note.compoundStep,note.time);
    }

    for(let a=0;a<pattern.steps.length;a++){
      for(let b=a+1;b<pattern.steps.length;b++){
        const timeA=timeByStep.get(a);
        const timeB=timeByStep.get(b);
        if(timeA==null||timeB==null)continue;
        const sameBeat=pattern.stepBeats[a]===pattern.stepBeats[b];
        const sameTime=Math.abs(timeA-timeB)<=.00001;
        if(sameBeat!==sameTime){
          throw new Error(`Simbers v${SIMBERS_VERSION}: invalid beat grouping in ${pattern.name}`);
        }
      }
    }
  }
}

'''
    if marker not in html:
        raise RuntimeError("Could not add flow timing validator")
    html = html.replace(marker, validator + marker, 1)

# Tag every explicit note with its occurrence so the validator can group repeats safely.
needle = 'compoundFlow:pattern.id,\n            compoundStep:stepIndex'
replacement = 'compoundFlow:pattern.id,\n            compoundStartIndex:i,\n            compoundStep:stepIndex'
count = html.count(needle)
if count:
    html = html.replace(needle, replacement)
elif html.count('compoundStartIndex:i,') < 2:
    raise RuntimeError("Could not tag compound-flow occurrences")

# Validate immediately before serializing actual _time values.
validation_call = '  validateExplicitFlowTiming(generatedNotes);\n\n  const colorNotes=generatedNotes.map(note=>({'
if validation_call not in html:
    target = '  const colorNotes=generatedNotes.map(note=>({'
    if target not in html:
        raise RuntimeError("Could not insert timing validation call")
    html = html.replace(target, validation_call, 1)

# Embed version in every generated difficulty output.
version_field = '        _simbersVersion:SIMBERS_VERSION,\n'
if '_simbersVersion:SIMBERS_VERSION' not in html:
    anchor = '        _generator:\n          "Beat Signature Natural Arc Multi-Difficulty HTML",\n'
    if anchor not in html:
        raise RuntimeError("Could not embed version in map output")
    html = html.replace(anchor, anchor + version_field, 1)

html_path.write_text(html, encoding="utf-8")
