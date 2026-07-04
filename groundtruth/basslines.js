// groundtruth/basslines.js — famous root-motion lines for the bassline drill.
//
// Each line is written as scale degrees relative to the tonic, so the drill
// can play it in a random key. The drill establishes the key with a cadence,
// plays the roots low, and you name the degrees; the reveal tells you which
// famous line you just transcribed.
//
// Degrees use the chromatic set: 1 b2 2 b3 3 4 b5 5 b6 6 b7 7.

export const BASSLINES = [
  {
    id: 'fifties', name: 'the 50s / doo-wop progression',
    hint: 'Stand by Me, Earth Angel, every prom slow dance',
    mode: 'major', tempo: 100, degrees: ['1','6','4','5'],
  },
  {
    id: 'stand-by-me', name: 'Stand by Me (full verse roots)',
    hint: 'the 50s progression stretched over 8 bars',
    mode: 'major', tempo: 110, degrees: ['1','1','6','6','4','5','1','1'],
  },
  {
    id: 'andalusian', name: 'the Andalusian cadence',
    hint: 'Hit the Road Jack, Runaway, flamenco everything',
    mode: 'minor', tempo: 96, degrees: ['1','b7','b6','5'],
  },
  {
    id: 'pachelbel', name: "Pachelbel's Canon",
    hint: 'also Basket Case, Graduation, half of pop radio',
    mode: 'major', tempo: 92, degrees: ['1','5','6','3','4','1','4','5'],
  },
  {
    id: 'twelve-bar', name: '12-bar blues roots',
    hint: 'the whole form, one root per bar',
    mode: 'major', tempo: 116, degrees: ['1','1','1','1','4','4','1','1','5','4','1','5'],
  },
  {
    id: 'rhythm-changes', name: 'rhythm changes (A section roots)',
    hint: 'I Got Rhythm, Oleo, The Flintstones theme',
    mode: 'major', tempo: 120, degrees: ['1','6','2','5','1','6','2','5'],
  },
  {
    id: 'autumn-leaves', name: 'Autumn Leaves roots',
    hint: 'a cycle of fourths landing home in minor',
    mode: 'minor', tempo: 112, degrees: ['4','b7','b3','b6','2','5','1','1'],
  },
  {
    id: 'fly-me', name: 'Fly Me to the Moon roots',
    hint: 'the full diatonic cycle of fourths',
    mode: 'major', tempo: 112, degrees: ['6','2','5','1','4','7','3','6'],
  },
  {
    id: 'i-will-survive', name: 'the minor cycle of fourths',
    hint: 'I Will Survive, Still Got the Blues',
    mode: 'minor', tempo: 104, degrees: ['1','4','b7','b3','b6','2','5','1'],
  },
  {
    id: 'blue-bossa', name: 'Blue Bossa roots',
    hint: 'minor i–iv, then ii–V home',
    mode: 'minor', tempo: 124, degrees: ['1','1','4','4','2','5','1','1'],
  },
  {
    id: 'hotel-california', name: 'Hotel California verse roots',
    hint: 'an Andalusian cousin, one root per bar',
    mode: 'minor', tempo: 100, degrees: ['1','5','b7','4','b6','b3','4','5'],
  },
  {
    id: 'whiter-shade', name: 'the diatonic walk-down',
    hint: 'A Whiter Shade of Pale, Piano Man verse',
    mode: 'major', tempo: 88, degrees: ['1','7','6','5','4','3','2','5'],
  },
];
