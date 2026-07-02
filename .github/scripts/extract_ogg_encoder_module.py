from pathlib import Path
import re

html_path = Path("simbers.html")
module_path = Path("simbers-ogg-encoder.js")
text = html_path.read_text(encoding="utf-8")

# Extract the bundled wasm-media-encoders UMD wrapper.
license_start = text.index("<!--\nBundled dependency: wasm-media-encoders 0.7.0")
first_script_start = text.index("<script>", license_start)
first_script_end = text.index("</script>", first_script_start)
license_html = text[license_start:first_script_start].strip()
encoder_wrapper = text[first_script_start + len("<script>"):first_script_end].strip()

if "WasmMediaEncoder" not in encoder_wrapper:
    raise SystemExit("Bundled encoder wrapper was not found")

# Extract the embedded OGG WASM payload and all inline encoder helpers.
ogg_start = text.index('const EMBEDDED_OGG_WASM_B64=')
ogg_end = text.index("\nlet crcTable=null;", ogg_start)
ogg_block = text[ogg_start:ogg_end]
match = re.search(r'const EMBEDDED_OGG_WASM_B64="([A-Za-z0-9+/=]+)";', ogg_block)
if not match:
    raise SystemExit("Embedded OGG WASM payload was not found")
wasm_b64 = match.group(1)

license_js = license_html.replace("<!--", "/*", 1).rsplit("-->", 1)[0] + "*/"

module_text = f'''{license_js}

{encoder_wrapper}

const WasmMediaEncoderApi = globalThis.WasmMediaEncoder;
if (!WasmMediaEncoderApi) {{
  throw new Error("wasm-media-encoders failed to initialize.");
}}

const EMBEDDED_OGG_WASM_B64 = "{wasm_b64}";
let embeddedOggWasmBytes = null;
let compiledOggModule = null;

function base64ToBytes(base64) {{
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}}

function concatenateBytes(chunks, totalLength) {{
  const out = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {{
    out.set(chunk, offset);
    offset += chunk.length;
  }}
  return out;
}}

async function getEmbeddedOggEncoder() {{
  if (!embeddedOggWasmBytes) {{
    embeddedOggWasmBytes = base64ToBytes(EMBEDDED_OGG_WASM_B64);
  }}
  if (compiledOggModule) {{
    return WasmMediaEncoderApi.createEncoder("audio/ogg", compiledOggModule);
  }}
  return WasmMediaEncoderApi.createEncoder(
    "audio/ogg",
    embeddedOggWasmBytes,
    module => {{ compiledOggModule = module; }}
  );
}}

export async function encodeOggVorbis(
  samples,
  sampleRate,
  {{
    vbrQuality = 2,
    blockSize = 16384,
    onProgress = null
  }} = {{}}
) {{
  const encoder = await getEmbeddedOggEncoder();
  encoder.configure({{ sampleRate, channels: 1, vbrQuality }});

  const chunks = [];
  let totalLength = 0;

  for (let offset = 0; offset < samples.length; offset += blockSize) {{
    const encoded = encoder.encode([
      samples.subarray(offset, Math.min(samples.length, offset + blockSize))
    ]);

    if (encoded.length) {{
      const copy = new Uint8Array(encoded.length);
      copy.set(encoded);
      chunks.push(copy);
      totalLength += copy.length;
    }}

    if ((offset / blockSize) % 10 === 0 && onProgress) {{
      await onProgress(offset / Math.max(1, samples.length));
    }}
  }}

  const finalBytes = encoder.finalize();
  if (finalBytes.length) {{
    const copy = new Uint8Array(finalBytes.length);
    copy.set(finalBytes);
    chunks.push(copy);
    totalLength += copy.length;
  }}

  if (onProgress) await onProgress(1);
  return concatenateBytes(chunks, totalLength);
}}

export const oggEncoderVersion = WasmMediaEncoderApi.jsLibraryVersion();
'''

# Remove the original inline dependency block.
after_first_script = first_script_end + len("</script>")
text = text[:license_start] + text[after_first_script:]

# Remove the original embedded payload/helpers from the app script.
ogg_start = text.index('const EMBEDDED_OGG_WASM_B64=')
ogg_end = text.index("\nlet crcTable=null;", ogg_start)
text = text[:ogg_start] + text[ogg_end + 1:]

# Turn the main application script into an ES module and import the encoder.
main_script_marker = '<script>\n"use strict";'
main_script_replacement = '<script type="module">\nimport { encodeOggVorbis } from "./simbers-ogg-encoder.js";\n\n"use strict";'
if main_script_marker not in text:
    raise SystemExit("Main application script marker was not found")
text = text.replace(main_script_marker, main_script_replacement, 1)

# Preserve the current progress UI while delegating encoding to the module.
old_call = 'const oggBytes=await encodeOggVorbis(monoSamples,sampleRate);'
new_call = '''const oggBytes=await encodeOggVorbis(monoSamples,sampleRate,{
    onProgress:async ratio=>{
      setProgress(
        .875+ratio*.09,
        `Encoding bundled OGG Vorbis… ${Math.round(ratio*100)}%`
      );
      await nextTick();
    }
  });'''
if old_call not in text:
    raise SystemExit("OGG encoder call site was not found")
text = text.replace(old_call, new_call, 1)

# Defensive checks so future HTML edits do not silently duplicate the payload.
for stale in (
    "EMBEDDED_OGG_WASM_B64",
    "getEmbeddedOggEncoder",
    "WasmMediaEncoder=t()"
):
    if stale in text:
        raise SystemExit(f"Inline encoder content still remains in HTML: {stale}")

module_path.write_text(module_text, encoding="utf-8")
html_path.write_text(text, encoding="utf-8")

original_bytes = len((text[:0] + license_html + encoder_wrapper + ogg_block).encode("utf-8"))
print(f"Created {module_path} ({module_path.stat().st_size} bytes)")
print(f"Reduced simbers.html to {html_path.stat().st_size} bytes")
