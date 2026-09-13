/* Reader UI internationalization layer.
 * i18next owns lookup/fallback/interpolation. English + Turkish are bundled by
 * reader/index.html; other content languages are translated once through the
 * existing Mozhi/Google route and cached as i18next resource bundles.
 */
(()=>{
'use strict';

const CACHE_PREFIX='reader-ui-i18next-v1:';
const SUPPORTED=['en','tr','es','fr','de','it','pt','nl','pl','ru','ja','ko','zh-CN','ar','id'];
const LOCALE_TAGS={
  en:'en-US',tr:'tr-TR',es:'es-ES',fr:'fr-FR',de:'de-DE',it:'it-IT',
  pt:'pt-PT',nl:'nl-NL',pl:'pl-PL',ru:'ru-RU',ja:'ja-JP',ko:'ko-KR',
  'zh-CN':'zh-CN',ar:'ar-SA',id:'id-ID'
};
const inflight=new Map();
let builtinMain=null;
let builtinAdvanced=null;
let sourceHash='00000000';
let initialized=false;

function uiLanguageForChoice(choice){
  choice=String(choice||'');
  if(choice==='tr-fast')return 'tr';
  return SUPPORTED.includes(choice)?choice:'en'
}
function localeTag(lang){return LOCALE_TAGS[uiLanguageForChoice(lang)]||'en-US'}
function dir(lang){return uiLanguageForChoice(lang)==='ar'?'rtl':'ltr'}

function hashText(s){
  let h=0x811c9dc5;
  s=String(s||'');
  for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x01000193)}
  return (h>>>0).toString(16).padStart(8,'0')
}
function clone(v){return JSON.parse(JSON.stringify(v))}
function bundle(main,advanced,lang){
  return {...clone(main?.[lang]||{}),advanced:clone(advanced?.[lang]||{})}
}
function lookup(obj,path){
  let cur=obj;
  for(const part of String(path).split('.')){if(cur==null)return undefined;cur=cur[part]}
  return cur
}
function manualT(path,vars={},lang='en'){
  const lng=uiLanguageForChoice(lang);
  const root={...(builtinMain?.[lng]||builtinMain?.en||{}),advanced:(builtinAdvanced?.[lng]||builtinAdvanced?.en||{})};
  let out=lookup(root,path);
  if(out==null){
    const en={...(builtinMain?.en||{}),advanced:(builtinAdvanced?.en||{})};
    out=lookup(en,path)
  }
  out=out==null?path:String(out);
  for(const [k,v] of Object.entries(vars||{}))out=out.replaceAll('{'+k+'}',String(v));
  return out
}
function t(path,vars={},lang='en'){
  const lng=uiLanguageForChoice(lang);
  if(!initialized||!window.i18next)return manualT(path,vars,lng);
  return window.i18next.t(path,{lng,...(vars||{})})
}
function at(key,vars={},lang='en'){return t('advanced.'+key,vars,lang)}

function flatten(obj,prefix='',out=[]){
  for(const [k,v] of Object.entries(obj||{})){
    const path=prefix?prefix+'.'+k:k;
    if(typeof v==='string')out.push([path,v]);
    else if(v&&typeof v==='object')flatten(v,path,out)
  }
  return out
}
function setPath(obj,path,value){
  const bits=String(path).split('.');
  let cur=obj;
  for(let i=0;i<bits.length-1;i++)cur=cur[bits[i]]||(cur[bits[i]]={});
  cur[bits[bits.length-1]]=value
}
function placeholders(s){
  return [...String(s||'').matchAll(/\{([A-Za-z0-9_]+)\}/g)].map(x=>x[1]).sort().join('|')
}
function marker(i){return '⟦RUI'+i+'⟧'}
function parseMarked(text,count){
  const re=/⟦\s*RUI(\d+)\s*⟧/g,marks=[];
  let m;
  while((m=re.exec(String(text||''))))marks.push({id:+m[1],start:m.index,end:re.lastIndex});
  if(marks.length!==count||marks.some((x,i)=>x.id!==i))return null;
  const out=[];
  for(let i=0;i<marks.length;i++){
    const end=i+1<marks.length?marks[i+1].start:String(text).length;
    out.push(String(text).slice(marks[i].end,end).trim())
  }
  return out
}
function makeBatches(entries,max=1450){
  const out=[];let group=[],size=0;
  for(const e of entries){
    const cost=e[1].length+18;
    if(group.length&&size+cost>max){out.push(group);group=[];size=0}
    group.push(e);size+=cost
  }
  if(group.length)out.push(group);
  return out
}
async function translateOne(entry,target,tag){
  const [path,source]=entry;
  try{
    const out=await window.ReaderMozhi.translateText(source,{source:'en',target,cacheKey:'ui|'+sourceHash+'|'+target+'|'+tag+'|'+path});
    if(!out?.trim()||placeholders(out)!==placeholders(source))return [path,source];
    return [path,out.trim()]
  }catch(_){return [path,source]}
}
async function translateGroup(entries,target,tag){
  if(!entries.length)return[];
  const payload=entries.map((e,i)=>marker(i)+e[1]).join('\n');
  try{
    const raw=await window.ReaderMozhi.translateText(payload,{source:'en',target,cacheKey:'ui|'+sourceHash+'|'+target+'|'+tag});
    const pieces=parseMarked(raw,entries.length);
    if(pieces){
      return entries.map((e,i)=>{
        const source=e[1],piece=pieces[i];
        return [e[0],piece&&placeholders(piece)===placeholders(source)?piece:source]
      })
    }
  }catch(_){}
  if(entries.length===1)return[await translateOne(entries[0],target,tag)];
  const mid=Math.ceil(entries.length/2);
  return[
    ...(await translateGroup(entries.slice(0,mid),target,tag+'a')),
    ...(await translateGroup(entries.slice(mid),target,tag+'b'))
  ]
}
function cacheGet(lang){
  try{
    const raw=localStorage.getItem(CACHE_PREFIX+sourceHash+':'+lang);
    if(!raw)return null;
    const x=JSON.parse(raw);
    return x&&typeof x==='object'?x:null
  }catch(_){return null}
}
function cachePut(lang,resource){
  try{localStorage.setItem(CACHE_PREFIX+sourceHash+':'+lang,JSON.stringify(resource))}catch(_){}
}
function addBundle(lang,resource){
  if(!window.i18next||!resource)return;
  window.i18next.addResourceBundle(lang,'translation',resource,true,true)
}
async function ensureLocale(lang){
  lang=uiLanguageForChoice(lang);
  if(lang==='en'||lang==='tr')return true;
  if(window.i18next?.hasResourceBundle?.(lang,'translation'))return true;
  if(inflight.has(lang))return inflight.get(lang);

  const job=(async()=>{
    const cached=cacheGet(lang);
    if(cached){addBundle(lang,cached);return true}
    if(!window.ReaderMozhi?.translateText)throw new Error('UI translation service unavailable');

    const source=bundle(builtinMain,builtinAdvanced,'en');
    const entries=flatten(source);
    const translated={};
    const batches=makeBatches(entries);
    for(let i=0;i<batches.length;i++){
      const rows=await translateGroup(batches[i],lang,'b'+i);
      for(const [path,value] of rows)setPath(translated,path,value)
    }
    cachePut(lang,translated);
    addBundle(lang,translated);
    return true
  })().finally(()=>inflight.delete(lang));

  inflight.set(lang,job);
  return job
}
function init({main,advanced,language='en'}={}){
  builtinMain=main||{};
  builtinAdvanced=advanced||{};
  sourceHash=hashText(JSON.stringify({main:builtinMain.en||{},advanced:builtinAdvanced.en||{}}));

  if(window.i18next){
    window.i18next.init({
      lng:uiLanguageForChoice(language),
      fallbackLng:'en',
      supportedLngs:SUPPORTED,
      load:'currentOnly',
      ns:['translation'],
      defaultNS:'translation',
      resources:{
        en:{translation:bundle(builtinMain,builtinAdvanced,'en')},
        tr:{translation:bundle(builtinMain,builtinAdvanced,'tr')}
      },
      interpolation:{escapeValue:false,prefix:'{',suffix:'}'},
      returnNull:false,
      returnEmptyString:false,
      initImmediate:false
    });
    initialized=true
  }
  return api
}
function setLanguage(lang){
  lang=uiLanguageForChoice(lang);
  if(window.i18next&&initialized)window.i18next.changeLanguage(lang).catch?.(()=>{});
  return lang
}

const api={
  init,t,at,ensureLocale,setLanguage,uiLanguageForChoice,localeTag,dir,
  supported:[...SUPPORTED],
  get ready(){return initialized}
};
window.ReaderI18n=api;
})();
