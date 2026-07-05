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

## Content track: the standards library (separate from the drill curriculum)

The build plan above is the **drills/curriculum** track. This is the parallel
**content** track: growing and verifying the lead-sheet library the standards
room and the form/comp drills draw on. It's independent — a data problem, not a
UI one.

### Where the library stands
- **106 tunes.** `js/standards-data.js` (25: the originals, etudes, and
  public-domain melody tunes) + `js/standards-data-extra.js` (81: the expansion).
  Both export `SONGS`; `standards.js` concatenates them.
- **Schema** (per tune): `{ id, title, composer, year, tonic (pc 0–11),
  mode:'major'|'minor', bpb:3|4, style:'swing'|'bossa'|'ballad'|'waltz', bpm,
  sections:[{name, bars:['Cm7','Gm7 C7', …]}], melody? }`. One bar per `bars`
  element; two chords in a bar = space-separated, split evenly. Form is written
  **out in full** (no repeats). Chords only, except `melody` (see below).
- **Chord tokens are a fixed whitelist** — the qualities in `theory.js`
  `chordVoicing` / `QUALITIES`. No slash chords (write root position). `reference.js`
  `parseChordSymbol` is the source of truth for what parses.
- **Copyright line we hold:** chord progressions are uncopyrightable facts, so
  changes ship freely (iReal-Pro's model). **Melodies only for public-domain /
  traditional tunes and original otolab etudes** — never copyrighted heads.

### The Real Book is in the repo
`Real_Book_1_C-compressed.pdf` (5th ed., 511 pages) is committed on `main`. Keep
it there but **out of the app tree** — it's a 9 MB binary; nothing imports it.
- **Page offset: PDF page = book page + 12.** Charts start at PDF p.13 (book p.1).
- **Errata:** PDF pp.9–13 are the book's own "Corrections for Real Book #1" —
  read them first and apply; the printed charts have known errors.
- Render/read pages with the Read tool's `pages` param (poppler-utils installed).
- **Conversion when transcribing:** minor is written `-` (`E-7`=Em7); drop slash
  basses (`Eb-7/Bb`→`Ebm7`); map exotic labels to the whitelist (`alt`→`7#5`,
  `-Δ`→`mMaj7`, `Δ`→`maj7`, `ø`→`m7b5`); simplify >2 chords/bar to the two
  structural ones; write repeats/DS/1st-2nd-endings out in full.

### Two jobs still open

**A. Extract the tunes that were skipped.** The following famous standards are
in the book but not yet in the library — I skipped them by hand because the
handwritten charts have 1st/2nd endings, dense harmony, slash chords, or
genuinely variant published changes, and shipping wrong changes poisons practice.
They need a **per-tune agent** that reads the page + errata and cross-checks one
source, or careful manual work:

| tune | book p. | why hard |
|---|---|---|
| My Romance | 311 | 1st/2nd endings, variant changes |
| Sophisticated Lady | 397 | chromatic, dense |
| 'Round Midnight | 364 | dense, errata-heavy |
| Naima | 315 | pedal-tone, unusual |
| Moment's Notice | 299 | fast ii–V chain |
| Nica's Dream | 319 | multi-section |
| Joy Spring | 247 | modulating A, ambiguous bars |
| Once I Loved | 329 | slash chords, endings |
| Con Alma | 89 | remote modulations |
| Lullaby of Birdland | 277 | bridge reconstruction |
| Like Someone in Love | 262 | descending slash chords, endings |
| Sugar | 414 | (9) extensions, parenthetical alts |
| Meditation | 288 | uncertain bars 3–4 |
| In a Mellow Tone | 222 | 16-bar halves, differing endings |
| Blue Train | 58 | ii–V arrangement, not a plain blues |
| Sidewinder | 382 | 24-bar, chromatic-approach bars |
| Here's That Rainy Day | 191 | hard-to-read scan |

The **easy** ones (blues + modal, clean one-chord-per-bar) are already done:
Foggy Day, One Note Samba, Impressions, Mr. P.C., All Blues, Freddie Freeloader,
Straight No Chaser, Blue Monk, Bessie's Blues.

**B. Verify all 106 charts against the book.** Never done end-to-end (the agent
fleet that was going to do it died on a spend limit). One agent per ~14 tunes:
read each tune's page + errata, compare chords/form, emit one line
`id | OK/MINOR/MAJOR | detail`. Treat jam-session divergence (6 vs maj7, added
turnarounds) as MINOR; only a wrong key / wrong form / structurally wrong section
is MAJOR. Reconcile MAJORs into the data files.

**Both A and B are agent-fleet work** (parallel `Task` subagents). They stalled
because the Fable-5 monthly spend limit was hit mid-session — every subagent
died with a 400. Relaunch once budget resets (`/usage-credits`), or grind by
hand at ~2 tunes / 10 attempts.

### The extraction pipeline (rebuild it in scratchpad — it's ephemeral)
The drafting/validation harness lived in the session scratchpad and is gone. To
recreate:
- **`SPEC.md`** — the schema + hard rules + conversion rules above, handed to each
  agent verbatim.
- **`assemble.mjs`** — globs per-tune `*.js` files + `batch*.txt` (```js blocks),
  `new Function`-evals the object literals, dedupes vs core ids/titles, validates
  (parseable tokens via `reference.js`, ≤2 chords/bar, 8–96 bars, no slash, no
  melody), sorts by title, regenerates `standards-data-extra.js`.
- **`check.mjs`** — imports both data files with
  `node --experimental-default-type=module`, asserts tonic/bpb/style/bpm ranges,
  unique ids, every chord parses to a ≥3-note voicing, and (for melody tunes)
  that melody beats == bars × bpb.
- Agents that emit chart data trip the **content filter** if they dump big blocks
  in the final message — have them **write each tune to its own file** and return
  only a terse id list.

### Library roadmap (content, lower priority than A/B)
- **Melodies for the now-public-domain tunes** already in the library (anything
  published ≤1930: Body and Soul, Georgia on My Mind, I Got Rhythm, All of Me,
  Sweet Georgia Brown, Summertime…). Format: `melody` string of `'Note:beats'` /
  `'r:beats'` tokens from bar 1 beat 1 (see the etudes in `standards-data.js`);
  `standards.js parseMelody` + `gradeMelody` already consume it, unlocking the
  melody-dictation quiz for those tunes.
- **Comp depth** — walking bass + a drum feel in `standards.js addComp`. (Note:
  the drill-curriculum handoff lists full-band transcription as out of scope for
  *drills*; this is different — it's making the standards *playback* groove
  better, which is low-risk and additive.)
- More tunes generally; the `paste-a-tab` dojo drill already turns any pasted
  changes into a quiz, so the library isn't the only path in.

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
