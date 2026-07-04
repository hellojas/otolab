# groundtruth

The curated data that powers otodojo's quizzes. Two collections, both plain
ES modules so the app works as a static page with no fetch/build step.

## songs.js — progressions

```js
{
  id: 'autumn-leaves',              // unique slug
  title: 'Autumn Leaves',
  artist: 'Kosma (jazz standard)',
  genre: 'jazz',                    // 'pop' | 'jazz' | 'blues' (filterable)
  difficulty: 3,                    // 1 diatonic loop · 2 one surprise · 3 jazz changes
  key: 'Em',                        // tonic + optional 'm' for minor
  tempo: 120,                       // bpm for playback (quiz can slow it down)
  bars: [['Am7'],['D7'],['Gmaj7'],['Cmaj7'],['F#m7b5'],['B7'],['Em7'],['Em7']],
  note: 'shown after you check — teaching notes, what was simplified',
}
```

- Each entry in `bars` is one bar; multiple chords in a bar split it evenly
  (`['Bbm7','Eb7']` = two beats each in 4/4).
- Chord spellings follow tab-site conventions: `m7`, `maj7`, `m7b5`, `dim7`,
  `sus4`, `7#9`, slash basses like `C/E` … the parser in `js/theory.js`
  normalizes the common variants (`min7`, `-7`, `ø`, `Δ7`, `M7`).
- Consecutive identical chords merge into one longer quiz slot automatically,
  so writing one chord per bar is fine.

## basslines.js — root-motion lines

```js
{
  id: 'andalusian',
  name: 'the Andalusian cadence',
  hint: 'Hit the Road Jack, Runaway, flamenco everything',  // shown on reveal
  mode: 'minor',                    // played in a random key of this mode
  tempo: 96,
  degrees: ['1','b7','b6','5'],     // chromatic degrees: 1 b2 2 b3 3 4 b5 5 b6 6 b7 7
}
```

## Adding ground truth from tab sites

1. Find the song's chords on your source of choice (Ultimate Guitar,
   Guitar World's /tabs/, Chordify, a fake book…). Cross-check two sources —
   tab sites disagree constantly, and the quiz is only as good as its answer
   key.
2. Reduce to the teaching skeleton: one section (verse or A section,
   4–12 bars), root-position chords, drop passing embellishments. Note what
   you simplified in `note`.
3. Transpose nothing — keep the recording's key so ears trained here
   transfer to the record.
4. Only chord symbols and degrees go in. Chord progressions are facts and
   not copyrightable; melodies and lyrics are, so they stay out.

Tip: paste the chords into the app's **paste a tab** drill first — if the
key guess and playback sound right, the `bars` array is exactly what you
pasted, bar for bar.
