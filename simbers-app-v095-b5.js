const VERSION="0.9.5";

(async()=>{
  const [runtimeResponse,patchResponse]=await Promise.all([
    fetch(`./simbers-v093.js?v=${VERSION}&build=5`,{cache:"no-store"}),
    fetch(`./simbers-v095-patch.js?v=${VERSION}&build=5`,{cache:"no-store"})
  ]);

  if(!runtimeResponse.ok){
    throw new Error(`Simbers v0.9.3 runtime fetch failed (${runtimeResponse.status})`);
  }
  if(!patchResponse.ok){
    throw new Error(`Simbers v0.9.5 patch fetch failed (${patchResponse.status})`);
  }

  let runtime=await runtimeResponse.text();
  const patch=await patchResponse.text();

  runtime=runtime.replace(
    'const VERSION="0.9.3";',
    `const VERSION="${VERSION}";`
  );

  const insertionPoint='  document.open();';
  if(!runtime.includes(insertionPoint)){
    throw new Error("v0.9.5 runtime insertion point missing");
  }

  runtime=runtime.replace(
    insertionPoint,
    `${patch}\n${insertionPoint}`
  );

  try{
    new Function(runtime);
  }catch(error){
    throw new Error(
      `Generated v0.9.5 runtime is invalid: ${error.message}\n${error.stack||""}`
    );
  }

  const runtimeUrl=URL.createObjectURL(
    new Blob([runtime],{type:"text/javascript"})
  );
  await import(runtimeUrl);
})().catch(error=>{
  console.error(error);
  document.body.innerHTML=`<pre style="max-width:900px;padding:24px;color:#ff8293;white-space:pre-wrap">Simbers v${VERSION} failed to load.\n\n${String(error.stack||error)}</pre>`;
});
