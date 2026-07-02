from pathlib import Path

path = Path('simbers.html')
text = path.read_text(encoding='utf-8')

style_start = text.index('<style>')
style_end = text.index('</style>', style_start) + len('</style>')

new_style = r'''<style>
  :root{
    color-scheme:dark;
    --bg:#0d1015;
    --panel:#151922;
    --panel-2:#1a1f29;
    --line:#2a303b;
    --text:#f5f7fb;
    --muted:#9da7b5;
    --red:#ff4f72;
    --blue:#63a7ff;
    --accent:#7db3ff;
  }

  *{box-sizing:border-box;min-width:0}

  html{
    width:100%;
    min-height:100%;
    overflow-x:hidden;
    background:var(--bg);
  }

  body{
    width:100%;
    min-height:100vh;
    margin:0;
    display:flex;
    align-items:center;
    justify-content:center;
    padding:max(20px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(20px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));
    overflow-x:hidden;
    color:var(--text);
    font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
    background:
      radial-gradient(circle at 20% 0%,rgba(99,167,255,.08),transparent 28%),
      radial-gradient(circle at 85% 100%,rgba(255,79,114,.07),transparent 30%),
      var(--bg);
  }

  .app{
    width:100%;
    max-width:640px;
    margin:0 auto;
  }

  .card{
    width:100%;
    padding:28px;
    border:1px solid var(--line);
    border-radius:20px;
    background:linear-gradient(180deg,var(--panel-2),var(--panel));
    box-shadow:0 16px 44px rgba(0,0,0,.28);
  }

  .brandMark{
    display:flex;
    align-items:center;
    gap:8px;
    margin-bottom:16px;
  }

  .brandMark span{
    display:block;
    width:26px;
    height:6px;
    border-radius:999px;
    transform:rotate(-36deg);
  }

  .brandMark span:first-child{background:var(--red)}
  .brandMark span:last-child{background:var(--blue);transform:rotate(36deg);margin-left:-12px}

  h1{
    margin:0;
    font-size:clamp(30px,7vw,44px);
    line-height:1.05;
    letter-spacing:-.035em;
  }

  .subtitle{
    margin:10px 0 24px;
    color:var(--muted);
    font-size:14px;
  }

  .actions{
    display:grid;
    grid-template-columns:1fr 1fr;
    gap:10px;
  }

  .fileInput{
    position:absolute;
    width:1px;
    height:1px;
    opacity:0;
    pointer-events:none;
  }

  .uploadButton,
  button{
    min-height:50px;
    display:flex;
    align-items:center;
    justify-content:center;
    padding:0 16px;
    border-radius:12px;
    font:700 14px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
    text-align:center;
    cursor:pointer;
    user-select:none;
    -webkit-tap-highlight-color:transparent;
    transition:background .15s ease,border-color .15s ease,transform .12s ease,opacity .15s ease;
  }

  .uploadButton{
    border:1px solid var(--line);
    background:#121722;
    color:var(--text);
  }

  .uploadButton:hover{background:#171d28;border-color:#394252}

  button{
    border:1px solid #6d8fbd;
    background:#7db3ff;
    color:#0b111b;
    box-shadow:none;
  }

  button:hover{background:#94c0ff}
  .uploadButton:active,button:active{transform:translateY(1px)}
  button:disabled{opacity:.4;cursor:not-allowed}

  progress{
    width:100%;
    height:6px;
    display:block;
    margin:20px 0 12px;
    overflow:hidden;
    border:0;
    border-radius:999px;
    background:#0f131a;
    accent-color:var(--accent);
  }

  progress::-webkit-progress-bar{background:#0f131a;border-radius:999px}
  progress::-webkit-progress-value{background:linear-gradient(90deg,var(--red),var(--blue));border-radius:999px}

  .mapStatus{
    width:100%;
    min-height:19px;
    color:var(--muted);
    font-size:12px;
    line-height:1.45;
    overflow-wrap:anywhere;
  }

  #mapStatus{
    display:-webkit-box;
    -webkit-box-orient:vertical;
    -webkit-line-clamp:3;
    overflow:hidden;
  }

  #npsNote{margin-top:4px;color:#cfd5de}
  .hidden{display:none!important}

  .viewerShell{
    width:100%;
    max-height:0;
    margin-top:0;
    overflow:hidden;
    opacity:0;
    border:0 solid var(--line);
    border-radius:14px;
    background:#0e1117;
    transition:max-height .28s ease,margin-top .28s ease,opacity .18s ease,border-width .18s ease;
  }

  .viewerShell.open{
    max-height:540px;
    margin-top:18px;
    opacity:1;
    border-width:1px;
  }

  .viewerStatus{
    min-height:34px;
    display:flex;
    align-items:center;
    padding:7px 12px;
    color:var(--muted);
    background:#12161e;
    border-bottom:1px solid var(--line);
    font-size:12px;
    text-align:left;
  }

  .viewerShell iframe{
    width:100%;
    height:min(56vh,430px);
    min-height:330px;
    display:block;
    border:0;
    background:#101116;
  }

  .viewerToolbar{
    min-height:46px;
    display:flex;
    align-items:center;
    justify-content:flex-end;
    gap:8px;
    padding:6px 8px;
    border-top:1px solid var(--line);
    background:#12161e;
  }

  .viewerToolbar button{
    width:auto;
    min-width:60px;
    min-height:34px;
    padding:0 12px;
    border:1px solid var(--line);
    border-radius:10px;
    background:#1b212b;
    color:var(--text);
    font-size:12px;
  }

  .viewerToolbar button:hover{background:#242c38}
  body.viewer-open{align-items:flex-start}

  @media(max-width:560px){
    body{padding-left:12px;padding-right:12px}
    .card{padding:22px 18px;border-radius:16px}
    .actions{grid-template-columns:1fr}
    .uploadButton,button{min-height:48px}
    .viewerShell.open{max-height:470px}
    .viewerShell iframe{height:360px;min-height:360px}
  }
</style>'''

text = text[:style_start] + new_style + text[style_end:]
text = text.replace('Upload a song and create a complete five-difficulty Beat Saber map.', 'Upload a song, generate the map, and preview it instantly.', 1)
path.write_text(text, encoding='utf-8')
print('Applied simple UI')
