/*
 * Reader v18 static image enhancement layer.
 *
 * Reader-image pipeline:
 *   Denoise: Off / Medium / High
 *     High   = original lab filter: radius 4, sigmaS 3, sigmaR 0.10, 2 passes
 *     Medium = exactly 60% blend strength of High
 *   Anime4K: Auto / All / Off
 *     Auto = source pixels >= 80% of 1,048,576 px
 *   Anime4K profile: Simplified (default) / Sophisticated (legacy Higher-end B)
 *   Simplified uses ANIME4KJS_SIMPLE_M_2X and pre-caps its input so the
 *   Anime4K render stays at or below a 3840px long edge.
 *   Final processed raster is capped to <=2x source dimensions and <=3840px long edge
 *
 * Stored bytes are never modified. Processing is transient/display-only.
 */
(()=>{
'use strict';

const ANIME_STORAGE_KEY='reader-image-anime4k-mode';
const DENOISE_STORAGE_KEY='reader-image-denoise-mode';
const PROFILE_STORAGE_KEY='reader-image-anime4k-profile';

const VALID_ANIME_MODES=new Set(['auto','all','off']);
const VALID_DENOISE_MODES=new Set(['off','medium','high']);
const VALID_PROFILES=new Set(['simplified','sophisticated']);

const PIXEL_BUDGET=1048576;
const AUTO_THRESHOLD=Math.ceil(PIXEL_BUDGET*0.80); // 838,861
const HIGH_DENOISE=Object.freeze({radius:4,spatial:3,range:0.10,passes:2,strength:1.0});
const MEDIUM_DENOISE=Object.freeze({...HIGH_DENOISE,strength:0.60});

const ANIME4K_PROFILES=Object.freeze({
  simplified:Object.freeze({exportName:'ANIME4KJS_SIMPLE_M_2X',nativeScale:2}),
  sophisticated:Object.freeze({exportName:'ANIME4K_HIGHEREND_MODE_B',nativeScale:4})
});
const ANIME4K_CDN='https://cdn.jsdelivr.net/npm/anime4k.js@1.1.3/+esm';
const MAX_ANIME_SCALE=2;
const MAX_LONG_EDGE=3840;
const CACHE_LIMIT=96;

const generatedURLs=new Set();
const cache=new Map();
const order=[];
let anime4kModulePromise=null;
let processingGeneration=0;
const coverAnimeObserver=('IntersectionObserver' in window)?new IntersectionObserver(entries=>{
  for(const entry of entries){
    if(entry.isIntersecting){
      coverAnimeObserver.unobserve(entry.target);
      processCoverImage(entry.target);
    }
  }
},{root:null,rootMargin:'700px 0px',threshold:0.01}):null;

function getAnimeMode(){
  try{
    const v=localStorage.getItem(ANIME_STORAGE_KEY)||'all';
    return VALID_ANIME_MODES.has(v)?v:'all';
  }catch(_){return 'all'}
}
function getDenoiseMode(){
  try{
    const v=localStorage.getItem(DENOISE_STORAGE_KEY)||'medium';
    return VALID_DENOISE_MODES.has(v)?v:'medium';
  }catch(_){return 'medium'}
}
function getProfileMode(){
  try{
    const v=localStorage.getItem(PROFILE_STORAGE_KEY)||'simplified';
    return VALID_PROFILES.has(v)?v:'simplified';
  }catch(_){return 'simplified'}
}
function invalidateAndReprocess(){
  processingGeneration++;
  refreshSettingsUI();
  reprocessVisible();
}
function setAnimeMode(v){
  if(!VALID_ANIME_MODES.has(v))v='all';
  try{localStorage.setItem(ANIME_STORAGE_KEY,v)}catch(_){}
  invalidateAndReprocess();
}
function setDenoiseMode(v){
  if(!VALID_DENOISE_MODES.has(v))v='medium';
  try{localStorage.setItem(DENOISE_STORAGE_KEY,v)}catch(_){}
  invalidateAndReprocess();
}
function setProfileMode(v){
  if(!VALID_PROFILES.has(v))v='simplified';
  try{localStorage.setItem(PROFILE_STORAGE_KEY,v)}catch(_){}
  invalidateAndReprocess();
}

function compileShader(gl,type,src){
  const sh=gl.createShader(type);gl.shaderSource(sh,src);gl.compileShader(sh);
  if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS)){
    const msg=gl.getShaderInfoLog(sh)||'shader compile failed';gl.deleteShader(sh);throw new Error(msg);
  }
  return sh;
}
function makeProgram(gl,vs,fs){
  const p=gl.createProgram();
  const a=compileShader(gl,gl.VERTEX_SHADER,vs),b=compileShader(gl,gl.FRAGMENT_SHADER,fs);
  gl.attachShader(p,a);gl.attachShader(p,b);gl.linkProgram(p);gl.deleteShader(a);gl.deleteShader(b);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS)){
    const msg=gl.getProgramInfoLog(p)||'program link failed';gl.deleteProgram(p);throw new Error(msg);
  }
  return p;
}
function createTex(gl,w,h,source=null){
  const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,1);
  if(source)gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
  else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  return t;
}

function gpuBilateral(source,params){
  const w=source.width,h=source.height;
  const cv=document.createElement('canvas');cv.width=w;cv.height=h;
  const gl=cv.getContext('webgl2',{alpha:true,premultipliedAlpha:false,preserveDrawingBuffer:true});
  if(!gl)throw new Error('WebGL2 unavailable');

  const vs=`#version 300 es
  precision highp float;
  const vec2 V[3]=vec2[3](vec2(-1.,-1.),vec2(3.,-1.),vec2(-1.,3.));
  out vec2 uv;
  void main(){vec2 p=V[gl_VertexID];gl_Position=vec4(p,0.,1.);uv=.5*(p+1.);}`;

  const fs=`#version 300 es
  precision highp float;
  uniform sampler2D src;
  uniform vec2 texel;
  uniform int radius;
  uniform float sigmaS;
  uniform float sigmaR;
  uniform float strength;
  in vec2 uv;
  out vec4 outColor;
  void main(){
    vec4 c=texture(src,uv);
    vec3 sum=vec3(0.);
    float ws=0.;
    for(int yy=-8;yy<=8;yy++){
      for(int xx=-8;xx<=8;xx++){
        if(abs(xx)>radius||abs(yy)>radius)continue;
        vec2 off=vec2(float(xx),float(yy));
        vec4 q=texture(src,uv+off*texel);
        float ds=dot(off,off);
        vec3 diff=q.rgb-c.rgb;
        float dr=dot(diff,diff);
        float sw=exp(-ds/(2.0*sigmaS*sigmaS));
        float rw=exp(-dr/(2.0*sigmaR*sigmaR));
        float wt=sw*rw;
        sum+=q.rgb*wt;
        ws+=wt;
      }
    }
    vec3 filtered=sum/max(ws,1e-8);
    outColor=vec4(mix(c.rgb,filtered,strength),c.a);
  }`;

  const prog=makeProgram(gl,vs,fs);
  gl.useProgram(prog);
  gl.viewport(0,0,w,h);
  gl.uniform1i(gl.getUniformLocation(prog,'src'),0);
  gl.uniform2f(gl.getUniformLocation(prog,'texel'),1/w,1/h);
  gl.uniform1i(gl.getUniformLocation(prog,'radius'),params.radius);
  gl.uniform1f(gl.getUniformLocation(prog,'sigmaS'),params.spatial);
  gl.uniform1f(gl.getUniformLocation(prog,'sigmaR'),params.range);
  gl.uniform1f(gl.getUniformLocation(prog,'strength'),params.strength);

  const srcTex=createTex(gl,w,h,source);
  const ping=createTex(gl,w,h);
  const pong=createTex(gl,w,h);
  const fb=gl.createFramebuffer();

  function render(from,to){
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D,from);
    gl.bindFramebuffer(gl.FRAMEBUFFER,fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,to,0);
    gl.drawArrays(gl.TRIANGLES,0,3);
  }

  let from=srcTex,to=ping;
  for(let i=0;i<params.passes;i++){
    render(from,to);
    from=to;
    to=(to===ping)?pong:ping;
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  const copyFs=`#version 300 es
  precision highp float;
  uniform sampler2D src;
  in vec2 uv;
  out vec4 outColor;
  void main(){outColor=texture(src,uv);}`;
  const cp=makeProgram(gl,vs,copyFs);
  gl.useProgram(cp);
  gl.uniform1i(gl.getUniformLocation(cp,'src'),0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D,from);
  gl.viewport(0,0,w,h);
  gl.drawArrays(gl.TRIANGLES,0,3);

  // Force completion before another WebGL context (Anime4K) consumes this canvas.
  gl.finish();

  gl.deleteFramebuffer(fb);
  gl.deleteTexture(srcTex);
  gl.deleteTexture(ping);
  gl.deleteTexture(pong);
  gl.deleteProgram(prog);
  gl.deleteProgram(cp);
  return cv;
}

async function getAnime4K(){
  if(!anime4kModulePromise){
    anime4kModulePromise=import(ANIME4K_CDN).catch(err=>{
      anime4kModulePromise=null;
      throw err;
    });
  }
  return anime4kModulePromise;
}

async function runAnime4K(source,sourceW,sourceH,profileMode){
  const A=await getAnime4K();
  const spec=ANIME4K_PROFILES[profileMode]||ANIME4K_PROFILES.simplified;
  const profile=A[spec.exportName];
  if(!profile)throw new Error(`Anime4K profile not exported: ${spec.exportName}`);

  let animeSource=source;
  let prepared=null;

  // Performance profile: keep the actual 2x Anime4K render at <=3840px long edge,
  // rather than rendering a huge intermediate and shrinking it afterwards.
  if(profileMode==='simplified'){
    const sourceLong=Math.max(source.width||sourceW,source.height||sourceH);
    const inputLong=Math.floor(MAX_LONG_EDGE/spec.nativeScale);
    if(sourceLong>inputLong){
      const scale=inputLong/sourceLong;
      prepared=document.createElement('canvas');
      prepared.width=Math.max(1,Math.round((source.width||sourceW)*scale));
      prepared.height=Math.max(1,Math.round((source.height||sourceH)*scale));
      const pctx=prepared.getContext('2d',{alpha:true});
      pctx.imageSmoothingEnabled=true;
      pctx.imageSmoothingQuality='high';
      pctx.drawImage(source,0,0,prepared.width,prepared.height);
      animeSource=prepared;
    }
  }

  const raw=document.createElement('canvas');
  const upscaler=new A.ImageUpscaler(profile);
  upscaler.attachSource(animeSource,raw);
  upscaler.upscale();

  const maxW=Math.max(1,Math.round(sourceW*MAX_ANIME_SCALE));
  const maxH=Math.max(1,Math.round(sourceH*MAX_ANIME_SCALE));
  const longScale=MAX_LONG_EDGE/Math.max(1,raw.width,raw.height);
  const scale=Math.min(maxW/raw.width,maxH/raw.height,longScale,1);

  if(scale>=0.9999){
    try{upscaler.detachSource?.()}catch(_){}
    return raw;
  }

  const out=document.createElement('canvas');
  out.width=Math.max(1,Math.round(raw.width*scale));
  out.height=Math.max(1,Math.round(raw.height*scale));

  const ctx=out.getContext('2d',{alpha:true});
  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality='high';
  ctx.drawImage(raw,0,0,out.width,out.height);

  try{upscaler.detachSource?.()}catch(_){}
  return out;
}

function canvasBlob(canvas){
  return new Promise((resolve,reject)=>canvas.toBlob(
    b=>b?resolve(b):reject(new Error('Canvas export failed')),
    'image/png'
  ));
}

async function sourceCanvas(src){
  const x=new Image();
  x.decoding='async';
  x.src=src;
  if(x.decode)await x.decode();
  else await new Promise((ok,bad)=>{x.onload=ok;x.onerror=bad});

  const cv=document.createElement('canvas');
  cv.width=x.naturalWidth;
  cv.height=x.naturalHeight;
  const ctx=cv.getContext('2d',{alpha:true});
  ctx.drawImage(x,0,0);
  return cv;
}

function cachePut(key,promise){
  cache.set(key,promise);
  order.push(key);
  while(order.length>CACHE_LIMIT){
    const old=order.shift();
    if(!old||old===key)continue;
    const p=cache.get(old);
    cache.delete(old);
    Promise.resolve(p).then(v=>{
      if(v?.url&&generatedURLs.has(v.url)){
        generatedURLs.delete(v.url);
        URL.revokeObjectURL(v.url);
      }
    }).catch(()=>{});
  }
}

async function buildProcessed(src,animeMode,denoiseMode,profileMode){
  const key=`${animeMode}|${denoiseMode}|${profileMode}|${src}`;
  if(cache.has(key))return cache.get(key);

  const promise=(async()=>{
    const source=await sourceCanvas(src);
    const sourceW=source.width,sourceH=source.height;
    const sourcePixels=sourceW*sourceH;

    let denoised=source;
    if(denoiseMode==='high')denoised=gpuBilateral(source,HIGH_DENOISE);
    else if(denoiseMode==='medium')denoised=gpuBilateral(source,MEDIUM_DENOISE);

    const useAnime=animeMode==='all'||(animeMode==='auto'&&sourcePixels>=AUTO_THRESHOLD);
    let result=denoised;
    let animeApplied=false;

    if(useAnime){
      let animeSource=denoised;
      let bitmap=null;
      try{
        // This readback/synchronization step is intentional: it guarantees that
        // Anime4K receives the already-denoised pixels, not the pre-filter source.
        if(typeof createImageBitmap==='function'){
          bitmap=await createImageBitmap(denoised);
          animeSource=bitmap;
        }
        result=await runAnime4K(animeSource,sourceW,sourceH,profileMode);
        animeApplied=true;
      }catch(err){
        console.warn('[reader-image] Anime4K unavailable',err);
        result=denoised;
      }finally{
        try{bitmap?.close?.()}catch(_){}
      }
    }

    const blob=await canvasBlob(result);
    const url=URL.createObjectURL(blob);
    generatedURLs.add(url);
    return {
      url,
      sourcePixels,
      animeApplied,
      denoiseMode,
      width:result.width,
      height:result.height
    };
  })();

  cachePut(key,promise);
  try{return await promise}catch(err){cache.delete(key);throw err}
}

async function processCoverImage(img){
  if(!(img instanceof HTMLImageElement)||img.dataset.readerCoverAnime4k!=='1')return;
  const current=img.currentSrc||img.src||'';
  if(!current||generatedURLs.has(current)||img.dataset.readerCoverEnhanceBusy==='1')return;

  const src=img.dataset.readerCoverEnhanceSource||current;
  if(!src||generatedURLs.has(src))return;
  const stamp='cover-simple-2x|'+src;
  if(img.dataset.readerCoverEnhanceStamp===stamp&&img.dataset.readerCoverEnhanced==='1')return;

  img.dataset.readerCoverEnhanceBusy='1';
  img.dataset.readerCoverEnhanceSource=src;
  try{
    const processed=await buildProcessed(src,'all','off','simplified');
    if(!img.isConnected||img.dataset.readerCoverAnime4k!=='1')return;
    const live=img.currentSrc||img.src||'';
    if(live!==src&&!generatedURLs.has(live))return;

    img.dataset.readerCoverEnhanceStamp=stamp;
    img.dataset.readerCoverEnhanced='1';
    img.dataset.readerAnime4k='1';
    img.dataset.readerAnimeProfile='simplified';
    img.src=processed.url;
  }catch(err){
    console.warn('[reader-image] webnovel cover 2x failed',src,err);
  }finally{
    delete img.dataset.readerCoverEnhanceBusy;
  }
}

function queueCoverImage(img){
  if(!(img instanceof HTMLImageElement)||img.dataset.readerCoverAnime4k!=='1')return;
  if(coverAnimeObserver)coverAnimeObserver.observe(img);
  else processCoverImage(img);
}

async function processImage(img){
  if(!(img instanceof HTMLImageElement)||!img.closest('#readerView'))return;
  const current=img.currentSrc||img.src||'';
  if(!current)return;
  if(generatedURLs.has(current))return;

  const src=img.dataset.readerEnhanceSource||current;
  if(!src||generatedURLs.has(src))return;
  if(img.dataset.readerEnhanceBusy==='1')return;

  const animeMode=getAnimeMode();
  const denoiseMode=getDenoiseMode();
  const profileMode=getProfileMode();
  const generation=processingGeneration;
  const stamp=`${animeMode}|${denoiseMode}|${profileMode}|${src}`;

  if(img.dataset.readerEnhanceStamp===stamp&&img.dataset.readerEnhanced==='1')return;

  img.dataset.readerEnhanceBusy='1';
  img.dataset.readerEnhanceSource=src;

  try{
    const processed=await buildProcessed(src,animeMode,denoiseMode,profileMode);
    if(generation!==processingGeneration||!img.isConnected)return;

    const live=img.currentSrc||img.src||'';
    if(live!==src&&!generatedURLs.has(live))return;

    img.dataset.readerEnhanceStamp=stamp;
    img.dataset.readerEnhanced='1';
    img.dataset.readerAnime4k=processed.animeApplied?'1':'0';
    img.dataset.readerDenoise=processed.denoiseMode;
    img.dataset.readerAnimeProfile=profileMode;
    img.dataset.readerSourcePixels=String(processed.sourcePixels);
    img.src=processed.url;
  }catch(err){
    console.warn('[reader-image] enhancement failed',src,err);
  }finally{
    delete img.dataset.readerEnhanceBusy;
  }
}

function scan(root=document){
  if(root instanceof HTMLImageElement){
    processImage(root);
    queueCoverImage(root);
  }
  root.querySelectorAll?.('#readerView img').forEach(processImage);
  root.querySelectorAll?.('img[data-reader-cover-anime4k="1"]').forEach(queueCoverImage);
}

function reprocessVisible(){
  document.querySelectorAll('#readerView img').forEach(img=>{
    if(img.dataset.readerEnhanceSource){
      img.dataset.readerEnhanced='0';
      img.dataset.readerEnhanceStamp='';
    }
    processImage(img);
  });
}

function segMarkup(id,kind,items){
  return `<div class="seg readerEnhanceSeg" id="${id}">${
    items.map(([value,label])=>
      `<button type="button" data-${kind}="${value}" aria-pressed="false">${label}</button>`
    ).join('')
  }</div>`;
}

function installSettingsUI(){
  const panel=document.querySelector('#settings');
  if(!panel||document.querySelector('#readerImageEnhanceSettings'))return;

  const sections=[...panel.querySelectorAll('.settingsGroup')];
  const readerSection=sections.find(s=>s.querySelector('#settingsReaderTitle'))||sections.at(-1);

  const section=document.createElement('section');
  section.className='settingsGroup';
  section.id='readerImageEnhanceSettings';
  section.innerHTML=`
    <div class="settingsGroupTitle">Image processing</div>
    <div class="setting two">
      <label>Anime4K</label>
      ${segMarkup('readerAnime4kMode','anime-mode',[
        ['auto','Auto'],['all','All'],['off','Off']
      ])}
    </div>
    <div class="setting two">
      <label>Profile</label>
      ${segMarkup('readerAnime4kProfile','anime-profile',[
        ['simplified','Simplified'],['sophisticated','Sophisticated']
      ])}
    </div>
    <div class="setting two">
      <label>Denoise</label>
      ${segMarkup('readerDenoiseMode','denoise-mode',[
        ['off','Off'],['medium','Medium'],['high','High']
      ])}
    </div>`;

  if(readerSection)panel.insertBefore(section,readerSection);
  else panel.appendChild(section);

  const style=document.createElement('style');
  style.textContent=`
    #readerImageEnhanceSettings .readerEnhanceSeg{min-width:0}
    #readerImageEnhanceSettings .readerEnhanceSeg button{
      min-width:0;
      padding:0 7px;
      white-space:nowrap;
      overflow:hidden;
      text-overflow:ellipsis;
    }
  `;
  document.head.appendChild(style);

  section.querySelectorAll('[data-anime-mode]').forEach(btn=>{
    btn.addEventListener('click',()=>setAnimeMode(btn.dataset.animeMode));
  });
  section.querySelectorAll('[data-anime-profile]').forEach(btn=>{
    btn.addEventListener('click',()=>setProfileMode(btn.dataset.animeProfile));
  });
  section.querySelectorAll('[data-denoise-mode]').forEach(btn=>{
    btn.addEventListener('click',()=>setDenoiseMode(btn.dataset.denoiseMode));
  });

  document.querySelector('#resetSettingsBtn')?.addEventListener('click',()=>{
    try{
      localStorage.removeItem(ANIME_STORAGE_KEY);
      localStorage.removeItem(DENOISE_STORAGE_KEY);
      localStorage.removeItem(PROFILE_STORAGE_KEY);
    }catch(_){}
    invalidateAndReprocess();
  });

  refreshSettingsUI();
}

function refreshSettingsUI(){
  const anime=getAnimeMode();
  const denoise=getDenoiseMode();
  const profile=getProfileMode();

  document.querySelectorAll('[data-anime-mode]').forEach(btn=>{
    const on=btn.dataset.animeMode===anime;
    btn.classList.toggle('on',on);
    btn.setAttribute('aria-pressed',on?'true':'false');
  });
  document.querySelectorAll('[data-anime-profile]').forEach(btn=>{
    const on=btn.dataset.animeProfile===profile;
    btn.classList.toggle('on',on);
    btn.setAttribute('aria-pressed',on?'true':'false');
  });
  document.querySelectorAll('[data-denoise-mode]').forEach(btn=>{
    const on=btn.dataset.denoiseMode===denoise;
    btn.classList.toggle('on',on);
    btn.setAttribute('aria-pressed',on?'true':'false');
  });
}

const observer=new MutationObserver(records=>{
  for(const r of records){
    if(r.type==='childList'){
      for(const n of r.addedNodes)if(n.nodeType===1)scan(n);
    }else if(r.type==='attributes'&&r.target instanceof HTMLImageElement){
      const img=r.target;
      const live=img.currentSrc||img.src||'';
      if(generatedURLs.has(live))continue;

      if(img.dataset.readerEnhanceSource&&live!==img.dataset.readerEnhanceSource){
        img.dataset.readerEnhanceSource=live;
        img.dataset.readerEnhanced='0';
        img.dataset.readerEnhanceStamp='';
      }
      if(img.dataset.readerCoverEnhanceSource&&live!==img.dataset.readerCoverEnhanceSource){
        img.dataset.readerCoverEnhanceSource=live;
        img.dataset.readerCoverEnhanced='0';
        img.dataset.readerCoverEnhanceStamp='';
      }
      processImage(img);
      queueCoverImage(img);
    }
  }
});

function boot(){
  installSettingsUI();
  observer.observe(document.documentElement,{
    subtree:true,
    childList:true,
    attributes:true,
    attributeFilter:['src','data-reader-cover-anime4k']
  });
  scan(document);
  console.info(
    `[reader-image] denoise=${getDenoiseMode()} · Anime4K=${getAnimeMode()} · `+
    `profile=${getProfileMode()} · max=${MAX_ANIME_SCALE}x/${MAX_LONG_EDGE}px · threshold=${AUTO_THRESHOLD}px`
  );
}

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',boot,{once:true});
}else boot();

addEventListener('pagehide',()=>{
  observer.disconnect();
  coverAnimeObserver?.disconnect();
  for(const u of generatedURLs)try{URL.revokeObjectURL(u)}catch(_){}
  generatedURLs.clear();
  cache.clear();
  order.length=0;
});

window.ReaderImageEnhance={
  get mode(){return getAnimeMode()},
  get animeMode(){return getAnimeMode()},
  get denoiseMode(){return getDenoiseMode()},
  get profileMode(){return getProfileMode()},
  setMode:setAnimeMode,
  setAnimeMode,
  setDenoiseMode,
  setProfileMode,
  constants:{
    pixelBudget:PIXEL_BUDGET,
    autoThreshold:AUTO_THRESHOLD,
    denoiseHigh:HIGH_DENOISE,
    denoiseMedium:MEDIUM_DENOISE,
    profiles:ANIME4K_PROFILES,
    maxAnimeScale:MAX_ANIME_SCALE,
    maxLongEdge:MAX_LONG_EDGE
  }
};
})();
