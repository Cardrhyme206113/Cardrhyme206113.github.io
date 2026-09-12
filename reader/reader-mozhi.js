/* Automatic EN -> TR translation through the same public Mozhi/Google route
 * tested by reader/gt.html. No settings/provider UI: the reader calls this only
 * when Turkish content is requested, and falls back to the existing packaged
 * Turkish translation if Mozhi fails.
 */
(()=>{
'use strict';

const INSTANCES=[
  'https://translate.projectsegfau.lt',
  'https://translate.privacyredirect.com',
  'https://mozhi.adminforge.de',
  'https://mozhi.ducks.party',
  'https://mozhi.pussthecat.org',
  'https://mozhi.aryak.me',
  'https://translate.nerdvpn.de',
  'https://mozhi.canine.tools',
  'https://mozhi.franklyflawless.org'
];

const CHUNK_LIMIT=1800;
const HTML_BATCH_LIMIT=1550;
const TIMEOUT_MS=7000;
const BAD_INSTANCE_MS=60000;
const DB_NAME='reader-mozhi-cache-v1';
const STORE='translations';
const DB_VERSION=1;
const CACHE_MAX=2200;

let preferredInstance=null;
const badUntil=new Map();
const memCache=new Map();
let dbPromise=null;
let writes=0;

function hashText(s){
  let h=0x811c9dc5;
  s=String(s||'');
  for(let i=0;i<s.length;i++){
    h^=s.charCodeAt(i);
    h=Math.imul(h,0x01000193)
  }
  return (h>>>0).toString(16).padStart(8,'0')
}

function openDB(){
  if(dbPromise)return dbPromise;
  dbPromise=new Promise(resolve=>{
    if(!('indexedDB' in window)){resolve(null);return}
    let req;
    try{req=indexedDB.open(DB_NAME,DB_VERSION)}catch(_){resolve(null);return}
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(STORE)){
        const s=db.createObjectStore(STORE,{keyPath:'key'});
        s.createIndex('ts','ts')
      }
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>resolve(null)
  });
  return dbPromise
}

async function cacheGet(key){
  if(!key)return null;
  if(memCache.has(key))return memCache.get(key);
  const db=await openDB();
  if(!db)return null;
  return new Promise(resolve=>{
    let tx;
    try{tx=db.transaction(STORE,'readonly')}catch(_){resolve(null);return}
    const req=tx.objectStore(STORE).get(key);
    req.onsuccess=()=>{
      const v=req.result?.value;
      if(typeof v==='string'){memCache.set(key,v);resolve(v)}
      else resolve(null)
    };
    req.onerror=()=>resolve(null)
  })
}

async function cachePut(key,value){
  if(!key||typeof value!=='string')return;
  memCache.set(key,value);
  const db=await openDB();
  if(!db)return;
  await new Promise(resolve=>{
    let tx;
    try{tx=db.transaction(STORE,'readwrite')}catch(_){resolve();return}
    tx.objectStore(STORE).put({key,value,ts:Date.now()});
    tx.oncomplete=()=>resolve();tx.onerror=()=>resolve();tx.onabort=()=>resolve()
  });
  if(++writes%64===0)cleanup(db).catch(()=>{})
}

async function cleanup(db){
  const count=await new Promise(resolve=>{
    const req=db.transaction(STORE,'readonly').objectStore(STORE).count();
    req.onsuccess=()=>resolve(req.result||0);req.onerror=()=>resolve(0)
  });
  if(count<=CACHE_MAX)return;
  let remove=count-CACHE_MAX;
  await new Promise(resolve=>{
    const tx=db.transaction(STORE,'readwrite');
    const idx=tx.objectStore(STORE).index('ts');
    idx.openCursor().onsuccess=e=>{
      const cur=e.target.result;
      if(!cur||remove<=0)return;
      cur.delete();remove--;cur.continue()
    };
    tx.oncomplete=()=>resolve();tx.onerror=()=>resolve();tx.onabort=()=>resolve()
  })
}

function mozhiUrl(instance,text,sl,tl){
  const p=new URLSearchParams({engine:'google',from:sl,to:tl,text});
  return instance+'/api/translate?'+p.toString()
}

async function fetchMozhi(instance,text,sl='en',tl='tr'){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),TIMEOUT_MS);
  try{
    const r=await fetch(mozhiUrl(instance,text,sl,tl),{
      method:'GET',
      mode:'cors',
      cache:'no-store',
      credentials:'omit',
      signal:controller.signal,
      headers:{Accept:'application/json'}
    });
    const body=await r.text();
    if(!r.ok)throw new Error('HTTP '+r.status+(body?' · '+body.slice(0,120).replace(/\s+/g,' '):''));
    let data;
    try{data=JSON.parse(body)}catch(_){throw new Error('Non-JSON Mozhi response')}
    const translated=data&&data['translated-text'];
    if(typeof translated!=='string'||!translated.trim())throw new Error('Unexpected/empty Mozhi response');
    return translated
  }finally{clearTimeout(timer)}
}

function instanceOrder(){
  const now=Date.now();
  const ordered=preferredInstance
    ? [preferredInstance,...INSTANCES.filter(x=>x!==preferredInstance)]
    : INSTANCES.slice();
  const healthy=ordered.filter(x=>(badUntil.get(x)||0)<=now);
  const cooling=ordered.filter(x=>(badUntil.get(x)||0)>now);
  return healthy.length?[...healthy,...cooling]:ordered
}

async function translateChunk(text,sl='en',tl='tr'){
  let last=null;
  for(const instance of instanceOrder()){
    try{
      const out=await fetchMozhi(instance,text,sl,tl);
      preferredInstance=instance;
      badUntil.delete(instance);
      return out
    }catch(e){
      last=e;
      badUntil.set(instance,Date.now()+BAD_INSTANCE_MS);
      console.warn('[reader-mozhi] instance failed',instance,e)
    }
  }
  throw last||new Error('All Mozhi instances failed')
}

function splitText(text,max=CHUNK_LIMIT){
  text=String(text||'');
  if(text.length<=max)return[text];
  const out=[];
  let rest=text;
  while(rest.length>max){
    const head=rest.slice(0,max);
    const floor=Math.floor(max*.58);
    let cut=-1;
    const n=head.lastIndexOf('\n');
    if(n>=floor)cut=n+1;
    if(cut<floor){
      const re=/[.!?。！？][\"')\]]?\s+/g;
      let m,last=-1;
      while((m=re.exec(head)))last=re.lastIndex;
      if(last>=floor)cut=last
    }
    if(cut<floor){
      const sp=head.lastIndexOf(' ');
      if(sp>=floor)cut=sp+1
    }
    if(cut<1)cut=max;
    out.push(rest.slice(0,cut));
    rest=rest.slice(cut)
  }
  if(rest)out.push(rest);
  return out
}

async function translateText(text,{source='en',target='tr',cacheKey=''}={}){
  text=String(text??'');
  if(!text.trim())return text;
  const key='text|v1|'+source+'-'+target+'|'+cacheKey+'|'+hashText(text);
  const cached=await cacheGet(key);
  if(cached!=null)return cached;

  const chunks=splitText(text,CHUNK_LIMIT);
  const out=[];
  for(const chunk of chunks)out.push(await translateChunk(chunk,source,target));
  const value=out.join('');
  await cachePut(key,value);
  return value
}

function marker(id){return '⟦RDR'+id+'⟧'}

async function translateHTML(html,{source='en',target='tr',cacheKey=''}={}){
  html=String(html??'');
  if(!html.trim())return html;
  const key='html|v1|'+source+'-'+target+'|'+cacheKey+'|'+hashText(html);
  const cached=await cacheGet(key);
  if(cached!=null)return cached;

  const tpl=document.createElement('template');
  tpl.innerHTML=html;
  const entries=[];
  const walker=document.createTreeWalker(tpl.content,NodeFilter.SHOW_TEXT);
  let node;
  while((node=walker.nextNode())){
    const parent=node.parentElement;
    if(parent&&/^(SCRIPT|STYLE|NOSCRIPT)$/i.test(parent.tagName))continue;
    const raw=node.nodeValue||'';
    const m=/^(\s*)([\s\S]*?)(\s*)$/.exec(raw);
    const core=m?m[2]:raw;
    if(!core||!/[\p{L}\p{N}]/u.test(core))continue;
    entries.push({node,lead:m?m[1]:'',core,trail:m?m[3]:'',id:entries.length})
  }
  if(!entries.length)return html;

  const groups=[];
  let group=[],size=0;
  const flush=()=>{if(group.length){groups.push(group);group=[];size=0}};
  for(const e of entries){
    const cost=marker(e.id).length+1+e.core.length+1;
    if(cost>HTML_BATCH_LIMIT){
      flush();groups.push([e]);continue
    }
    if(group.length&&size+cost>HTML_BATCH_LIMIT)flush();
    group.push(e);size+=cost
  }
  flush();

  for(const g of groups){
    if(g.length===1&&g[0].core.length>HTML_BATCH_LIMIT){
      const e=g[0];
      const translated=await translateText(e.core,{source,target,cacheKey:cacheKey+'|node:'+e.id});
      e.node.nodeValue=e.lead+translated.trim()+e.trail;
      continue
    }

    const payload=g.map(e=>marker(e.id)+e.core).join('\n');
    const translated=await translateText(payload,{source,target,cacheKey:cacheKey+'|batch:'+g[0].id+'-'+g[g.length-1].id});
    const re=/⟦\s*RDR(\d+)\s*⟧/g;
    const marks=[];
    let m;
    while((m=re.exec(translated)))marks.push({id:Number(m[1]),start:m.index,end:re.lastIndex});
    if(marks.length!==g.length||marks.some((x,i)=>x.id!==g[i].id)){
      throw new Error('Mozhi changed reader text markers')
    }
    for(let i=0;i<marks.length;i++){
      const e=g[i];
      const start=marks[i].end;
      const end=i+1<marks.length?marks[i+1].start:translated.length;
      const piece=translated.slice(start,end).replace(/^\s+|\s+$/g,'');
      if(!piece)throw new Error('Empty translated HTML segment');
      e.node.nodeValue=e.lead+piece+e.trail
    }
  }

  const value=tpl.innerHTML;
  await cachePut(key,value);
  return value
}

window.ReaderMozhi={
  translateText,
  translateHTML,
  clearMemoryCache(){memCache.clear()},
  constants:{instances:[...INSTANCES],chunkLimit:CHUNK_LIMIT,htmlBatchLimit:HTML_BATCH_LIMIT}
};
})();
