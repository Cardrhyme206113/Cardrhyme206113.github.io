/* Static reader UI internationalization.
 * All UI locales are bundled resources. No UI text is translated through Mozhi
 * or any other network translation API at runtime.
 */
(()=>{
'use strict';

const SUPPORTED=['en','tr','es','fr','de','it','pt','nl','pl','ru','ja','ko','zh-CN','ar','id'];
const LOCALE_TAGS={
 en:'en-US',tr:'tr-TR',es:'es-ES',fr:'fr-FR',de:'de-DE',it:'it-IT',pt:'pt-PT',
 nl:'nl-NL',pl:'pl-PL',ru:'ru-RU',ja:'ja-JP',ko:'ko-KR','zh-CN':'zh-CN',ar:'ar-SA',id:'id-ID'
};
let initialized=false;
let builtinMain=null;
let builtinAdvanced=null;

function uiLanguageForChoice(choice){
 choice=String(choice||'');
 if(choice==='tr-fast')return 'tr';
 return SUPPORTED.includes(choice)?choice:'en'
}
function localeTag(lang){return LOCALE_TAGS[uiLanguageForChoice(lang)]||'en-US'}
function dir(lang){return uiLanguageForChoice(lang)==='ar'?'rtl':'ltr'}
function clone(v){return JSON.parse(JSON.stringify(v))}
function merge(base,over){
 const out=clone(base||{});
 for(const [k,v] of Object.entries(over||{})){
  if(v&&typeof v==='object'&&!Array.isArray(v)&&out[k]&&typeof out[k]==='object')out[k]=merge(out[k],v);
  else out[k]=v
 }
 return out
}
function resourceFor(lang){
 lang=uiLanguageForChoice(lang);
 const staticLocales=window.READER_I18N_STATIC||{};
 if(lang==='en')return {...clone(builtinMain?.en||{}),advanced:clone(builtinAdvanced?.en||{})};
 if(lang==='tr')return {...clone(builtinMain?.tr||builtinMain?.en||{}),advanced:clone(builtinAdvanced?.tr||builtinAdvanced?.en||{})};
 const base={...clone(builtinMain?.en||{}),advanced:clone(builtinAdvanced?.en||{})};
 return merge(base,staticLocales[lang]||{})
}
function lookup(obj,path){
 let cur=obj;
 for(const part of String(path).split('.')){if(cur==null)return undefined;cur=cur[part]}
 return cur
}
function manualT(path,vars={},lang='en'){
 const res=resourceFor(lang);let out=lookup(res,path);
 if(out==null)out=lookup(resourceFor('en'),path);
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
function init({main,advanced,language='en'}={}){
 builtinMain=main||{};builtinAdvanced=advanced||{};
 if(window.i18next){
  const resources={};
  for(const lang of SUPPORTED)resources[lang]={translation:resourceFor(lang)};
  window.i18next.init({
   lng:uiLanguageForChoice(language),fallbackLng:'en',supportedLngs:SUPPORTED,load:'currentOnly',
   ns:['translation'],defaultNS:'translation',resources,
   interpolation:{escapeValue:false,prefix:'{',suffix:'}'},returnNull:false,returnEmptyString:false,initImmediate:false
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
async function ensureLocale(lang){
 lang=uiLanguageForChoice(lang);
 if(!SUPPORTED.includes(lang))throw new Error('Unsupported UI locale: '+lang);
 return true
}
const api={init,t,at,ensureLocale,setLanguage,uiLanguageForChoice,localeTag,dir,supported:[...SUPPORTED],get ready(){return initialized}};
window.ReaderI18n=api;
})();
