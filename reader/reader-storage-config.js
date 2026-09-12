// Generated storage routing. Viewer may be hosted at ANY GitHub Pages path.
window.__READER_STORAGE__ = Object.freeze({
  "version": 2,
  "metadataRoot": "https://raw.githubusercontent.com/Cardrhyme206113/reader-storage-a/main/",
  "roots": [
    "https://raw.githubusercontent.com/Cardrhyme206113/reader-storage-a/main/",
    "https://raw.githubusercontent.com/Cardrhyme206113/reader-storage-b/main/",
    "https://raw.githubusercontent.com/Cardrhyme206113/reader-storage-c/main/"
  ],
  "bucketBoundaries": [
    78,
    163
  ],
  "revision": "hq-20260911-2348-card"
});

// Lightweight in-app diagnostics are loaded immediately so mobile users can
// inspect reader/network/UI failures without DevTools.
(()=>{
  if(document.querySelector('script[data-reader-ui-debug]'))return;
  const d=document.createElement('script');
  d.src='./reader-ui-debug.js?v=20260912-ui1';
  d.dataset.readerUiDebug='1';
  document.head.appendChild(d);
})();

// Optional reader feature layers are loaded after the core reader has finished
// parsing, so they can extend the current build without owning navigation/layout.
document.addEventListener('DOMContentLoaded',()=>{
  if(document.querySelector('script[data-reader-translation-engine]'))return;
  const s=document.createElement('script');
  s.src='./reader-translation.js?v=20260912-engine7';
  s.dataset.readerTranslationEngine='1';
  document.head.appendChild(s);
},{once:true});
