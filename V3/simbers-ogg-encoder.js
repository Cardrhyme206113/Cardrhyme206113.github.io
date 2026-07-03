// Native WebCodecs Opus encoder adapter for Simplified Sabers.
// Keeps the old encodeOggVorbis() call shape so the duplicated mapmaker needs no edits.
import { muxOpusToOgg } from "./ogg-opus-muxer.js";

function resampleChannel(input, sourceRate, targetRate) {
  if (sourceRate === targetRate) return input;
  const length = Math.max(1, Math.round(input.length * targetRate / sourceRate));
  const out = new Float32Array(length);
  const scale = sourceRate / targetRate;
  for (let i = 0; i < length; i++) {
    const pos = i * scale;
    const i0 = Math.floor(pos);
    const i1 = Math.min(input.length - 1, i0 + 1);
    const t = pos - i0;
    out[i] = input[i0] * (1 - t) + input[i1] * t;
  }
  return out;
}

function interleavePlanar(channels, offset, frames) {
  const out = new Float32Array(frames * channels.length);
  for (let c = 0; c < channels.length; c++) {
    out.set(channels[c].subarray(offset, offset + frames), c * frames);
  }
  return out;
}

export async function encodeOggVorbis(audioChannels, sampleRate, options = {}) {
  if (!("AudioEncoder" in globalThis) || !("AudioData" in globalThis)) {
    throw new Error("This browser does not provide the WebCodecs Opus encoder. Use a current Chromium-based browser.");
  }

  const targetRate = 48000;
  const channels = audioChannels.slice(0, 2).map(channel => resampleChannel(channel, sampleRate, targetRate));
  if (!channels.length) throw new Error("No audio channels were provided.");

  const bitrate = options.bitrate || (channels.length === 1 ? 64000 : 96000);
  const config = {
    codec: "opus",
    sampleRate: targetRate,
    numberOfChannels: channels.length,
    bitrate,
    bitrateMode: "variable"
  };
  const support = await AudioEncoder.isConfigSupported(config);
  if (!support.supported) throw new Error("Native Opus encoding is not supported by this browser build.");

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

  const frameSize = 960; // 20 ms Opus packets at 48 kHz.
  const totalFrames = channels[0].length;
  let offset = 0;
  while (offset < totalFrames) {
    const frames = Math.min(frameSize, totalFrames - offset);
    const data = interleavePlanar(channels, offset, frames);
    const audioData = new AudioData({
      format: "f32-planar",
      sampleRate: targetRate,
      numberOfFrames: frames,
      numberOfChannels: channels.length,
      timestamp: Math.round(offset * 1_000_000 / targetRate),
      data
    });
    encoder.encode(audioData);
    audioData.close();
    offset += frames;
    if (options.onProgress && (offset % (frameSize * 24) === 0 || offset >= totalFrames)) {
      await options.onProgress(offset / totalFrames);
    }
    if (encoder.encodeQueueSize > 48) await new Promise(resolve => setTimeout(resolve, 0));
    if (encoderError) throw encoderError;
  }

  await encoder.flush();
  encoder.close();
  if (encoderError) throw encoderError;
  if (!packets.length) throw new Error("The native Opus encoder returned no packets.");

  return muxOpusToOgg(packets, {
    channels: channels.length,
    inputRate: targetRate,
    preSkip: 312
  });
}
