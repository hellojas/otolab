#!/usr/bin/env python3
"""chordrec — offline chord recognition for otolab.

Runs the mini-Chordify pipeline on a song and emits a JSON file that otolab's
per-video import (the "import" button in the lab) understands, plus a MIREX
.lab file for anything else:

    ingest (file or YouTube) -> [demucs: strip drums] -> madmom beats/downbeats
    -> madmom DeepChroma + CRF chords -> snap chords to the beat grid
    -> key estimate -> otolab JSON + .lab

The chord model is madmom's deep-chroma CNN + linear-chain CRF — a 25-class
maj/min recognizer. It will flatten sevenths and alterations to triads (a
Dm7b5 comes out D:min or F:maj); treat the output as a strong first draft to
correct by ear, which is exactly the workflow otolab is built around.

Setup (Python 3.9-3.11 recommended):
    pip install librosa soundfile git+https://github.com/CPJKU/madmom
    pip install yt-dlp          # only for YouTube ingest (also needs ffmpeg)
    pip install demucs          # only for --separate (pulls PyTorch)

Usage:
    python chordrec.py song.wav
    python chordrec.py song.mp3 --separate
    python chordrec.py https://youtu.be/VIDEOID -o mysong
    python chordrec.py song.wav --bpb 3 --video-id dQw4w9WgXcQ

Then in otolab: load the video, hit "import", pick <name>.otolab.json — the
chords land on the timeline, the beat grid and key come along, and the same
progression is packed into the reference box so "grade me" works against it.
"""

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

NOTE_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
NOTE_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
# key tonics that conventionally spell with flats (major / relative-minor pairs)
FLAT_MAJOR = {5, 10, 3, 8, 1, 6}   # F Bb Eb Ab Db Gb
FLAT_MINOR = {2, 7, 0, 5, 10, 3}   # d g c f bb eb

LAB_TO_PC = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5,
             'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10,
             'Bb': 10, 'B': 11}


def die(msg):
    print(f"chordrec: {msg}", file=sys.stderr)
    sys.exit(1)


def ingest(src, workdir):
    """Return a local audio file path for `src` (file path or YouTube URL/id)."""
    p = Path(src)
    if p.exists():
        return p
    if not (src.startswith('http') or len(src) == 11):
        die(f"input not found: {src}")
    if not shutil.which('ffmpeg'):
        die("YouTube ingest needs ffmpeg on PATH (yt-dlp uses it to extract audio)")
    out = Path(workdir) / 'ytaudio.%(ext)s'
    url = src if src.startswith('http') else f'https://www.youtube.com/watch?v={src}'
    cmd = ['yt-dlp', '-x', '--audio-format', 'wav', '-o', str(out), url]
    print('+', ' '.join(cmd))
    if subprocess.run(cmd).returncode != 0:
        die("yt-dlp failed (is it installed? pip install yt-dlp)")
    wav = Path(workdir) / 'ytaudio.wav'
    if not wav.exists():
        die("yt-dlp finished but no wav appeared")
    return wav


def separate(audio_path, workdir):
    """Strip drums with demucs (two-stems). Returns the no_drums wav, or the
    original path with a warning if demucs isn't available."""
    if not shutil.which('demucs') and subprocess.run(
            [sys.executable, '-c', 'import demucs'], capture_output=True).returncode != 0:
        print('chordrec: demucs not installed — skipping separation '
              '(pip install demucs)', file=sys.stderr)
        return audio_path
    cmd = [sys.executable, '-m', 'demucs', '--two-stems', 'drums',
           '-o', str(workdir), str(audio_path)]
    print('+', ' '.join(cmd))
    if subprocess.run(cmd).returncode != 0:
        print('chordrec: demucs failed — continuing on the full mix', file=sys.stderr)
        return audio_path
    hits = list(Path(workdir).glob('**/no_drums.wav'))
    return hits[0] if hits else audio_path


def to_wav(audio_path, workdir):
    """madmom is happiest with wav; convert via ffmpeg when needed."""
    if audio_path.suffix.lower() == '.wav':
        return audio_path
    if not shutil.which('ffmpeg'):
        die(f"{audio_path.suffix} input needs ffmpeg on PATH (or feed a .wav)")
    out = Path(workdir) / 'input.wav'
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(audio_path),
                    '-ac', '1', '-ar', '44100', str(out)], check=True)
    return out


def analyze(wav, bpb=None):
    """The core: madmom chords + beats + downbeats."""
    from madmom.audio.chroma import DeepChromaProcessor
    from madmom.features.chords import DeepChromaChordRecognitionProcessor
    from madmom.features.beats import RNNBeatProcessor, DBNBeatTrackingProcessor
    from madmom.features.downbeats import RNNDownBeatProcessor, DBNDownBeatTrackingProcessor

    wav = str(wav)
    print('chordrec: recognizing chords (deep chroma + CRF)…')
    segs = DeepChromaChordRecognitionProcessor()(DeepChromaProcessor()(wav))
    chords = [(float(s), float(e), lab) for s, e, lab in segs if lab != 'N']

    print('chordrec: tracking beats…')
    beats = [float(b) for b in DBNBeatTrackingProcessor(fps=100)(RNNBeatProcessor()(wav))]

    print('chordrec: tracking downbeats…')
    bars = [3, 4] if bpb is None else [bpb]
    db = DBNDownBeatTrackingProcessor(beats_per_bar=bars, fps=100)(RNNDownBeatProcessor()(wav))
    downbeats = [float(t) for t, pos in db if int(pos) == 1]
    meter = int(max((int(pos) for _, pos in db), default=4))
    return chords, beats, downbeats, meter


def snap_chords(chords, beats):
    """Snap each chord start to the nearest beat and merge repeats."""
    if not beats:
        return chords

    def nearest(t):
        return min(beats, key=lambda b: abs(b - t))

    out = []
    for s, e, lab in chords:
        t = nearest(s)
        if out and out[-1][2] == lab:
            continue
        if out and t <= out[-1][0]:
            t = s  # two changes inside one beat — keep the raw time
        out.append((t, e, lab))
    return out


def parse_label(lab):
    """'C:maj' / 'F#:min' -> (pc, otolab quality) or None."""
    if ':' not in lab:
        return None
    note, qual = lab.split(':', 1)
    pc = LAB_TO_PC.get(note)
    if pc is None:
        return None
    return pc, ('m' if qual.startswith('min') else '')


def estimate_key(chords):
    """Duration-weighted diatonic fit over all 24 keys; maj/min chords only."""
    dur = {}
    for s, e, lab in chords:
        p = parse_label(lab)
        if p:
            dur[p] = dur.get(p, 0) + (e - s)
    best, best_score = (0, 'major'), -1
    for tonic in range(12):
        for mode, majs, mins in (
                ('major', (0, 5, 7), (2, 4, 9)),
                ('minor', (3, 8, 10), (0, 5, 7))):
            score = 0
            for (pc, q), d in dur.items():
                deg = (pc - tonic) % 12
                if (q == '' and deg in majs) or (q == 'm' and deg in mins):
                    score += d
            tq = '' if mode == 'major' else 'm'
            score += 1.5 * dur.get((tonic, tq), 0)  # weight the tonic chord
            if score > best_score:
                best_score, best = score, (tonic, mode)
    return {'tonic': best[0], 'mode': best[1]}


def pc_name(pc, key):
    flats = (key['mode'] == 'major' and key['tonic'] in FLAT_MAJOR) or \
            (key['mode'] == 'minor' and key['tonic'] in FLAT_MINOR)
    return (NOTE_FLAT if flats else NOTE_SHARP)[pc]


def reference_text(chords, downbeats, key):
    """One bar per ' | ' segment, chords named for the key — feeds otolab's
    reference box so "grade me" works immediately."""
    if not downbeats:
        return ' '.join(dict.fromkeys(
            pc_name(parse_label(l)[0], key) + parse_label(l)[1]
            for _, _, l in chords if parse_label(l)))
    bars = []
    for i, t0 in enumerate(downbeats):
        t1 = downbeats[i + 1] if i + 1 < len(downbeats) else float('inf')
        labs = []
        for s, e, lab in chords:
            p = parse_label(lab)
            if not p:
                continue
            if s < t1 - 0.08 and e > t0 + 0.08:  # overlaps the bar (with edge slack)
                name = pc_name(p[0], key) + p[1]
                if not labs or labs[-1] != name:
                    labs.append(name)
        bars.append(' '.join(labs) if labs else '%')
    # trim leading/trailing empty bars
    while bars and bars[0] == '%':
        bars.pop(0)
    while bars and bars[-1] == '%':
        bars.pop()
    return ' | '.join(bars)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('input', help='audio file, YouTube URL, or 11-char video id')
    ap.add_argument('-o', '--out', help='output basename (default: input stem)')
    ap.add_argument('--separate', action='store_true',
                    help='strip drums with demucs first (better accuracy, needs demucs)')
    ap.add_argument('--bpb', type=int, help='force beats per bar (default: detect 3 or 4)')
    ap.add_argument('--video-id', help='YouTube video id to stamp into the otolab JSON '
                                       '(auto-filled when input is a YouTube URL/id)')
    args = ap.parse_args()

    video_id = args.video_id
    if not video_id:
        if len(args.input) == 11 and not Path(args.input).exists():
            video_id = args.input
        elif 'youtu' in args.input:
            import re
            m = re.search(r'(?:v=|youtu\.be/)([\w-]{11})', args.input)
            video_id = m.group(1) if m else None

    with tempfile.TemporaryDirectory() as workdir:
        audio = ingest(args.input, workdir)
        stem = Path(args.out) if args.out else Path(audio.stem)
        if args.separate:
            audio = separate(audio, workdir)
        wav = to_wav(Path(audio), workdir)
        chords, beats, downbeats, meter = analyze(wav, args.bpb)

    if not chords:
        die('no chords recognized — is there harmonic content in this audio?')

    snapped = snap_chords(chords, beats)
    key = estimate_key(chords)

    # --- .lab (MIREX exchange format) ---
    lab_path = stem.with_suffix('.lab')
    lab_path.write_text(''.join(f'{s:.3f}\t{e:.3f}\t{lab}\n' for s, e, lab in chords))

    # --- otolab per-video import JSON ---
    entries = []
    for t, _e, lab in snapped:
        p = parse_label(lab)
        if p:
            entries.append({'t': round(t, 3), 'root': p[0], 'quality': p[1], 'bass': None})
    bpm = None
    if len(beats) > 1:
        ivs = sorted(beats[i + 1] - beats[i] for i in range(len(beats) - 1))
        bpm = round(60 / ivs[len(ivs) // 2], 1)
    data = {
        'videoId': video_id,
        'title': stem.name,
        'key': key,
        'chords': entries,
        'solo': [],
        'grid': {'bpm': bpm, 't0': downbeats[0] if downbeats else None,
                 'bpb': meter, 'snap': False},
        'lyrics': None,
        'reference': reference_text(chords, downbeats, key),
    }
    json_path = stem.with_suffix('.otolab.json')
    json_path.write_text(json.dumps(data, indent=2))

    kn = pc_name(key['tonic'], key) + (' minor' if key['mode'] == 'minor' else ' major')
    print(f"\nchordrec: {len(entries)} chords · key {kn} · "
          f"{bpm or '?'} bpm · {meter}/4 · {len(downbeats)} bars")
    print(f"  {lab_path}   (MIREX lab)")
    print(f"  {json_path}   (otolab import — lab room ⇒ import)")


if __name__ == '__main__':
    main()
