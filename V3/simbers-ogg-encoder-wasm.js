// Lazy fallback loader for the original bundled WASM Ogg/Vorbis encoder.
// This file is only imported after native WebCodecs Opus encoding fails.

export { encodeOggVorbis } from "https://cdn.jsdelivr.net/gh/Cardrhyme206113/Cardrhyme206113.github.io@7105f496f3bf8e689fd6ece8235b8200adbdb944/simbers-ogg-encoder.js";
