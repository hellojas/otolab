# otolab

Ear-training over real songs. Loop a section of a YouTube video, play what you
hear on a MIDI keyboard (or your computer keys), and the app names the chord
and tells you its **function in the key** — including when it's *not* diatonic.

This recreates the "sit at the piano with Spotify, replay the bar, hunt for the
bass note" workflow, minus the piano.

## The core design idea

Most chord-trainer UIs make you pick from the seven diatonic chords, which
breaks the moment a tune borrows a chord or hits a secondary dominant. otolab
flips it: **chord entry is the answer mechanism, function is a computed
label.** You play any chord — any root, any quality, shell voicings welcome —
and the analyzer classifies it relative to the key you've set:

- diatonic → `ii7`, `V7`, `Imaj7` …
- secondary dominants → `V7/ii`, `V7/V` …
- tritone subs → `subV7`
- modal interchange → `iv`, `bVImaj7`, `bVII7` (backdoor)
- passing diminished → `vii°7/x`
- anything else → labeled chromatic/outside, never rejected

The diatonic palette still exists as a one-click row of chips (with a second
"common outside" row), but it's a shortcut, not a constraint.

## Workflow

1. Paste a YouTube link and hit **load**.
2. Set the key (or log a few chords and hit **guess from chords**).
3. Loop the tricky bar: `[` sets point A, `]` sets B, `\` toggles the loop.
   Slow it down with the speed menu. `←`/`→` skip ±5s.
4. Play what you hear — MIDI keyboard (**connect midi**), computer keys
   (`A`–`'` are the notes, `Z`/`X` shift octave), or click the on-screen piano.
   The big readout shows the chord name; the line under it shows the roman
   numeral and function. Two notes shows the interval; one note, the pitch —
   handy for bass-line hunting.
5. Press **Enter** to log the chord at the current video time. The progression
   builds up as a timeline; click a chip to jump there.
6. Everything saves to localStorage per video. Export/import as JSON.

## Practice mode

Once a song is transcribed, toggle **practice**. Chord labels hide behind `?`.
Click a chip: that segment loops. Play your guess on the keyboard — nail the
root *and* quality and it flips green and reveals; a wrong full chord counts as
an attempt. **reveal** gives up on the current one. Score is per session.

## Running it

It's a static page — no build step.

- Local: `python3 -m http.server` in the repo root, then <http://localhost:8000>.
- GitHub Pages: Settings → Pages → deploy from `main` / root. (Web MIDI needs
  HTTPS or localhost, so Pages works great.)

Chrome or Edge for Web MIDI; everything else works in any modern browser.

## Why YouTube and not Spotify?

Spotify's Web Playback SDK requires Premium auth and still doesn't expose the
audio stream, and its 30-second preview API is deprecated. YouTube's IFrame
API gives seeking, looping, and 0.25× playback for free, which is what this
workflow actually needs. (Neither service lets the browser analyze the audio
itself, so automatic chord detection over streams isn't feasible — that's why
transcribe-then-quiz is the model.)

## Roadmap ideas

- Beat-grid / bar-aligned capture instead of raw timestamps
- Shareable song annotations (JSON is already exportable)
- A "degrees" drill mode: app plays a diatonic chord, you name the degree —
  functional pitch training with the same engine
- Voice-leading hints between logged chords
