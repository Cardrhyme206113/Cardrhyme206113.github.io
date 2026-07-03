// Minimal Ogg Opus muxer. No third-party dependencies.
const textEncoder = new TextEncoder();

function installVersionMarker() {
  const run = () => {
    if (document.getElementById("simbersVersionInfo")) return;
    const marker = document.createElement("div");
    marker.id = "simbersVersionInfo";
    marker.textContent = "v0.9.5 · V3";
    marker.title = "Simplified Sabers v0.9.5 — V3 native encoder build";
    Object.assign(marker.style, {
      position: "fixed",
      top: "10px",
      right: "12px",
      zIndex: "99999",
      padding: "5px 8px",
      border: "1px solid rgba(255,255,255,.16)",
      borderRadius: "4px",
      background: "rgba(14,14,14,.82)",
      color: "#9a9a9a",
      font: "700 10px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
      letterSpacing: ".06em",
      textTransform: "uppercase",
      pointerEvents: "none",
      backdropFilter: "blur(8px)",
      WebkitBackdropFilter: "blur(8px)"
    });
    document.body.appendChild(marker);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run, { once:true });
  else run();
}
installVersionMarker();

function concat(parts) {
  const size = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}

function writeU32LE(view, offset, value) { view.setUint32(offset, value >>> 0, true); }
function writeU64LE(view, offset, value) {
  const v = BigInt(value);
  view.setUint32(offset, Number(v & 0xffffffffn), true);
  view.setUint32(offset + 4, Number((v >> 32n) & 0xffffffffn), true);
}

let crcTable;
function getCrcTable() {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let j = 0; j < 8; j++) r = (r & 0x80000000) ? ((r << 1) ^ 0x04c11db7) : (r << 1);
    crcTable[i] = r >>> 0;
  }
  return crcTable;
}

function oggCrc(bytes) {
  const table = getCrcTable();
  let crc = 0;
  for (let i = 0; i < bytes.length; i++) crc = ((crc << 8) ^ table[((crc >>> 24) ^ bytes[i]) & 255]) >>> 0;
  return crc >>> 0;
}

function makePage(packet, { serial, sequence, granule, headerType }) {
  const segments = [];
  let remaining = packet.length;
  while (remaining >= 255) { segments.push(255); remaining -= 255; }
  segments.push(remaining);
  const header = new Uint8Array(27 + segments.length);
  const view = new DataView(header.buffer);
  header.set(textEncoder.encode("OggS"), 0);
  header[4] = 0;
  header[5] = headerType;
  writeU64LE(view, 6, granule);
  writeU32LE(view, 14, serial);
  writeU32LE(view, 18, sequence);
  writeU32LE(view, 22, 0);
  header[26] = segments.length;
  header.set(segments, 27);
  const page = concat([header, packet]);
  writeU32LE(new DataView(page.buffer), 22, oggCrc(page));
  return page;
}

function opusHead(channels, preSkip, inputRate) {
  const out = new Uint8Array(19);
  const view = new DataView(out.buffer);
  out.set(textEncoder.encode("OpusHead"), 0);
  out[8] = 1;
  out[9] = channels;
  view.setUint16(10, preSkip, true);
  view.setUint32(12, inputRate, true);
  view.setInt16(16, 0, true);
  out[18] = 0;
  return out;
}

function opusTags(vendor = "Simplified Sabers WebCodecs") {
  const vendorBytes = textEncoder.encode(vendor);
  const out = new Uint8Array(8 + 4 + vendorBytes.length + 4);
  const view = new DataView(out.buffer);
  out.set(textEncoder.encode("OpusTags"), 0);
  view.setUint32(8, vendorBytes.length, true);
  out.set(vendorBytes, 12);
  view.setUint32(12 + vendorBytes.length, 0, true);
  return out;
}

export function muxOpusToOgg(packets, options = {}) {
  const channels = options.channels || 2;
  const inputRate = options.inputRate || 48000;
  const preSkip = options.preSkip ?? 312;
  const serial = options.serial ?? ((Math.random() * 0xffffffff) >>> 0);
  const pages = [];
  let sequence = 0;
  pages.push(makePage(opusHead(channels, preSkip, inputRate), { serial, sequence: sequence++, granule: 0, headerType: 2 }));
  pages.push(makePage(opusTags(), { serial, sequence: sequence++, granule: 0, headerType: 0 }));
  let granule = BigInt(preSkip);
  for (let i = 0; i < packets.length; i++) {
    const entry = packets[i];
    granule += BigInt(entry.frames);
    pages.push(makePage(entry.data, {
      serial,
      sequence: sequence++,
      granule,
      headerType: i === packets.length - 1 ? 4 : 0
    }));
  }
  return concat(pages);
}
