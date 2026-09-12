/*
 * Reader translation engine v2
 *
 * Google is the preferred live provider for Turkish. It translates stable text
 * blocks around the current reading position, replaces the real reader DOM,
 * then lets the reader repaginate normally. Completed block translations are
 * cached in IndexedDB. If Google fails or times out, the reader falls back to
 * its existing built-in translated content for the rest of the session.
 */
(()=>{
'use strict';

const ENGINE_KEY='reader-translation-engine';
const DEFAULT_ENGINE='google';
const FALLBACK_ENGINE='builtin';
const SOURCE_LANG='en';
const TARGET_LANG='tr';
const GOOGLE_ENDPOINT='https://translate.googleapis.com/translate_a/single';
const GOOGLE_TIMEOUT_MS=6500;
const GOOGLE_RETRY_DELAY_MS=3000;
const GOOGLE_MAX_RETRIES=3;
const GOOGLE_CHUNK_LIMIT=4200;
const BATCH_CHAR_LIMIT=3400;
const BUFFER_PAGES=1;
const CACHE_DB='reader-translation-block-cache-v2';
const CACHE_STORE='blocks';
const CACHE_VERSION=1;
const CACHE_MAX_ENTRIES=5000;
const BLOCK_SELECTOR='h1,h2,h3,h4,h5,h6,p,li,blockquote,figcaption,dt,dd,td,th';

const providers=new Map();
const inflight=new Map();
const memCache=new Map();
const sourceSnapshots=new Map();
const snapshotOrder=[];
let dbPromise=null;
let settingsSection=null;
let syncTicket=0;
let syncQueued=false;
let applying=false;
let changingEngine=false;
let fallbackActive=false;
let fallbackBusy=false;
let forcedFailureCount=0;
const debugEvents=[];
let lastFailure=null;
let diagnosticsOpen=false;
function debugEvent(stage,data={}){
  const e={time:new Date().toISOString(),stage,...data};
  debugEvents.push(e);
  while(debugEvents.length>80)debugEvents.shift();
  if(stage.includes('fail')||stage.includes('error'))console.warn('[reader-translation]',stage,e);
  else console.debug('[reader-translation]',stage,e);
  refreshSettingsUI();
  return e
}
function normalizeError(err){
  return {
    name:String(err?.name||'Error'),
    message:String(err?.message||err||'Unknown error'),
    stack:err?.stack?String(err.stack).split('\n').slice(0,4).join('\n'):''
  }
}

function trUI(){
  try{return uiLanguage==='tr'}catch(_){return document.documentElement.lang==='tr'}
}
function preferredEngine(){
  let v=null;
  try{v=localStorage.getItem(ENGINE_KEY)}catch(_){}
  v=v||DEFAULT_ENGINE;
  return providers.has(v)?v:DEFAULT_ENGINE
}
function effectiveEngine(){
  const p=preferredEngine();
  return fallbackActive&&p==='google'?FALLBACK_ENGINE:p
}
function usesLiveTranslation(){
  return trUI()&&effectiveEngine()!=='builtin'
}
function esc(s){
  return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
}
function cleanText(s){
  return String(s||'').replace(/\u00ad/g,'').replace(/[ \t\f\v]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim()
}
function hashText(s){
  let h=0x811c9dc5;
  for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x01000193)}
  return (h>>>0).toString(16).padStart(8,'0')
}
function currentBookId(){try{return BOOK?.id||''}catch(_){return''}}
function sectionKey(){return currentBookId()+'|'+String(state?.section??0)}

function registerProvider(provider){
  if(!provider||!provider.id)throw new Error('Translation provider requires an id');
  providers.set(String(provider.id),provider);
  refreshSettingsUI();
  return provider.id
}

registerProvider({
  id:'builtin',
  label:{en:'Built-in',tr:'Yerleşik'},
  description:{
    en:'Use the reader’s existing pretranslated Turkish content.',
    tr:'Okuyucudaki mevcut önceden çevrilmiş Türkçe içeriği kullanır.'
  }
});

function parseGooglePayload(data){
  if(!Array.isArray(data)||!Array.isArray(data[0]))throw new Error('Unexpected Google Translate response');
  return cleanText(data[0].map(x=>Array.isArray(x)?(x[0]||''):'').join(''))
}
async function googleRequest(text){
  if(forcedFailureCount>0){forcedFailureCount--;throw new Error('Simulated Google failure')}
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),GOOGLE_TIMEOUT_MS);
  const params=new URLSearchParams({client:'gtx',sl:SOURCE_LANG,tl:TARGET_LANG,dt:'t'});
  const started=performance.now();
  let postError=null;
  try{
    let r;
    try{
      r=await fetch(GOOGLE_ENDPOINT+'?'+params.toString(),{
        method:'POST',
        mode:'cors',
        credentials:'omit',
        signal:controller.signal,
        headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},
        body:new URLSearchParams({q:text})
      });
      if(!r.ok){
        const e=new Error('POST HTTP '+r.status);
        e.httpStatus=r.status;e.method='POST';throw e
      }
      debugEvent('google.post.ok',{ms:Math.round(performance.now()-started),status:r.status,chars:text.length})
    }catch(err){
      postError=err;
      debugEvent('google.post.fail',{ms:Math.round(performance.now()-started),...normalizeError(err)});
      if(controller.signal.aborted)throw err;
      const u=GOOGLE_ENDPOINT+'?'+params.toString()+'&q='+encodeURIComponent(text);
      const getStarted=performance.now();
      r=await fetch(u,{mode:'cors',credentials:'omit',signal:controller.signal});
      if(!r.ok){
        const e=new Error('GET HTTP '+r.status);
        e.httpStatus=r.status;e.method='GET';e.postError=postError;throw e
      }
      debugEvent('google.get.ok',{ms:Math.round(performance.now()-getStarted),status:r.status,chars:text.length})
    }
    const parsed=parseGooglePayload(await r.json());
    debugEvent('google.request.ok',{ms:Math.round(performance.now()-started),chars:text.length,via:postError?'GET':'POST'});
    return parsed
  }catch(err){
    const info={ms:Math.round(performance.now()-started),chars:text.length,...normalizeError(err)};
    lastFailure={stage:'google.request',...info};
    debugEvent('google.request.fail',info);
    throw err
  }finally{clearTimeout(timer)}
}
function splitText(text,limit=GOOGLE_CHUNK_LIMIT){
  text=cleanText(text);
  if(!text)return[];
  if(text.length<=limit)return[text];
  const out=[];
  let rest=text;
  while(rest.length>limit){
    let cut=rest.lastIndexOf('\n\n',limit);
    if(cut<limit*.55)cut=rest.lastIndexOf('\n',limit);
    if(cut<limit*.55){
      const part=rest.slice(0,limit+1);
      const ms=[...part.matchAll(/[.!?…][”’"')\]]?\s+/g)];
      cut=ms.length?ms[ms.length-1].index+ms[ms.length-1][0].length:limit
    }
    if(cut<limit*.45)cut=limit;
    out.push(rest.slice(0,cut).trim());
    rest=rest.slice(cut).trimStart()
  }
  if(rest)out.push(rest);
  return out
}
async function googleTranslate(text){
  const chunks=splitText(text);
  const out=[];
  for(const chunk of chunks){
    let lastError=null;
    for(let attempt=0;attempt<=GOOGLE_MAX_RETRIES;attempt++){
      const attemptStarted=performance.now();
      debugEvent('google.attempt.start',{attempt:attempt+1,total:GOOGLE_MAX_RETRIES+1,chars:chunk.length});
      try{
        out.push(await googleRequest(chunk));
        debugEvent('google.attempt.ok',{attempt:attempt+1,total:GOOGLE_MAX_RETRIES+1,ms:Math.round(performance.now()-attemptStarted)});
        lastError=null;
        break
      }catch(err){
        lastError=err;
        const info={attempt:attempt+1,total:GOOGLE_MAX_RETRIES+1,ms:Math.round(performance.now()-attemptStarted),...normalizeError(err)};
        lastFailure={stage:'google.attempt',...info};
        debugEvent('google.attempt.fail',info);
        if(attempt<GOOGLE_MAX_RETRIES){
          debugEvent('google.retry.wait',{delayMs:GOOGLE_RETRY_DELAY_MS,nextAttempt:attempt+2});
          await new Promise(r=>setTimeout(r,GOOGLE_RETRY_DELAY_MS))
        }
      }
    }
    if(lastError)throw lastError
  }
  return cleanText(out.join('\n\n'))
}
registerProvider({
  id:'google',
  label:{en:'Google Translate',tr:'Google Translate'},
  description:{
    en:'Recommended. Live Google translation with automatic built-in fallback.',
    tr:'Önerilen. Canlı Google çevirisi; hata durumunda otomatik yerleşik yedek.'
  },
  translate:googleTranslate
});

function openDB(){
  if(dbPromise)return dbPromise;
  if(!('indexedDB' in window))return Promise.resolve(null);
  dbPromise=new Promise(resolve=>{
    const req=indexedDB.open(CACHE_DB,CACHE_VERSION);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(CACHE_STORE)){
        const s=db.createObjectStore(CACHE_STORE,{keyPath:'key'});
        s.createIndex('ts','ts',{unique:false})
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
      const v=req.result?.text??null;
      if(v!=null)memCache.set(key,v);
      resolve(v)
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
  if(++writesSinceCleanup>=80){writesSinceCleanup=0;cleanupCache(db).catch(()=>{})}
}
async function cleanupCache(db){
  const count=await new Promise(resolve=>{
    const req=db.transaction(CACHE_STORE,'readonly').objectStore(CACHE_STORE).count();
    req.onsuccess=()=>resolve(req.result||0);req.onerror=()=>resolve(0)
  });
  if(count<=CACHE_MAX_ENTRIES)return;
  let left=count-CACHE_MAX_ENTRIES;
  await new Promise(resolve=>{
    const tx=db.transaction(CACHE_STORE,'readwrite');
    const idx=tx.objectStore(CACHE_STORE).index('ts');
    idx.openCursor().onsuccess=e=>{
      const cur=e.target.result;
      if(!cur||left<=0)return;
      cur.delete();left--;cur.continue()
    };
    tx.oncomplete=()=>resolve();tx.onerror=()=>resolve();tx.onabort=()=>resolve()
  })
}

function blockElements(){
  const prose=document.querySelector('#proseContent');
  if(!prose)return[];
  const all=[...prose.querySelectorAll(BLOCK_SELECTOR)];
  return all.filter(el=>{
    if(!cleanText(el.textContent))return false;
    if(el.querySelector('img,svg,video,audio,canvas'))return false;
    return ![...el.children].some(ch=>ch.matches?.(BLOCK_SELECTOR))
  })
}
function assignBlockIds(blocks){
  blocks.forEach((el,i)=>{el.dataset.readerTranslationBlock=String(i)})
}
function sourceBlockText(el){
  if(el?.classList?.contains('chapterTitle')){
    const kicker=cleanText(el.querySelector('.chapterKicker')?.textContent||'');
    const name=cleanText(el.querySelector('.chapterName')?.textContent||'');
    return cleanText([kicker,(name&&name!==kicker)?name:''].filter(Boolean).join(': '))
  }
  return cleanText(el?.textContent||'')
}
function snapshotCurrentSection(){
  if(!BOOK||state?.view!=='reader'||current?.().imageOnly)return;
  const blocks=blockElements();
  assignBlockIds(blocks);
  const key=sectionKey();
  const texts=new Map();
  for(const el of blocks)texts.set(el.dataset.readerTranslationBlock,sourceBlockText(el));
  sourceSnapshots.set(key,texts);
  const pos=snapshotOrder.indexOf(key);
  if(pos>=0)snapshotOrder.splice(pos,1);
  snapshotOrder.push(key);
  while(snapshotOrder.length>20){
    const old=snapshotOrder.shift();
    if(old)sourceSnapshots.delete(old)
  }
}
function sourceForBlock(el){
  return sourceSnapshots.get(sectionKey())?.get(el.dataset.readerTranslationBlock)||null
}
function wordRange(el){
  const words=[...el.querySelectorAll('.wordAnchor[data-wi]')];
  if(!words.length)return null;
  return{first:+words[0].dataset.wi,last:+words[words.length-1].dataset.wi}
}
function currentAnchorBlockId(blocks){
  if(state.mode==='scroll'){
    const host=document.querySelector('#scrollHost');
    if(!host)return blocks[0]?.dataset.readerTranslationBlock||null;
    const top=host.getBoundingClientRect().top+4;
    let best=null,bestDist=Infinity;
    for(const el of blocks){
      const r=el.getBoundingClientRect();
      if(r.bottom>=top){
        const d=Math.abs(r.top-top);
        if(d<bestDist){best=el;bestDist=d}
      }
    }
    return best?.dataset.readerTranslationBlock||blocks[0]?.dataset.readerTranslationBlock||null
  }
  const start=state.pageAnchors?.[state.page]?.index??0;
  for(const el of blocks){
    const r=wordRange(el);
    if(r&&r.last>=start)return el.dataset.readerTranslationBlock
  }
  return blocks[0]?.dataset.readerTranslationBlock||null
}
function blocksForWindow(){
  const blocks=blockElements();
  assignBlockIds(blocks);
  if(!blocks.length)return[];
  if(state.mode==='scroll'){
    const host=document.querySelector('#scrollHost');
    if(!host)return blocks.slice(0,12);
    const vr=host.getBoundingClientRect();
    const bottom=vr.bottom+host.clientHeight*BUFFER_PAGES;
    return blocks.filter(el=>{
      const r=el.getBoundingClientRect();
      return r.bottom>=vr.top-24&&r.top<=bottom
    })
  }
  const page=Math.max(0,+state.page||0);
  const start=state.pageAnchors?.[page]?.index??0;
  const end=state.pageAnchors?.[page+BUFFER_PAGES+1]?.index??(state.wordCount||Number.MAX_SAFE_INTEGER);
  const chosen=blocks.filter(el=>{
    const r=wordRange(el);
    return r&&r.last>=start&&r.first<end
  });
  return chosen.length?chosen:blocks.slice(0,10)
}
function makeCacheKey(blockId,source){
  return[
    effectiveEngine(),SOURCE_LANG+'-'+TARGET_LANG,currentBookId(),String(state.section||0),String(blockId),hashText(source)
  ].join('|')
}

function groupForBatch(items){
  const groups=[];
  let g=[],chars=0;
  for(const item of items){
    const n=item.source.length+18;
    if(g.length&&chars+n>BATCH_CHAR_LIMIT){groups.push(g);g=[];chars=0}
    g.push(item);chars+=n
  }
  if(g.length)groups.push(g);
  return groups
}
function marker(i){return '__RDR'+i+'__'}
function parseMarkedTranslation(text,count){
  const re=/__RDR\s*(\d+)\s*__/g;
  const hits=[...String(text||'').matchAll(re)];
  if(hits.length!==count)return null;
  const out=Array(count).fill('');
  for(let i=0;i<hits.length;i++){
    const idx=+hits[i][1];
    const from=hits[i].index+hits[i][0].length;
    const to=i+1<hits.length?hits[i+1].index:String(text).length;
    if(idx<0||idx>=count)return null;
    out[idx]=cleanText(String(text).slice(from,to))
  }
  return out.every(Boolean)?out:null
}
async function translateGroup(group){
  if(group.length===1)return[await providers.get(effectiveEngine()).translate(group[0].source)];
  const payload=group.map((x,i)=>marker(i)+'\n'+x.source).join('\n\n');
  const translated=await providers.get(effectiveEngine()).translate(payload);
  const parsed=parseMarkedTranslation(translated,group.length);
  if(parsed)return parsed;
  const out=[];
  for(const item of group)out.push(await providers.get(effectiveEngine()).translate(item.source));
  return out
}
async function translateItems(items){
  const results=new Map();
  const missing=[];
  for(const item of items){
    const cached=await cacheGet(item.key);
    if(cached!=null)results.set(item.id,cached);
    else missing.push(item)
  }
  for(const group of groupForBatch(missing)){
    const signature=group.map(x=>x.key).join('\n');
    let promise=inflight.get(signature);
    if(!promise){
      promise=(async()=>{
        const texts=await translateGroup(group);
        for(let i=0;i<group.length;i++)await cachePut(group[i].key,cleanText(texts[i]));
        return texts
      })().finally(()=>inflight.delete(signature));
      inflight.set(signature,promise)
    }
    const texts=await promise;
    group.forEach((item,i)=>results.set(item.id,cleanText(texts[i])))
  }
  return results
}

function unwrapWordAnchors(prose){
  prose.querySelectorAll('.wordAnchor').forEach(span=>span.replaceWith(document.createTextNode(span.textContent||'')));
  prose.normalize()
}
function installStyles(){
  if(document.querySelector('#readerTranslationStylesV2'))return;
  const s=document.createElement('style');
  s.id='readerTranslationStylesV2';
  s.textContent=[
    '#proseContent{transition:opacity .12s ease}',
    '#proseContent.readerTranslationSwapping{opacity:.28}',
    '#readerTranslationSettings .readerTranslationSeg{min-width:0}',
    '#readerTranslationSettings .readerTranslationSeg button{min-width:0;padding:0 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#readerTranslationSettings .readerTranslationHint{margin-top:8px;color:var(--muted);font-size:9.5px;line-height:1.45}',
    '#readerTranslationSettings .readerTranslationDiagRow{display:flex;gap:6px;margin-top:9px;flex-wrap:wrap}',
    '#readerTranslationSettings .readerTranslationDiagBtn{appearance:none;border:1px solid var(--line);background:var(--surface);color:var(--readingText);border-radius:7px;padding:6px 9px;font:600 9px/1.2 inherit}',
    '#readerTranslationSettings .readerTranslationDiag{margin-top:8px;border:1px solid var(--line);border-radius:8px;background:color-mix(in srgb,var(--surface) 88%,transparent);overflow:hidden}',
    '#readerTranslationSettings .readerTranslationDiagHead{padding:7px 8px;border-bottom:1px solid var(--line);font:700 9px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted)}',
    '#readerTranslationSettings .readerTranslationDiagList{max-height:220px;overflow:auto;padding:4px 0}',
    '#readerTranslationSettings .readerTranslationDiagItem{padding:5px 8px;border-top:1px solid color-mix(in srgb,var(--line) 60%,transparent);font:500 8.5px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere}',
    '#readerTranslationSettings .readerTranslationDiagItem:first-child{border-top:0}',
    '#readerTranslationSettings .readerTranslationDiagItem.fail{color:#d46d62}',
    '#readerTranslationSettings .readerTranslationDiagTime{opacity:.66;margin-right:5px}'
  ].join('\n');
  document.head.appendChild(s)
}
async function applyTranslations(items,translations,anchorBlockId){
  if(!items.length||!translations.size)return;
  const prose=document.querySelector('#proseContent');
  if(!prose)return;
  const progress=typeof currentSectionFraction==='function'?currentSectionFraction():0;
  applying=true;
  prose.classList.add('readerTranslationSwapping');
  await new Promise(r=>requestAnimationFrame(r));
  try{
    let changed=0;
    for(const item of items){
      const translated=translations.get(item.id);
      if(!translated||item.el.dataset.readerTranslationHash===item.hash)continue;
      item.el.textContent=translated;
      item.el.dataset.readerTranslationHash=item.hash;
      item.el.dataset.readerTranslatedProvider=effectiveEngine();
      changed++
    }
    if(!changed)return;
    unwrapWordAnchors(prose);
    if(typeof indexAndEmphasizeWords==='function')indexAndEmphasizeWords(prose);
    let anchor=null;
    const anchorBlock=prose.querySelector('[data-reader-translation-block="'+CSS.escape(String(anchorBlockId||''))+'"]');
    const first=anchorBlock?.querySelector('.wordAnchor[data-wi]');
    if(first&&typeof anchorFromSpan==='function')anchor=anchorFromSpan(first);
    if(typeof applyLayout==='function')applyLayout(progress,anchor)
  }finally{
    applying=false;
    requestAnimationFrame(()=>prose.classList.remove('readerTranslationSwapping'))
  }
}
async function activateFallback(reason){
  if(fallbackActive||fallbackBusy||preferredEngine()!=='google')return;
  fallbackBusy=true;fallbackActive=true;syncTicket++;
  refreshSettingsUI();
  debugEvent('fallback.activate',{reason:normalizeError(reason),book:currentBookId(),section:state?.section,page:state?.page});
  console.warn('[reader-translation] Google fallback',reason);
  try{
    if(typeof saveReadingProgress==='function'&&BOOK&&state?.view==='reader')saveReadingProgress();
    const id=currentBookId();
    if(id&&state?.view==='reader'&&typeof openBook==='function')await openBook(id)
  }catch(e){console.warn('[reader-translation] fallback reload failed',e)}
  finally{fallbackBusy=false}
}

async function syncVisibleWindow(){
  syncQueued=false;
  const ticket=++syncTicket;
  if(applying||fallbackBusy||!usesLiveTranslation()||!BOOK||state?.view!=='reader'||current().imageOnly)return;
  let snapshot=sourceSnapshots.get(sectionKey());
  if(!snapshot){snapshotCurrentSection();snapshot=sourceSnapshots.get(sectionKey())}
  if(!snapshot)return;
  const blocks=blockElements();
  assignBlockIds(blocks);
  const anchorId=currentAnchorBlockId(blocks);
  const targets=blocksForWindow();
  const items=[];
  for(const el of targets){
    const id=el.dataset.readerTranslationBlock;
    const source=sourceForBlock(el);
    if(!source)continue;
    const hash=hashText(source);
    if(el.dataset.readerTranslationHash===hash)continue;
    items.push({id,el,source,hash,key:makeCacheKey(id,source)})
  }
  if(!items.length)return;
  let translations;
  try{
    translations=await translateItems(items)
  }catch(err){
    if(ticket!==syncTicket)return;
    const info={...normalizeError(err),book:currentBookId(),section:state.section,page:state.page};
    lastFailure={stage:'provider.translation',...info};
    debugEvent('provider.translation.fail',info);
    await activateFallback(err);
    return
  }
  if(ticket!==syncTicket||effectiveEngine()==='builtin')return;
  try{
    await applyTranslations(items,translations,anchorId)
  }catch(err){
    const info={...normalizeError(err),book:currentBookId(),section:state.section,page:state.page};
    lastFailure={stage:'reader.apply',...info};
    debugEvent('reader.apply.error',info);
    // Do NOT switch engines: Google may have succeeded and only the reader
    // replacement/repagination path failed.
    console.error('[reader-translation] DOM apply/repagination failed; keeping Google selected',err);
    return
  }
  if(ticket!==syncTicket)return;
  queueSync()
}
function queueSync(){
  if(syncQueued||applying)return;
  syncQueued=true;
  requestAnimationFrame(()=>syncVisibleWindow().catch(e=>console.warn('[reader-translation] sync failed',e)))
}

function localized(provider,field){
  const v=provider?.[field];
  if(typeof v==='string')return v;
  return v?.[trUI()?'tr':'en']||v?.en||''
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
function formatDiagEvent(e){
  const t=String(e.time||'').slice(11,19);
  const parts=[e.stage||'event'];
  if(e.attempt)parts.push((trUI()?'deneme ':'attempt ')+e.attempt+'/'+(e.total||'?'));
  if(Number.isFinite(e.ms))parts.push(e.ms+' ms');
  if(Number.isFinite(e.status))parts.push('HTTP '+e.status);
  if(e.via)parts.push(e.via);
  if(Number.isFinite(e.delayMs))parts.push((trUI()?'bekle ':'wait ')+(e.delayMs/1000)+' s');
  if(e.name||e.message)parts.push([e.name,e.message].filter(Boolean).join(': '));
  return '<div class="readerTranslationDiagItem '+((String(e.stage).includes('fail')||String(e.stage).includes('error'))?'fail':'')+'"><span class="readerTranslationDiagTime">'+esc(t)+'</span>'+esc(parts.join(' · '))+'</div>'
}
function renderDiagnostics(){
  const events=debugEvents.slice(-16).reverse();
  const status=fallbackActive
    ?(trUI()?'Yerleşik yedek aktif':'Built-in fallback active')
    :(effectiveEngine()==='google'?(trUI()?'Google aktif':'Google active'):(trUI()?'Yerleşik aktif':'Built-in active'));
  return '<div class="readerTranslationDiag" '+(diagnosticsOpen?'':'hidden')+'>'+
    '<div class="readerTranslationDiagHead">'+esc(status)+' · '+esc((trUI()?'son ':'last ')+events.length+(trUI()?' olay':' events'))+'</div>'+
    '<div class="readerTranslationDiagList">'+(events.length?events.map(formatDiagEvent).join(''):'<div class="readerTranslationDiagItem">'+esc(trUI()?'Henüz tanılama olayı yok.':'No diagnostic events yet.')+'</div>')+'</div>'+
    '</div>'
}
function refreshSettingsUI(){
  if(!settingsSection)return;
  const current=preferredEngine();
  const title=trUI()?'Çeviri':'Translation';
  const label=trUI()?'Çeviri motoru':'Translation engine';
  let hint=trUI()
    ?'Google varsayılandır. Mevcut sayfa çevresindeki metin bloklarını toplu çevirir, +1 sayfa önden gider ve sonucu bu cihazda önbelleğe alır.'
    :'Google is the default. It batch-translates text blocks around the current page, keeps a +1 page buffer, and caches results on this device.';
  if(fallbackActive&&current==='google')hint+=(trUI()?' Google bu oturumda yanıt vermediği için yerleşik yedek aktif.':' Built-in fallback is active for this session because Google did not respond.');
  if(lastFailure){
    const detail=(lastFailure.name?lastFailure.name+': ':'')+(lastFailure.message||'');
    hint+=' '+(trUI()?'Son hata':'Last error')+': '+lastFailure.stage+' · '+detail;
    if(lastFailure.attempt)hint+=' · '+(trUI()?'deneme ':'attempt ')+lastFailure.attempt+'/'+lastFailure.total;
    if(Number.isFinite(lastFailure.ms))hint+=' · '+lastFailure.ms+' ms'
  }
  settingsSection.innerHTML=
    '<div class="settingsGroupTitle">'+esc(title)+'</div>'+
    '<div class="setting two"><label>'+esc(label)+'</label><div class="seg readerTranslationSeg" id="readerTranslationEngine">'+
    [...providers.values()].map(p=>{
      const on=p.id===current;
      const suffix=p.id==='google'?(trUI()?' · Önerilen':' · Recommended'):'';
      return '<button type="button" data-translation-engine="'+esc(p.id)+'" class="'+(on?'on':'')+'" aria-pressed="'+(on?'true':'false')+'" title="'+esc(localized(p,'description'))+'">'+esc(localized(p,'label')+suffix)+'</button>'
    }).join('')+
    '</div></div><div class="readerTranslationHint">'+esc(hint)+'</div>'+
    '<div class="readerTranslationDiagRow"><button type="button" class="readerTranslationDiagBtn" data-translation-diagnostics>'+
      esc(diagnosticsOpen?(trUI()?'Ayrıntıları gizle':'Hide details'):(trUI()?'Hata ayrıntıları':'Failure details'))+
    '</button>'+
    (fallbackActive&&current==='google'?'<button type="button" class="readerTranslationDiagBtn" data-translation-retry>'+esc(trUI()?'Google\'ı tekrar dene':'Retry Google')+'</button>':'')+
    '</div>'+renderDiagnostics();
  settingsSection.querySelectorAll('[data-translation-engine]').forEach(btn=>btn.addEventListener('click',()=>setEngine(btn.dataset.translationEngine)));
  settingsSection.querySelector('[data-translation-diagnostics]')?.addEventListener('click',()=>{diagnosticsOpen=!diagnosticsOpen;refreshSettingsUI()});
  settingsSection.querySelector('[data-translation-retry]')?.addEventListener('click',()=>window.ReaderTranslation?.retryGoogle?.())
}
async function setEngine(id){
  if(changingEngine||!providers.has(id))return;
  const same=id===preferredEngine();
  if(same&&!(id==='google'&&fallbackActive))return;
  changingEngine=true;
  try{
    if(typeof saveReadingProgress==='function'&&BOOK&&state?.view==='reader')saveReadingProgress();
    try{localStorage.setItem(ENGINE_KEY,id)}catch(_){}
    fallbackActive=false;fallbackBusy=false;syncTicket++;
    refreshSettingsUI();
    const book=currentBookId();
    if(book&&state?.view==='reader'&&typeof openBook==='function')await openBook(book);
    queueSync()
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
  if(typeof setSectionMarkup==='function'){
    const base=setSectionMarkup;
    setSectionMarkup=function(){
      const out=base.apply(this,arguments);
      if(usesLiveTranslation())snapshotCurrentSection();
      queueSync();
      return out
    }
  }
  if(typeof setPage==='function'){
    const base=setPage;
    setPage=function(){
      const out=base.apply(this,arguments);
      queueSync();
      return out
    }
  }
  if(typeof updateHud==='function'){
    const base=updateHud;
    updateHud=function(){
      const out=base.apply(this,arguments);
      if(!applying)queueSync();
      return out
    }
  }
  if(typeof openBook==='function'){
    const base=openBook;
    openBook=async function(){
      const out=await base.apply(this,arguments);
      if(usesLiveTranslation()&&BOOK)BOOK.contentLanguage='en';
      queueSync();
      return out
    }
  }
  if(typeof applyLanguage==='function'){
    const base=applyLanguage;
    applyLanguage=function(){
      const out=base.apply(this,arguments);
      refreshSettingsUI();queueSync();return out
    }
  }
}

function boot(){
  installStyles();
  installSettingsUI();
  patchReader();
  document.querySelector('#scrollHost')?.addEventListener('scroll',()=>{if(state?.mode==='scroll')queueSync()},{passive:true});
  window.addEventListener('resize',queueSync,{passive:true});
  console.info('[reader-translation] preferred='+preferredEngine()+' · effective='+effectiveEngine()+' · block batching · buffer='+BUFFER_PAGES)
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();

window.ReaderTranslation={
  registerProvider,
  get engine(){return preferredEngine()},
  get effectiveEngine(){return effectiveEngine()},
  get providers(){return [...providers.keys()]},
  get fallbackActive(){return fallbackActive},
  get lastFailure(){return lastFailure?{...lastFailure}:null},
  diagnostics(){return {engine:preferredEngine(),effectiveEngine:effectiveEngine(),fallbackActive,lastFailure:lastFailure?{...lastFailure}:null,events:debugEvents.slice()}},
  setEngine,
  refresh:queueSync,
  retryGoogle(){fallbackActive=false;fallbackBusy=false;refreshSettingsUI();const id=currentBookId();return id&&state?.view==='reader'?openBook(id):Promise.resolve()},
  simulateGoogleFailure(count=1){forcedFailureCount=Math.max(1,+count||1);queueSync()},
  simulateFallback(){return activateFallback(new Error('Simulated Google fallback'))},
  clearMemoryCache(){memCache.clear()},
  constants:{sourceLanguage:SOURCE_LANG,targetLanguage:TARGET_LANG,pageBuffer:BUFFER_PAGES,googleTimeoutMs:GOOGLE_TIMEOUT_MS,googleRetryDelayMs:GOOGLE_RETRY_DELAY_MS,googleMaxRetries:GOOGLE_MAX_RETRIES,batchCharLimit:BATCH_CHAR_LIMIT}
};
})();
