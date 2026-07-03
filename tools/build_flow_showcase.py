#!/usr/bin/env python3
import base64, gzip, json, math, re, struct, subprocess, wave, zipfile, zlib
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
PAYLOAD="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"
MAP=json.loads(gzip.decompress(base64.b64decode(PAYLOAD)).decode())
BPM=float(MAP["b"])
DURATION=float(MAP["t"])
NOTES=MAP["n"]
SECTIONS=MAP["s"]
OUT=ROOT/"flow-showcase"
MAPDIR=OUT/"map"
MAPDIR.mkdir(parents=True,exist_ok=True)

difficulty_notes=[]
for beat,x,y,color,direction,connector in NOTES:
    note={"_time":float(beat),"_lineIndex":int(x),"_lineLayer":int(y),"_type":int(color),"_cutDirection":int(direction)}
    if connector:
        note["_customData"]={"_connector":True}
    difficulty_notes.append(note)

events=[]
for beat in range(int(max(n[0] for n in NOTES))+9):
    value=5 if beat%2==0 else 1
    events.append({"_time":float(beat),"_type":0,"_value":value})
    events.append({"_time":float(beat),"_type":1,"_value":value})
section_starts={int(row[5]) for row in SECTIONS}
for beat in sorted(section_starts):
    events.append({"_time":float(beat),"_type":4,"_value":5})

bookmarks=[]
for index,flow_index,flow_name,alternative,alternative_name,start,end,count in SECTIONS:
    color=[0.9,0.15,0.25,1.0] if int(alternative) in (1,3) else [0.1,0.55,1.0,1.0]
    bookmarks.append({"_time":float(start),"_name":f"{int(flow_index):02d} · {alternative_name} · {flow_name}","_color":color})

difficulty={
    "_version":"2.2.0",
    "_notes":difficulty_notes,
    "_obstacles":[],
    "_events":sorted(events,key=lambda e:(e["_time"],e["_type"])),
    "_waypoints":[],
    "_customData":{
        "_bookmarks":bookmarks,
        "_flowShowcaseVersion":"1.0.0",
        "_sourceLibraryVersion":"1.5.0",
        "_allLibraryAlternativesIncluded":True
    }
}
info={
    "_version":"2.1.0",
    "_songName":"All Flow Showcase — 50 BPM",
    "_songSubName":"80 alternatives + safe connectors",
    "_songAuthorName":"Tick Generator",
    "_levelAuthorName":"Simplified Sabers",
    "_beatsPerMinute":BPM,
    "_shuffle":0,
    "_shufflePeriod":0.5,
    "_previewStartTime":0,
    "_previewDuration":10,
    "_songFilename":"song.ogg",
    "_coverImageFilename":"cover.png",
    "_environmentName":"DefaultEnvironment",
    "_allDirectionsEnvironmentName":"GlassDesertEnvironment",
    "_songTimeOffset":0,
    "_difficultyBeatmapSets":[{
        "_beatmapCharacteristicName":"Standard",
        "_difficultyBeatmaps":[{
            "_difficulty":"ExpertPlus",
            "_difficultyRank":9,
            "_beatmapFilename":"ExpertPlus.dat",
            "_noteJumpMovementSpeed":8,
            "_noteJumpStartBeatOffset":0,
            "_customData":{"_difficultyLabel":"All 80 Flow Alternatives"}
        }]
    }],
    "_customData":{
        "_flowShowcaseVersion":"1.0.0",
        "_sourceLibraryVersion":"1.5.0"
    }
}
(MAPDIR/"ExpertPlus.dat").write_text(json.dumps(difficulty,separators=(",",":")),encoding="utf-8")
(MAPDIR/"Info.dat").write_text(json.dumps(info,indent=2),encoding="utf-8")

# 8 kHz mono click track: one simple tick every 50 BPM beat.
sample_rate=8000
seconds_per_beat=60.0/BPM
total_samples=int(math.ceil(DURATION*sample_rate))
wav_path=OUT/"song.wav"
with wave.open(str(wav_path),"wb") as wav:
    wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(sample_rate)
    cursor=0
    for beat in range(int(math.ceil(DURATION/seconds_per_beat))+1):
        start=int(round(beat*seconds_per_beat*sample_rate))
        if start>total_samples:break
        silence=max(0,start-cursor)
        if silence:
            wav.writeframes(b"\0\0"*silence)
            cursor+=silence
        accent=beat in section_starts
        frequency=1800 if accent else 1250 if beat%4==0 else 950
        duration=.065 if accent else .040
        count=min(int(duration*sample_rate),total_samples-cursor)
        frames=bytearray()
        for i in range(count):
            t=i/sample_rate
            envelope=math.exp(-55*t)
            value=int(max(-32767,min(32767,32767*(.58 if accent else .38)*math.sin(2*math.pi*frequency*t)*envelope)))
            frames.extend(struct.pack("<h",value))
        wav.writeframes(frames);cursor+=count
    if cursor<total_samples:
        wav.writeframes(b"\0\0"*(total_samples-cursor))

subprocess.run([
    "ffmpeg","-y","-hide_banner","-loglevel","error",
    "-i",str(wav_path),"-ar","8000","-ac","1","-c:a","libvorbis","-b:a","8k",
    str(MAPDIR/"song.ogg")
],check=True)
wav_path.unlink()

# Small generated PNG cover, no external imaging package.
width=height=512
rows=[]
for y in range(height):
    row=bytearray([0])
    for x in range(width):
        r,g,b=7,10,17
        if abs((x+y)-512)<18:r,g,b=225,45,76
        if abs((x-y))<18:r,g,b=30,142,240
        if 388<y<484 and 30<x<482:r,g,b=12,17,27
        row.extend((r,g,b))
    rows.append(bytes(row))
raw=b"".join(rows)
def chunk(kind,payload):
    return struct.pack(">I",len(payload))+kind+payload+struct.pack(">I",zlib.crc32(kind+payload)&0xffffffff)
png=b"\x89PNG\r\n\x1a\n"+chunk(b"IHDR",struct.pack(">IIBBBBB",width,height,8,2,0,0,0))+chunk(b"IDAT",zlib.compress(raw,9))+chunk(b"IEND",b"")
(MAPDIR/"cover.png").write_bytes(png)

zip_path=OUT/"Flow_Showcase_50BPM.zip"
with zipfile.ZipFile(zip_path,"w",zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
    for name in ("Info.dat","ExpertPlus.dat","song.ogg","cover.png"):
        archive.write(MAPDIR/name,arcname=name)

# Browser map data.
(ROOT/"flow-showcase-map.js").write_text(
    "window.FLOW_SHOWCASE_MAP="+json.dumps(MAP,separators=(",",":"))+";\n",
    encoding="utf-8"
)

# Make the page use the real generated ZIP instead of temporary embedded chunks.
page_path=ROOT/"flow-showcase.html"
page=page_path.read_text(encoding="utf-8")
page=re.sub(r'\n<script src="\./flow-showcase-zip-[1-9]\.js"></script>','',page)
page=page.replace(
    '  const zipBase64=(window.FLOW_SHOWCASE_ZIP_CHUNKS||[]).join("");\n'
    '  const bytes=Uint8Array.from(atob(zipBase64),character=>character.charCodeAt(0));\n'
    '  document.getElementById("downloadMap").href=URL.createObjectURL(new Blob([bytes],{type:"application/zip"}));',
    '  document.getElementById("downloadMap").href="./flow-showcase/Flow_Showcase_50BPM.zip";'
)
page_path.write_text(page,encoding="utf-8")

report={
    "version":"1.0.0","bpm":BPM,"durationSeconds":DURATION,
    "sections":len(SECTIONS),"notes":len(NOTES),
    "connectorNotes":sum(1 for note in NOTES if note[5]),
    "zipBytes":zip_path.stat().st_size
}
(OUT/"build-report.json").write_text(json.dumps(report,indent=2),encoding="utf-8")
print(json.dumps(report))
