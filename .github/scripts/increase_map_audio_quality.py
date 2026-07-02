from pathlib import Path
import re

html_path = Path('simbers.html')
module_path = Path('simbers-ogg-encoder.js')
html = html_path.read_text(encoding='utf-8')
module = module_path.read_text(encoding='utf-8')

# Upgrade the encoder module from mono-only input to 1- or 2-channel input.
module_pattern = re.compile(
    r'export async function encodeOggVorbis\(.*?\n\}\n\nexport const oggEncoderVersion',
    re.S,
)
module_replacement = '''export async function encodeOggVorbis(
  samples,
  sampleRate,
  {
    vbrQuality = 3,
    blockSize = 16384,
    onProgress = null
  } = {}
) {
  const channels = Array.isArray(samples) ? samples : [samples];
  if (channels.length < 1 || channels.length > 2) {
    throw new Error(`OGG encoder supports 1 or 2 channels, got ${channels.length}.`);
  }

  const sampleCount = channels[0]?.length || 0;
  if (!sampleCount || channels.some(channel => channel.length !== sampleCount)) {
    throw new Error("OGG encoder channels must be non-empty and the same length.");
  }

  const encoder = await getEmbeddedOggEncoder();
  encoder.configure({
    sampleRate,
    channels: channels.length,
    vbrQuality
  });

  const chunks = [];
  let totalLength = 0;

  for (let offset = 0; offset < sampleCount; offset += blockSize) {
    const end = Math.min(sampleCount, offset + blockSize);
    const encoded = encoder.encode(
      channels.map(channel => channel.subarray(offset, end))
    );

    if (encoded.length) {
      const copy = new Uint8Array(encoded.length);
      copy.set(encoded);
      chunks.push(copy);
      totalLength += copy.length;
    }

    if ((offset / blockSize) % 10 === 0 && onProgress) {
      await onProgress(offset / Math.max(1, sampleCount));
    }
  }

  const finalBytes = encoder.finalize();
  if (finalBytes.length) {
    const copy = new Uint8Array(finalBytes.length);
    copy.set(finalBytes);
    chunks.push(copy);
    totalLength += copy.length;
  }

  if (onProgress) await onProgress(1);
  return concatenateBytes(chunks, totalLength);
}

export const oggEncoderVersion'''
module, count = module_pattern.subn(module_replacement, module, count=1)
if count != 1:
    raise SystemExit(f'Encoder module replacement count was {count}')

# Add a stereo-preserving output resampler while leaving the faster mono
# analysis path at 22.05 kHz.
insert_after = '''function downmixAndResample(buffer, targetRate, maxSeconds){
  const srcRate=buffer.sampleRate;
  const srcLen=Math.min(buffer.length, Math.floor(maxSeconds*srcRate));
  const channels=buffer.numberOfChannels;
  const outLen=Math.floor(srcLen*targetRate/srcRate);
  const out=new Float32Array(outLen);
  const channelData=[];
  for(let c=0;c<channels;c++) channelData.push(buffer.getChannelData(c));
  for(let i=0;i<outLen;i++){
    const pos=i*srcRate/targetRate, i0=Math.floor(pos), i1=Math.min(srcLen-1,i0+1), t=pos-i0;
    let s=0;
    for(let c=0;c<channels;c++) s += channelData[c][i0]*(1-t)+channelData[c][i1]*t;
    out[i]=s/channels;
  }
  return out;
}
'''
addition = insert_after + '''
function resampleChannelsForOutput(buffer,targetRate,maxSeconds){
  const srcRate=buffer.sampleRate;
  const srcLen=Math.min(buffer.length,Math.floor(maxSeconds*srcRate));
  const outputChannelCount=Math.min(2,Math.max(1,buffer.numberOfChannels));
  const outLen=Math.floor(srcLen*targetRate/srcRate);
  const sourceChannels=[];
  for(let c=0;c<outputChannelCount;c++){
    sourceChannels.push(buffer.getChannelData(c));
  }

  return sourceChannels.map(source=>{
    const out=new Float32Array(outLen);
    for(let i=0;i<outLen;i++){
      const pos=i*srcRate/targetRate;
      const i0=Math.floor(pos);
      const i1=Math.min(srcLen-1,i0+1);
      const t=pos-i0;
      out[i]=source[i0]*(1-t)+source[i1]*t;
    }
    return out;
  });
}
'''
if insert_after not in html:
    raise SystemExit('Downmix/resample function was not found')
html = html.replace(insert_after, addition, 1)

old_decode = '''    const targetRate = 22050;
    const maxSeconds = Math.min(300, decoded.duration);
    const mono = downmixAndResample(decoded, targetRate, maxSeconds);
    await ctx.close();

    setProgress(.05,"Computing harmonic salience…");
    const result = await analyzeSamples(mono, targetRate, {'''
new_decode = '''    const analysisRate = 22050;
    const outputRate = 32000;
    const maxSeconds = Math.min(300, decoded.duration);
    const mono = downmixAndResample(decoded, analysisRate, maxSeconds);
    const outputChannels = resampleChannelsForOutput(
      decoded,
      outputRate,
      maxSeconds
    );
    await ctx.close();

    setProgress(.05,"Computing harmonic salience…");
    const result = await analyzeSamples(mono, analysisRate, {'''
if old_decode not in html:
    raise SystemExit('Audio decode/rate block was not found')
html = html.replace(old_decode, new_decode, 1)

html = html.replace(
    'result.patterns = await analyzeBeatSynchronousPatterns(result,mono,targetRate,{',
    'result.patterns = await analyzeBeatSynchronousPatterns(result,mono,analysisRate,{',
    1,
)
html = html.replace(
    'const output=await buildMapZip(result,mono,targetRate);',
    'const output=await buildMapZip(result,outputChannels,outputRate);',
    1,
)

html = html.replace(
    'async function buildMapZip(result,monoSamples,sampleRate){',
    'async function buildMapZip(result,audioChannels,sampleRate){',
    1,
)

old_encode = '''  setProgress(
    .87,
    `Encoding OGG • Expert+ NPS ${expertPlusNps.toFixed(2)}…`
  );
  const oggBytes=await encodeOggVorbis(monoSamples,sampleRate,{
    onProgress:async ratio=>{
      setProgress(
        .875+ratio*.09,
        `Encoding bundled OGG Vorbis… ${Math.round(ratio*100)}%`
      );
      await nextTick();
    }
  });'''
new_encode = '''  setProgress(.87,"Encoding high-quality OGG…");
  const oggBytes=await encodeOggVorbis(audioChannels,sampleRate,{
    vbrQuality:3,
    onProgress:async ratio=>{
      setProgress(
        .875+ratio*.09,
        `Encoding high-quality OGG… ${Math.round(ratio*100)}%`
      );
      await nextTick();
    }
  });'''
if old_encode not in html:
    raise SystemExit('OGG encode call block was not found')
html = html.replace(old_encode, new_encode, 1)

for stale in (
    'const targetRate = 22050;',
    'buildMapZip(result,mono,targetRate)',
    'encodeOggVorbis(monoSamples',
):
    if stale in html:
        raise SystemExit(f'Stale audio-quality code remains: {stale}')

html_path.write_text(html,encoding='utf-8')
module_path.write_text(module,encoding='utf-8')
print('Upgraded generated map audio to 32 kHz stereo when available, Vorbis q3')
