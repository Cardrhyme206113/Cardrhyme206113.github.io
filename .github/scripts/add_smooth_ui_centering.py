from pathlib import Path

path = Path('simbers.html')
text = path.read_text(encoding='utf-8')

# Wrap all top-panel UI in one cluster so auto margins can keep equal
# distance from the panel's top and bottom edges.
start_old = '''    <section class="card">
      <div class="titleRow">'''
start_new = '''    <section class="card">
      <div class="uiCluster">
        <div class="titleRow">'''
if start_old not in text:
    raise SystemExit('Card start markup not found')
text = text.replace(start_old, start_new, 1)

end_old = '''      <div id="mapStatus" class="mapStatus">Select a song.</div>
      <div id="npsNote" class="mapStatus"></div>
    </section>'''
end_new = '''        <div id="mapStatus" class="mapStatus">Select a song.</div>
        <div id="npsNote" class="mapStatus"></div>
      </div>
    </section>'''
if end_old not in text:
    raise SystemExit('Card end markup not found')
text = text.replace(end_old, end_new, 1)

# Replace the old direct-child sizing rule with a vertically auto-centered cluster.
old_cluster_css = '''  .card > *{
    position:relative;
    z-index:1;
    width:min(100%,600px);
    margin-left:auto;
    margin-right:auto;
  }'''
new_cluster_css = '''  .uiCluster{
    position:relative;
    z-index:1;
    width:min(100%,600px);
    margin-block:auto;
    margin-inline:auto;
    opacity:1;
    transform:translate3d(0,0,0);
    will-change:transform,opacity;
  }'''
if old_cluster_css not in text:
    raise SystemExit('Old card child CSS not found')
text = text.replace(old_cluster_css, new_cluster_css, 1)

# Wide-screen sizing should target the cluster too.
old_wide = '    .card > *{width:min(100%,620px)}'
new_wide = '    .uiCluster{width:min(100%,620px)}'
if old_wide not in text:
    raise SystemExit('Wide card child sizing not found')
text = text.replace(old_wide, new_wide, 1)

# Add a compositor-only FLIP animation. ResizeObserver catches status/NPS/text
# height changes and animates from the previous center to the new center.
insert_after = '''let lastMapZip = null;
let lastMapZipName = "";'''
centering_js = insert_after + '''

const uiCard = document.querySelector(".card");
const uiCluster = document.querySelector(".uiCluster");
const uiReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let uiCenterSnapshot = null;
let uiCenterRaf = 0;
let uiCenterAnimation = null;

function scheduleUiCenterMotion(animate=true){
  cancelAnimationFrame(uiCenterRaf);
  uiCenterRaf=requestAnimationFrame(()=>{
    const rect=uiCluster.getBoundingClientRect();
    const next={top:rect.top,height:rect.height};

    if(uiCenterSnapshot && animate && !uiReducedMotion.matches){
      const deltaY=uiCenterSnapshot.top-next.top;
      const heightChanged=Math.abs(uiCenterSnapshot.height-next.height)>.5;

      if(Math.abs(deltaY)>.5 || heightChanged){
        if(uiCenterAnimation) uiCenterAnimation.cancel();
        uiCenterAnimation=uiCluster.animate([
          {
            transform:`translate3d(0,${deltaY}px,0)`,
            opacity:1,
            offset:0
          },
          {
            transform:`translate3d(0,${deltaY*.72}px,0)`,
            opacity:.68,
            offset:.26
          },
          {
            transform:`translate3d(0,${deltaY*.16}px,0)`,
            opacity:.9,
            offset:.68
          },
          {
            transform:"translate3d(0,0,0)",
            opacity:1,
            offset:1
          }
        ],{
          duration:560,
          easing:"cubic-bezier(.22,1,.36,1)"
        });
        uiCenterAnimation.addEventListener("finish",()=>{
          uiCenterAnimation=null;
        },{once:true});
      }
    }

    uiCenterSnapshot=next;
  });
}

const uiCenterResizeObserver=new ResizeObserver(()=>scheduleUiCenterMotion(true));
uiCenterResizeObserver.observe(uiCard);
uiCenterResizeObserver.observe(uiCluster);
requestAnimationFrame(()=>scheduleUiCenterMotion(false));
if(document.fonts && document.fonts.ready){
  document.fonts.ready.then(()=>scheduleUiCenterMotion(true));
}'''
if insert_after not in text:
    raise SystemExit('UI centering JS insertion point not found')
text = text.replace(insert_after, centering_js, 1)

path.write_text(text, encoding='utf-8')
print('Added equal-spacing top-panel centering with smooth parabolic fade motion')
