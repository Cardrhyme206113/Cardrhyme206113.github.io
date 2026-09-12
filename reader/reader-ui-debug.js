(()=>{'use strict';
if(window.ReaderUIDebug)return;

const MAX_EVENTS=180;
const events=[];
let panelOpen=false;
let section=null;
let renderQueued=false;
let lastStateSig='';
let lastVpSig='';
const nativeFetch=window.fetch.bind(window);

function esc(s){
  return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
}
function tr(){
  try{return typeof uiLanguage!=='undefined'?uiLanguage==='tr':document.documentElement.lang==='tr'}catch(_){return true}
}
function errInfo(err){
  return {
    name:String(err?.name||'Error'),
    message:String(err?.message||err||'Unknown error'),
    stack:err?.stack?String(err.stack).split('\n').slice(0,4).join('\n'):''
  }
}
function safeUrl(v){
  try{
    const u=new URL(String(v),location.href);
    return u.origin+u.pathname
  }catch(_){return String(v||'').slice(0,180)}
}
function add(stage,data={}){
  const e={time:new Date().toISOString(),stage,...data};
  events.push(e);
  while(events.length>MAX_EVENTS)events.shift();
  queueRender();
  return e
}
function queueRender(){
  if(!panelOpen||renderQueued)return;
  renderQueued=true;
  requestAnimationFrame(()=>{renderQueued=false;render()})
}
function snapshot(){
  let app={};
  try{
    const s=typeof state!=='undefined'?state:null;
    const b=typeof BOOK!=='undefined'?BOOK:null;
    app={
      view:s?.view??null,
      section:s?.section??null,
      page:s?.page??null,
      pages:s?.pages??null,
      book:b?.id??null
    }
  }catch(_){}
  const vv=window.visualViewport;
  return {
    url:location.href,
    online:navigator.onLine,
    visibility:document.visibilityState,
    viewport:{w:innerWidth,h:innerHeight,dpr:devicePixelRatio||1},
    visualViewport:vv?{
      w:Math.round(vv.width),
      h:Math.round(vv.height),
      top:Math.round(vv.offsetTop),
      left:Math.round(vv.offsetLeft),
      scale:Number(vv.scale?.toFixed?.(3)??vv.scale)
    }:null,
    app
  }
}
function allEvents(){
  const out=events.slice();
  try{
    const t=window.ReaderTranslation?.diagnostics?.();
    if(Array.isArray(t?.events)){
      for(const e of t.events)out.push({...e,stage:'translation.'+e.stage})
    }
  }catch(_){}
  return out.sort((a,b)=>String(a.time).localeCompare(String(b.time))).slice(-120)
}
function eventLine(e){
  const parts=[e.stage||'event'];
  for(const k of ['method','status','view','section','page','pages','attempt','total','ms','delayMs','w','h','top','scale']){
    if(e[k]!==undefined&&e[k]!==null)parts.push(k+'='+e[k])
  }
  if(e.url)parts.push(safeUrl(e.url));
  if(e.name||e.message)parts.push([e.name,e.message].filter(Boolean).join(': '));
  const bad=/error|fail|reject|offline|csp/i.test(String(e.stage));
  const t=String(e.time||'').slice(11,19);
  return '<div class="readerUiDbgItem '+(bad?'bad':'')+'"><span class="readerUiDbgTime">'+esc(t)+'</span>'+esc(parts.join(' · '))+'</div>'
}
function reportText(){
  const snap=snapshot();
  const lines=[
    'Reader UI diagnostics',
    'Time: '+new Date().toISOString(),
    'URL: '+location.href,
    'UA: '+navigator.userAgent,
    'Online: '+navigator.onLine,
    'Visibility: '+document.visibilityState,
    'Viewport: '+JSON.stringify(snap.viewport),
    'VisualViewport: '+JSON.stringify(snap.visualViewport),
    'Reader state: '+JSON.stringify(snap.app),
    '',
    'Recent events:'
  ];
  for(const e of allEvents()){
    lines.push(JSON.stringify(e))
  }
  return lines.join('\n')
}
async function copyReport(btn){
  const text=reportText();
  try{
    await navigator.clipboard.writeText(text)
  }catch(_){
    const ta=document.createElement('textarea');
    ta.value=text;ta.style.position='fixed';ta.style.opacity='0';
    document.body.appendChild(ta);ta.select();
    try{document.execCommand('copy')}catch(__){}
    ta.remove()
  }
  if(btn){
    const old=btn.textContent;
    btn.textContent=tr()?'Kopyalandı':'Copied';
    setTimeout(()=>{if(btn.isConnected)btn.textContent=old},1000)
  }
}
function ensureStyles(){
  if(document.querySelector('#readerUiDebugStyles'))return;
  const s=document.createElement('style');
  s.id='readerUiDebugStyles';
  s.textContent=[
    '#readerUiDebugSettings .readerUiDbgActions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}',
    '#readerUiDebugSettings .readerUiDbgBtn{appearance:none;border:1px solid var(--line);background:var(--surface);color:var(--readingText);border-radius:7px;padding:6px 9px;font:600 9px/1.2 inherit}',
    '#readerUiDebugSettings .readerUiDbgBox{margin-top:8px;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:color-mix(in srgb,var(--surface) 88%,transparent)}',
    '#readerUiDebugSettings .readerUiDbgHead{padding:7px 8px;border-bottom:1px solid var(--line);color:var(--muted);font:700 8.5px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere}',
    '#readerUiDebugSettings .readerUiDbgList{max-height:270px;overflow:auto}',
    '#readerUiDebugSettings .readerUiDbgItem{padding:5px 8px;border-top:1px solid color-mix(in srgb,var(--line) 60%,transparent);font:500 8.4px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere}',
    '#readerUiDebugSettings .readerUiDbgItem:first-child{border-top:0}',
    '#readerUiDebugSettings .readerUiDbgItem.bad{color:#d46d62}',
    '#readerUiDebugSettings .readerUiDbgTime{opacity:.62;margin-right:5px}'
  ].join('\n');
  document.head.appendChild(s)
}
function ensureSection(){
  const settings=document.querySelector('#settings');
  if(!settings)return false;
  section=document.querySelector('#readerUiDebugSettings');
  if(!section){
    section=document.createElement('section');
    section.className='settingsGroup';
    section.id='readerUiDebugSettings';
    settings.appendChild(section)
  }
  return true
}
function render(){
  if(!ensureSection())return;
  const snap=snapshot();
  const ev=allEvents();
  const title=tr()?'Hata ayıklama':'Debug';
  const show=panelOpen?(tr()?'Ayrıntıları gizle':'Hide details'):(tr()?'UI ayrıntıları':'UI details');
  const app=snap.app||{};
  const vv=snap.visualViewport;
  const head=[
    navigator.onLine?(tr()?'çevrimiçi':'online'):(tr()?'çevrimdışı':'offline'),
    'view='+(app.view??'-'),
    'sec='+(app.section??'-'),
    'page='+(app.page??'-')+'/'+(app.pages??'-'),
    vv?('vv='+vv.w+'×'+vv.h+' top='+vv.top):null
  ].filter(Boolean).join(' · ');
  section.innerHTML=
    '<div class="settingsGroupTitle">'+esc(title)+'</div>'+
    '<div class="readerUiDbgActions">'+
      '<button type="button" class="readerUiDbgBtn" data-ui-debug-toggle>'+esc(show)+'</button>'+
      '<button type="button" class="readerUiDbgBtn" data-ui-debug-copy>'+esc(tr()?'Raporu kopyala':'Copy report')+'</button>'+
      (panelOpen?'<button type="button" class="readerUiDbgBtn" data-ui-debug-clear>'+esc(tr()?'Temizle':'Clear')+'</button>':'')+
    '</div>'+
    (panelOpen?'<div class="readerUiDbgBox"><div class="readerUiDbgHead">'+esc(head)+'</div><div class="readerUiDbgList">'+
      (ev.length?ev.slice(-40).reverse().map(eventLine).join(''):'<div class="readerUiDbgItem">'+esc(tr()?'Henüz olay yok.':'No events yet.')+'</div>')+
    '</div></div>':'');
  section.querySelector('[data-ui-debug-toggle]')?.addEventListener('click',()=>{panelOpen=!panelOpen;render()});
  section.querySelector('[data-ui-debug-copy]')?.addEventListener('click',e=>copyReport(e.currentTarget));
  section.querySelector('[data-ui-debug-clear]')?.addEventListener('click',()=>{events.length=0;render()})
}

window.addEventListener('error',e=>{
  if(e.target&&e.target!==window){
    add('resource.error',{tag:e.target.tagName||'',url:e.target.currentSrc||e.target.src||e.target.href||''});
    return
  }
  add('js.error',{file:safeUrl(e.filename||''),line:e.lineno,col:e.colno,...errInfo(e.error||e.message)})
},true);
window.addEventListener('unhandledrejection',e=>add('promise.reject',errInfo(e.reason)));
window.addEventListener('securitypolicyviolation',e=>add('csp.violation',{directive:e.violatedDirective,blocked:safeUrl(e.blockedURI)}));
window.addEventListener('online',()=>add('network.online'));
window.addEventListener('offline',()=>add('network.offline'));
document.addEventListener('visibilitychange',()=>add('document.visibility',{value:document.visibilityState}));
window.addEventListener('orientationchange',()=>add('window.orientation',{value:screen.orientation?.type||window.orientation||''}));

window.fetch=async function(input,init){
  const method=String(init?.method||input?.method||'GET').toUpperCase();
  const url=typeof input==='string'?input:input?.url||'';
  const started=performance.now();
  try{
    const r=await nativeFetch(input,init);
    if(!r.ok)add('fetch.http',{method,url:safeUrl(url),status:r.status,ms:Math.round(performance.now()-started)});
    return r
  }catch(err){
    add('fetch.error',{method,url:safeUrl(url),ms:Math.round(performance.now()-started),...errInfo(err)});
    throw err
  }
};

if(window.visualViewport){
  const onVp=()=>{
    const vv=window.visualViewport;
    const sig=[Math.round(vv.width),Math.round(vv.height),Math.round(vv.offsetTop),Math.round(vv.offsetLeft),Number(vv.scale.toFixed(2))].join('|');
    if(sig===lastVpSig)return;
    lastVpSig=sig;
    add('visualViewport.change',{w:Math.round(vv.width),h:Math.round(vv.height),top:Math.round(vv.offsetTop),left:Math.round(vv.offsetLeft),scale:Number(vv.scale.toFixed(2))})
  };
  let vpTimer=0;
  const throttle=()=>{clearTimeout(vpTimer);vpTimer=setTimeout(onVp,180)};
  visualViewport.addEventListener('resize',throttle,{passive:true});
  visualViewport.addEventListener('scroll',throttle,{passive:true});
  setTimeout(onVp,0)
}
window.addEventListener('resize',()=>add('window.resize',{w:innerWidth,h:innerHeight}),{passive:true});

setInterval(()=>{
  try{
    const s=typeof state!=='undefined'?state:null;
    const b=typeof BOOK!=='undefined'?BOOK:null;
    const sig=JSON.stringify([s?.view,s?.section,s?.page,s?.pages,b?.id]);
    if(sig!==lastStateSig){
      lastStateSig=sig;
      add('reader.state',{view:s?.view??null,section:s?.section??null,page:s?.page??null,pages:s?.pages??null,book:b?.id??null})
    }
  }catch(err){add('debug.state.error',errInfo(err))}
},700);

window.ReaderUIDebug={
  log:add,
  snapshot,
  events:()=>allEvents().map(e=>({...e})),
  report:reportText,
  clear(){events.length=0;render()},
  open(){panelOpen=true;render()}
};

ensureStyles();
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',()=>{add('debug.ready');render()},{once:true})
}else{
  add('debug.ready');render()
}
})();