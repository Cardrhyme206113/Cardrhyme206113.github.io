from pathlib import Path
import re
p=Path('simbers-flow-library.js')
s=p.read_text(encoding='utf-8')
s=re.sub(r'\nif\(location\.pathname\.endsWith\([\s\S]*$', '\n', s, count=1)
p.write_text(s,encoding='utf-8')
