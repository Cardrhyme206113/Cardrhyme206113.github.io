from pathlib import Path
import runpy
import traceback

status = Path("tools/v090-debug.txt")
try:
    runpy.run_path("tools/patch_simbers_v090.py", run_name="__main__")
except Exception:
    status.write_text("FAILED\n" + traceback.format_exc(), encoding="utf-8")
else:
    status.write_text("SUCCESS\n", encoding="utf-8")
