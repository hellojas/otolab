# otolab

Ear-training over real songs — one app, two rooms:

- **lab** (default): loop a section of a YouTube video, play what you hear on
  a MIDI keyboard (or your computer keys), and the app names the chord and
  tells you its **function in the key** — including when it's *not* diatonic.
  This recreates the "sit at the piano with Spotify, replay the bar, hunt for
  the bass note" workflow, minus the piano. A **solo** room does the same for a
  single line — transcribe a melody or improvised solo one note at a time and
  the app places each note on its chord and names its role (chord tone /
  tension / approach).
- **dojo** 道場: the practice hall — no video, no internet. A sequenced
  curriculum (**today**'s workout + a mastery-gated **path**) drives a deck of
  chip-answered drills: recognition (intervals, qualities, degrees, scale
  degrees, basslines), harmony (cadences, form), production (echo/dictation,
  sing, licks), color (modes, tensions), rhythm, and the song-quiz / paste-a-tab
  progression trainers — plus the built-in standards library with synth comping
  and transcription quizzes.

The toggle lives in the header; the mode persists. Same synth, same theory
engine, same themes everywhere. lab is strictly the transcribe-over-video room;
dojo is the no-video practice hall (the standards library lives there).

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

## Solo transcription

Transcribing a single line off a record — a melody, a bass riff, an improvised
solo — is a different job from transcribing changes, and the **solo** section
is built for it. Log the chords above first, then:

1. Loop and slow down the phrase (0.25× and the `.`/`,` chord loops help).
2. Find one note — play it on the keyboard/MIDI, or hit **🎤 hum to note** and
   sing it (a monophonic pitch detector names what you hum, tuning cents and
   all — no instrument needed).
3. Press `n` (or **+ note @ playhead**) to log it at the current video time.

Each logged note lands on a **piano-roll over the chord of the moment** and is
labeled with its role in that harmony: a `chord tone` (green), a `tension`
(9/11/13/alterations, amber), or an `approach` note (chromatic/outside, red) —
plus its scale degree in the key. That note-vs-chord reading is the point: it
trains you to hear a line as chord tones + tensions + approaches instead of a
blur of pitches. **▶ line** plays the transcription back; **along** sounds each
note as the video reaches it so you can check it against the record; the summary
tallies what percentage of the line is chord tones vs tensions vs approaches.
The line saves per video and travels in export/import.

**🎙 sing over: on** turns the same mic into a sing-along coach: play the record
and sing, and every sustained note you produce is scored against the chord under
the playhead — a live chord-tone / tension / approach breakdown that trains you
to *aim* for chord tones over the moving harmony instead of just reading them
back afterward.

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
keyboard. Every drill logs to a cross-session progress store, and a curriculum
sits on top of them so there's always an obvious next thing to do.

### today + path — the program

The gym had no program, so the **today** and **path** tabs add one:

- **today** assembles a short daily workout from where you are in the path:
  a warm-up on something you've learned, today's focus unit, a review of the
  items due for spaced repetition, and one applied task (a real song quiz).
  Each step launches the right drill preconfigured and ticks itself off as you
  hit its mini-goal ("10 right at ≥85%"). A day **streak** keeps you honest.
- **path** is the syllabus in order — intervals → scale degrees → qualities →
  function → production. A unit completes when its goal items reach their
  accuracy target over enough tries, which unlocks the units that depend on it;
  locked units show what to clear first. You can always practise an open unit
  early — nothing is a wall.

### recognition — name what plays

Naming a progression by ear decomposes into three skills, trained in order:

1. **Bass first** — root motion *is* the progression. The **intervals** drill
   (P4/P5/m3 both ways cover most real root motion) and the **basslines**
   drill (famous root-motion lines — the 50s progression, the Andalusian
   cadence, rhythm changes — played low after a key-setting cadence) train
   exactly this.
2. **Quality second** — the **qualities** drill: one chord, no key context;
   triads & sus → sevenths → extensions.
3. **Function last, the multiplier** — the **degrees** drill (a diatonic
   seventh after a key-setting cadence: name its roman numeral), then the
   **song quiz**: a progression from the [groundtruth collection](groundtruth/)
   plays with bass + comping and you fill in roman numerals; the title stays
   hidden until you check. **paste a tab** turns any chords you paste — from
   Ultimate Guitar, Chordify, anywhere — into the same quiz, key guessed
   automatically. **scale degrees** is the single-note foundation under
   *degrees*: a cadence sets the key, the tonic sounds, then one note plays —
   which degree is it? Diatonic first, chromatics when the seven are automatic.

### harmony — hear the bigger gesture

- **cadences** — a tonic chord sets the key, then a short cadence plays and you
  name the type as one gesture: ii–V–I, backdoor (bVII7→I), tritone sub
  (subV→I), deceptive (V→vi), plagal, or minor ii–V–i.
- **form** — a standard comps by at speed; listen for how the sections repeat
  and return, then name the form: AABA, ABAC, AB, 12-bar blues, or 16-bar.

### production — make the sound, not just name it

- **echo** — call & response, the productive half of ear training. An idiomatic
  line (a guide-tone line, a bebop run, or an enclosure over a ii–V–I) plays
  over a light comp; reproduce it on keyboard/MIDI/on-screen piano, graded
  note-by-note. **echo** mode replays the phrase; **dictation** plays it once
  and you rebuild it from memory. Save a phrase you like to the lick bank.
- **sing** — audiation, the skill every method builds on. Enable the mic and
  *match a note* the app plays, *sing a scale degree* from the key with no
  reference pitch, *sing a chord tone* (hear a chord, produce its root/3rd/5th/
  7th), or *sing a guide-tone line* over a ii–V–i note by note. A live tuner
  grades you when you lock onto the pitch.
- **licks** — your lick bank. Phrases banked from the echo tab can be played,
  echoed, or cycled through **all 12 keys** — transposing a line into every key
  is how it becomes yours, and each echo is graded and logged.

### color + time

- **modes** — scale color, not key. A tonic vamp anchors home, the scale runs
  up, and you name the mode from its characteristic note (lydian's ♯4,
  phrygian's ♭2, mixolydian's ♭7). Selectable sets: jazz three, dark four, or
  all seven.
- **tensions** — a seventh chord sounds, then a single extension above it, then
  both together; name the color (9 · ♭9 · ♯9 · 11 · ♯11 · ♭13 · 13). The
  available tensions follow the chord family.
- **rhythm** — half of transcription and the app trained none of it. Hear a
  one-bar pattern, tap it back over a count-in (spacebar or the pad), and get
  scored on how close each hit lands. Eighths → syncopation → triplets.

Every drill logs to a **progress** tab: overall accuracy, per-drill bars, a
14-day activity sparkline, and your weakest items. Tick **focus weak** where a
drill offers it and a spaced-repetition scheduler biases questions toward what
you keep missing — because ear training only sticks through repetition over
time. Nothing leaves your browser.

## Standards: the built-in jam room

The **standards** section (in the dojo) is a full practice loop with no video
and no internet — an iReal-Pro-style library baked into the app:

- **~100 lead sheets** (`js/standards-data.js` + `js/standards-data-extra.js`):
  Autumn Leaves, All the Things You Are, Stella by Starlight, Body and Soul,
  Night and Day, Cherokee, Giant Steps, rhythm changes, blues heads, the
  Jobim bossas, the Ellington and Blue Note books… Chord progressions aren't
  copyrightable, so the classic changes ship free (the same model iReal Pro
  uses); the extended library's forms were cross-checked against published
  chart analyses and open chord-progression corpora, and tunes whose
  published changes irreconcilably disagree were left out rather than
  guessed. **Melodies are included only for public-domain/traditional tunes
  and original otolab etudes** — copyrighted heads stay out on purpose;
  that's what your ears and the recordings are for.
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

## Quiz mode

Once a song is transcribed, toggle **quiz** (in the lab work-column). Chord
labels hide behind `?`. Click a chip: that segment loops. Play your guess on the
keyboard — nail the root *and* quality and it flips green and reveals; a wrong
full chord counts as an attempt. **reveal** gives up on the current one. Score
is per session.

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
- Extend the mastery-gated curriculum to fold songs/segments and standards you
  keep missing into the daily workout
- Solo-line export to notation, and pitch-detection transcription straight from
  shared tab audio (not just the mic)
