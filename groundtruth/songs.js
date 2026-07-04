// groundtruth/songs.js — curated chord progressions from famous songs.
//
// These are the "commonly published" changes — the versions you'd see on
// Ultimate Guitar / Guitar World tabs or in a fake book, sometimes simplified
// to their teaching skeleton (noted per song). Chord progressions are facts
// and aren't copyrightable; no melodies or lyrics live here.
//
// Schema: see groundtruth/README.md
//   key:   'C' | 'Em' | 'Bb' ...  (m suffix = minor)
//   bars:  array of bars; each bar is an array of chord symbols that split
//          the bar evenly (['Dm7','G7'] = two beats each in 4/4).
//   difficulty: 1 = diatonic pop loop, 2 = one borrowed/secondary chord,
//               3 = jazz changes / fast harmonic rhythm.

export const SONGS = [
  // ---- pop / rock ----
  {
    id: 'let-it-be', title: 'Let It Be', artist: 'The Beatles',
    genre: 'pop', difficulty: 1, key: 'C', tempo: 74,
    bars: [['C'],['G'],['Am'],['F'],['C'],['G'],['F'],['C']],
    note: 'verse; the walk-downs between chords omitted',
  },
  {
    id: 'stand-by-me', title: 'Stand by Me', artist: 'Ben E. King',
    genre: 'pop', difficulty: 1, key: 'A', tempo: 118,
    bars: [['A'],['A'],['F#m'],['F#m'],['D'],['E'],['A'],['A']],
    note: 'the 50s / doo-wop progression, one chord per bar',
  },
  {
    id: 'no-woman-no-cry', title: 'No Woman, No Cry', artist: 'Bob Marley',
    genre: 'pop', difficulty: 1, key: 'C', tempo: 78,
    bars: [['C'],['G'],['Am'],['F'],['C'],['F'],['C'],['G']],
  },
  {
    id: 'someone-like-you', title: 'Someone Like You', artist: 'Adele',
    genre: 'pop', difficulty: 1, key: 'A', tempo: 68,
    bars: [['A'],['C#m'],['F#m'],['D']],
    note: 'verse loop, slash-bass movement simplified to root position',
  },
  {
    id: 'creep', title: 'Creep', artist: 'Radiohead',
    genre: 'pop', difficulty: 2, key: 'G', tempo: 92,
    bars: [['G'],['B'],['C'],['Cm']],
    note: 'the III and iv are the whole point — listen for the major-third bass jump, then the C→Cm melt',
  },
  {
    id: 'hotel-california', title: 'Hotel California', artist: 'Eagles',
    genre: 'pop', difficulty: 2, key: 'Bm', tempo: 74,
    bars: [['Bm'],['F#'],['A'],['E'],['G'],['D'],['Em'],['F#']],
    note: 'verse; a descending-bass Andalusian cousin with two major surprises (V and IV of the relative)',
  },
  {
    id: 'twelve-bar-blues', title: '12-bar blues in C', artist: 'traditional',
    genre: 'blues', difficulty: 1, key: 'C', tempo: 100,
    bars: [['C7'],['C7'],['C7'],['C7'],['F7'],['F7'],['C7'],['C7'],['G7'],['F7'],['C7'],['G7']],
    note: 'the basic form with a quick V–IV turnaround',
  },
  {
    id: 'isnt-she-lovely', title: "Isn't She Lovely", artist: 'Stevie Wonder',
    genre: 'pop', difficulty: 2, key: 'E', tempo: 96,
    bars: [['C#m7'],['F#7'],['B7'],['E']],
    note: 'the vi–II7–V7–I loop, extensions (9/13) simplified to plain 7ths',
  },
  {
    id: 'sunday-morning', title: 'Sunday Morning', artist: 'Maroon 5',
    genre: 'pop', difficulty: 1, key: 'C', tempo: 90,
    bars: [['Dm7'],['G7'],['Cmaj7'],['Cmaj7']],
    note: 'a pop tune that is literally a looping ii–V–I',
  },

  // ---- jazz standards ----
  {
    id: 'autumn-leaves', title: 'Autumn Leaves', artist: 'Kosma (jazz standard)',
    genre: 'jazz', difficulty: 3, key: 'Em', tempo: 120,
    bars: [['Am7'],['D7'],['Gmaj7'],['Cmaj7'],['F#m7b5'],['B7'],['Em7'],['Em7']],
    note: 'A section in the Real Book key — a ii–V–I in major chained into a ii–V–i in the relative minor',
  },
  {
    id: 'fly-me-to-the-moon', title: 'Fly Me to the Moon', artist: 'Bart Howard (jazz standard)',
    genre: 'jazz', difficulty: 3, key: 'C', tempo: 118,
    bars: [['Am7'],['Dm7'],['G7'],['Cmaj7'],['Fmaj7'],['Bm7b5'],['E7'],['Am7']],
    note: 'first 8: the whole cycle of fourths, then the minor ii–V pointing home',
  },
  {
    id: 'blue-bossa', title: 'Blue Bossa', artist: 'Kenny Dorham',
    genre: 'jazz', difficulty: 2, key: 'Cm', tempo: 140,
    bars: [['Cm7'],['Cm7'],['Fm7'],['Fm7'],['Dm7b5'],['G7'],['Cm7'],['Cm7']],
    note: 'first 8; the full tune later tonicizes Db',
  },
  {
    id: 'take-the-a-train', title: 'Take the A Train', artist: 'Billy Strayhorn',
    genre: 'jazz', difficulty: 3, key: 'C', tempo: 144,
    bars: [['C6'],['C6'],['D7'],['D7'],['Dm7'],['G7'],['C6'],['C6']],
    note: 'A section; the D7 is the famous #11 chord, simplified here to a plain V7/V',
  },
  {
    id: 'all-of-me', title: 'All of Me', artist: 'Marks/Simons (jazz standard)',
    genre: 'jazz', difficulty: 2, key: 'C', tempo: 130,
    bars: [['C6'],['C6'],['E7'],['E7'],['A7'],['A7'],['Dm7'],['Dm7']],
    note: 'first 8: secondary dominants marching around the cycle',
  },
  {
    id: 'girl-from-ipanema', title: 'The Girl from Ipanema', artist: 'Jobim',
    genre: 'jazz', difficulty: 3, key: 'F', tempo: 126,
    bars: [['Fmaj7'],['Fmaj7'],['G7'],['G7'],['Gm7'],['Gb7'],['Fmaj7'],['Gb7']],
    note: 'A section; the Gb7 is a tritone sub sliding down to Fmaj7',
  },
  {
    id: 'misty', title: 'Misty', artist: 'Erroll Garner',
    genre: 'jazz', difficulty: 3, key: 'Eb', tempo: 66,
    bars: [['Ebmaj7'],['Bbm7','Eb7'],['Abmaj7'],['Abm7','Db7']],
    note: 'first 4 bars: I, then ii–V into IV, then the backdoor ii–V',
  },
  {
    id: 'so-what', title: 'So What', artist: 'Miles Davis',
    genre: 'jazz', difficulty: 1, key: 'Dm', tempo: 136,
    bars: [['Dm7'],['Dm7'],['Dm7'],['Dm7'],['Ebm7'],['Ebm7'],['Dm7'],['Dm7']],
    note: 'modal: 16 bars of D dorian then up a half step — compressed to 4+2+2 here',
  },
  {
    id: 'cantaloupe-island', title: 'Cantaloupe Island', artist: 'Herbie Hancock',
    genre: 'jazz', difficulty: 2, key: 'Fm', tempo: 112,
    bars: [['Fm7'],['Fm7'],['Db7'],['Db7'],['Dm7'],['Dm7'],['Fm7'],['Fm7']],
    note: 'each chord is 4 bars on the record — compressed to 2 each',
  },
];
