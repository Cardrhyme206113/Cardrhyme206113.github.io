from pathlib import Path

path = Path('simbers.html')
text = path.read_text(encoding='utf-8')

old = '''            <svg viewBox="0 0 48 48" focusable="false">
              <circle cx="24" cy="25" r="11"></circle>
              <path d="M24 9v5M24 36v5M8 25h5M35 25h5M13 14l4 4M31 32l4 4M35 14l-4 4M17 32l-4 4"></path>
              <path d="M29 16c2-5 7-6 10-3"></path>
            </svg>'''

new = '''            <svg viewBox="0 0 48 48" focusable="false">
              <circle cx="21.5" cy="27.5" r="10.5"></circle>
              <path d="M27.5 18.5c1.9-4.8 6-6.8 10.2-5.1M39 10l3-3m-3 3 4 1m-4-1 2 4"></path>
            </svg>'''

if old not in text:
    raise SystemExit('Current bomb SVG block not found')

text = text.replace(old, new, 1)
path.write_text(text, encoding='utf-8')
print('Replaced bomb icon with refined monochrome line SVG')
