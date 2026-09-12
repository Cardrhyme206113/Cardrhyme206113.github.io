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
const DEFAULT_ENGINE='builtin';
const SOURCE_LANG='en';
const TARGET_LANG='tr';
const GOOGLE_ENDPOINT='https://translate.googleapis.com/translate_a/single';
const GOOGLE_CHUNK_LIMIT=4200;
const CACHE_MAX_ENTRIES=2500;

const providers=new Map();
const inflight=new Map();
const memCache=new Map();
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
function usesLiveTranslation(){return trUI()&&readEngine()!==DEFAULT_ENGINE}
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
  w