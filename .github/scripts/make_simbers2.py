from pathlib import Path

text = Path('simbers.html').read_text(encoding='utf-8')
text = text.replace('https://cardrhyme206113.github.io/ArcViewer-simtest/', 'https://cardrhyme206113.github.io/beatsaver-viewer/simbers-viewer.html', 1)
text = text.replace('title="ArcViewer preview"', 'title="Lightweight Beat Saber 3D preview"', 1)
text = text.replace('      difficulty:"ExpertPlus",\n      uiOff:false', '      mode:"Standard",\n      difficulty:"ExpertPlus",\n      uiOff:false', 1)
text = text.replace('Loading ArcViewer…', 'Loading lightweight 3D viewer…')
Path('simbers2.html').write_text(text, encoding='utf-8')
