# otolab

Ear-training over real songs — one app, two rooms:

- **lab** (default): loop a section of a YouTube video, play what you hear on
  a MIDI keyboard (or your computer keys), and the app names the chord and
  tells you its **function in the key** — including when it's *not* diatonic.
  This recreates the "sit at the piano with Spotify, replay the bar, hunt for
  the bass note" workflow, minus the piano.
- **dojo** 道場: the practice hall — no video, no internet. Chip-answered
  drills (song quiz, paste-a-tab, basslines, degrees, qualities, intervals —
  absorbed from the old standalone otodojo app), plus the built-in standards
  library with synth comping and transcription quizzes.

The toggle lives in the header; the mode persists. Same synth, same theory
engine, same themes everywhere.

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
   The **⚙ settings** menu in the header picks the synth's voice — piano,
   e-piano, organ, guitar (a Karplus-Strong plucked string), brass, strings,
   music box — plus its overall volume; both persist across sessions.
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

## Dojo: the drill hall

Dojo mode's tabbed drills flip otolab's direction: **the app plays, you
name.** Everything is answered with chips, so it works on a phone with no
keyboard. Naming a progression by ear decomposes into three skills, trained
in order:

1. **Bass first** — root motion *is* the progression. The **intervals** drill
   (P4/P5/m3 both ways cover most real root motion) and the **basslines**
   drill (famous root-motion lines — the 50s progression, the Andalusian
   cadence, rhythm changes — played low after a key-setting cadence) train
   exactly this.
2. **Quality second** — the **qualities** drill: one chord, no key context;
   triads & sus → sevenths → extensions.
3. **Function last, the multiplier** — the **degrees** drill (random keys,
   chip answers — the keyboard-free cousin of the drill section), then the
   **song quiz**: a progression from the [groundtruth collection](groundtruth/)
   plays with bass + comping and you fill in roman numerals; the title stays
   hidden until you check. **paste a tab** turns any chords you paste — from
   Ultimate Guitar, Chordify, anywhere — into the same quiz, key guessed
   automatically.

## Drill: name the degree

The **drill** section is functional ear training with no video: a I–IV–V7–I
cadence establishes the key you've set up top, then one chord plays. Name its
degree by clicking a palette chip or playing the chord on your keyboard —
`r` replays it, **cadence** re-grounds you, **reveal** gives up. Start with
**diatonic 7ths**; switch to **+ common outside** to get secondary dominants,
subV7 and borrowed chords in the mix. Score is per session.

## Standards: the built-in jam room

The **standards** section is a full practice loop with no video and no
internet — an iReal-Pro-style library baked into the app:

- **25 lead sheets**: Autumn Leaves, All the Things You Are, Stella by
  Starlight, rhythm changes, blues heads, bossas… Chord progressions aren't
  copyrightable, so the classic changes ship free (the same model iReal Pro
  uses). **Melodies are included only for public-domain/traditional tunes and
  original otolab etudes** — copyrighted heads stay out on purpose; that's
  what your ears and the recordings are for.
- **▶ changes** comps the chart through the synth with a one-bar count-in:
  walking-ish bass + stabs for swing, clave-flavored comping for bossa, pads
  for ballads, oom-pah-pah for waltzes. Swing eighths land on the back of the
  triplet. Click any bar in the chart to play from there; **loop** repeats the
  form. Tempo is a slider; the ⚙ synth voice applies here too.
- **Transpose to any key** — or **random key**, which is the real ear workout:
  the key readout shows `?` until you reveal.
- **quiz: chords** hides the chart. Listen, then type the changes you hear
  (bars optional, jazz shorthand welcome) and **grade me** aligns your answer
  against the chart with the same scorer as the check section — exact 1,
  right root + family ¾, right root ½.
- **quiz: melody** (melody tunes only) is melodic dictation: hear the line,
  hit **● record my echo**, play it back on any keyboard (MIDI, computer keys,
  on-screen piano), and get graded note-by-note — exact pitch 1, right note
  wrong octave ¾. **reveal** prints the line.

The etudes are a difficulty ladder for dictation: a ii–V–I arpeggio line, a
blues riff that follows the changes, and a guide-tone line over the Autumn
Leaves turnaround — plus Greensleeves and St. James Infirmary for real
(public-domain) tunes.

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

- More standards in the library (and more public-domain heads as tunes age in
  — everything published ≤1930 is now US public domain, so Body and Soul,
  Georgia on My Mind and On the Sunny Side of the Street are fair game for
  melodies)
- Walking bass lines and drum feel for the standards comper
- A spaced-repetition queue for songs/segments/tunes you keep missing
- Per-song stats over time (accuracy by chord function)
