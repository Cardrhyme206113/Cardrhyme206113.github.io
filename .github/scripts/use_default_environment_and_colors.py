from pathlib import Path
import re

path = Path('simbers.html')
text = path.read_text(encoding='utf-8')

# Replace the custom Linkin Park / boost-palette lighting code with a
# default-environment red/blue-only lighting pass.
pattern = re.compile(
    r'function vanillaLightValue\(colorSlot,style\)\{.*?\n\}\n\n\nfunction wallOverlapsInteractiveObject\(',
    re.S,
)

replacement = r'''function defaultLightValue(useRed,style){
  const base=useRed?5:1;
  const offsets={
    static:0,
    flash:1,
    fade:2,
    transition:3
  };
  return base+offsets[style];
}

function defaultLightIsRed(segment,index,sectionIndex){
  const melodyBucket=Math.round(
    clamp(segment?.melodyValue||0,0,1)*8
  );
  const clusterBucket=Number.isFinite(segment?.cluster)
    ?segment.cluster
    :index;
  return Math.abs(
    melodyBucket+
    clusterBucket+
    sectionIndex
  )%2===1;
}

function buildVanillaLightingEvents(result,seed){
  const segments=result.patterns?.segments||[];
  const duration=Math.max(.1,result.duration||0);
  const eventMap=new Map();
  const lastTimeByType=new Map();

  function pushLight(
    time,
    type,
    value,
    brightness=1,
    force=false
  ){
    time=+clamp(time,0,duration).toFixed(4);

    if(!force){
      const previous=lastTimeByType.get(type);
      if(
        Number.isFinite(previous)&&
        time-previous<.085
      )return;
    }

    const event={
      _time:time,
      _type:type,
      _value:value,
      _floatValue:+clamp(
        brightness,
        0,
        1.25
      ).toFixed(3)
    };

    eventMap.set(
      `${time.toFixed(4)}|${type}`,
      event
    );
    lastTimeByType.set(type,time);
  }

  const allLightGroups=[0,1,2,3,4];
  for(const type of allLightGroups){
    pushLight(0,type,0,0,true);
  }

  if(!segments.length){
    return [...eventMap.values()];
  }

  let lastSection=-1;
  let previousEventTime=segments[0].start;
  let strongestRecentTime=-999;

  for(let i=0;i<segments.length;i++){
    const segment=segments[i];
    const time=clamp(
      segment.start||0,
      0,
      duration
    );
    const nextTime=i+1<segments.length
      ?segments[i+1].start
      :duration;
    const sectionIndex=Math.floor(time/8);
    const strength=clamp(
      segmentEventStrength(segment),
      0,
      1
    );
    const state=clamp(
      segment.stateChange||0,
      0,
      1
    );
    const beat=clamp(
      segment.beatStrength||0,
      0,
      1
    );
    const activity=clamp(
      segment.activity||0,
      0,
      1
    );
    const useRed=defaultLightIsRed(
      segment,
      i,
      sectionIndex
    );

    const newSection=sectionIndex!==lastSection;
    if(newSection||state>.78){
      const groups=[0,1,4];
      for(let g=0;g<groups.length;g++){
        pushLight(
          time+g*.012,
          groups[g],
          defaultLightValue(
            g%2? !useRed:useRed,
            "transition"
          ),
          .50+.12*strength
        );
      }
      lastSection=sectionIndex;
    }

    const signatureHash=hashString([
      seed,
      sectionIndex,
      Number.isFinite(segment.cluster)
        ?segment.cluster
        :i,
      Math.round((segment.melodyValue||0)*12)
    ].join("|"));
    const mainType=[0,1,2,3,4][signatureHash%5];

    let style="transition";
    if(strength>.78&&time-strongestRecentTime>.18){
      style="flash";
      strongestRecentTime=time;
    }else if(strength>.52||state>.48||beat>.58){
      style="fade";
    }else if(activity>.42){
      style="static";
    }

    const brightness=clamp(
      .50+.52*strength+.14*activity,
      .46,
      1.18
    );

    pushLight(
      time,
      mainType,
      defaultLightValue(useRed,style),
      brightness
    );

    if(strength>.42||beat>.50){
      const sideType=(
        Math.round((segment.melodyValue||0)*10)+
        sectionIndex
      )%2?2:3;
      pushLight(
        time+.012,
        sideType,
        defaultLightValue(
          !useRed,
          strength>.68?"flash":"fade"
        ),
        brightness*.88
      );
    }

    if(strength>.72||state>.78){
      pushLight(
        time+.024,
        4,
        defaultLightValue(useRed,strength>.84?"flash":"fade"),
        Math.min(1.24,brightness+.10)
      );
      pushLight(
        time+.036,
        0,
        defaultLightValue(!useRed,"fade"),
        brightness
      );
    }

    const gapFromPrevious=time-previousEventTime;
    if(gapFromPrevious<.30&&strength>.48){
      const rapidType=i%2?2:3;
      pushLight(
        time+.058,
        rapidType,
        defaultLightValue(i%2?useRed:!useRed,"fade"),
        .66+.26*strength
      );
    }

    if(nextTime-time>1.15&&activity<.48){
      const quietTime=Math.min(
        duration,
        time+Math.min(.72,(nextTime-time)*.48)
      );
      pushLight(quietTime,mainType,0,0);
      pushLight(quietTime+.02,i%2?2:3,0,0);
    }

    previousEventTime=time;
  }

  const endTime=Math.max(0,duration-.025);
  for(const type of allLightGroups){
    pushLight(endTime,type,0,0,true);
  }

  return [...eventMap.values()].sort((a,b)=>
    a._time-b._time||a._type-b._type
  );
}


function wallOverlapsInteractiveObject('''

text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit(f'Lighting function replacement count was {count}')

text = text.replace(
    '_environmentName:"LinkinParkEnvironment",\n    _allDirectionsEnvironmentName:"GlassDesertEnvironment",',
    '_environmentName:"DefaultEnvironment",\n    _allDirectionsEnvironmentName:"DefaultEnvironment",',
    1,
)
text = text.replace(
    '"beat strength + built-in LinkinPark normal/boost palette"',
    '"beat strength + default environment red/blue palette"',
    1,
)
text = text.replace(
    '"Info 2.0 + V2 events + supported ArcViewer environment"',
    '"Info 2.0 + V2 events + DefaultEnvironment"',
    1,
)
text = text.replace(
    '"Building beat-driven LinkinPark lighting…"',
    '"Building beat-driven default lighting…"',
    1,
)

for stale in ('LinkinParkEnvironment','GlassDesertEnvironment','LinkinPark normal/boost palette'):
    if stale in text:
        raise SystemExit(f'Stale custom environment reference remains: {stale}')

path.write_text(text, encoding='utf-8')
print('Switched all characteristics to DefaultEnvironment and default red/blue lighting')
