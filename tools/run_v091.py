from pathlib import Path
import base64

payload=base64.b64decode(Path('tools/patch_v091_logic.b64').read_text())
Path('/tmp/patch_v091_logic.py').write_bytes(payload)
exec(compile(payload,'patch_v091_logic.py','exec'))
