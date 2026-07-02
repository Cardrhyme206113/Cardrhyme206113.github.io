from pathlib import Path

path = Path('simbers.html')
text = path.read_text(encoding='utf-8')

old_body = '''  body{
    width:100%;
    min-height:100vh;
    margin:0;
    display:flex;
    align-items:center;
    justify-content:center;
    padding:0;
    overflow-x:hidden;
    color:var(--text);
    font:15px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
    background:
      radial-gradient(circle,#ff9acb 0 11%,transparent 38%),
      radial-gradient(circle,#6a2be0 0 12%,transparent 40%),
      radial-gradient(circle,#ff54a5 0 9%,transparent 36%),
      linear-gradient(125deg,#ff4e9d 0%,#b342ed 42%,#6429cc 72%,#311143 100%);
    background-repeat:no-repeat;
    background-size:
      150% 150%,
      165% 165%,
      145% 145%,
      220% 220%;
    animation:gradientDrift 11s linear infinite;
  }'''
new_body = '''  body{
    width:100%;
    height:100vh;
    height:100dvh;
    min-height:100vh;
    margin:0;
    display:flex;
    align-items:flex-start;
    justify-content:center;
    padding:0;
    overflow:hidden;
    position:relative;
    color:var(--text);
    font:15px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
    background:
      radial-gradient(circle,#ff9acb 0 11%,transparent 38%),
      radial-gradient(circle,#6a2be0 0 12%,transparent 40%),
      radial-gradient(circle,#ff54a5 0 9%,transparent 36%),
      linear-gradient(125deg,#ff4e9d 0%,#b342ed 42%,#6429cc 72%,#311143 100%);
    background-repeat:no-repeat;
    background-size:
      150% 150%,
      165% 165%,
      145% 145%,
      220% 220%;
    animation:gradientDrift 11s linear infinite;
  }

  body::before{
    content:"";
    position:fixed;
    inset:0;
    z-index:0;
    pointer-events:none;
    background:rgba(7,5,13,.64);
  }'''
if old_body not in text:
    raise SystemExit('body block not found')
text = text.replace(old_body, new_body, 1)

old_app = '''  .app{
    width:100%;
    max-width:600px;
    flex:0 1 600px;
    margin:0 auto;
    position:relative;
    isolation:isolate;
  }'''
new_app = '''  .app{
    width:100%;
    max-width:none;
    height:100vh;
    height:100dvh;
    min-height:100vh;
    flex:0 0 100%;
    margin:0;
    position:relative;
    z-index:1;
    isolation:isolate;
    overflow:hidden;
  }'''
if old_app not in text:
    raise SystemExit('app block not found')
text = text.replace(old_app, new_app, 1)

old_app_before = '''  .app::before{
    content:"";
    position:absolute;
    z-index:-1;
    inset:-2px;
    border-radius:30px;
    background:
      linear-gradient(
        130deg,
        rgba(255,255,255,.22),
        rgba(255,255,255,.03) 35% 68%,
        rgba(255,117,190,.16)
      );
  }'''
new_app_before = '''  .app::before{display:none}'''
if old_app_before not in text:
    raise SystemExit('app highlight block not found')
text = text.replace(old_app_before, new_app_before, 1)

old_card = '''  .card{
    position:relative;
    width:100%;
    max-width:100%;
    overflow:hidden;
    padding:22px;
    border:1px solid var(--panel-line);
    border-radius:20px;
    background:
      linear-gradient(
        145deg,
        rgba(255,255,255,.055),
        transparent 34%
      ),
      linear-gradient(
        160deg,
        var(--panel) 0%,
        var(--panel-deep) 100%
      );
    box-shadow:
      0 18px 42px rgba(22,4,38,.24),
      inset 0 1px 0 rgba(255,255,255,.10);
  }'''
new_card = '''  .card{
    position:relative;
    width:100%;
    max-width:none;
    height:50vh;
    height:50dvh;
    overflow-x:hidden;
    overflow-y:auto;
    display:flex;
    flex-direction:column;
    justify-content:center;
    padding:12px max(14px,env(safe-area-inset-right)) 12px max(14px,env(safe-area-inset-left));
    border:0;
    border-bottom:1px solid rgba(255,255,255,.14);
    border-radius:0;
    background:rgba(12,7,20,.84);
    box-shadow:none;
  }'''
if old_card not in text:
    raise SystemExit('card block not found')
text = text.replace(old_card, new_card, 1)

old_card_children = '''  .card > *{
    position:relative;
    z-index:1;
  }'''
new_card_children = '''  .card > *{
    position:relative;
    z-index:1;
    width:min(100%,600px);
    margin-left:auto;
    margin-right:auto;
  }'''
if old_card_children not in text:
    raise SystemExit('card child block not found')
text = text.replace(old_card_children, new_card_children, 1)

old_mobile = '''  @media(max-width:520px){
    body{
      align-items:center;
      padding:0;
    }

    .app{
      max-width:none;
      flex-basis:auto;
      margin:0;
    }

    .app::before{
      display:none;
    }

    .card{
      padding:14px;
      border-left:0;
      border-right:0;
      border-radius:0;
    }

    .actions{
      grid-template-columns:1fr;
      justify-items:center;
    }

    .uploadButton,
    button{
      width:min(100%,420px);
      min-height:48px;
      margin-inline:auto;
    }
  }'''
new_mobile = '''  @media(max-width:520px){
    .card{
      justify-content:flex-start;
      padding:10px 10px 8px;
    }

    .brandMark{margin-bottom:10px}
    h1{font-size:clamp(28px,9vw,38px)}
    .subtitle{margin:7px auto 12px}

    .actions{
      grid-template-columns:1fr;
      justify-items:center;
      gap:7px;
    }

    .uploadButton,
    button{
      width:min(100%,420px);
      min-height:44px;
      margin-inline:auto;
    }

    progress{margin:10px auto 7px}
  }'''
if old_mobile not in text:
    raise SystemExit('mobile block not found')
text = text.replace(old_mobile, new_mobile, 1)

old_viewer = '''  .viewerShell{
    width:100%;
    max-height:0;
    margin-top:0;
    overflow:hidden;
    opacity:0;
    border:0 solid rgba(255,255,255,.16);
    border-radius:20px;
    background:#101116;
    transition:max-height .34s ease,margin-top .34s ease,opacity .18s ease,border-width .18s ease;
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
    color:rgba(255,255,255,.78);
    background:rgba(255,255,255,.045);
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
    min-height:48px;
    display:flex;
    align-items:center;
    justify-content:flex-end;
    gap:8px;
    padding:6px 8px;
    background:rgba(15,8,24,.96);
  }
  .viewerToolbar button{
    width:auto;
    min-width:62px;
    min-height:36px;
    padding:0 13px;
    border:1px solid rgba(255,255,255,.18);
    border-radius:12px;
    background:rgba(255,255,255,.08);
    color:#fff;
    box-shadow:none;
    font-size:13px;
  }
  .viewerToolbar button:active{transform:translateY(1px)}
  body.viewer-open{align-items:flex-start}

  @media(max-width:520px){
    .viewerShell.open{max-height:470px}
    .viewerShell iframe{height:360px;min-height:360px}
  }'''
new_viewer = '''  .viewerShell{
    position:relative;
    width:100%;
    height:0;
    max-height:0;
    margin:0;
    overflow:hidden;
    opacity:0;
    border:0;
    border-radius:0;
    background:#08090d;
    transition:opacity .16s ease;
  }

  .viewerShell.open{
    height:50vh;
    height:50dvh;
    max-height:50vh;
    max-height:50dvh;
    margin:0;
    opacity:1;
    border-top:1px solid rgba(255,255,255,.12);
  }

  .viewerStatus{
    position:absolute;
    z-index:3;
    top:0;
    left:0;
    right:0;
    min-height:30px;
    display:flex;
    align-items:center;
    padding:6px 10px;
    color:rgba(255,255,255,.78);
    background:linear-gradient(180deg,rgba(5,6,10,.86),rgba(5,6,10,.20));
    font-size:11px;
    text-align:left;
    pointer-events:none;
  }

  .viewerShell iframe{
    position:absolute;
    inset:0;
    width:100%;
    height:100%;
    min-height:0;
    display:block;
    border:0;
    background:#08090d;
  }

  .viewerToolbar{
    position:absolute;
    z-index:4;
    right:8px;
    bottom:8px;
    min-height:0;
    display:flex;
    align-items:center;
    justify-content:flex-end;
    gap:6px;
    padding:0;
    background:transparent;
  }

  .viewerToolbar button{
    width:auto;
    min-width:56px;
    min-height:34px;
    padding:0 11px;
    border:1px solid rgba(255,255,255,.18);
    border-radius:10px;
    background:rgba(12,13,19,.82);
    color:#fff;
    box-shadow:none;
    font-size:12px;
    backdrop-filter:blur(6px);
  }

  .viewerToolbar button:active{transform:translateY(1px)}
  body.viewer-open{align-items:flex-start}'''
if old_viewer not in text:
    raise SystemExit('viewer CSS block not found')
text = text.replace(old_viewer, new_viewer, 1)

old_append = 'document.querySelector(".card").appendChild(viewerShell);'
new_append = 'document.querySelector(".app").appendChild(viewerShell);'
if old_append not in text:
    raise SystemExit('viewer append target not found')
text = text.replace(old_append, new_append, 1)

path.write_text(text, encoding='utf-8')
print('Applied top-half UI and exact bottom-half ArcViewer layout')
