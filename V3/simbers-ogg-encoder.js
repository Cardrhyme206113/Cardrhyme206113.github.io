// Native WebCodecs Opus encoder with local WASM Ogg/Vorbis fallback.
import { muxOpusToOgg } from "./ogg-opus-muxer.js";

const BITRATE_KEY = "simbers-audio-bitrate-kbps";
let selectedBitrateKbps = Number(localStorage.getItem(BITRATE_KEY)) || 32;

function status(message) {
  const element = document.getElementById("mapStatus") || document.querySelector(".mapStatus");
  if (element) element.textContent = message;
}

function installBitrateControl() {
  const run = () => {
    document.querySelector(".subtitle")?.remove();
    if (document.getElementById("simbersBitrateControl")) return;
    const anchor = document.querySelector(".featureToggles") || document.querySelector(".statusBar");
    if (!anchor?.parentNode) return;

    const style = document.createElement("style");
    style.textContent = `
      .simbersBitrateControl{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr) 66px;align-items:center;gap:12px;margin:0 0 18px;padding:10px 12px;border:2px solid var(--border,#333);border-radius:4px;background:#151515}
      .simbersBitrateLabel,.simbersBitrateValue{font:700 11px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.05em;text-transform:uppercase;color:var(--muted,#9a9a9a);white-space:nowrap}
      .simbersBitrateValue{height:28px;display:grid;place-items:center;border:1px solid #444;border-radius:3px;background:#0e0e0e;color:#fff}
      .simbersBitrateRange{width:100%;height:28px;margin:0;appearance:none;background:transparent;cursor:pointer}
      .simbersBitrateRange::-webkit-slider-runnable-track{height:6px;border:1px solid #444;border-radius:2px;background:#0e0e0e}
      .simbersBitrateRange::-webkit-slider-thumb{appearance:none;width:18px;height:22px;margin-top:-9px;border:2px solid #fff;border-radius:2px;background:var(--primary,#007bff);box-shadow:0 0 0 1px #000}
      .simbersBitrateRange::-moz-range-track{height:6px;border:1px solid #444;border-radius:2px;background:#0e0e0e}
      .simbersBitrateRange::-moz-range-thumb{width:16px;height:20px;border:2px solid #fff;border-radius:2px;background:var(--primary,#007bff);box-shadow:0 0 0 1px #000}
      @media(max-width:620px){.simbersBitrateControl{grid-template-columns:1fr 62px;gap:8px;margin-bottom:12px}.simbersBitrateLabel{grid-column:1/-1}.simbersBitrateRange{height:24px}}
    `;
    document.head.appendChild(style);

    const box = document.createElement("div");
    box.id = "simbersBitrateControl";
    box.className = "simbersBitrateControl";
    box.innerHTML = `<span class="simbersBitrateLabel">Audio bitrate</span><input class="simbersBitrateRange" type="range" min="16" max="128" step="16" value="${selectedBitrateKbps}" aria-label="Audio bitrate"><output class="simbersBitrateValue">${selectedBitrateKbps} kbps</output>`;
    anchor.parentNode.insertBefore(box, anchor);
    const range = box.querySelector("input");
    const output = box.querySelector("output");
    range.addEventListener("input", () => {
      selectedBitrateKbps = Number(range.value);
      localStorage.setItem(BITRATE_KEY, String(selectedBitrateKbps));
      output.textContent = `${selectedBitrateKbps} kbps`;
    });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run, { once:true });
  else run();
}
installBitrateControl();

function resampleChannel(input, sourceRate, targetRate) {
  if (sourceRate === targetRate) return input;
  const length = Math.max(1, Math.round(input.length * targetRate / sourceRate));
  const out = new Float32Array(length);
  const scale = sourceRate / targetRate;
  for (let i = 0; i < length; i++) {
    const position = i * scale;
    const first = Math.floor(position);
    const second = Math.min(input.length - 1, first + 1);
    const mix = position - first;
    out[i] = input[first] * (1 - mix) + input[second] * mix;
  }
  return out;
}

function interleavePlanar(channels, offset, frames) {
  const out = new Float32Array(frames * channels.length);
  for (let channel = 0; channel < channels.length; channel++) out.set(channels[channel].subarray(offset, offset + frames), channel * frames);
  return out;
}

async function encodeNative(audioChannels, sampleRate, options, bitrate) {
  if (!("AudioEncoder" in globalThis) || !("AudioData" in globalThis)) throw new Error("WebCodecs AudioEncoder is unavailable.");
  const targetRate = 48000;
  const channels = audioChannels.slice(0, 2).map(channel => resampleChannel(channel, sampleRate, targetRate));
  if (!channels.length) throw new Error("No audio channels were provided.");
  const config = { codec:"opus", sampleRate:targetRate, numberOfChannels:channels.length, bitrate, bitrateMode:"constant" };
  const support = await AudioEncoder.isConfigSupported(config);
  if (!support.supported) throw new Error("Native Opus configuration is unsupported.");

  const packets = [];
  let encoderError = null;
  const encoder = new AudioEncoder({
    output(chunk) {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      const frames = Math.max(1, Math.round((chunk.duration || 20000) * targetRate / 1_000_000));
      packets.push({ data, frames });
    },
    error(error) { encoderError = error; }
  });
  encoder.configure(config);
  const frameSize = 960;
  const totalFrames = channels[0].length;
  let offset = 0;
  while (offset < totalFrames) {
    const frames = Math.min(frameSize, totalFrames - offset);
    const audioData = new AudioData({ format:"f32-planar", sampleRate:targetRate, numberOfFrames:frames, numberOfChannels:channels.length, timestamp:Math.round(offset * 1_000_000 / targetRate), data:interleavePlanar(channels, offset, frames) });
    encoder.encode(audioData);
    audioData.close();
    offset += frames;
    if (options.onProgress && (offset % (frameSize * 24) === 0 || offset >= totalFrames)) await options.onProgress(offset / totalFrames);
    if (encoder.encodeQueueSize > 48) await new Promise(resolve => setTimeout(resolve, 0));
    if (encoderError) throw encoderError;
  }
  await encoder.flush();
  encoder.close();
  if (encoderError) throw encoderError;
  if (!packets.length) throw new Error("Native Opus returned no packets.");
  return muxOpusToOgg(packets, { channels:channels.length, inputRate:targetRate, preSkip:312 });
}

async function encodeWasmFallback(audioChannels, sampleRate, options) {
  status("Native encoder failed — loading local WASM backup…");
  const fallback = await import("./simbers-ogg-encoder-wasm.js");
  if (typeof fallback.encodeOggVorbis !== "function") throw new Error("Local WASM backup did not expose encodeOggVorbis().");
  const result = await fallback.encodeOggVorbis(audioChannels, sampleRate, {
    ...options,
    bitrate: selectedBitrateKbps * 1000,
    vbrQuality: Math.max(-1, Math.min(10, (selectedBitrateKbps - 16) / 11.2))
  });
  status(`Local WASM backup encoder used (${selectedBitrateKbps} kbps target).`);
  return result;
}

export async function encodeOggVorbis(audioChannels, sampleRate, options = {}) {
  const bitrateKbps = Math.max(16, Math.min(128, Math.round(selectedBitrateKbps / 16) * 16));
  const bitrate = bitrateKbps * 1000;
  try {
    status(`Encoding audio natively at ${bitrateKbps} kbps…`);
    return await encodeNative(audioChannels, sampleRate, options, bitrate);
  } catch (nativeError) {
    console.warn("Native Opus encoding failed; using local WASM fallback.", nativeError);
    try {
      return await encodeWasmFallback(audioChannels, sampleRate, options);
    } catch (fallbackError) {
      throw new Error(`Native encoding failed (${nativeError.message}); local WASM backup also failed (${fallbackError.message}).`);
    }
  }
}
