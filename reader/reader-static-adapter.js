(() => {
  'use strict';
  window.__READER_STANDALONE__ = true;
  window.__READER_STATIC__ = true;

  const nativeFetch = window.fetch.bind(window);
  const textDecoder = new TextDecoder('utf-8');
  const indexCache = new Map();
  const chapterLookup = new Map();
  const blockCache = new Map();
  const BLOCK_CACHE_LIMIT = 24;
  let catalogPromise = null;
  let warnedNoRange = false;
  let fzstdPromise = null;
  let catalogRef = null;
  let cryptoConfigPromise = null;
  let cryptoKeyPromise = null;
  let corruptMode = false;
  let corruptSeed = '';
  const corruptIndexSeeds = new Map();
  let corruptCatalogFingerprint = 'catalog';
  const staticBase = new URL('./', document.baseURI || location.href);
  window.__READER_STATIC_BASE__ = staticBase.pathname;

  // Multi-repository storage routing. The viewer shell stays tiny; metadata,
  // covers, indexes and bucket packs are fetched from reader-storage-a/b/c.
  const rawStorage = window.__READER_STORAGE__ || {};
  const storageRoots = (Array.isArray(rawStorage.roots) && rawStorage.roots.length ? rawStorage.roots : ['./'])
    .map(x => new URL(String(x || './'), staticBase));
  const metadataRoot = new URL(String(
    rawStorage.metadataRoot || rawStorage.metadata_root || rawStorage.roots?.[0] || './'
  ), staticBase);
  const splitAfterBucket = Number.isFinite(Number(
    rawStorage.splitAfterBucket ?? rawStorage.split_after_bucket
  )) ? Number(rawStorage.splitAfterBucket ?? rawStorage.split_after_bucket) : null;
  const bucketBoundaries = Array.isArray(rawStorage.bucketBoundaries ?? rawStorage.bucket_boundaries)
    ? (rawStorage.bucketBoundaries ?? rawStorage.bucket_boundaries).map(Number).filter(Number.isFinite)
    : [];
  const storageRevision = String(rawStorage.revision || '');

  function bucketNumber(idx,bucketDir=''){
    const n=Number(idx?.bucket);
    if(Number.isInteger(n) && n>=0)return n;
    const m=/^b(\d{4,})/.exec(String(bucketDir||''));
    return m?Number(m[1]):0;
  }

  function storageRootForBucket(bucket){
    if(storageRoots.length<=1)return storageRoots[0] || metadataRoot;
    const b=Number(bucket);
    if(bucketBoundaries.length===storageRoots.length-1){
      let i=0;
      while(i<bucketBoundaries.length && b>bucketBoundaries[i])i++;
      return storageRoots[i] || storageRoots[0] || metadataRoot;
    }
    if(splitAfterBucket!==null){
      return storageRoots[b>splitAfterBucket?1:0] || storageRoots[0] || metadataRoot;
    }
    return storageRoots[0] || metadataRoot;
  }

  function storageURL(rel,{bucket=null,mutable=false}={}){
    const clean=String(rel||'').replace(/^\.\//,'');
    const root=bucket===null ? metadataRoot : storageRootForBucket(bucket);
    const u=new URL(clean,root);
    if(storageRevision)u.searchParams.set('rsv',storageRevision);
    return u.href;
  }
  // v18 static media does not rely on a service worker. Older reader-static
  // builds did. Merely unregistering is insufficient for the CURRENT document:
  // an already-controlled tab stays controlled until the next navigation.
  // If that legacy worker still owns this page, unregister it and reload once.
  if('serviceWorker' in navigator){
    const legacyController=/\/reader-static-sw\.js(?:$|\?)/.test(navigator.serviceWorker.controller?.scriptURL||'');
    navigator.serviceWorker.getRegistrations().then(async regs=>{
      let removed=false;
      for(const reg of regs){
        const u=reg.active?.scriptURL||reg.waiting?.scriptURL||reg.installing?.scriptURL||'';
        if(/\/reader-static-sw\.js(?:$|\?)/.test(u)){
          try{removed=(await reg.unregister())||removed}catch(_){}
        }
      }
      if(legacyController&&removed){
        const key='reader-legacy-sw-reload-v1';
        if(sessionStorage.getItem(key)!=='1'){
          sessionStorage.setItem(key,'1');
          location.reload();
        }
      }else if(!legacyController){
        sessionStorage.removeItem('reader-legacy-sw-reload-v1');
      }
    }).catch(()=>{});
  }

  const jsonResponse = (obj, status=200) => new Response(JSON.stringify(obj), {status, headers:{'Content-Type':'application/json; charset=utf-8'}});
  const bytesResponse = (bytes, mime='application/octet-stream', status=200, headers={}) => new Response(bytes, {status, headers:{'Content-Type':mime, ...headers}});
  const textResponse = (text, status=200, headers={}) => bytesResponse(text, 'text/plain; charset=utf-8', status, headers);
  const fold = s => String(s ?? '').toLocaleLowerCase();
  const includesFold = (a,b) => fold(a).includes(fold(b));

  function setCatalogStage(message){
    try{
      const el=document.getElementById('loaderStatus');
      if(el)el.textContent=message;
    }catch(_){}
  }

  function metadataMirrorURL(input){
    try{
      const u=new URL(String(input));
      if(u.hostname!=='raw.githubusercontent.com')return null;
      const parts=u.pathname.split('/').filter(Boolean);
      if(parts.length<4)return null;
      const owner=parts.shift(),repo=parts.shift(),ref=parts.shift();
      const path=parts.join('/');
      return `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${ref}/${path}`
    }catch(_){return null}
  }

  function timeoutPromise(ms,label){
    return new Promise((_,reject)=>setTimeout(()=>reject(new Error(label||'timeout')),ms))
  }

  async function readResponseBytes(response,controller,{stallMs=8000,totalMs=30000,onProgress=null}={}){
    if(!response.body?.getReader){
      return Promise.race([
        response.arrayBuffer(),
        timeoutPromise(totalMs,'metadata body timeout')
      ])
    }

    const reader=response.body.getReader();
    const chunks=[];
    let total=0;
    const started=Date.now();
    const expected=Number(response.headers.get('content-length')||0);

    try{
      while(true){
        const elapsed=Date.now()-started;
        if(elapsed>=totalMs)throw new Error('metadata total timeout');

        let timer;
        const stalled=new Promise((_,reject)=>{
          timer=setTimeout(()=>reject(new Error('metadata stream stalled')),stallMs)
        });
        let part;
        try{
          part=await Promise.race([reader.read(),stalled])
        }finally{
          clearTimeout(timer)
        }

        if(part.done)break;
        if(part.value?.byteLength){
          chunks.push(part.value);
          total+=part.value.byteLength;
          if(onProgress)onProgress(total,expected)
        }
      }
    }catch(e){
      try{controller.abort()}catch(_){}
      try{await reader.cancel(e)}catch(_){}
      throw e
    }

    const out=new Uint8Array(total);
    let off=0;
    for(const chunk of chunks){out.set(chunk,off);off+=chunk.byteLength}
    return out.buffer
  }

  async function fetchMetadataFully(url,options={},label='Katalog'){
    const controller=new AbortController();
    let headerTimer;
    try{
      const response=await Promise.race([
        nativeFetch(url,{...options,cache:'force-cache',signal:controller.signal}),
        new Promise((_,reject)=>{
          headerTimer=setTimeout(()=>{
            try{controller.abort()}catch(_){}
            reject(new Error('metadata header timeout'))
          },8000)
        })
      ]);
      clearTimeout(headerTimer);

      const bytes=await readResponseBytes(response,controller,{
        stallMs:8000,
        totalMs:30000,
        onProgress:(done,total)=>{
          const mb=(done/1048576).toFixed(1);
          const all=total>0?' / '+(total/1048576).toFixed(1)+' MB':' MB';
          setCatalogStage(`${label} indiriliyor… ${mb}${all}`)
        }
      });

      return new Response(bytes,{
        status:response.status,
        statusText:response.statusText,
        headers:new Headers(response.headers)
      })
    }finally{
      clearTimeout(headerTimer)
    }
  }

  async function resilientMetadataFetch(url,options={},label='Katalog'){
    const primary=String(url);
    const mirror=metadataMirrorURL(primary);

    // CDN first: raw.githubusercontent.com has been the recurring mobile stall
    // point for this reader. Raw GitHub remains the fallback.
    const routes=mirror?[mirror,primary]:[primary];
    let last=null;

    for(let i=0;i<routes.length;i++){
      try{
        const host=new URL(routes[i]).hostname;
        setCatalogStage(`${label} sunucusuna bağlanılıyor… (${i+1}/${routes.length})`);
        const r=await fetchMetadataFully(routes[i],options,label);
        if(!r.ok)throw new Error(`metadata HTTP ${r.status} via ${host}`);
        return r
      }catch(e){
        last=e;
        console.warn('[reader-static] metadata route failed',routes[i],e);
        if(i+1<routes.length)await new Promise(r=>setTimeout(r,150))
      }
    }
    throw last||new Error('metadata fetch failed')
  }

  function requestReaderPassword(){
    // Temporary client-side auto-unlock. This keyword is intentionally shipped
    // with the viewer and therefore must not be treated as server-side access control.
    return Promise.resolve('card');
  }

  function escXml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));}
  function placeholderCover(title='Reader'){
    const short=String(title||'Reader').slice(0,34);
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="420" height="620"><rect width="420" height="620" fill="#34383d"/><text x="34" y="54" fill="#ddd" font-family="system-ui" font-size="16" letter-spacing="3">READER</text><foreignObject x="32" y="382" width="350" height="176"><div xmlns="http://www.w3.org/1999/xhtml" style="color:white;font:700 34px/1.12 Georgia,serif;overflow:hidden">${escXml(short)}</div></foreignObject></svg>`;
    return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
  }

  function b64bytes(s){
    const bin=atob(String(s||'')),out=new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);
    return out;
  }

  // Wrong-key decoy mode ---------------------------------------------------
  // A failed authenticated decrypt reveals no plaintext. Instead, the wrong
  // password and encrypted bytes seed a deterministic synthetic library.
  function hash32(input){
    let h=2166136261>>>0;
    const s=String(input??'');
    for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)>>>0;}
    h^=h>>>16;h=Math.imul(h,0x7feb352d)>>>0;h^=h>>>15;h=Math.imul(h,0x846ca68b)>>>0;h^=h>>>16;
    return h>>>0;
  }
  function byteFingerprint(bytes,limit=4096){
    const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes||0);
    let h=2166136261>>>0;
    const step=Math.max(1,Math.floor(b.length/Math.max(1,limit)));
    for(let i=0;i<b.length;i+=step){h^=b[i];h=Math.imul(h,16777619)>>>0;}
    h^=b.length;return (h>>>0).toString(16).padStart(8,'0');
  }
  function rngFor(label){
    let x=hash32(`${corruptSeed}|${label}`)||0x9e3779b9;
    return ()=>{x+=0x6D2B79F5;let t=x;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};
  }
  const corruptGlyphs=[...'ȝɀʭƛǂӜѮƚɇꝏȹȶɬɧƞȺɌɲǥƗƢƷҨӾԄԆԈΛЖѰӁӬѪϞΨЖжѬ中界文読書夢影零壊異空頁章▓▒░╳⌁⌬⟊⟁⧖⫷⫸'];
  const corruptPunct=['.','.',',',',',';',':','—','…','?','!'];
  function corruptVisual(value,label='external'){
    const src=String(value??'');
    if(!corruptMode)return src;
    const r=rngFor(`visual:${label}:${src}`);
    return [...src].map(ch=>{
      if(/[0-9A-Za-z]/.test(ch))return corruptGlyphs[Math.floor(r()*corruptGlyphs.length)];
      return ch;
    }).join('');
  }
  window.__readerCorruptVisual=(value,label)=>corruptVisual(value,label);
  function corruptWord(r,n){let o='';for(let i=0;i<n;i++)o+=corruptGlyphs[Math.floor(r()*corruptGlyphs.length)];return o;}
  function corruptLine(r,target=62){
    let o='';while(o.length<target){if(o)o+=' ';o+=corruptWord(r,2+Math.floor(r()*9));if(r()<.22)o+=corruptPunct[Math.floor(r()*corruptPunct.length)];}
    return o.slice(0,target+Math.floor(r()*18));
  }
  function corruptTitle(label,min=8,max=30){const r=rngFor(`title:${label}`);let o='';while(o.length<min){if(o)o+=' ';o+=corruptWord(r,2+Math.floor(r()*8));}return o.slice(0,min+Math.floor(r()*(max-min+1)));}
  function corruptParagraphs(label,count=8){
    const r=rngFor(`text:${label}`),out=[];
    for(let p=0;p<count;p++){const lines=2+Math.floor(r()*5),parts=[];for(let i=0;i<lines;i++)parts.push(corruptLine(r,44+Math.floor(r()*54)));out.push(parts.join(' '));}
    return out;
  }
  function escHtml(s){return String(s??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));}
  function corruptSvg(label,w=420,h=620){
    const r=rngFor(`svg:${label}`),rects=[];
    const bg=`hsl(${Math.floor(r()*360)} 25% 12%)`;
    for(let i=0;i<95;i++){
      const x=Math.floor(r()*w),y=Math.floor(r()*h),rw=3+Math.floor(r()*Math.max(5,w*.38)),rh=2+Math.floor(r()*Math.max(4,h*.085));
      const hue=Math.floor(r()*360),sat=35+Math.floor(r()*65),lit=18+Math.floor(r()*62),op=(.18+r()*.78).toFixed(2);
      rects.push(`<rect x="${x}" y="${y}" width="${rw}" height="${rh}" fill="hsl(${hue} ${sat}% ${lit}% / ${op})"/>`);
    }
    for(let i=0;i<14;i++){
      const y=Math.floor(r()*h),hh=1+Math.floor(r()*11),dx=Math.floor((r()-.5)*80);
      rects.push(`<path d="M${Math.max(0,dx)} ${y} H${w}" stroke="hsl(${Math.floor(r()*360)} 85% 58% / .7)" stroke-width="${hh}"/>`);
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="${bg}"/>${rects.join('')}<filter id="n"><feTurbulence baseFrequency=".75" numOctaves="2" seed="${Math.floor(r()*999)}"/><feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 .19 0"/></filter><rect width="100%" height="100%" filter="url(#n)" opacity=".48"/></svg>`;
  }
  function corruptCoverURL(label){return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(corruptSvg(`cover:${label}`));}
  function corruptHtml(label,chapterNo=1){
    const r=rngFor(`html:${label}`),pars=corruptParagraphs(label,5+Math.floor(r()*9));
    let body=`<h2>${escHtml(corruptTitle(`${label}:head`,10,34))}</h2>`;
    if(r()<.66){const img=`glitch-${Math.floor(r()*99999)}.svg`;body+=`<p><img src="${img}" alt="${escHtml(corruptTitle(`${label}:alt`,4,16))}"></p>`;}
    body+=pars.map(p=>`<p>${escHtml(p)}</p>`).join('');
    return `<!doctype html><html><body>${body}</body></html>`;
  }
  function syntheticCatalog(cipherBytes){
    const fp=byteFingerprint(cipherBytes),r=rngFor(`catalog:${fp}:${cipherBytes.byteLength}`);
    corruptCatalogFingerprint=fp;
    // We cannot know the authenticated catalog's true record count with the wrong
    // key. Build a full-sized deterministic decoy instead, scaling loosely from
    // ciphertext size so a large real catalog still yields a large broken one.
    const totalSeries=Math.max(1600,Math.min(3200,Math.round(cipherBytes.byteLength/650)));
    const epubShare=.24+r()*.16;
    const epubCount=Math.max(320,Math.round(totalSeries*epubShare));
    const wnCount=Math.max(640,totalSeries-epubCount);
    const c={series:[],webnovels:[],lightnovels:[],volumes:[],total_chapters:0};
    for(let i=0;i<epubCount;i++){
      const path=`corrupt-ln-${i}-${fp.slice(0,4)}`,vols=1+Math.floor(r()*8),name=corruptTitle(`ln:${fp}:${i}`,9,34),author=corruptTitle(`lna:${fp}:${i}`,5,21);
      const s={id:path,path,name,author,description:corruptParagraphs(`lnd:${fp}:${i}`,2).join(' '),kind:'epub',volume_count:vols,translated:false,translated_count:0,cover_book_id:`c-ln-${i}-1`,cover:corruptCoverURL(`ln:${i}:${fp}`),total_size:100000+Math.floor(r()*9000000),updated_ns:Math.floor(r()*9e15)};
      c.series.push(s);c.lightnovels.push(s);
      for(let v=1;v<=vols;v++)c.volumes.push({id:`c-ln-${i}-${v}`,series:path,rel_path:path,series_name:name,filename:`${name} ${v}`,volume:(1+Math.floor(r()*97)),title:`${name} ${corruptTitle(`vol:${i}:${v}`,2,7)}`,author,description:s.description,kind:'epub',cover:corruptCoverURL(`ln:${i}:${v}:${fp}`),size:100000+Math.floor(r()*3500000),deep_ok:1,translated:false,chapter_count:5+Math.floor(r()*18)});
    }
    for(let i=0;i<wnCount;i++){
      const id=`cwn-${i}-${fp.slice(-4)}`,chapters=28+Math.floor(r()*190),name=corruptTitle(`wn:${fp}:${i}`,10,38),author=corruptTitle(`wna:${fp}:${i}`,5,22);
      const n={id:`wn:${id}`,source_id:id,path:`wn:${id}`,name,author,description:corruptParagraphs(`wnd:${fp}:${i}`,2).join(' '),kind:'webnovel',chapter_count:chapters,available_chapters:chapters,translated_count:0,word_count:chapters*(1100+Math.floor(r()*1700)),cover_book_id:id,cover:corruptCoverURL(`wn:${i}:${fp}`),genres:[corruptTitle(`g:${i}:1`,3,9),corruptTitle(`g:${i}:2`,3,9)],status:corruptTitle(`status:${i}`,3,8),rating:+(r()*10).toFixed(2),rating_count:Math.floor(r()*100000)};
      c.series.push(n);c.webnovels.push(n);c.total_chapters+=chapters;
    }
    return c;
  }
  function syntheticIndex(kind,id,cipherBytes){
    const fp=byteFingerprint(cipherBytes),r=rngFor(`idx:${kind}:${id}:${fp}`);corruptIndexSeeds.set(`${kind}:${id}`,fp);
    if(kind==='wn'){
      const n=28+Math.floor(r()*190),chapters=[];
      for(let i=0;i<n;i++)chapters.push({id:`${id}:${i}:${fp.slice(0,3)}`,i:i+1,t:corruptTitle(`ch:${id}:${i}:${fp}`,7,34),en:[0,0,700+Math.floor(r()*5200)]});
      return {kind:'webnovel',_key:`wn:${id}`,frames:[],chapters,source_bytes:cipherBytes.byteLength,translated_bytes:0};
    }
    const sectionCount=7+Math.floor(r()*20),spine=[];
    for(let i=0;i<sectionCount;i++)spine.push({path:`section-${i+1}.xhtml`,title:corruptTitle(`lnch:${id}:${i}:${fp}`,7,30),image_only:false});
    const cat=catalogRef,vol=cat?.volumeById?.get(String(id));
    const title=vol?.title||corruptTitle(`book:${id}:${fp}`,10,36),series=vol?.series||`corrupt-series-${id}`;
    return {kind:'epub',_key:`ln:${id}`,frames:[],resources:{},translations:{},book:{id:String(id),rel_path:String(id),series,series_name:vol?.series_name||title,filename:title,volume:vol?.volume||1,title,author:vol?.author||corruptTitle(`ba:${id}`,5,20),description:vol?.description||'',size:cipherBytes.byteLength,deep_ok:1,translated:false,translations:[],kind:'epub',spine,toc:spine.map(x=>({label:x.title,path:x.path,depth:0}))}};
  }
  async function enterCorruptMode(password,cfg){
    const raw=new Uint8Array([...new TextEncoder().encode(String(password)),...b64bytes(cfg.salt||''),...b64bytes(cfg.check||'')]);
    const dig=new Uint8Array(await crypto.subtle.digest('SHA-256',raw));
    corruptSeed=[...dig].map(x=>x.toString(16).padStart(2,'0')).join('');corruptMode=true;
    document.documentElement.dataset.readerCorrupt='1';window.__READER_CORRUPT__=true;
    console.warn('[reader-static] authenticated unlock failed; deterministic corruption view active');
  }
  async function loadCryptoConfig(){
    if(!cryptoConfigPromise)cryptoConfigPromise=(async()=>{
      const r=await resilientMetadataFetch(storageURL('data/crypto.json',{mutable:true}),{},'Şifre bilgisi');
      if(r.status===404)return {encrypted:false};
      if(!r.ok)throw new Error(`reader-static crypto config HTTP ${r.status}`);
      const c=await r.json();return c&&c.encrypted?c:{encrypted:false};
    })();
    return cryptoConfigPromise;
  }
  async function deriveReaderKey(password,cfg){
    if(!globalThis.crypto?.subtle)throw new Error('WebCrypto is unavailable; encrypted reader requires HTTPS or localhost');
    setCatalogStage('Katalog anahtarı hazırlanıyor…');
    const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);
    return Promise.race([
      crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt:b64bytes(cfg.salt),iterations:Number(cfg.iterations||600000)},material,{name:'AES-GCM',length:256},false,['decrypt']),
      timeoutPromise(15000,'PBKDF2 timeout')
    ])
  }
  async function decryptEnvelope(bytes,key){
    if(bytes.byteLength<28)throw new Error('encrypted payload too short');
    const iv=bytes.subarray(0,12),ct=bytes.subarray(12);
    try{
      return new Uint8Array(await Promise.race([
        crypto.subtle.decrypt({name:'AES-GCM',iv},key,ct),
        timeoutPromise(15000,'AES decrypt timeout')
      ]))
    }catch(e){
      if(/timeout/i.test(String(e?.message||e)))throw e;
      throw new Error('wrong password or corrupted encrypted data')
    }
  }
  async function ensureCryptoKey(){
    const cfg=await loadCryptoConfig();if(!cfg.encrypted)return null;
    if(corruptMode)return null;
    if(!cryptoKeyPromise)cryptoKeyPromise=(async()=>{
      const password=await requestReaderPassword();
      const key=await deriveReaderKey(password,cfg);
      try{
        const check=await decryptEnvelope(b64bytes(cfg.check),key);
        if(new TextDecoder().decode(check)!=='reader-static-key-check-v1')throw new Error('bad key check');
        return key;
      }catch(_){
        await enterCorruptMode(password,cfg);
        return null;
      }
    })();
    return cryptoKeyPromise;
  }
  async function decodeProtectedJSON(response){
    let b=new Uint8Array(await response.arrayBuffer());
    setCatalogStage('Katalog şifresi çözülüyor…');
    const key=await ensureCryptoKey();
    if(corruptMode)return {__readerCorruptCipher:b};
    if(key)b=await decryptEnvelope(b,key);
    if(key){
      setCatalogStage('Katalog açılıyor…');
      const ds=new DecompressionStream('gzip');
      b=new Uint8Array(await Promise.race([
        new Response(new Blob([b]).stream().pipeThrough(ds)).arrayBuffer(),
        timeoutPromise(15000,'catalog gzip timeout')
      ]));
    }
    setCatalogStage('Katalog okunuyor…');
    return JSON.parse(textDecoder.decode(b));
  }

  async function loadCatalog(){
    if(!catalogPromise){
      catalogPromise=(async()=>{
        const cfg=await loadCryptoConfig();
        const r=await resilientMetadataFetch(storageURL(cfg.encrypted?'data/catalog.rse':'data/catalog.json',{mutable:true}),{},'Katalog');
        if(!r.ok) throw new Error(`reader-static catalog HTTP ${r.status}`);
        let c=cfg.encrypted?await decodeProtectedJSON(r):await r.json();
        if(c?.__readerCorruptCipher)c=syntheticCatalog(c.__readerCorruptCipher);
        c.series=Array.isArray(c.series)?c.series:[];
        c.webnovels=Array.isArray(c.webnovels)?c.webnovels:c.series.filter(x=>x.kind==='webnovel');
        c.lightnovels=Array.isArray(c.lightnovels)?c.lightnovels:c.series.filter(x=>x.kind==='epub');
        c.volumes=Array.isArray(c.volumes)?c.volumes:[];
        c.seriesByPath=new Map(); c.wnById=new Map(); c.volumeById=new Map(); c.volumesBySeries=new Map(); c.coverById=new Map();

        // Building all derived maps used to run as one uninterrupted synchronous
        // block. On mobile that can monopolise the main thread long enough to
        // make the loader look permanently frozen. Index in small batches and
        // yield between them so rendering/input can continue.
        const totalIndexItems=Math.max(1,c.series.length+c.volumes.length);
        let indexed=0;
        const indexYield=async()=>{
          const pct=Math.min(99,Math.round(indexed/totalIndexItems*100));
          setCatalogStage(`Katalog indeksleniyor… ${pct}%`);
          await new Promise(r=>setTimeout(r,0))
        };

        for(let i=0;i<c.series.length;i++){
          const s=c.series[i];
          c.seriesByPath.set(String(s.path),s);
          if(s.kind==='webnovel'){
            const id=String(s.source_id ?? String(s.id).replace(/^wn:/,''));
            c.wnById.set(id,s);c.wnById.set(`wn:${id}`,s);
            if(s.cover){c.coverById.set(id,s.cover);c.coverById.set(`wn:${id}`,s.cover)}
          }
          if(s.cover_book_id!=null&&s.cover)c.coverById.set(String(s.cover_book_id),s.cover);
          indexed++;
          if((i&255)===255)await indexYield()
        }

        for(let i=0;i<c.volumes.length;i++){
          const v=c.volumes[i];
          c.volumeById.set(String(v.id),v);
          const seriesKey=String(v.series);
          let list=c.volumesBySeries.get(seriesKey);
          if(!list){list=[];c.volumesBySeries.set(seriesKey,list)}
          list.push(v);
          if(v.cover)c.coverById.set(String(v.id),v.cover);
          indexed++;
          if((i&255)===255)await indexYield()
        }

        setCatalogStage('Katalog indeksleniyor… 100%');
        catalogRef=c;
        window.mockCoverURL=function(id){
          const k=String(id??'');
          if(corruptMode)return c.coverById.get(k)||c.wnById.get(k)?.cover||corruptCoverURL(k);
          const rel=c.coverById.get(k)||c.wnById.get(k)?.cover||null;
          return rel?storageURL(String(rel),{}):placeholderCover(c.volumeById.get(k)?.title||c.wnById.get(k)?.name||k)
        };
        return c;
      })();
    }
    return catalogPromise;
  }

  function wnId(key){const s=decodeURIComponent(String(key??''));return s.startsWith('wn:')?s.slice(3):s;}
  async function getWN(key){const c=await loadCatalog();return c.wnById.get(String(key))||c.wnById.get(wnId(key))||null;}
  async function getSeries(path){const c=await loadCatalog();return c.seriesByPath.get(String(path))||null;}

  async function loadIndex(kind,id){
    const key=`${kind}:${id}`;
    if(!indexCache.has(key)){
      indexCache.set(key,(async()=>{
        if(corruptMode){
          // Synthetic catalog IDs do not exist on disk. Derive their broken
          // indexes from the wrong-key universe + encrypted catalog fingerprint.
          const pseudo=new TextEncoder().encode(`${corruptCatalogFingerprint}|${kind}|${id}|${corruptSeed}`);
          const idx=syntheticIndex(kind,String(id),pseudo);
          idx._key=key;idx.frames=idx.frames||[];
          if(kind==='wn')for(const ch of idx.chapters||[])chapterLookup.set(String(ch.id),{index:idx,chapter:ch});
          return idx;
        }
        const cfg=await loadCryptoConfig(),ext=cfg.encrypted?'.rse':'.json';
        const r=await nativeFetch(storageURL(`data/index/${kind}/${encodeURIComponent(String(id))}${ext}`,{mutable:true}),{cache:'no-cache'});
        if(!r.ok) throw new Error(`reader-static ${key} index HTTP ${r.status}`);
        let idx=cfg.encrypted?await decodeProtectedJSON(r):await r.json();
        if(idx?.__readerCorruptCipher)idx=syntheticIndex(kind,String(id),idx.__readerCorruptCipher);
        idx._key=key; idx.frames=idx.frames||[];
        if(kind==='wn') for(const ch of idx.chapters||[]) chapterLookup.set(String(ch.id),{index:idx,chapter:ch});
        return idx;
      })());
    }
    return indexCache.get(key);
  }

  async function nativeDecompress(bytes,codec){
    if(codec==='none') return bytes;
    const ds=new DecompressionStream(codec==='brotli'?'brotli':codec);
    return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer());
  }
  function loadScript(src){return new Promise((res,rej)=>{const s=document.createElement('script');s.src=src;s.async=true;s.onload=res;s.onerror=()=>rej(new Error(`Could not load ${src}`));document.head.appendChild(s);});}
  async function ensureFzstd(){
    if(!fzstdPromise) fzstdPromise=(async()=>{
      if(window.fzstd)return window.fzstd;
      // Native DecompressionStream('zstd') is preferred. Older browsers get the
      // tiny compatibility decoder from a CDN. No missing local /vendor probe.
      let last=null;
      for(const src of ['https://cdn.jsdelivr.net/npm/fzstd@0.1.1/umd/index.js','https://unpkg.com/fzstd@0.1.1/umd/index.js']){
        try{await loadScript(src);if(window.fzstd)return window.fzstd}catch(e){last=e}
      }
      throw last||new Error('Zstd decoder unavailable');
    })();
    return fzstdPromise;
  }
  async function decompress(bytes,codec){
    try{return await nativeDecompress(bytes,codec)}catch(e){if(codec==='zstd'){const z=await ensureFzstd();return z.decompress(bytes)}throw e}
  }
  function touchCache(k,v){if(blockCache.has(k))blockCache.delete(k);blockCache.set(k,v);while(blockCache.size>BLOCK_CACHE_LIMIT)blockCache.delete(blockCache.keys().next().value);}

  async function decodeFrame(idx,frameId){
    const fr=idx.frames?.[frameId]; if(!fr) throw new Error(`Missing frame ${frameId} in ${idx._key}`);
    const [part,off,clen,rlen,codec]=fr; const key=`${idx._key}:${frameId}`;
    if(blockCache.has(key)){const v=blockCache.get(key);touchCache(key,v);return v;}
    const promise=(async()=>{
      const bucket=idx.bucket_dir||`b${String(idx.bucket).padStart(4,'0')}`; const pack=String(part).padStart(3,'0')+'.pack';
      const bnum=bucketNumber(idx,bucket); const url=storageURL(`data/buckets/${bucket}/${pack}`,{bucket:bnum}); const end=off+clen-1;
      const r=await nativeFetch(url,{headers:{Range:`bytes=${off}-${end}`},cache:'force-cache'});
      if(!r.ok) throw new Error(`Pack HTTP ${r.status}: ${url}`);
      let b=new Uint8Array(await r.arrayBuffer());
      if(r.status!==206){
        if(!warnedNoRange){warnedNoRange=true;console.warn('[reader-static] host ignored HTTP Range; whole pack may be downloaded');}
        if(b.byteLength>=off+clen)b=b.subarray(off,off+clen);else if(b.byteLength!==clen)throw new Error(`Unexpected non-range pack length ${b.byteLength}`);
      }
      const keyObj=await ensureCryptoKey();if(keyObj)b=await decryptEnvelope(b,keyObj);
      const raw=await decompress(b,codec||'zstd'); if(rlen&&raw.byteLength!==rlen)console.warn('reader-static frame size mismatch',idx._key,frameId,raw.byteLength,rlen); return raw;
    })();
    touchCache(key,promise); try{const v=await promise;touchCache(key,v);return v}catch(e){blockCache.delete(key);throw e}
  }

  async function readSegments(idx,segments){
    if(!segments?.length) return new Uint8Array();
    const parts=[]; let total=0;
    for(const seg of segments){const [fid,roff,rlen]=seg;const raw=await decodeFrame(idx,fid);const sl=raw.subarray(roff,roff+rlen);parts.push(sl);total+=sl.byteLength;}
    if(parts.length===1)return parts[0]; const out=new Uint8Array(total);let o=0;for(const p of parts){out.set(p,o);o+=p.byteLength;}return out;
  }

  function publicChapter(ch){return {path:`wn-chapter:${ch.id}`,title:ch.t||`Chapter ${ch.i??''}`,translated_title:ch.tt||'',image_only:false,chapter_id:ch.id,chapter_index:ch.i??0,available:!!ch.en,translated:!!ch.tr};}
  async function wnBook(key){
    const n=await getWN(key); if(!n)return null; const id=String(n.source_id??wnId(n.id)); const idx=await loadIndex('wn',id); const chapters=(idx.chapters||[]).map(publicChapter);
    return {id:`wn:${id}`,rel_path:`wn:${id}`,series:`wn:${id}`,series_name:n.name,filename:n.name,volume:null,title:n.name,author:n.author||'',description:n.description||'',release_date:'',size:(idx.source_bytes||0)+(idx.translated_bytes||0),deep_ok:1,translated:!!n.translated_count,translated_count:n.translated_count||0,translations:n.translated_count?['tr']:[],kind:'webnovel',curated:!!n.curated,curation_tier:n.curation_tier||null,chapter_count:n.chapter_count||chapters.length,estimated_word_count:n.word_count||0,spine:chapters,toc:chapters.map(x=>({label:x.title,path:x.path,depth:0}))};
  }
  async function lnBook(id){const idx=await loadIndex('ln',String(id));return idx.book||null;}

  async function seriesResponse(path){
    const s=await getSeries(path); if(!s)return null;
    if(s.kind==='webnovel'){
      const n=s; return {series:{...n,hero_book_id:n.cover_book_id,kind:'webnovel'},volumes:[{id:n.cover_book_id,rel_path:n.path,series:n.path,series_name:n.name,filename:n.name,volume:null,title:n.name,author:n.author||'',description:n.description||'',release_date:'',patch_lang:n.translated_count?'tr':null,size:n.text_bytes||0,mtime_ns:0,deep_ok:1,translated:!!n.translated_count,translated_count:n.translated_count||0,kind:'webnovel',chapter_count:n.chapter_count||0,available_chapters:n.available_chapters??n.chapter_count??0,curated:!!n.curated,curation_tier:n.curation_tier||null}]};
    }
    const c=await loadCatalog(); const vols=(c.volumesBySeries.get(String(path))||[]).slice();
    return {series:{path:s.path,name:s.name,volume_count:s.volume_count||vols.length,hero_book_id:s.cover_book_id,description:s.description||'',author:s.author||'',first_release_date:s.first_release_date||'',latest_release_date:s.latest_release_date||'',translated:!!s.translated,translated_count:s.translated_count||0,kind:'epub'},volumes:vols};
  }

  async function chapterText(entry,wanted){
    const {index:idx,chapter:ch}=entry;const lang=wanted==='tr'&&ch.tr?'tr':'en';
    if(corruptMode){const fp=corruptIndexSeeds.get(idx._key)||idx._key;return {text:corruptParagraphs(`wnbody:${fp}:${ch.id}`,7+(hash32(ch.id)%11)).join('\n\n'),language:'en'};}
    const loc=lang==='tr'?ch.tr:ch.en;if(!loc)return {text:'',language:lang};const [fid,off,len]=loc;const raw=await decodeFrame(idx,fid);return {text:textDecoder.decode(raw.subarray(off,off+len)),language:lang};
  }
  async function lnResource(bookId,path,lang){
    const idx=await loadIndex('ln',String(bookId));
    if(corruptMode){
      const fp=corruptIndexSeeds.get(idx._key)||idx._key, p=String(path||'');
      if(/glitch-[^/]+\.svg$/i.test(p))return {bytes:new TextEncoder().encode(corruptSvg(`media:${bookId}:${p}:${fp}`,900,1200)),mime:'image/svg+xml',language:'en'};
      if(/\.x?html?$/i.test(p))return {bytes:new TextEncoder().encode(corruptHtml(`section:${bookId}:${p}:${fp}`)),mime:'application/xhtml+xml; charset=utf-8',language:'en'};
      return {bytes:new TextEncoder().encode(corruptParagraphs(`res:${bookId}:${p}:${fp}`,4).join('\n\n')),mime:'text/plain; charset=utf-8',language:'en'};
    }
    let ent=null,actual='en';
    if(lang&&idx.translations?.[lang]?.[path]){ent=idx.translations[lang][path];actual=lang}
    if(!ent)ent=idx.resources?.[path]; if(!ent)return null;
    return {bytes:await readSegments(idx,ent.l||[]),mime:ent.m||'application/octet-stream',language:actual};
  }

  function applySearch(items,params){
    let rows=items.slice(); const source=(params.get('source')||'all').toLowerCase();
    if(source==='webnovel'||source==='wn')rows=rows.filter(x=>x.kind==='webnovel'); else if(source==='epub'||source==='ln'||source==='lightnovel')rows=rows.filter(x=>x.kind==='epub');
    const q=(params.get('q')||params.get('keywords')||'').trim(),title=(params.get('title')||'').trim(),author=(params.get('author')||'').trim(),exclude=(params.get('exclude')||'').trim();
    if(q)rows=rows.filter(x=>includesFold(`${x.name} ${x.author} ${x.description} ${(x.genres||[]).join(' ')}`,q));if(title)rows=rows.filter(x=>includesFold(x.name,title));if(author)rows=rows.filter(x=>includesFold(x.author,author));if(exclude)rows=rows.filter(x=>!includesFold(`${x.name} ${x.author} ${x.description}`,exclude));
    const statuses=params.getAll('status').filter(Boolean);if(statuses.length)rows=rows.filter(x=>statuses.includes(String(x.status||'')));
    const gin=[...params.getAll('genre_in'),...params.getAll('genres_in'),...params.getAll('genre_include')].filter(Boolean),gout=[...params.getAll('genre_out'),...params.getAll('genres_out'),...params.getAll('genre_exclude')].filter(Boolean),gr=params.get('genre_mode')||params.get('genre_rule')||'all';
    if(gin.length)rows=rows.filter(x=>{const s=new Set((x.genres||[]).map(g=>fold(g)));const q=gin.map(g=>fold(g));return gr==='all'?q.every(g=>s.has(g)):q.some(g=>s.has(g))});if(gout.length)rows=rows.filter(x=>{const s=new Set((x.genres||[]).map(g=>fold(g)));return !gout.map(g=>fold(g)).some(g=>s.has(g))});
    const tr=params.get('translation')||'any';if(tr==='some'||tr==='translated')rows=rows.filter(x=>(x.translated_count||0)>0);else if(tr==='none'||tr==='untranslated')rows=rows.filter(x=>!(x.translated_count||0));else if(tr==='full'||tr==='complete')rows=rows.filter(x=>x.kind==='epub'?(x.volume_count>0&&x.translated_count>=x.volume_count):(x.available_chapters>0&&x.translated_count>=x.available_chapters));else if(tr==='partial')rows=rows.filter(x=>(x.translated_count||0)>0&&(x.kind==='epub'?x.translated_count<x.volume_count:x.translated_count<x.available_chapters));
    const nf=(name,fn)=>{const r=params.get(name);if(r!==null&&r!==''){const n=Number(r);if(Number.isFinite(n))rows=rows.filter(x=>fn(x,n));}};nf('rating_min',(x,n)=>Number(x.rating??-Infinity)>=n);nf('rating_max',(x,n)=>Number(x.rating??Infinity)<=n);nf('rating_count_min',(x,n)=>Number(x.rating_count||0)>=n);nf('chapters_min',(x,n)=>Number(x.chapter_count||0)>=n);nf('chapters_max',(x,n)=>Number(x.chapter_count||0)<=n);nf('volumes_min',(x,n)=>Number(x.volume_count||0)>=n);nf('volumes_max',(x,n)=>Number(x.volume_count||0)<=n);nf('translated_min',(x,n)=>Number(x.translated_count||0)>=n);
    const curated=params.get('curated')||'any';if(curated==='only')rows=rows.filter(x=>!!x.curated);else if(curated==='not')rows=rows.filter(x=>!x.curated);
    const sort=params.get('sort')||'relevance',sorts={title_az:(a,b)=>a.name.localeCompare(b.name),title_za:(a,b)=>b.name.localeCompare(a.name),rating_desc:(a,b)=>Number(b.rating||0)-Number(a.rating||0),rating_count_desc:(a,b)=>Number(b.rating_count||0)-Number(a.rating_count||0),chapters_desc:(a,b)=>Number(b.chapter_count||0)-Number(a.chapter_count||0),volumes_desc:(a,b)=>Number(b.volume_count||0)-Number(a.volume_count||0),updated_desc:(a,b)=>Number(b.updated_ns||0)-Number(a.updated_ns||0),release_desc:(a,b)=>String(b.latest_release_date||'').localeCompare(String(a.latest_release_date||'')),curated_desc:(a,b)=>Number(!!b.curated)-Number(!!a.curated)};if(sorts[sort])rows.sort(sorts[sort]);return rows;
  }

  // Do NOT preload the catalog here. The main reader boot owns catalog loading.
  // Starting loadCatalog() while this external script is still being parsed held
  // the entire application at 0% on slower mobile devices.
  window.mockCoverURL=id=>corruptMode?corruptCoverURL(String(id??'')):placeholderCover(String(id??''));



  function coverPathFor(id){
    const c=catalogRef,k=String(id??'');
    const rel=c?.coverById?.get(k)||c?.wnById?.get(k)?.cover||null;
    if(corruptMode)return rel||corruptCoverURL(k);
    return rel?storageURL(String(rel),{}):placeholderCover(c?.volumeById?.get(k)?.title||c?.wnById?.get(k)?.name||k);
  }
  window.__readerStaticCoverURL=coverPathFor;

  // Packed EPUB media is resolved in JS to blob: URLs.  This deliberately avoids
  // raw <img src="/api/res/..."> requests and therefore works on the first load,
  // under subfolders, and without a service worker.
  const mediaBlobCache=new Map();
  const mediaBlobOrder=[];
  const MEDIA_BLOB_LIMIT=384;
  async function logicalMediaBlobURL(logical){
    const key=String(logical||'');
    if(!key)return key;
    if(/^(?:data:|blob:)/i.test(key))return key;
    if(mediaBlobCache.has(key))return mediaBlobCache.get(key);
    const promise=(async()=>{
      const u=new URL(key,document.baseURI||location.href);
      // Bypass fetch/service workers entirely for packed EPUB resources. This is
      // what makes media work on the first page load and also makes stale workers
      // from older reader-static builds harmless.
      if(u.pathname.startsWith('/api/res/')){
        const rest=u.pathname.slice('/api/res/'.length),slash=rest.indexOf('/');
        if(slash<0)throw new Error(`Malformed EPUB media URL: ${key}`);
        const bid=decodeURIComponent(rest.slice(0,slash));
        const member=decodeURIComponent(rest.slice(slash+1));
        if(member.startsWith('/')||member.split('/').includes('..'))throw new Error(`Unsafe EPUB media path: ${member}`);
        const r=await lnResource(bid,member,(u.searchParams.get('lang')||'').toLowerCase());
        if(!r)throw new Error(`EPUB media not found: ${bid}/${member}`);
        return URL.createObjectURL(new Blob([r.bytes],{type:r.mime||'application/octet-stream'}));
      }
      const r=await nativeFetch(u.href,{cache:'force-cache'});
      if(!r.ok)throw new Error(`EPUB media HTTP ${r.status}: ${key}`);
      return URL.createObjectURL(await r.blob());
    })();
    mediaBlobCache.set(key,promise);mediaBlobOrder.push(key);
    while(mediaBlobOrder.length>MEDIA_BLOB_LIMIT){
      const old=mediaBlobOrder.shift();
      if(!old||old===key)continue;
      const op=mediaBlobCache.get(old);mediaBlobCache.delete(old);
      Promise.resolve(op).then(u=>{if(typeof u==='string'&&u.startsWith('blob:'))URL.revokeObjectURL(u)}).catch(()=>{});
    }
    try{return await promise}catch(e){mediaBlobCache.delete(key);throw e}
  }
  async function hydrateOne(el,attr,dataAttr){
    const logical=el.getAttribute(dataAttr);if(!logical||el.dataset.readerStaticLoading===dataAttr)return;
    el.dataset.readerStaticLoading=dataAttr;
    try{
      const u=await logicalMediaBlobURL(logical);
      if(!el.isConnected)return;
      el.setAttribute(attr,u);
      el.removeAttribute(dataAttr);
      delete el.dataset.readerStaticLoading;
    }catch(e){
      delete el.dataset.readerStaticLoading;
      console.warn('[reader-static] EPUB media unavailable',logical,e);
      // Trigger the production reader's normal unavailable-image UI, but static
      // mode disables its misleading "replace with cover" front-matter fallback.
      if(attr==='src'&&el.tagName==='IMG'){
        el.dispatchEvent(new Event('error'));
      }
    }
  }
  async function hydrateSrcset(el){
    const logical=el.getAttribute('data-reader-static-srcset');if(!logical||el.dataset.readerStaticSrcsetLoading==='1')return;
    el.dataset.readerStaticSrcsetLoading='1';
    try{
      const parts=logical.split(',').map(x=>x.trim()).filter(Boolean);
      const out=[];
      for(const part of parts){
        const bits=part.split(/\s+/),u=bits.shift();
        bits.unshift(await logicalMediaBlobURL(u));out.push(bits.join(' '));
      }
      if(el.isConnected){el.setAttribute('srcset',out.join(', '));el.removeAttribute('data-reader-static-srcset')}
    }catch(e){console.warn('[reader-static] EPUB srcset unavailable',logical,e)}
    finally{delete el.dataset.readerStaticSrcsetLoading}
  }
  window.__readerStaticHydrateMedia=function(root=document){
    const nodes=[];
    if(root?.nodeType===1)nodes.push(root);
    root?.querySelectorAll?.('[data-reader-static-src],[data-reader-static-poster],[data-reader-static-srcset],[data-reader-static-href]').forEach(x=>nodes.push(x));
    for(const el of nodes){
      if(el.hasAttribute?.('data-reader-static-src'))hydrateOne(el,'src','data-reader-static-src');
      if(el.hasAttribute?.('data-reader-static-poster'))hydrateOne(el,'poster','data-reader-static-poster');
      if(el.hasAttribute?.('data-reader-static-href'))hydrateOne(el,'href','data-reader-static-href');
      if(el.hasAttribute?.('data-reader-static-srcset'))hydrateSrcset(el);
    }
  };
  addEventListener('pagehide',()=>{
    for(const p of mediaBlobCache.values())Promise.resolve(p).then(u=>{if(typeof u==='string'&&u.startsWith('blob:'))URL.revokeObjectURL(u)}).catch(()=>{});
    mediaBlobCache.clear();mediaBlobOrder.length=0;
  });

  window.fetch=async function(input,init){
    const raw=typeof input==='string'?input:(input?.url||String(input));let url;try{url=new URL(raw,document.baseURI||location.href)}catch(_){return nativeFetch(input,init)}const p=url.pathname;
    if(p==='/api/status'){const c=await loadCatalog();return jsonResponse({phase:'done',running:false,series:c.series.length,found:c.total_chapters||0,errors:0,webnovels_available:c.webnovels.length>0});}
    if(p==='/api/library'){
      const c=await loadCatalog(),source=(url.searchParams.get('source')||'epub').toLowerCase(),q=(url.searchParams.get('q')||'').trim();let rows=source==='webnovel'?c.webnovels:c.lightnovels;if(q)rows=rows.filter(x=>includesFold(`${x.name} ${x.author} ${x.description}`,q));
      return jsonResponse({series:rows,total_volumes:c.volumes.length,total_webnovels:c.webnovels.length,total_webnovel_chapters:c.total_chapters||0,library_source:source,webnovels_available:c.webnovels.length>0});
    }
    if(p==='/api/series'){const d=await seriesResponse(url.searchParams.get('path')||'');return d?jsonResponse(d):jsonResponse({error:'not found'},404);}
    if(p==='/api/book'){
      const id=url.searchParams.get('id')||'';const d=String(id).startsWith('wn:')?await wnBook(id):await lnBook(id).catch(()=>null);return d?jsonResponse(d):jsonResponse({error:'not found'},404);
    }
    if(p==='/api/wn/chapters'){const id=wnId(url.searchParams.get('book')||'');const idx=await loadIndex('wn',id);const rows=(idx.chapters||[]).map(publicChapter);return jsonResponse({book:`wn:${id}`,chapters:rows,count:rows.length});}
    if(p.startsWith('/api/wn/chapter/')){
      const cid=decodeURIComponent(p.split('/').pop());let e=chapterLookup.get(String(cid));if(!e){for(const v of indexCache.values()){const idx=await v;if(idx.kind!=='webnovel')continue;const ch=(idx.chapters||[]).find(x=>String(x.id)===String(cid));if(ch){e={index:idx,chapter:ch};break;}}}if(!e)return textResponse('',404);const out=await chapterText(e,(url.searchParams.get('lang')||'en').toLowerCase());return textResponse(out.text,200,{'X-Reader-Content-Language':out.language});
    }
    if(p.startsWith('/api/res/')){
      const rest=p.slice('/api/res/'.length);const slash=rest.indexOf('/');if(slash<0)return bytesResponse('',400);const bid=decodeURIComponent(rest.slice(0,slash));const member=decodeURIComponent(rest.slice(slash+1));if(member.startsWith('/')||member.split('/').includes('..'))return bytesResponse('',400);const r=await lnResource(bid,member,(url.searchParams.get('lang')||'').toLowerCase());return r?bytesResponse(r.bytes,r.mime,200,{'Cache-Control':'public, max-age=3600','X-Reader-Content-Language':r.language||'en'}):bytesResponse('',404);
    }
    if(p==='/api/search/options'){
      const c=await loadCatalog(),gc=new Map(),sc=new Map(),ratings=[];for(const x of c.webnovels){for(const g of x.genres||[])gc.set(g,(gc.get(g)||0)+1);if(x.status)sc.set(x.status,(sc.get(x.status)||0)+1);if(Number.isFinite(Number(x.rating)))ratings.push(Number(x.rating));}
      return jsonResponse({webnovels_available:c.webnovels.length>0,genres:[...gc.entries()].sort((a,b)=>b[1]-a[1]).map(([name,count])=>({name,count})),statuses:[...sc.entries()].map(([name,count])=>({name,count})),rating_min:ratings.length?Math.min(...ratings):0,rating_max:ratings.length?Math.max(...ratings):10});
    }
    if(p==='/api/search'){
      const c=await loadCatalog();let rows=applySearch(c.series,url.searchParams);const page=Math.max(1,Number(url.searchParams.get('page')||1)),ps=Math.max(1,Number(url.searchParams.get('page_size')||48)),total=rows.length,pages=Math.max(1,Math.ceil(total/ps));rows=rows.slice((page-1)*ps,page*ps);return jsonResponse({results:rows,total,page,pages,page_size:ps,total_epub:rows.filter(x=>x.kind==='epub').length,total_webnovel:rows.filter(x=>x.kind==='webnovel').length,webnovels_available:c.webnovels.length>0});
    }
    return nativeFetch(input,init);
  };
})();
