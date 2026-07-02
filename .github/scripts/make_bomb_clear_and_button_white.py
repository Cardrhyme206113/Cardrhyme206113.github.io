from pathlib import Path

path = Path('simbers.html')
text = path.read_text(encoding='utf-8')

old_bomb = '''            <svg viewBox="0 0 48 48" focusable="false">
              <circle cx="21.5" cy="27.5" r="10.5"></circle>
              <path d="M27.5 18.5c1.9-4.8 6-6.8 10.2-5.1M39 10l3-3m-3 3 4 1m-4-1 2 4"></path>
            </svg>'''

new_bomb = '''            <svg viewBox="0 0 48 48" focusable="false">
              <circle cx="19.5" cy="29" r="12.5"></circle>
              <rect x="27" y="14" width="8" height="7" rx="1.5" transform="rotate(-45 31 17.5)"></rect>
              <path d="M34 14c3-4 6-4 9-7M43 7l3-3m-3 3 4 1m-4-1 1 4"></path>
            </svg>'''

if old_bomb not in text:
    raise SystemExit('Current bomb SVG block not found')
text = text.replace(old_bomb, new_bomb, 1)

old_button_color = '''    color:#1c0715;
    box-shadow:0 6px 0 rgba(81,16,74,.24);'''
new_button_color = '''    color:#fff;
    text-shadow:0 1px 1px rgba(0,0,0,.28);
    box-shadow:0 6px 0 rgba(81,16,74,.24);'''

if old_button_color not in text:
    raise SystemExit('Create Map button color block not found')
text = text.replace(old_button_color, new_button_color, 1)

path.write_text(text, encoding='utf-8')
print('Made bomb icon visibly classic and Create Map text white')
