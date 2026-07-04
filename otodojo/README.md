# otodojo 音道場

Chord ear-training drills built on real songs — the practice-hall companion to
[otolab](https://github.com/hellojas/otolab). Where otolab is
transcribe-what-you-hear over a YouTube recording, otodojo flips the
direction: **the app plays a synth version of a famous progression, and you
name the chords.**

No build step, no dependencies. Serve the folder
(`python3 -m http.server`) or visit it on GitHub Pages.

## The drills

| drill | what it trains |
|---|---|
| **song quiz** | A progression from the [groundtruth collection](groundtruth/) plays on the synth (piano voicings + a bass line). You fill in roman numerals from answer chips; the title stays hidden until you check. Filter by genre/difficulty, slow to 0.5×, replay freely, hide the key name for hard mode. |
| **paste a tab** | Paste chords from any tab or chord site — Ultimate Guitar, Guitar World, Chordify, a Real Book chart. The parser eats bar lines and skips lyric lines, guesses the key, and builds the same quiz. This is how you turn *any* song you're learning into an ear-training exercise. |
| **basslines** | A cadence establishes the key, then a famous root-motion line plays low (the 50s progression, the Andalusian cadence, rhythm changes, Autumn Leaves…). You name the scale degrees; the reveal tells you whose line you just transcribed. |
| **degrees** | Cadence, then one diatonic seventh chord. Which degree is it? Functional pitch training — the drill from otolab's roadmap. |
| **qualities** | One chord, no key context. Triads & sus → sevenths → extensions, in increasing difficulty. |
| **intervals** | Melodic (up/down) and harmonic intervals, m2 through P8. |

## Why these drills — what actually helps you figure out chords

Naming a progression by ear decomposes into three skills, best trained in
this order:

1. **Bass first.** The bass is the most isolated pitch in nearly every mix,
   and root motion *is* the progression. The intervals drill (P4/P5/m3 in
   both directions cover most real root motion) and the basslines drill
   train exactly this. This mirrors the real workflow: loop the bar, hunt
   the bass note, then figure out what's stacked on it.
2. **Quality second.** Given the root, is the color major, minor, dominant,
   half-diminished? That's the qualities drill.
3. **Function last — and it's the multiplier.** Root + quality *relative to
   the key* is the roman numeral, and hearing "IV going iv" instead of
   "C going Cm" is what transfers between songs and keys. The degrees drill
   trains it in isolation; the song quiz applies it to real tunes.

Famous basslines are in the collection deliberately: a line like
Autumn Leaves' cycle of fourths or the Andalusian descent is a chord
progression you can *sing*, which makes it stick in a way flashcards don't.

## Ground truth

`groundtruth/` holds the curated data — `songs.js` (progressions with key,
tempo, bars, difficulty) and `basslines.js` (root-motion lines as scale
degrees). See [groundtruth/README.md](groundtruth/README.md) for the schema
and how to add songs from tab sites. Only chord symbols and root degrees are
stored — progressions are facts; melodies and lyrics stay out.

## Relationship to otolab

Same synth, same theory engine (chord qualities, roman-numeral analysis,
key guessing), same washi/yoru themes. otolab answers "what chord did I just
hear in this recording?"; otodojo answers "can I name chords cold, on demand?"
Use otodojo to build the reflexes, otolab to apply them to records.
