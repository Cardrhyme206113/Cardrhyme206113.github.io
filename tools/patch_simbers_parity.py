from pathlib import Path
import re

path = Path("simbers.html")
text = path.read_text(encoding="utf-8")

if "function parityFilteredOptions" not in text:
    helper = '''function parityFilteredOptions(options,previous,boundaryTarget){
  if(boundaryTarget)return [boundaryTarget];
  if(!previous)return options;
  const target=oppositeDirection(previous.direction);
  if(options.includes(target))return [target];
  const ranked=options
    .filter(direction=>direction!==previous.direction)
    .sort((a,b)=>
      angleDistance(CUT[a].deg,CUT[target].deg)-
      angleDistance(CUT[b].deg,CUT[target].deg)
    );
  return ranked.length?[ranked[0]]:[target];
}
'''
    text, count = re.subn(
        r"(function parityPenalty\(previous,direction,time\)\{)",
        helper + r"\1",
        text,
        count=1,
    )
    if count != 1:
        raise RuntimeError("Could not insert parity helper")

text, count = re.subn(
    r"function parityPenalty\(previous,direction,time\)\{.*?\n\}",
    '''function parityPenalty(previous,direction,time){
  const d=CUT[direction];
  if(!previous)return d.dy<-.15?0:(Math.abs(d.dx)>.9?2.2:1.2);
  if(direction===previous.direction)return 1000000000;
  const dt=Math.max(.05,time-previous.time);
  const expected=(CUT[previous.direction].deg+180)%360;
  const error=angleDistance(d.deg,expected);
  let score=error/5;
  if(error>90)score+=250;
  else if(error>45)score+=45;
  else if(error>22.5)score+=12;
  if(dt<.55&&error>45)score+=80;
  return score;
}''',
    text,
    count=1,
    flags=re.S,
)
if count != 1:
    raise RuntimeError("Could not replace parity penalty")

if "leftOptions=parityFilteredOptions(" not in text:
    text, count = re.subn(
        r"\n\s*if\(boundaryTargets\?\.left\)\{\s*leftOptions=\[boundaryTargets\.left\];\s*\}\s*if\(boundaryTargets\?\.right\)\{\s*rightOptions=\[boundaryTargets\.right\];\s*\}",
        '''
  leftOptions=parityFilteredOptions(
    leftOptions,
    previous.left,
    boundaryTargets?.left
  );
  rightOptions=parityFilteredOptions(
    rightOptions,
    previous.right,
    boundaryTargets?.right
  );''',
        text,
        count=1,
        flags=re.S,
    )
    if count != 1:
        raise RuntimeError("Could not replace direction options")

path.write_text(text, encoding="utf-8")
