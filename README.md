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
6. Check your work: **play along** makes the synth sound each logged chord as
   the playhead crosses it, layered over the actual record — a wrong chord
   clashes immediately. **▶ play progression** auditions the logged chords in
   order without the video.
7. Hit **grab lyrics** (artist/track prefill from the video title) to pull
   synced lyrics from [LRCLIB](https://lrclib.net); logged chords render above
   the lyric lines, chord-sheet style, and the current line highlights during
   playback. If the video has a long intro, nudge the **offset** to line the
   lyrics up. Clicking a lyric line seeks the video there. **Drag a chord
   label** along its line to pin it to a word (rewrites the timestamp); click
   one to hear it.
8. Loop by chord: `.` loops the chord under the playhead, `,` widens the loop
   to ± one chord — no A/B fiddling. The **synth vol** slider keeps play-along
   under the record.
9. Everything saves to localStorage per video. Export/import as JSON.

## Checking yourself against "real" chords

There's no free, legal chord API (Ultimate Guitar and Chordify are closed),
so the **check** section gives you two routes:

- **Paste a reference** from any chord site — `Fmaj7 | Dm7 G7 | Em7b5 A7`,
  bars optional, jazz shorthand welcome (`D-7`, `Bø7`, `C△7`). **grade me**
  aligns your logged progression against it (sequence alignment, so a missed
  or extra chord shifts instead of wrecking everything after it) and scores:
  exact match 1, right root + right family ¾, right root ½. Wrong pairs are
  clickable — jump straight to the spot and re-listen.
- **🎙 suggest chords from audio** — the YouTube iframe's audio is
  cross-origin and untouchable, but Chrome will capture *tab audio* you
  explicitly share. Hit the button, pick this tab, tick "also share tab
  audio", and play the song: a chromagram + template matcher suggests chords
  as it hears them (triads and sevenths). It's a rough ear, not ground truth —
  use **→ use as reference** and then grade against it, deleting obvious
  misfires first.

## Bars instead of timestamps

Tap the tempo (**tap** button or `b` on the beat), hit **set 1** on a bar-one
downbeat, pick the meter, and chips show `bar·beat` (`12·3`) instead of clock
time — hover for the raw time. Turn **snap** on and newly logged chords quantize
to the nearest beat; **snap all** retrofits the ones you already logged. The
grid saves with the song and travels in exports and share links.

## Voice-leading hints

Toggle **voice leading** in the progression bar and small connectors appear
between chips showing how each chord's guide tones (3rd & 7th — the notes that
actually carry the motion) resolve into the next chord: `F→E · B→B♭` on a
ii–V, common tones marked with `•`. Good for seeing *why* a progression pulls
where it pulls, and for planning smooth voicings on a 27-key board.

## Sharing a transcription

**share link** copies a URL with the chords, key, and beat grid packed into
the fragment (nothing hits a server — it's all in the link). Opening it loads
the video and the transcription; if you already have your own take on that
song, it asks before replacing. Lyrics don't travel (too big for a URL) but
refetch in one click, and the lyric offset does come along.

## Drill: name the degree

The **drill** section is functional ear training with no video: a I–IV–V7–I
cadence establishes the key you've set up top, then one chord plays. Name its
degree by clicking a palette chip or playing the chord on your keyboard —
`r` replays it, **cadence** re-grounds you, **reveal** gives up. Start with
**diatonic 7ths**; switch to **+ common outside** to get secondary dominants,
subV7 and borrowed chords in the mix. Score is per session.

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

- Melodic dictation over the same engine (app plays a line, you play it back)
- A spaced-repetition queue for songs/segments you keep missing
- Per-song stats over time (accuracy by chord function)
