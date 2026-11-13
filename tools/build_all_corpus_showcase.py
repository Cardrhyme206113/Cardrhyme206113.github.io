#!/usr/bin/env python3
"""Generate a Beat Saber v2 showcase using all SimbersV5 embedded corpus flows."""
import base64
import json
import math
import re
import struct
import subprocess
import tempfile
import wave
import zipfile
import zlib
from array import array
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "simbers5.html"
OUTPUT = ROOT / "corpus-showcase"
BPM = 300.0
BEAT_STEP = 0.0625  # Sixteenth notes at 300 BPM: 12.5 ms per note.
FLOW_GAP = 0.0625
INTRO_SECONDS = 1.5
SAMPLE_RATE = 16000

def parse_corpus():
    html = SOURCE.read_text(encoding="utf-8")
    match = re.search(r'const SCF_CORPUS_BASE64="([^"]+)"', html)
    expected = re.search(r"SCF_EXPECTED_CORPUS_COUNT=(\d+)", html)
    if not match or not expected:
        raise RuntimeError("Simbers embedded flow corpus not found")
    raw = base64.b64decode(match.group(1), validate=True)
    patterns = []
    position = 0
    while position < len(raw):
        off = position
        length, popularity, maps = raw[position:position + 3]
        position += 3
        if not 3 <= length <= 10 or position + length > len(raw):
            raise ValueError(f"Invalid corpus pattern at {off}")
        notes = []
        for encoded in raw[position:position + length]:
            x = encoded % 4
            y = encoded // 4 % 3
            direction = encoded // 12
            if not (0 <= x <= 3 and 0 <= y <= 2 and 0 <= direction <= 8):
                raise ValueError(f"Invalid corpus note at {position}")
            notes.append((x, y, direction))
        patterns.append(dict(id=len(patterns), popularity=popularity, maps=maps, notes=notes))
        position += length
    if len(patterns) != int(expected.group(1)):
        raise AssertionError(f"Expected {expected.group(1)} corpus flows, found {len(patterns)}")
    return patterns

def make_cover(path):
    width = height = 128
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        for x in range(width):
            left = abs(x - (height - y) * .58) < 9
            right = abs(x - y * .58 - 51) < 9
            red, green, blue = (245, 64, 91) if left else ((64, 152, 250) if right else (20, 22, 27))
            raw.extend((red, green, blue, 255))
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff)
    png = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))
    path.write_bytes(png)

def synth_clicks(note_times, accents, duration, path):
    samples = array("h", [0]) * (int((duration + .35) * SAMPLE_RATE) + 1)
    # Distinct short click per note. Slight alternating pitch distinguishes hands.
    for i, timestamp in enumerate(note_times):
        pos = int(timestamp * SAMPLE_RATE)
        freq = 900 if i % 2 else 1200
        count = int(.006 * SAMPLE_RATE)
        for j in range(count):
            envelope = (1 - j / count) ** 2
            v = int(9500 * envelope * math.sin(2 * math.pi * freq * j / SAMPLE_RATE))
            if pos + j < len(samples):
                samples[pos + j] = max(-32768, min(32767, samples[pos + j] + v))
    # A slightly deeper accent marks each new corpus sequence.
    for timestamp in accents:
        pos = int(timestamp * SAMPLE_RATE)
        count = int(.012 * SAMPLE_RATE)
        for j in range(count):
            envelope = (1 - j / count) ** 2
            v = int(6500 * envelope * math.sin(2 * math.pi * 440 * j / SAMPLE_RATE))
            if pos + j < len(samples):
                samples[pos + j] = max(-32768, min(32767, samples[pos + j] + v))
    with wave.open(str(path), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(SAMPLE_RATE)
        out.writeframes(samples.tobytes())

def main():
    patterns = parse_corpus()
    OUTPUT.mkdir(exist_ok=True)
    notes = []
    note_times = []
    accents = []
    beats = INTRO_SECONDS * BPM / 60
    for pattern in patterns:
        accents.append(beats * 60 / BPM)
        for j, (x, y, d) in enumerate(pattern["notes"]):
            seconds = beats * 60 / BPM
            note_times.append(seconds)
            notes.append({
                "_time": round(beats, 5),
                "_lineIndex": x,
                "_lineLayer": y,
                "_type": pattern["id"] % 2,
                "_cutDirection": d,
                "_customData": {"_corpusIndex": pattern["id"], "_corpusStep": j}
            })
            beats += BEAT_STEP
        beats += FLOW_GAP
    duration = beats * 60 / BPM + .4
    beatmap = {
        "_version": "2.0.0",
        "_notes": notes,
        "_obstacles": [],
        "_events": [],
        "_customData": {"_source": "SimbersV5 embedded curated corpus",
                        "_corpusCount": len(patterns), "_noteCount": len(notes)}
    }
    info = {
        "_version": "2.0.0",
        "_songName": "SimbersV5 — Every Corpus Flow (Fast Showcase)",
        "_songSubName": f"{len(patterns)} curated patterns / {len(notes)} notes",
        "_songAuthorName": "Synthetic click track",
        "_levelAuthorName": "SimbersV5 corpus showcase",
        "_beatsPerMinute": BPM,
        "_songTimeOffset": 0,
        "_shuffle": 0,
        "_shufflePeriod": 0.5,
        "_previewStartTime": 2.0,
        "_previewDuration": 12.0,
        "_songFilename": "song.ogg",
        "_coverImageFilename": "cover.png",
        "_environmentName": "DefaultEnvironment",
        "_allDirectionsEnvironmentName": "GlassDesertEnvironment",
        "_difficultyBeatmapSets": [
            {"_beatmapCharacteristicName": "Standard",
             "_difficultyBeatmaps": [{
                 "_difficulty": "ExpertPlus", "_difficultyRank": 9,
                 "_beatmapFilename": "ExpertPlus.dat",
                 "_noteJumpMovementSpeed": 19,
                 "_noteJumpStartBeatOffset": 0,
                 "_customData": {}
             }]}
        ],
        "_customData": {}
    }
    with tempfile.TemporaryDirectory() as temp:
        temp = Path(temp)
        cover = temp / "cover.png"
        wav = temp / "song.wav"
        ogg = temp / "song.ogg"
        make_cover(cover)
        synth_clicks(note_times, accents, duration, wav)
        subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error",
                        "-y", "-i", str(wav), "-c:a", "libvorbis", "-q:a", "2", str(ogg)], check=True)
        archive = OUTPUT / "SimbersV5_All_3252_Corpus_Flows_Fast.zip"
        with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
            z.writestr("Info.dat", json.dumps(info, ensure_ascii=False, separators=(",", ":")))
            z.writestr("ExpertPlus.dat", json.dumps(beatmap, ensure_ascii=False, separators=(",", ":")))
            z.write(ogg, "song.ogg")
            z.write(cover, "cover.png")
    manifest = {
        "patterns": len(patterns),
        "notes": len(notes),
        "bpm": BPM,
        "seconds": round(duration, 2),
        "flowLengths": {str(n): sum(len(p["notes"]) == n for p in patterns) for n in range(3, 11)},
        "archive": archive.name,
        "description": "Every curated SimbersV5 corpus flow once, original lane/direction geometry; alternating red/blue flow colors. Rapid synthetic click per note."
    }
    (OUTPUT / "report.json").write_text(json.dumps(manifest, indent=2) + "\n")
    with zipfile.ZipFile(archive) as z:
        assert set(z.namelist()) == {"Info.dat", "ExpertPlus.dat", "song.ogg", "cover.png"}
        stored = json.loads(z.read("ExpertPlus.dat"))
        assert len(stored["_notes"]) == len(notes)
        assert {n["_customData"]["_corpusIndex"] for n in stored["_notes"]} == set(range(len(patterns)))
    print(json.dumps(manifest, indent=2))

if __name__ == "__main__":
    main()
