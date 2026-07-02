from pathlib import Path

path=Path('simbers.html')
text=path.read_text(encoding='utf-8')
text=text.replace('Create a map to see its preview here!','Create a map to see it\'s preview here!')
text=text.replace('viewerStatus.textContent="ArcViewer ready. Sending generated map…";','viewerStatus.textContent=viewerShell.classList.contains("empty")?"ArcViewer ready.":"ArcViewer ready. Sending generated map…";',1)
path.write_text(text,encoding='utf-8')
print('Fixed persistent viewer copy and idle status')
