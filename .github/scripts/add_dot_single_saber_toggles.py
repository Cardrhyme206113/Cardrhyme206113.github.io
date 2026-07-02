from pathlib import Path

path = Path('simbers.html')
text = path.read_text(encoding='utf-8')

# Add icon-only Dot Notes and Single Saber toggles after Arcs.
old_arc_toggle = '''        <label class="featureToggle" title="Arcs">
          <input id="featureArcs" type="checkbox" checked aria-label="Arcs">
          <span class="featureIcon" aria-hidden="true">
            <svg viewBox="0 0 48 48" focusable="false">
              <rect x="7" y="28" width="9" height="9" rx="2"></rect>
              <rect x="32" y="11" width="9" height="9" rx="2"></rect>
              <path d="M14 30C19 17 25 14 34 17"></path>
            </svg>
          </span>
        </label>'''

new_arc_toggle = old_arc_toggle + '''

        <label class="featureToggle" title="Dot notes">
          <input id="featureDots" type="checkbox" aria-label="Dot notes">
          <span class="featureIcon" aria-hidden="true">
            <svg viewBox="0 0 48 48" focusable="false">
              <rect x="10" y="10" width="28" height="28" rx="6"></rect>
              <circle cx="24" cy="24" r="4"></circle>
            </svg>
          </span>
        </label>

        <label class="featureToggle" title="Single saber sections">
          <input id="featureSingleSaber" type="checkbox" aria-label="Single saber sections">
          <span class="featureIcon" aria-hidden="true">
            <svg viewBox="0 0 48 48" focusable="false">
              <path d="M13 35l21-21"></path>
              <path d="M10 38l6-6 4 4-6 6zM31 12l5-2 2 2-2 5"></path>
            </svg>
          </span>
        </label>'''

if old_arc_toggle not in text:
    raise SystemExit('Arc toggle block not found')
text = text.replace(old_arc_toggle, new_arc_toggle, 1)

# Register the new controls.
old_registry = '''  featureBombs:$("featureBombs"), featureWalls:$("featureWalls"), featureArcs:$("featureArcs"),'''
new_registry = '''  featureBombs:$("featureBombs"), featureWalls:$("featureWalls"), featureArcs:$("featureArcs"),
  featureDots:$("featureDots"), featureSingleSaber:$("featureSingleSaber"),'''
if old_registry not in text:
    raise SystemExit('Feature element registry not found')
text = text.replace(old_registry, new_registry, 1)

# Invalidate stale maps when either new option changes.
old_listener = '''for(const control of [els.featureBombs,els.featureWalls,els.featureArcs]){
  control.addEventListener("change",invalidateMapForFeatureChange);
}'''
new_listener = '''for(const control of [
  els.featureBombs,
  els.featureWalls,
  els.featureArcs,
  els.featureDots,
  els.featureSingleSaber
]){
  control.addEventListener("change",invalidateMapForFeatureChange);
}'''
if old_listener not in text:
    raise SystemExit('Feature invalidation listener not found')
text = text.replace(old_listener, new_listener, 1)

# Build deterministic musically important sections used by both modes.
marker = '''function buildBeatmap(result,seed,config,lightingEvents,featureOptions){'''
helpers = '''function notationImportance(segment,previousSegment,nextSegment){
  const melodyJump=Math.max(
    Math.abs((segment.melodyValue||0)-(previousSegment?.melodyValue||0)),
    Math.abs((segment.melodyValue||0)-(nextSegment?.melodyValue||0))
  );

  return clamp(
    .40*(segment.stateChange||0)+
    .28*(segment.beatStrength||0)+
    .18*(segment.activity||0)+
    .14*clamp(melodyJump/.45,0,1),
    0,1
  );
}

function buildNotationSections(segments,config,seed){
  if(segments.length<6)return [];

  const threshold=
    config.id==="expertPlus"?.62:
    config.id==="expert"?.65:
    config.id==="hard"?.68:
    config.id==="medium"?.71:.74;
  const cooldown=
    config.id==="expertPlus"?11:
    config.id==="expert"?13:
    config.id==="hard"?15:
    config.id==="medium"?17:19;

  const scores=segments.map((segment,index)=>notationImportance(
    segment,
    segments[index-1],
    segments[index+1]
  ));

  const candidates=[];
  for(let i=2;i<segments.length-2;i++){
    const score=scores[i];
    if(score<threshold)continue;
    if(score<scores[i-1]||score<scores[i+1])continue;
    candidates.push({index:i,score});
  }

  candidates.sort((a,b)=>b.score-a.score||a.index-b.index);
  const chosen=[];
  const targetCount=Math.max(1,Math.ceil(segments.length/(cooldown*2.2)));

  for(const candidate of candidates){
    if(chosen.some(section=>Math.abs(section.peak-candidate.index)<cooldown))continue;

    const span=clamp(
      Math.round(4+(candidate.score-threshold)*10),
      4,
      8
    );
    const start=Math.max(0,candidate.index-1);
    const end=Math.min(segments.length,start+span);
    chosen.push({peak:candidate.index,start,end,score:candidate.score});
    if(chosen.length>=targetCount)break;
  }

  chosen.sort((a,b)=>a.start-b.start);
  let hand=hashString(`${seed}|${config.id}|single-saber-first-hand`)%2;
  return chosen.map(section=>{
    const result={...section,hand};
    hand=1-hand;
    return result;
  });
}

function sectionLookup(sections,length){
  const lookup=new Array(length).fill(null);
  for(const section of sections){
    for(let i=section.start;i<section.end;i++)lookup[i]=section;
  }
  return lookup;
}

''' + marker

if marker not in text:
    raise SystemExit('buildBeatmap marker not found')
text = text.replace(marker, helpers, 1)

# Create section plan at the start of each beatmap build.
old_setup = '''  const assignments=signatureAssignments(
    segments,
    seed,
    config
  );
  const previous={left:null,right:null};'''
new_setup = '''  const assignments=signatureAssignments(
    segments,
    seed,
    config
  );
  const notationSections=(featureOptions.dots||featureOptions.singleSaber)
    ?buildNotationSections(segments,config,seed)
    :[];
  const notationByEvent=sectionLookup(notationSections,segments.length);
  const previous={left:null,right:null};'''
if old_setup not in text:
    raise SystemExit('Beatmap setup block not found')
text = text.replace(old_setup, new_setup, 1)

# Replace the fixed two-note push with section-aware dot/single-saber behavior.
old_note_push = '''    generatedNotes.push({
      eventIndex:i,
      time,
      lineIndex:safePattern.l[0],
      lineLayer:safePattern.l[1],
      type:0,
      cutDirection:CUT[chosen.leftDirection].code,
      flowDifficulty:pattern.difficulty,
      segment
    });
    generatedNotes.push({
      eventIndex:i,
      time,
      lineIndex:safePattern.r[0],
      lineLayer:safePattern.r[1],
      type:1,
      cutDirection:CUT[chosen.rightDirection].code,
      flowDifficulty:pattern.difficulty,
      segment
    });'''

new_note_push = '''    const notationSection=notationByEvent[i];
    const makeDot=featureOptions.dots&&Boolean(notationSection);
    const singleHand=featureOptions.singleSaber&&notationSection
      ?notationSection.hand
      :null;

    if(singleHand===null||singleHand===0){
      generatedNotes.push({
        eventIndex:i,
        time,
        lineIndex:safePattern.l[0],
        lineLayer:safePattern.l[1],
        type:0,
        cutDirection:makeDot?8:CUT[chosen.leftDirection].code,
        flowDifficulty:pattern.difficulty,
        notationSection:notationSection?.peak??null,
        segment
      });
    }

    if(singleHand===null||singleHand===1){
      generatedNotes.push({
        eventIndex:i,
        time,
        lineIndex:safePattern.r[0],
        lineLayer:safePattern.r[1],
        type:1,
        cutDirection:makeDot?8:CUT[chosen.rightDirection].code,
        flowDifficulty:pattern.difficulty,
        notationSection:notationSection?.peak??null,
        segment
      });
    }'''

if old_note_push not in text:
    raise SystemExit('Generated note push block not found')
text = text.replace(old_note_push, new_note_push, 1)

# Metadata and correct event count for one-note sections.
old_metadata_tail = '''        _wallEveryEvents:featureOptions.walls?config.wallEveryEvents:0,
        _lightingAlgorithm:'''
new_metadata_tail = '''        _wallEveryEvents:featureOptions.walls?config.wallEveryEvents:0,
        _dotNoteSections:featureOptions.dots?notationSections.length:0,
        _dotNoteAlgorithm:featureOptions.dots
          ?"directionless notes in musically important sections"
          :"disabled",
        _singleSaberSections:featureOptions.singleSaber?notationSections.length:0,
        _singleSaberAlgorithm:featureOptions.singleSaber
          ?"alternating left/right hands across musically important sections"
          :"disabled",
        _lightingAlgorithm:'''
if old_metadata_tail not in text:
    raise SystemExit('Beatmap metadata insertion point not found')
text = text.replace(old_metadata_tail, new_metadata_tail, 1)

text = text.replace(
    '''    eventCount:colorNotes.length/2,''',
    '''    eventCount:new Set(generatedNotes.map(note=>note.eventIndex)).size,''',
    1,
)

# Capture options at generation time.
old_options = '''  const featureOptions={
    bombs:els.featureBombs.checked,
    walls:els.featureWalls.checked,
    arcs:els.featureArcs.checked
  };'''
new_options = '''  const featureOptions={
    bombs:els.featureBombs.checked,
    walls:els.featureWalls.checked,
    arcs:els.featureArcs.checked,
    dots:els.featureDots.checked,
    singleSaber:els.featureSingleSaber.checked
  };'''
if old_options not in text:
    raise SystemExit('Feature options block not found')
text = text.replace(old_options, new_options, 1)

# Lock the options while processing.
old_disable = '''  els.featureBombs.disabled=true; els.featureWalls.disabled=true; els.featureArcs.disabled=true;'''
new_disable = '''  els.featureBombs.disabled=true; els.featureWalls.disabled=true; els.featureArcs.disabled=true;
  els.featureDots.disabled=true; els.featureSingleSaber.disabled=true;'''
if old_disable not in text:
    raise SystemExit('Feature disable block not found')
text = text.replace(old_disable, new_disable, 1)

old_enable = '''    els.featureBombs.disabled=false; els.featureWalls.disabled=false; els.featureArcs.disabled=false;'''
new_enable = '''    els.featureBombs.disabled=false; els.featureWalls.disabled=false; els.featureArcs.disabled=false;
    els.featureDots.disabled=false; els.featureSingleSaber.disabled=false;'''
if old_enable not in text:
    raise SystemExit('Feature enable block not found')
text = text.replace(old_enable, new_enable, 1)

path.write_text(text, encoding='utf-8')
print('Added icon-only dot-note and alternating single-saber section toggles')
