/*
 * Reader translation engine layer.
 *
 * Providers are pluggable through window.ReaderTranslation.registerProvider().
 * Built-in keeps the reader's existing pretranslated OPUS-MT content path.
 * Google translates the English source lazily, one visible page at a time,
 * prefetches one page ahead, and stores completed translations in IndexedDB.
 */
(()=>{
'use strict';

const ENGINE_KEY='reader-translation-engine';
const CACHE_DB='reader-translation-cache-v1';
const CACHE_STORE='pages';
const CACHE_VERSION=1;
const BUILTIN_ENGINE='builtin';
const DEFAULT_ENGINE='lingva';
const SOURCE_LANG='en';
const TARGET_LANG='tr';
const GOOGLE_ENDPOINT='https://translate.googleapis.com/translate_a/single';
const GOOGLE_CHUNK_LIMIT=4200;
const LINGVA_CHUNK_LIMIT=4800;
const LINGVA_TIMEOUT_MS=8500;
const LINGVA_BAD_INSTANCE_MS=5*60*1000;
const LINGVA_INSTANCES=[
  'https://lingva.ml',
  'https://translate.plausibility.cloud',
  'https://lingva.lunar.icu',
  'https://translate.projectsegfau.lt',
  'https://translate.jae.fi'
];
const CACHE_MAX_ENTRIES=2500;

const providers=new Map();
const inflight=new Map();
const memCache=new Map();
const lingvaBadUntil=new Map();
let dbPromise=null;
let syncTicket=0;
let overlay=null;
let overlayBody=null;
let overlayStatus=null;
let settingsSection=null;
let changingEngine=false;

function trUI(){
  try{return uiLanguage==='tr'}catch(_){return document.documentElement.lang==='tr'}
}
function readEngine(){
  let v=DEFAULT_ENGINE;
  try{v=localStorage.getItem(ENGINE_KEY)||DEFAULT_ENGINE}catch(_){}
  return providers.has(v)?v:DEFAULT_ENGINE;
}
function activeProvider(){return providers.get(readEngine())||providers.get(DEFAULT_ENGINE)}
function usesLiveTranslation(){return trUI()&&readEngine()!==BUILTIN_ENGINE}
function escHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function hashText(s){
  let h=0x811c9dc5;
  for(let i=0;i<s.length;i++){
    h^=s.charCodeAt(i);
    h=Math.imul(h,0x01000193)
  }
  return (h>>>0).toString(16).padStart(8,'0')
}
function currentBookId(){try{return BOOK?.id||''}catch(_){return''}}

function registerProvider(provider){
  if(!provider||typeof provider.id!=='string'||!provider.id.trim())throw new Error('Translation provider requires an id');
  const id=provider.id.trim();
  providers.set(id,{...provider,id});
  refreshSettingsUI();
  return id
}

registerProvider({
  id:'builtin',
  label:{en:'Built-in (OPUS-MT)',tr:'Yerleşik (OPUS-MT)'},
  description:{
    en:'Use the reader\'s existing pretranslated Turkish content when available.',
    tr:'Mevcut olduğunda okuyucudaki önceden çevrilmiş Türkçe içeriği kullanır.'
  }
});

function parseGooglePayload(data){
  if(!Array.isArray(data)||!Array.isArray(data[0]))throw new Error('Unexpected Google Translate response');
  return data[0].map(x=>Array.isArray(x)?(x[0]||''):'').join('').trim()
}

async function googleRequest(text){
  const params=new URLSearchParams({client:'gtx',sl:SOURCE_LANG,tl:TARGET_LANG,dt:'t'});
  const body=new URLSearchParams({q:text});
  let response;
  try{
    response=await fetch(`${GOOGLE_ENDPOINT}?${params}`,{
      method:'POST',
      mode:'cors',
      credentials:'omit',
      headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},
      body
    });
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
  }catch(postError){
    const url=`${GOOGLE_ENDPOINT}?${params}&q=${encodeURIComponent(text)}`;
    response=await fetch(url,{mode:'cors',credentials:'omit'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`)
  }
  return parseGooglePayload(await response.json())
}

function splitText(text,limit=GOOGLE_CHUNK_LIMIT){
  text=String(text||'').trim();
  if(!text)return[];
  if(text.length<=limit)return[text];
  const chunks=[];
  let rest=text;
  while(rest.length>limit){
    let cut=rest.lastIndexOf('\n\n',limit);
    if(cut<Math.floor(limit*.55))cut=rest.lastIndexOf('\n',limit);
    if(cut<Math.floor(limit*.55)){
      const window=rest.slice(0,limit+1);
      const matches=[...window.matchAll(/[.!?…][”’"')\]]?\s+/g)];
      cut=matches.length?matches[matches.length-1].index+matches[matches.length-1][0].length:-1
    }
    if(cut<Math.floor(limit*.45))cut=limit;
    chunks.push(rest.slice(0,cut).trim());
    rest=rest.slice(cut).trimStart()
  }
  if(rest.trim())chunks.push(rest.trim());
  return chunks
}

async function googleTranslate(text){
  const chunks=splitText(text);
  const out=[];
  for(const chunk of chunks)out.push(await googleRequest(chunk));
  return out.join('\n\n')
}

registerProvider({
  id:'google',
  label:{en:'Google Translate',tr:'Google Translate'},
  description:{
    en:'Translate English pages on demand with Google Translate. Unofficial endpoint; may be rate-limited.',
    tr:'İngilizce sayfaları ihtiyaç oldukça Google Translate ile çevirir. Resmî olmayan uç nokta; hız sınırı uygulanabilir.'
  },
  async translate(text){return googleTranslate(text)}
});

async function lingvaRequest(text){
  const errors=[];
  const now=Date.now();
  const candidates=LINGVA_INSTANCES
    .map((base,index)=>({base,index,badUntil:lingvaBadUntil.get(base)||0}))
    .sort((a,b)=>{
      const ag=a.badUntil>now?1:0,bg=b.badUntil>now?1:0;
      return ag-bg||a.index-b.index
    });

  for(const {base} of candidates){
    if((lingvaBadUntil.get(base)||0)>Date.now())continue;
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),LINGVA_TIMEOUT_MS);
    try{
      const r=await fetch(base+'/api/v1/'+SOURCE_LANG+'/'+TARGET_LANG,{
        method:'POST',
        mode:'cors',
        credentials:'omit',
        signal:controller.signal,
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({query:text})
      });
      if(!r.ok)throw new Error('HTTP '+r.status);
      const data=await r.json();
      if(data?.error)throw new Error(String(data.error));
      const translated=String(data?.translation||'').trim();
      if(!translated)throw new Error('Empty Lingva translation');
      clearTimeout(timer);
      return translated
    }catch(err){
      clearTimeout(timer);
      lingvaBadUntil.set(base,Date.now()+LINGVA_BAD_INSTANCE_MS);
      errors.push(base.replace(/^https?:\/\//,'')+': '+(err?.name||'Error')+' '+(err?.message||err))
    }
  }
  // If every instance is cooling down, allow one immediate retry of the primary
  // on the next user-triggered call instead of locking the engine for five minutes.
  if(LINGVA_INSTANCES.every(base=>(lingvaBadUntil.get(base)||0)>Date.now())){
    lingvaBadUntil.delete(LINGVA_INSTANCES[0])
  }
  throw new Error('All Lingva instances failed · '+errors.join(' | '))
}

async function lingvaTranslate(text){
  const chunks=splitText(text,LINGVA_CHUNK_LIMIT);
  const out=[];
  for(const chunk of chunks)out.push(await lingvaRequest(chunk));
  return out.join('\n\n')
}

registerProvider({
  id:'lingva',
  label:{en:'Lingva',tr:'Lingva'},
  description:{
    en:'Keyless Google-backed translation through public Lingva instances. Uses up to ~4,800 characters per request and automatically fails over between instances.',
    tr:'Genel Lingva sunucuları üzerinden anahtarsız, Google tabanlı çeviri. İstek başına yaklaşık 4.800 karakter kullanır ve sunucular arasında otomatik geçiş yapar.'
  },
  async translate(text){return lingvaTranslate(text)}
});

function buildMockGooglePayload(text){
  // Same outer shape consumed by parseGooglePayload(): data[0][n][0] is translated text.
  // The visible prefix makes it impossible to confuse this diagnostic provider with real Google.
  const translated='⟦YEREL API TESTİ⟧ '+String(text||'');
  return [[[translated,String(text||''),null,null,1]],null,SOURCE_LANG]
}

async function mockGoogleRequest(text){
  // No DNS, CORS, remote server or Google dependency. Keep an async boundary so this
  // still exercises the provider/request/render pipeline like a network translation.
  await new Promise(r=>setTimeout(r,60));
  const payload=buildMockGooglePayload(text);

  // Exercise the same JSON serialization/deserialization boundary an HTTP response has.
  const response=new Response(JSON.stringify(payload),{
    status:200,
    headers:{'Content-Type':'application/json;charset=UTF-8'}
  });
  if(!response.ok)throw new Error('Mock HTTP '+response.status);
  return parseGooglePayload(await response.json())
}

async function mockGoogleTranslate(text){
  const chunks=splitText(text);
  const out=[];
  for(const chunk of chunks)out.push(await mockGoogleRequest(chunk));
  return out.join('\n\n')
}

registerProvider({
  id:'google-local-mock',
  label:{en:'Local API Test',tr:'Yerel API Testi'},
  description:{
    en:'Diagnostic Google-API simulator. Runs entirely in this browser; no Google, DNS, CORS, or external network request.',
    tr:'Tanılama amaçlı Google API simülatörü. Tamamen bu tarayıcıda çalışır; Google, DNS, CORS veya dış ağ isteği kullanmaz.'
  },
  async translate(text){return mockGoogleTranslate(text)}
});

function openDB(){
  if(dbPromise)return dbPromise;
  if(!('indexedDB' in window))return Promise.resolve(null);
  dbPromise=new Promise(resolve=>{
    const req=indexedDB.open(CACHE_DB,CACHE_VERSION);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(CACHE_STORE)){
        const store=db.createObjectStore(CACHE_STORE,{keyPath:'key'});
        store.createIndex('ts','ts',{unique:false})
      }
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>resolve(null);
    req.onblocked=()=>resolve(null)
  });
  return dbPromise
}

async function cacheGet(key){
  if(memCache.has(key))return memCache.get(key);
  const db=await openDB();
  if(!db)return null;
  return new Promise(resolve=>{
    let tx;
    try{tx=db.transaction(CACHE_STORE,'readonly')}catch(_){resolve(null);return}
    const req=tx.objectStore(CACHE_STORE).get(key);
    req.onsuccess=()=>{
      const value=req.result?.text??null;
      if(value!=null)memCache.set(key,value);
      resolve(value)
    };
    req.onerror=()=>resolve(null)
  })
}

let writesSinceCleanup=0;
async function cachePut(key,text){
  memCache.set(key,text);
  const db=await openDB();
  if(!db)return;
  await new Promise(resolve=>{
    let tx;
    try{tx=db.transaction(CACHE_STORE,'readwrite')}catch(_){resolve();return}
    tx.objectStore(CACHE_STORE).put({key,text,ts:Date.now()});
    tx.oncomplete=()=>resolve();tx.onerror=()=>resolve();tx.onabort=()=>resolve()
  });
  writesSinceCleanup++;
  if(writesSinceCleanup>=64){writesSinceCleanup=0;cleanupCache(db).catch(()=>{})}
}

async function cleanupCache(db){
  const count=await new Promise(resolve=>{
    const req=db.transaction(CACHE_STORE,'readonly').objectStore(CACHE_STORE).count();
    req.onsuccess=()=>resolve(req.result||0);req.onerror=()=>resolve(0)
  });
  if(count<=CACHE_MAX_ENTRIES)return;
  const remove=count-CACHE_MAX_ENTRIES;
  await new Promise(resolve=>{
    const tx=db.transaction(CACHE_STORE,'readwrite');
    const idx=tx.objectStore(CACHE_STORE).index('ts');
    let n=0;
    idx.openCursor().onsuccess=e=>{
      const cur=e.target.result;
      if(!cur||n>=remove)return;
      cur.delete();n++;cur.continue()
    };
    tx.oncomplete=()=>resolve();tx.onerror=()=>resolve();tx.onabort=()=>resolve()
  })
}

function textFromFragment(root){
  const blocks=new Set(['P','DIV','H1','H2','H3','H4','H5','H6','LI','BLOCKQUOTE','PRE','FIGCAPTION','SECTION','ARTICLE']);
  let out='';
  const walk=node=>{
    if(node.nodeType===Node.TEXT_NODE){out+=node.nodeValue||'';return}
    if(node.nodeType!==Node.ELEMENT_NODE&&node.nodeType!==Node.DOCUMENT_FRAGMENT_NODE)return;
    const tag=node.nodeType===Node.ELEMENT_NODE?node.tagName:'';
    if(tag==='BR'){out+='\n';return}
    const block=blocks.has(tag);
    if(block&&out&&!out.endsWith('\n'))out+='\n';
    for(const child of node.childNodes)walk(child);
    if(block&&!out.endsWith('\n\n'))out+='\n\n'
  };
  walk(root);
  return out
    .replace(/[\t\f\v ]+/g,' ')
    .replace(/ *\n */g,'\n')
    .replace(/\n{3,}/g,'\n\n')
    .trim()
}

function pageSource(page){
  if(!usesLiveTranslation())return null;
  if(!currentBookId()||state?.view!=='reader'||state?.mode!=='paged')return null;
  const sec=current?.();
  if(!sec||sec.imageOnly)return null;
  const prose=document.querySelector('#proseContent');
  if(!prose)return null;
  const anchors=state.pageAnchors||[];
  const p=Math.max(0,Math.min((state.pages||1)-1,+page||0));
  const startIndex=anchors[p]?.index??0;
  const endIndex=anchors[p+1]?.index??(state.wordCount||Number(prose.dataset.wordCount)||0);
  const start=prose.querySelector(`.wordAnchor[data-wi="${startIndex}"]`);
  if(!start)return null;
  const end=endIndex<(state.wordCount||Infinity)?prose.querySelector(`.wordAnchor[data-wi="${endIndex}"]`):null;
  const range=document.createRange();
  range.setStartBefore(start);
  if(end)range.setEndBefore(end);else range.setEndAfter(prose.lastChild||prose);
  const frag=range.cloneContents();
  const text=textFromFragment(frag);
  if(!text)return null;
  const provider=readEngine();
  const book=currentBookId();
  const section=state.section||0;
  const h=hashText(text);
  return{
    provider,book,section,page:p,text,hash:h,
    key:`${provider}|${SOURCE_LANG}-${TARGET_LANG}|${book}|${section}|${p}|${h}`
  }
}

async function translatePage(page){
  const src=pageSource(page);
  if(!src)return null;
  const cached=await cacheGet(src.key);
  if(cached!=null)return{...src,translated:cached,cached:true};
  if(inflight.has(src.key))return inflight.get(src.key);
  const provider=providers.get(src.provider);
  if(!provider||typeof provider.translate!=='function')return null;
  const promise=(async()=>{
    const translated=await provider.translate(src.text,{source:SOURCE_LANG,target:TARGET_LANG,bookId:src.book,section:src.section,page:src.page});
    const clean=String(translated||'').trim();
    if(!clean)throw new Error('Empty translation');
    await cachePut(src.key,clean);
    return{...src,translated:clean,cached:false}
  })().finally(()=>inflight.delete(src.key));
  inflight.set(src.key,promise);
  return promise
}

function ensureOverlay(){
  if(overlay?.isConnected)return overlay;
  const stage=document.querySelector('#readerStage');
  if(!stage)return null;
  overlay=document.createElement('div');
  overlay.id='readerTranslationOverlay';
  overlay.hidden=true;
  overlay.innerHTML='<div class="readerTranslationStatus"></div><div class="readerTranslationBody"></div>';
  overlayStatus=overlay.querySelector('.readerTranslationStatus');
  overlayBody=overlay.querySelector('.readerTranslationBody');
  stage.appendChild(overlay);

  const style=document.createElement('style');
  style.id='readerTranslationStyles';
  style.textContent=`
    #readerTranslationOverlay{
      position:absolute;z-index:12;overflow:hidden;pointer-events:none;
      background:var(--paper);color:var(--readerTextActive,var(--readingText));
      contain:layout paint;isolation:isolate;
    }
    #readerTranslationOverlay[hidden]{display:none!important}
    #readerTranslationOverlay .readerTranslationBody{
      width:100%;height:100%;overflow:hidden;white-space:pre-wrap;
      overflow-wrap:anywhere;color:var(--readerTextActive,var(--readingText));
    }
    #readerTranslationOverlay .readerTranslationStatus{
      position:absolute;right:8px;top:7px;z-index:2;
      padding:3px 6px;border-radius:5px;background:color-mix(in srgb,var(--surface) 92%,transparent);
      color:var(--muted);font:600 8px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;
      opacity:.86;box-shadow:0 1px 6px rgba(0,0,0,.10)
    }
    #readerTranslationOverlay.ready .readerTranslationStatus{opacity:.48}
    #readerTranslationOverlay.error .readerTranslationStatus{color:#d46d62;opacity:.96}
    #readerTranslationSettings .readerTranslationSeg{min-width:0}
    #readerTranslationSettings .readerTranslationSeg button{min-width:0;padding:0 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #readerTranslationSettings .readerTranslationHint{margin-top:8px;color:var(--muted);font-size:9.5px;line-height:1.45}
  `;
  document.head.appendChild(style);
  return overlay
}

function placeOverlay(){
  if(!overlay||overlay.hidden)return;
  const m=state?.layoutMetrics;
  if(!m||m.mode!=='paged'){overlay.hidden=true;return}
  overlay.style.left=`${m.side}px`;
  overlay.style.top=`${m.topPad}px`;
  overlay.style.width=`${m.textW}px`;
  overlay.style.height=`${m.pageH}px`;
  const prose=document.querySelector('#proseContent');
  const cs=prose?getComputedStyle(prose):null;
  if(cs){
    overlayBody.style.fontFamily=cs.fontFamily;
    overlayBody.style.fontWeight=cs.fontWeight;
    overlayBody.style.letterSpacing=cs.letterSpacing
  }
  overlayBody.style.lineHeight=String(state.lineHeight||1.7);
  overlayBody.style.textAlign=state.justify?'justify':'start';
  overlayBody.style.hyphens=state.hyphen?'auto':'none';
  overlayBody.style.padding='0';
}

function fitOverlayText(){
  if(!overlayBody||overlay?.hidden)return;
  let px=Math.max(11,Number(state?.fontSize)||18);
  overlayBody.style.fontSize=px+'px';
  overlayBody.style.lineHeight=String(state?.lineHeight||1.7);
  let guard=0;
  while(overlayBody.scrollHeight>overlayBody.clientHeight+2&&px>11&&guard++<20){
    px=Math.max(11,px*.965);
    overlayBody.style.fontSize=px+'px'
  }
}

function hideOverlay(){if(overlay)overlay.hidden=true}
function showStatus(text,kind='loading'){
  ensureOverlay();
  if(!overlay)return;
  overlay.hidden=false;
  overlay.classList.toggle('ready',kind==='ready');
  overlay.classList.toggle('error',kind==='error');
  overlayStatus.textContent=text;
  placeOverlay()
}

async function syncVisiblePage(){
  const ticket=++syncTicket;
  if(!usesLiveTranslation()||state?.view!=='reader'||state?.mode!=='paged'||!BOOK||current().imageOnly){hideOverlay();return}
  ensureOverlay();
  const src=pageSource(state.page);
  if(!src){hideOverlay();return}

  const cached=await cacheGet(src.key);
  if(ticket!==syncTicket)return;
  if(cached!=null){
    renderTranslation(cached,true);
  }else{
    // Keep the English source visible while the request is in flight.
    hideOverlay();
    showTransientStatus(trUI()?'Çevriliyor…':'Translating…');
    try{
      const result=await translatePage(state.page);
      if(ticket!==syncTicket||!result)return;
      const now=pageSource(state.page);
      if(!now||now.key!==result.key)return;
      renderTranslation(result.translated,false)
    }catch(err){
      if(ticket!==syncTicket)return;
      hideOverlay();
      const providerName=localizeProviderLabel(activeProvider())||'Translation';
      showTransientStatus(providerName+' · '+(trUI()?'kullanılamıyor · İngilizce gösteriliyor':'unavailable · showing English'),true);
      console.warn('[reader-translation] translation failed',readEngine(),err)
    }
  }

  // Exactly one page ahead. No whole-chapter/background crawl.
  const next=state.page+1;
  if(next<state.pages)translatePage(next).catch(()=>{})
}

let statusToast=null,statusToastTimer=0;
function showTransientStatus(text,error=false){
  const stage=document.querySelector('#readerStage');if(!stage)return;
  if(!statusToast){
    statusToast=document.createElement('div');statusToast.id='readerTranslationToast';stage.appendChild(statusToast);
    const s=document.createElement('style');s.textContent=`#readerTranslationToast{position:absolute;z-index:18;right:12px;bottom:12px;max-width:min(330px,calc(100% - 24px));padding:6px 8px;border:1px solid var(--line);border-radius:7px;background:color-mix(in srgb,var(--surface) 94%,transparent);color:var(--muted);font:600 9px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;box-shadow:0 6px 20px rgba(0,0,0,.15);pointer-events:none;opacity:0;transform:translateY(4px);transition:opacity .15s ease,transform .15s ease}#readerTranslationToast.open{opacity:.94;transform:none}#readerTranslationToast.error{color:#d46d62}`;document.head.appendChild(s)
  }
  statusToast.textContent=text;statusToast.classList.toggle('error',!!error);statusToast.classList.add('open');
  clearTimeout(statusToastTimer);statusToastTimer=setTimeout(()=>statusToast?.classList.remove('open'),error?4200:1200)
}

function renderTranslation(text,cached){
  ensureOverlay();if(!overlay)return;
  overlay.hidden=false;overlay.classList.remove('error');overlay.classList.add('ready');
  overlayStatus.textContent=cached?(trUI()?'Önbellek':'Cached'):(localizeProviderLabel(activeProvider())||'Translation');
  overlayBody.textContent=text;
  placeOverlay();
  requestAnimationFrame(()=>{placeOverlay();fitOverlayText()})
}

function queueVisibleSync(){
  const ticket=++syncTicket;
  requestAnimationFrame(()=>{
    if(ticket!==syncTicket)return;
    syncVisiblePage().catch(err=>console.warn('[reader-translation] sync failed',err))
  })
}

function localizeProviderLabel(provider){
  const x=provider?.label;
  if(typeof x==='string')return x;
  return x?.[trUI()?'tr':'en']||x?.en||provider?.id||''
}
function localizeProviderDescription(provider){
  const x=provider?.description;
  if(typeof x==='string')return x;
  return x?.[trUI()?'tr':'en']||x?.en||''
}

function installSettingsUI(){
  const panel=document.querySelector('#settings');
  if(!panel)return;
  settingsSection=document.querySelector('#readerTranslationSettings');
  if(!settingsSection){
    settingsSection=document.createElement('section');
    settingsSection.className='settingsGroup';
    settingsSection.id='readerTranslationSettings';
    const appearance=document.querySelector('#settingsAppearanceTitle')?.closest('.settingsGroup');
    if(appearance)appearance.after(settingsSection);else panel.appendChild(settingsSection)
  }
  refreshSettingsUI()
}

function refreshSettingsUI(){
  if(!settingsSection)return;
  const current=readEngine();
  const title=trUI()?'Çeviri':'Translation';
  const label=trUI()?'Çeviri motoru':'Translation engine';
  const hint=trUI()
    ?'Türkçe seçiliyken kullanılır. Lingva anahtarsızdır; yaklaşık 4.800 karakterlik parçalara kadar çevirir, açık sayfa + sonraki 1 sayfayı hazırlar ve sonucu bu cihazda önbelleğe alır.'
    :'Used when Türkçe is selected. Lingva is keyless, translates chunks up to about 4,800 characters, keeps the visible page + 1 page ready, and caches results on this device.';
  settingsSection.innerHTML=`
    <div class="settingsGroupTitle">${escHtml(title)}</div>
    <div class="setting two">
      <label>${escHtml(label)}</label>
      <div class="seg readerTranslationSeg" id="readerTranslationEngine">${[...providers.values()].map(p=>{
        const on=p.id===current;
        const suffix=p.id==='lingva'?(trUI()?' · Önerilen':' · Recommended'):'';
        return `<button type="button" data-translation-engine="${escHtml(p.id)}" class="${on?'on':''}" aria-pressed="${on?'true':'false'}" title="${escHtml(localizeProviderDescription(p))}">${escHtml(localizeProviderLabel(p)+suffix)}</button>`
      }).join('')}</div>
    </div>
    <div class="readerTranslationHint">${escHtml(hint)}</div>`;
  settingsSection.querySelectorAll('[data-translation-engine]').forEach(btn=>{
    btn.addEventListener('click',()=>setEngine(btn.dataset.translationEngine))
  })
}

async function setEngine(id){
  if(changingEngine||!providers.has(id)||id===readEngine())return;
  changingEngine=true;
  try{
    if(typeof saveReadingProgress==='function'&&BOOK&&state?.view==='reader')saveReadingProgress();
    try{localStorage.setItem(ENGINE_KEY,id)}catch(_){}
    refreshSettingsUI();
    hideOverlay();
    const bookId=currentBookId();
    if(bookId&&state?.view==='reader'&&typeof openBook==='function'){
      await openBook(bookId)
    }
    queueVisibleSync()
  }finally{changingEngine=false}
}

function patchReader(){
  if(typeof hydrateBookSections==='function'){
    const base=hydrateBookSections;
    hydrateBookSections=async function(meta){
      if(!usesLiveTranslation())return base.apply(this,arguments);
      const copy={...meta,translated:false};
      if(Array.isArray(meta?.spine))copy.spine=meta.spine.map(s=>({...s,translated:false}));
      const sections=await base.call(this,copy);
      for(const sec of sections||[])sec.contentLanguage='en';
      return sections
    }
  }

  if(typeof ensureWebSectionLoaded==='function'){
    const base=ensureWebSectionLoaded;
    ensureWebSectionLoaded=async function(index,force=false){
      if(!usesLiveTranslation())return base.apply(this,arguments);
      const sec=BOOK?.sections?.[index];
      if(!sec)return base.apply(this,arguments);
      const translated=sec.translated;
      sec.translated=false;
      try{
        const out=await base.call(this,index,force);
        sec.contentLanguage='en';
        return out
      }finally{sec.translated=translated}
    }
  }

  if(typeof openBook==='function'){
    const base=openBook;
    openBook=async function(){
      const out=await base.apply(this,arguments);
      if(usesLiveTranslation()&&BOOK)BOOK.contentLanguage='en';
      queueVisibleSync();
      return out
    }
  }

  if(typeof updateHud==='function'){
    const base=updateHud;
    updateHud=function(){
      const out=base.apply(this,arguments);
      queueVisibleSync();
      return out
    }
  }

  if(typeof applyLanguage==='function'){
    const base=applyLanguage;
    applyLanguage=function(){
      const out=base.apply(this,arguments);
      refreshSettingsUI();
      queueVisibleSync();
      return out
    }
  }

  if(typeof applyLayout==='function'){
    const base=applyLayout;
    applyLayout=function(){
      const out=base.apply(this,arguments);
      queueVisibleSync();
      return out
    }
  }
}

function boot(){
  try{
    const migrationKey='reader-translation-lingva-default-v1';
    if(!localStorage.getItem(migrationKey)){
      const old=localStorage.getItem(ENGINE_KEY);
      if(!old||old==='google'||old==='google-local-mock')localStorage.setItem(ENGINE_KEY,'lingva');
      localStorage.setItem(migrationKey,'1')
    }
  }catch(_){}
  installSettingsUI();
  ensureOverlay();
  patchReader();
  window.addEventListener('resize',()=>{placeOverlay();queueVisibleSync()},{passive:true});
  console.info(`[reader-translation] engine=${readEngine()} · providers=${[...providers.keys()].join(',')} · page-buffer=1`)
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
else boot();

window.ReaderTranslation={
  registerProvider,
  get engine(){return readEngine()},
  get providers(){return [...providers.keys()]},
  setEngine,
  refresh:queueVisibleSync,
  clearMemoryCache(){memCache.clear()},
  constants:{sourceLanguage:SOURCE_LANG,targetLanguage:TARGET_LANG,pageBuffer:1,mockProvider:'google-local-mock',lingvaChunkLimit:LINGVA_CHUNK_LIMIT,lingvaInstances:[...LINGVA_INSTANCES]}
};
})();
