# otolab — ear-training curriculum build handoff

Working doc for continuing the ear-training build in a fresh session. Delete it
when the work is done. Everything here reflects the state of the repo as of the
last commit on `main` (this is now the working branch — see Git below).

## Where things stand

The app already covers **atomic recognition** thoroughly: intervals (± optional
tonic drone), chord qualities, functional chord degrees, single-note scale
degrees, rhythm tap-back, bass lines, sing-back (mic), and transcription of both
changes (lab) and single lines (the solo room), plus a standards library. Every
drill logs to a cross-session progress store (SM-2-lite) with a stats tab.

What's missing is the **connective + productive** layer: a program that
sequences the drills, and the half of ear training that makes *sound* rather
than just naming it. This doc specs that work.

All of this session's work is already merged into `main` (`0b63304`). Recent
commits:
- `092a9ff` solo room + noteVsChord/scaleDegree + pitch.js + progress.js
- `ff17f8a` dojo: scale-degrees, sing, rhythm drills + progress wiring
- `fa0ba54` docs
- `0b63304` this handoff

## Architecture primer (read before touching anything)

Static ES-module app, **no build step**. Serve with `python3 -m http.server`.
`index.html` loads `js/app.js` (type=module); everything else is imported.

### Module map
| file | role | key exports |
|---|---|---|
| `js/app.js` | orchestrator: `state`, persistence, capture/timeline, practice mode, palette, grid, share, themes, settings, transport, `init()` | — |
| `js/theory.js` | pitch/chord detection + functional analysis | `detectChord`, `analyzeFunction`, `paletteForKey`, `chordVoicing`, `qualityIntervals`, `guideTones`, `voiceLeading`, `scaleDegree`, `noteVsChord`, `romanFor`, `qualityFamily`, `pcName`, `midiName`, `useFlats` |
| `js/audio.js` | Web Audio synth + scheduler | `playChord`, `noteOn/Off`, `playNoteAt`, `playChordAt`, `clickAt`, `audioNow`, `ensureCtx`, `allNotesOff`, `VOICES` |
| `js/input.js` | shared held-note set (MIDI + computer keys + on-screen piano) | `onHeldChange`, `heldNotes`, `buildPiano`, `paintPiano`, `connectMidi` |
| `js/player.js` | YouTube IFrame wrapper (default export `api`) | `onTick`, `loadVideo`, `time()`, `seek`, `loopSegment`, `play/pause` |
| `js/reference.js` | chord-symbol parsing + alignment grading | `parseProgression`, `gradeProgression`, `alignSequences` (Needleman–Wunsch) |
| `js/dojo.js` | dojo tabs (song quiz, paste, basslines, degrees, qualities, intervals, **scale degrees**, **sing**, **rhythm**, **progress**) | `initDojo`, `stopDojo`, `stopDojoMic` |
| `js/solo.js` | solo transcription room (lab) | `initSolo(deps)`, `soloLog`, `refreshSolo`, `stopSolo`, `stopSoloMic` |
| `js/drill.js` | lab "name the degree" drill | `initDrill`, `answerDrill`, `drillReplay`, `stopDrill`, `isDrillOn` |
| `js/standards.js` | standards library room (comp + chord/melody quizzes) | `initStandards`, `stopStandards` |
| `js/pitch.js` | mic monophonic pitch detection (McLeod/NSDF) | `startMic(onPitch,onStop)`, `stopMic`, `isMicOn`, `freqToMidiCents` |
| `js/progress.js` | cross-session attempt log + SRS + stats | `record(cat,id,ok)`, `pickWeighted(cat,ids,focus)`, `stats()`, `dueCount()`, `reset()` |
| `groundtruth/songs.js`, `basslines.js` | data for song quiz + bassline drill | `SONGS`, `BASSLINES` |
| `js/standards-data*.js` | lead-sheet library | `SONGS` (chords + optional `melody`) |

### Patterns you must follow
- **Every "room"/drill surface exposes `init*` + `stop*`.** `app.js` wires each
  one's `onStart` callback to stop the others (mutual exclusion of audio). When
  you add a new playing surface, add it to those `onStart` lists in `app.js`
  `init()` and to the mode-switch in `initMode()`.
- **Dojo drills answer via chips** (phone-friendly, no keyboard). Canonical
  shape: a `makeScore(elId)`, a `state` object, a `#…-new` handler that builds
  chips, and `chip.onclick` that grades → `record()` → advances.
- **Progress hooks:** `cat` = drill name, `id` = item string (e.g. `'M3'`,
  `'m7'`, `'ii7'`, `'5'`, `'deg:b3'`). Use `pickWeighted(cat, candidateStrings,
  focusBool)` to choose the next item (adaptive/SRS), and `record(cat, id, ok)`
  on every answer. Stats/`progress` tab reads it automatically.
- **Audio in dojo:** `playSequence(events, bpm, {onStep,onDone})` where
  `events = [{notes?:[midi], bass?:midi, beats, slot?}]`. `cadenceEvents(key)`
  builds a key-setting I–IV–V–I. For sample-accurate timing (rhythm) schedule on
  the audio clock with `clickAt(when)` / `audioNow()`.
- **Persistence:** lab data lives in `app.js` `state` and is saved per video in
  `save()`, restored in `loadSaved()`, and mirrored in export/import. New lab
  fields must be added to all of those. Dojo/progress/curriculum data uses its
  own `localStorage` keys (`otolab:v1:*`).
- **`$` differs by file:** `dojo.js` uses `$ = id => getElementById(id)`;
  `app.js`/`solo.js`/`standards.js` use `$ = sel => querySelector(sel)`. Don't
  mix them up.
- **Theme colors are CSS vars** (`--diatonic` green, `--secondary` amber,
  `--outside` red, `--good`, `--bad`, `--accent`, `--muted`, `--panel`,
  `--border`). Reuse them — the role coloring (chord/tension/approach) maps to
  diatonic/secondary/outside. Four themes; never hardcode colors.
- New lab sections must be added to the dojo-hidden list in `css/style.css`
  (`body[data-mode="dojo"] … { display:none }`).

### Gotchas (bit me already)
- `stopDojo()` runs at the **start of every `playSequence`**, so it must **not**
  stop the mic — the sing drill grades while the synth plays the target.
  `stopDojoMic()` is deliberately separate (tab-switch + mode-switch only).
- **Mic-on-speakers:** the sing drill can hear the synth target bleed through
  speakers. Assume headphones, or gate grading for ~1s after target playback.
- `solo.js` subscribes to `onHeldChange` globally; it only acts on a single held
  note (2+ = a chord, ignored).
- Flats vs sharps: `useFlats(tonic, mode)`; flat-degree chord labels flip flat
  even in sharp keys (`… || roman.startsWith('b')`).
- The `n` shortcut logs a solo note (guarded against typing in inputs).

## The build plan (priority order)

Build in this order; each is independently shippable. Commit per feature.

### 1. Daily workout + mastery-gated curriculum  ★ highest leverage
The app is a gym with no program. Add the sequencing layer over the existing
progress store — mostly wiring, few new drills.

- **New module `js/curriculum.js`** + a new dojo tab **"today"** (put it first in
  `#dojo-tabs`). Also add `curriculum` data + a `path` view.
- **Syllabus data**: an ordered array of units `{ id, title, drill, config,
  goalItems:[…], goalPct, goalCount, requires:[unitId…] }`. `drill`/`config`
  name a dojo drill and its selector settings (e.g. `{drill:'intervals',
  config:{type:'melodic-both'}, goalItems:['P4','P5','M3','m3'], goalPct:85,
  goalCount:20}`).
- **Daily workout generator**: assembles ~4 steps = warm-up (a mastered drill) +
  current unit's drill + review (due SRS items via a new `progress.dueItems()`
  or reuse `pickWeighted` with `focus:true`) + one applied task (a progression/
  solo quiz). Present as a checklist; each step launches the relevant tab
  preconfigured and shows a mini-goal ("get 10 right at ≥85%").
- **Mastery gates**: a unit completes when `stats()` shows its `goalItems` at
  `≥goalPct` over `≥goalCount` tries; completing it unlocks `requires` dependents.
  Persist `{completedUnits, currentUnit}` in `otolab:v1:curriculum`.
- **Knowing when a step is done**: add `progress.onRecord(cb)` (a subscriber list
  fired inside `record()`), so the workout can count attempts live instead of
  polling. Small change to `progress.js`.
- **Streak + calendar**: `progress.js` already stores `daily{date:{total,correct}}`.
  Compute a day streak; show it on the Today panel. Reuse the `.stats-spark`
  styling.
- **Path view**: list units as locked / current / done with per-unit accuracy.

Files: `js/curriculum.js` (new), `js/progress.js` (+`onRecord`, maybe
`dueItems`), `js/dojo.js` (wire the tab; expose a way to programmatically set a
drill's selects and start it — the simplest is a small `runAssignment(drill,
config)` helper that sets the `<select>` values and clicks `#…-new`), `index.html`
(+`#panel-today`, `#panel-path` or a sub-view), `css/style.css`.

### 2. Call-and-response + melodic phrase dictation + lick bank
The productive loop the app lacks: hear a phrase → reproduce it → transpose to 12
keys → bank it.

- **New module `js/phrases.js`** — generate an idiomatic line as
  `{ chords:[{root,quality,beats}], melody:[{beat,midi,dur}] }`:
  - guide-tone lines over ii–V–I (use `guideTones()` from theory),
  - scalar/bebop fragments, enclosures/approach-note patterns,
  - params: bars, rhythm density, harmonic context, difficulty.
  - Emit `melody` in the same token space `standards.js` `parseMelody` uses
    (`{beat, midi, dur}`) so you can reuse its playback + `alignSequences` grading.
- **"echo" dojo tab (call & response)**: app plays the phrase (melody over a
  light comp), you echo it on keyboard/MIDI/voice/on-screen piano; grade
  note-by-note with `alignSequences` (exact pitch 1, right pc wrong octave 0.75 —
  same scorer `standards.js gradeMelody` uses). Difficulty levels: **echo**
  (immediate) vs **dictation** (play once, reconstruct) — same engine.
  Reuse the recording pattern in `standards.js` (`onHeldChange` → `st.recorded`).
- **Lick bank**: save the current phrase (or a selection from the solo room) to
  `otolab:v1:licks` as `{id,name,key,chords,melody,tags}`. A "licks" view lists
  them; each can be played, echoed, transposed to a chosen/random key, and added
  to the SRS (`record('licks', id, ok)`).
- **Transpose-to-12-keys drill**: cycle a lick through keys (shift all midi by
  the interval), you play it back each time, graded. Trivial given the above.

Files: `js/phrases.js` (new), `js/dojo.js` (+echo tab, +licks view), `index.html`,
`css/style.css`. Reuse `alignSequences` (reference.js) and the melody format.

### 3. Higher-order harmonic hearing
- **Cadence-type ID drill** (dojo tab): after a tonic, play a short cadence and
  name the type via chips: ii–V–I, backdoor (bVII7→I), tritone sub (subV→I),
  deceptive (V→vi), plagal, minor ii–V–i. Data = a table `type → [degree,quality]…`;
  play via `cadenceEvents`-style events. `record('cadence', type, ok)`.
- **Form recognition** (dojo tab, uses the standards library): comp a tune, ask
  "what's the form?" (AABA / ABAC / 12-bar blues / 16-bar / modal). Derive the
  answer from `song.sections` names. `record('form', formType, ok)`.
- (Lower) **Chunked progression mode** in the song quiz: label functional chunks
  ("ii–V of IV") rather than each chord.

### 4. Chord-tone / guide-tone singing + sing over the record
- **Extend the sing drill** (already in `dojo.js`) with modes:
  - **sing a chord tone**: play a chord, ask "sing the 3rd/5th/7th/root";
    target pc = chord root + interval; reuse the existing mic pc-match grading.
  - **guide-tone line**: play ii–V–I, sing the guide-tone line note by note
    (targets from `guideTones()`); grade each target in sequence.
- **Sing over the record** (lab): a mic toggle that runs `pitch.js` while the
  YouTube plays and shows your sung note vs the logged chord using `noteVsChord`
  (chord tone? which tension?), or grades you singing the melody/root. All the
  pieces already coexist (`player.onTick` + `pitch.js` + `noteVsChord`); it just
  needs wiring, likely in `solo.js` or a new small `singalong.js`.

### 5. Smaller adds (do if time)
- **Modal/scale-color recognition**: play a modal vamp or scale, name the mode
  (dorian/phrygian/lydian/mixolydian/aeolian/locrian) via chips.
- **Tension-over-chord ID**: play chord + a top tension, name it (♭9/♯9/♯11/♭13/
  9/11/13). Answer key = `noteVsChord`.
- **Phrase/transcription SRS review**: store transcribed phrases and re-test.

### Explicitly out of scope
Full-band transcription (comping voicings, walking-bass/drums), notation-export
polish, DAW-style features. Diminishing returns for an ear trainer.

## Testing recipe

No test suite; verify in a real browser with the pre-installed Chromium.

```bash
# syntax check
for f in js/*.js; do node --check "$f" || echo "FAIL $f"; done

# serve + smoke test (Playwright is global)
python3 -m http.server 8137 &
node -e 'import("/opt/node22/lib/node_modules/playwright/index.js").then(async (pkg)=>{
  const {chromium}=pkg.default||pkg; const errs=[]; const b=await chromium.launch();
  const p=await b.newPage(); p.on("pageerror",e=>errs.push(e.message));
  p.on("console",m=>{if(m.type()==="error")errs.push(m.text())});
  await p.goto("http://localhost:8137/index.html",{waitUntil:"networkidle"});
  await p.waitForTimeout(500);
  await p.click(".mode-toggle button[data-mode=dojo]");
  // click through tabs, run a drill, assert no errors …
  console.log("ERRORS:", errs.length?errs.join("|"):"none"); await b.close();
});'
```

**Testing the solo room / anything importing `player.js` without YouTube:** use
an import map to stub the player. Make a `soloqa-player-stub.js` exporting a
default `{ isReady:true, time:()=>8, onTick(){}, seek(){}, play(){}, … }` and a
test HTML with `<script type="importmap">{"imports":{"/js/player.js":
"/soloqa-player-stub.js"}}</script>`, then import the module and drive it. (This
verified the solo roll rendering: F over Dm7 → "♭3" chord tone, B over G7 → "3",
etc.) Delete the stub/test files before committing.

Take screenshots (`page.screenshot`) to eyeball layout + theming; the four
themes (yoru/sumi/washi/kissa) all use CSS vars so check at least one dark + light.

## Git workflow

- **Work directly on `main`.** The owner asked for everything to live on `main`
  and to develop there (no feature branch). Commit to `main` and push:
  `git push origin main` (retry on network errors with backoff).
- Keep commits small and per-feature. Verify in the browser before committing.
- Don't open a PR unless asked.
- Commit message trailers (chat-only identity stays out of commits):
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01X2Ws2j5DLFGFUrRiD6rh5D
  ```
- GitHub ops go through the `mcp__github__*` tools (no `gh` CLI). Repo scope:
  `hellojas/otolab`.

## Suggested first move in the new session

Read `README.md`, then `js/dojo.js` (drill patterns), `js/progress.js`, and
`js/solo.js` end to end. Then build **#1 (daily workout + curriculum)** — it's
the highest leverage and reuses everything already in place. Commit it, verify in
the browser, then move to **#2 (call-and-response + lick bank)**.
