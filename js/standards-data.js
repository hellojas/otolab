// standards-data.js — the built-in lead-sheet library for the standards mode.
//
// Chord progressions are common practice / jam-session changes (progressions
// themselves aren't copyrightable — the same model iReal Pro uses, chords
// only). Melodies are included ONLY for public-domain / traditional tunes and
// for original otolab etudes; copyrighted heads stay out on purpose — that's
// what your ears and the recordings are for.
//
// Format:
//   tonic/mode  — the song's home key (pitch class 0–11)
//   bpb         — beats per bar (4 or 3)
//   style       — comp pattern: 'swing' | 'bossa' | 'ballad' | 'waltz'
//   sections    — [{ name, bars: ['Cm7', 'F7', 'Gm7 C7', …] }]
//                 two chords in one bar split the bar evenly
//   melody      — optional stream of 'Note:beats' / 'r:beats' tokens, running
//                 from bar 1 beat 1; durations are quarter-note beats

const SONGS = [

  // ---------- chords + melody: traditional (public domain) ----------

  {
    id: 'greensleeves',
    title: 'Greensleeves',
    composer: 'traditional (16th c.)',
    year: '',
    tonic: 9, mode: 'minor', bpb: 3, style: 'waltz', bpm: 126,
    melodyNote: 'public domain — full verse',
    sections: [
      { name: 'A', bars: [
        'Am', 'Am', 'G', 'G', 'Em', 'Am', 'E7', 'E7',
        'Am', 'Am', 'G', 'G', 'Em', 'Am', 'E7', 'Am',
      ] },
    ],
    melody:
      'r:2 A3:1 C4:2 D4:1 E4:1.5 F4:0.5 E4:1 D4:2 B3:1 ' +
      'G3:1.5 A3:0.5 B3:1 C4:2 A3:1 A3:1.5 G#3:0.5 A3:1 B3:2 G#3:1 ' +
      'E3:2 A3:1 C4:2 D4:1 E4:1.5 F4:0.5 E4:1 D4:2 B3:1 ' +
      'G3:1.5 A3:0.5 B3:1 C4:1.5 B3:0.5 A3:1 G#3:1.5 F#3:0.5 G#3:1 A3:3',
  },

  {
    id: 'st-james-infirmary',
    title: 'St. James Infirmary',
    composer: 'traditional',
    year: '',
    tonic: 2, mode: 'minor', bpb: 4, style: 'ballad', bpm: 88,
    melodyNote: 'public domain — simplified head',
    sections: [
      { name: 'A', bars: ['Dm', 'A7', 'Dm', 'D7', 'Gm', 'Dm', 'A7', 'Dm'] },
    ],
    melody:
      'r:1 D4:1 F4:1 A4:1 A4:1.5 A4:0.5 G4:1 E4:1 ' +
      'D4:2 r:1 D4:0.5 F4:0.5 A4:1 A4:1 G4:1 F#4:1 ' +
      'G4:1 G4:1 Bb4:1 A4:1 A4:1 F4:1 E4:1 D4:1 ' +
      'E4:1.5 C#4:0.5 E4:1 G4:1 D4:3 r:1',
  },

  // ---------- chords + melody: original otolab etudes ----------

  {
    id: 'etude-251',
    title: 'etude: ii–V–I line (C)',
    composer: 'otolab original',
    year: '',
    tonic: 0, mode: 'major', bpb: 4, style: 'swing', bpm: 104,
    melodyNote: 'original etude — arpeggios spell each chord',
    sections: [
      { name: 'A', bars: ['Dm7', 'G7', 'Cmaj7', 'Cmaj7', 'Dm7', 'G7', 'C6', 'C6'] },
    ],
    melody:
      'D4:0.5 F4:0.5 A4:0.5 C5:0.5 A4:1 F4:1 ' +
      'G4:0.5 B4:0.5 D5:0.5 F5:0.5 D5:1 B4:1 ' +
      'C5:2 B4:0.5 A4:0.5 G4:1 ' +
      'E4:0.5 G4:0.5 B4:0.5 D5:0.5 C5:2 ' +
      'C5:0.5 A4:0.5 F4:0.5 D4:0.5 E4:1 F4:1 ' +
      'D4:0.5 F4:0.5 G4:0.5 B4:0.5 D5:1 B4:1 ' +
      'C5:2 G4:1 E4:1 C4:4',
  },

  {
    id: 'etude-blues-riff',
    title: 'etude: blues riff (F blues)',
    composer: 'otolab original',
    year: '',
    tonic: 5, mode: 'major', bpb: 4, style: 'swing', bpm: 126,
    melodyNote: 'original etude — riff follows the changes',
    sections: [
      { name: 'A', bars: [
        'F7', 'Bb7', 'F7', 'Cm7 F7',
        'Bb7', 'Bdim7', 'F7', 'Am7 D7',
        'Gm7', 'C7', 'F7 D7', 'Gm7 C7',
      ] },
    ],
    melody:
      'F4:0.5 A4:0.5 C5:0.5 Eb5:0.5 C5:2 ' +
      'F4:0.5 Ab4:0.5 Bb4:0.5 D5:0.5 Bb4:2 ' +
      'F4:0.5 A4:0.5 C5:0.5 Eb5:0.5 C5:2 ' +
      'G4:0.5 Bb4:0.5 C5:1 A4:1 F4:1 ' +
      'F4:0.5 Ab4:0.5 Bb4:0.5 D5:0.5 F5:2 ' +
      'F4:0.5 Ab4:0.5 B4:0.5 D5:0.5 Ab4:2 ' +
      'A4:0.5 C5:0.5 Eb5:0.5 C5:0.5 A4:2 ' +
      'A4:0.5 C5:0.5 E5:1 F#4:0.5 A4:0.5 C5:1 ' +
      'G4:0.5 Bb4:0.5 D5:0.5 Bb4:0.5 G4:2 ' +
      'Bb4:0.5 G4:0.5 E4:0.5 G4:0.5 C5:2 ' +
      'A4:1 F4:1 F#4:1 A4:1 ' +
      'Bb4:1 G4:1 E4:1 C5:1',
  },

  {
    id: 'etude-minor-line',
    title: 'etude: minor line (autumn changes)',
    composer: 'otolab original',
    year: '',
    tonic: 7, mode: 'minor', bpb: 4, style: 'swing', bpm: 96,
    melodyNote: 'original etude — guide tones through a minor turnaround',
    sections: [
      { name: 'A', bars: ['Cm7', 'F7', 'Bbmaj7', 'Ebmaj7', 'Am7b5', 'D7', 'Gm6', 'Gm6'] },
    ],
    melody:
      'C4:0.5 Eb4:0.5 G4:0.5 Bb4:0.5 G4:2 ' +
      'A4:0.5 C5:0.5 Eb5:0.5 C5:0.5 A4:2 ' +
      'D5:0.5 C5:0.5 Bb4:0.5 A4:0.5 Bb4:2 ' +
      'G4:0.5 Bb4:0.5 D5:0.5 Bb4:0.5 G4:2 ' +
      'A4:0.5 C5:0.5 Eb5:0.5 C5:0.5 A4:2 ' +
      'F#4:0.5 A4:0.5 C5:0.5 A4:0.5 F#4:2 ' +
      'G4:0.5 Bb4:0.5 D5:0.5 Bb4:0.5 G4:2 ' +
      'G4:3 r:1',
  },

  // ---------- chords only: the standards ----------

  {
    id: 'autumn-leaves',
    title: 'Autumn Leaves',
    composer: 'Joseph Kosma',
    year: 1945,
    tonic: 7, mode: 'minor', bpb: 4, style: 'swing', bpm: 120,
    sections: [
      { name: 'A', bars: ['Cm7', 'F7', 'Bbmaj7', 'Ebmaj7', 'Am7b5', 'D7', 'Gm6', 'Gm6'] },
      { name: 'A', bars: ['Cm7', 'F7', 'Bbmaj7', 'Ebmaj7', 'Am7b5', 'D7', 'Gm6', 'Gm6'] },
      { name: 'B', bars: ['Am7b5', 'D7', 'Gm6', 'Gm6', 'Cm7', 'F7', 'Bbmaj7', 'Bbmaj7'] },
      { name: 'C', bars: ['Am7b5', 'D7', 'Gm7 C7', 'Fm7 Bb7', 'Ebmaj7', 'Am7b5 D7', 'Gm6', 'Gm6'] },
    ],
  },

  {
    id: 'all-the-things',
    title: 'All the Things You Are',
    composer: 'Jerome Kern',
    year: 1939,
    tonic: 8, mode: 'major', bpb: 4, style: 'swing', bpm: 132,
    sections: [
      { name: 'A', bars: ['Fm7', 'Bbm7', 'Eb7', 'Abmaj7', 'Dbmaj7', 'Dm7 G7', 'Cmaj7', 'Cmaj7'] },
      { name: 'A', bars: ['Cm7', 'Fm7', 'Bb7', 'Ebmaj7', 'Abmaj7', 'Am7 D7', 'Gmaj7', 'Gmaj7'] },
      { name: 'B', bars: ['Am7', 'D7', 'Gmaj7', 'Gmaj7', 'F#m7b5', 'B7', 'Emaj7', 'C7#5'] },
      { name: 'A', bars: ['Fm7', 'Bbm7', 'Eb7', 'Abmaj7', 'Dbmaj7', 'Gb7', 'Cm7', 'Bdim7',
                          'Bbm7', 'Eb7', 'Abmaj7', 'Gm7b5 C7'] },
    ],
  },

  {
    id: 'blue-bossa',
    title: 'Blue Bossa',
    composer: 'Kenny Dorham',
    year: 1963,
    tonic: 0, mode: 'minor', bpb: 4, style: 'bossa', bpm: 144,
    sections: [
      { name: 'A', bars: ['Cm7', 'Cm7', 'Fm7', 'Fm7', 'Dm7b5', 'G7', 'Cm7', 'Cm7',
                          'Ebm7', 'Ab7', 'Dbmaj7', 'Dbmaj7', 'Dm7b5', 'G7', 'Cm7', 'Dm7b5 G7'] },
    ],
  },

  {
    id: 'so-what',
    title: 'So What',
    composer: 'Miles Davis',
    year: 1959,
    tonic: 2, mode: 'minor', bpb: 4, style: 'swing', bpm: 136,
    sections: [
      { name: 'A', bars: ['Dm7', 'Dm7', 'Dm7', 'Dm7', 'Dm7', 'Dm7', 'Dm7', 'Dm7'] },
      { name: 'A', bars: ['Dm7', 'Dm7', 'Dm7', 'Dm7', 'Dm7', 'Dm7', 'Dm7', 'Dm7'] },
      { name: 'B', bars: ['Ebm7', 'Ebm7', 'Ebm7', 'Ebm7', 'Ebm7', 'Ebm7', 'Ebm7', 'Ebm7'] },
      { name: 'A', bars: ['Dm7', 'Dm7', 'Dm7', 'Dm7', 'Dm7', 'Dm7', 'Dm7', 'Dm7'] },
    ],
  },

  {
    id: 'fly-me',
    title: 'Fly Me to the Moon',
    composer: 'Bart Howard',
    year: 1954,
    tonic: 0, mode: 'major', bpb: 4, style: 'swing', bpm: 120,
    sections: [
      { name: 'A', bars: ['Am7', 'Dm7', 'G7', 'Cmaj7 C7', 'Fmaj7', 'Bm7b5', 'E7', 'Am7 A7'] },
      { name: 'B', bars: ['Dm7', 'G7', 'Cmaj7', 'Am7', 'Dm7', 'G7', 'Em7b5', 'A7'] },
      { name: 'A', bars: ['Am7', 'Dm7', 'G7', 'Cmaj7 C7', 'Fmaj7', 'Bm7b5', 'E7', 'Am7 A7'] },
      { name: 'C', bars: ['Dm7', 'G7', 'Em7b5', 'A7', 'Dm7', 'G7', 'C6', 'Bm7b5 E7'] },
    ],
  },

  {
    id: 'a-train',
    title: 'Take the A Train',
    composer: 'Billy Strayhorn',
    year: 1941,
    tonic: 0, mode: 'major', bpb: 4, style: 'swing', bpm: 144,
    sections: [
      { name: 'A', bars: ['C6', 'C6', 'D7#11', 'D7#11', 'Dm7', 'G7', 'C6', 'Dm7 G7'] },
      { name: 'A', bars: ['C6', 'C6', 'D7#11', 'D7#11', 'Dm7', 'G7', 'C6', 'Gm7 C7'] },
      { name: 'B', bars: ['Fmaj7', 'Fmaj7', 'Fmaj7', 'Fmaj7', 'D7', 'D7', 'Dm7', 'G7'] },
      { name: 'A', bars: ['C6', 'C6', 'D7#11', 'D7#11', 'Dm7', 'G7', 'C6', 'C6'] },
    ],
  },

  {
    id: 'misty',
    title: 'Misty',
    composer: 'Erroll Garner',
    year: 1954,
    tonic: 3, mode: 'major', bpb: 4, style: 'ballad', bpm: 66,
    sections: [
      { name: 'A', bars: ['Ebmaj7', 'Bbm7 Eb7', 'Abmaj7', 'Abm7 Db7',
                          'Ebmaj7 Cm7', 'Fm7 Bb7', 'Gm7 C7', 'Fm7 Bb7'] },
      { name: 'A', bars: ['Ebmaj7', 'Bbm7 Eb7', 'Abmaj7', 'Abm7 Db7',
                          'Ebmaj7 Cm7', 'Fm7 Bb7', 'Eb6', 'Eb6'] },
      { name: 'B', bars: ['Bbm7', 'Eb7', 'Abmaj7', 'Abmaj7', 'Am7', 'D7', 'Gm7 C7', 'Fm7 Bb7'] },
      { name: 'A', bars: ['Ebmaj7', 'Bbm7 Eb7', 'Abmaj7', 'Abm7 Db7',
                          'Ebmaj7 Cm7', 'Fm7 Bb7', 'Eb6', 'Eb6'] },
    ],
  },

  {
    id: 'satin-doll',
    title: 'Satin Doll',
    composer: 'Duke Ellington & Billy Strayhorn',
    year: 1953,
    tonic: 0, mode: 'major', bpb: 4, style: 'swing', bpm: 118,
    sections: [
      { name: 'A', bars: ['Dm7 G7', 'Dm7 G7', 'Em7 A7', 'Em7 A7',
                          'Am7 D7', 'Abm7 Db7', 'Cmaj7', 'Cmaj7'] },
      { name: 'A', bars: ['Dm7 G7', 'Dm7 G7', 'Em7 A7', 'Em7 A7',
                          'Am7 D7', 'Abm7 Db7', 'Cmaj7', 'Cmaj7'] },
      { name: 'B', bars: ['Gm7 C7', 'Gm7 C7', 'Fmaj7', 'Fmaj7',
                          'Am7 D7', 'Am7 D7', 'G7', 'G7'] },
      { name: 'A', bars: ['Dm7 G7', 'Dm7 G7', 'Em7 A7', 'Em7 A7',
                          'Am7 D7', 'Abm7 Db7', 'Cmaj7', 'Cmaj7'] },
    ],
  },

  {
    id: 'ipanema',
    title: 'The Girl from Ipanema',
    composer: 'Antônio Carlos Jobim',
    year: 1962,
    tonic: 5, mode: 'major', bpb: 4, style: 'bossa', bpm: 130,
    sections: [
      { name: 'A', bars: ['Fmaj7', 'Fmaj7', 'G7', 'G7', 'Gm7', 'Gb7', 'Fmaj7', 'Gb7'] },
      { name: 'A', bars: ['Fmaj7', 'Fmaj7', 'G7', 'G7', 'Gm7', 'Gb7', 'Fmaj7', 'Fmaj7'] },
      { name: 'B', bars: ['Gbmaj7', 'Gbmaj7', 'B7', 'B7', 'F#m7', 'F#m7', 'D7', 'D7',
                          'Gm7', 'Gm7', 'Eb7', 'Eb7', 'Am7', 'D7b9', 'Gm7', 'C7b9'] },
      { name: 'A', bars: ['Fmaj7', 'Fmaj7', 'G7', 'G7', 'Gm7', 'Gb7', 'Fmaj7', 'Fmaj7'] },
    ],
  },

  {
    id: 'summertime',
    title: 'Summertime',
    composer: 'George Gershwin',
    year: 1935,
    tonic: 9, mode: 'minor', bpb: 4, style: 'ballad', bpm: 84,
    sections: [
      { name: 'A', bars: ['Am6', 'E7', 'Am6', 'A7', 'Dm7', 'Dm7', 'Bm7b5', 'E7',
                          'Am6', 'E7', 'Am6', 'D7', 'C6', 'Bm7b5 E7', 'Am6', 'Bm7b5 E7'] },
    ],
  },

  {
    id: 'all-of-me',
    title: 'All of Me',
    composer: 'Marks & Simons',
    year: 1931,
    tonic: 0, mode: 'major', bpb: 4, style: 'swing', bpm: 140,
    sections: [
      { name: 'A', bars: ['C6', 'C6', 'E7', 'E7', 'A7', 'A7', 'Dm7', 'Dm7'] },
      { name: 'B', bars: ['E7', 'E7', 'Am7', 'Am7', 'D7', 'D7', 'Dm7', 'G7'] },
      { name: 'A', bars: ['C6', 'C6', 'E7', 'E7', 'A7', 'A7', 'Dm7', 'Dm7'] },
      { name: 'C', bars: ['F6', 'Fm6', 'Em7 A7', 'Dm7 G7', 'C6', 'Ebdim7 Dm7', 'G7', 'C6'] },
    ],
  },

  {
    id: 'solar',
    title: 'Solar',
    composer: 'Miles Davis',
    year: 1954,
    tonic: 0, mode: 'minor', bpb: 4, style: 'swing', bpm: 152,
    sections: [
      { name: 'A', bars: ['CmMaj7', 'CmMaj7', 'Gm7', 'C7', 'Fmaj7', 'Fmaj7',
                          'Fm7', 'Bb7', 'Ebmaj7', 'Ebm7 Ab7', 'Dbmaj7', 'Dm7b5 G7'] },
    ],
  },

  {
    id: 'stella',
    title: 'Stella by Starlight',
    composer: 'Victor Young',
    year: 1944,
    tonic: 10, mode: 'major', bpb: 4, style: 'ballad', bpm: 108,
    sections: [
      { name: 'A', bars: ['Em7b5', 'A7b9', 'Cm7', 'F7', 'Fm7', 'Bb7', 'Ebmaj7', 'Ab7'] },
      { name: 'B', bars: ['Bbmaj7', 'Em7b5 A7b9', 'Dm7', 'Bbm7 Eb7',
                          'Fmaj7', 'Em7b5 A7b9', 'Am7b5', 'D7b9'] },
      { name: 'C', bars: ['G7', 'G7', 'Cm7', 'Cm7', 'Ab7', 'Ab7', 'Bbmaj7', 'Bbmaj7'] },
      { name: 'D', bars: ['Em7b5', 'A7b9', 'Dm7b5', 'G7b9', 'Cm7b5', 'F7b9', 'Bbmaj7', 'Bbmaj7'] },
    ],
  },

  {
    id: 'lady-bird',
    title: 'Lady Bird',
    composer: 'Tadd Dameron',
    year: 1947,
    tonic: 0, mode: 'major', bpb: 4, style: 'swing', bpm: 150,
    sections: [
      { name: 'A', bars: ['Cmaj7', 'Cmaj7', 'Fm7', 'Bb7', 'Cmaj7', 'Cmaj7', 'Bbm7', 'Eb7',
                          'Abmaj7', 'Abmaj7', 'Am7', 'D7', 'Dm7', 'G7',
                          'Cmaj7 Ebmaj7', 'Abmaj7 Dbmaj7'] },
    ],
  },

  {
    id: 'tune-up',
    title: 'Tune Up',
    composer: 'Miles Davis',
    year: 1953,
    tonic: 2, mode: 'major', bpb: 4, style: 'swing', bpm: 160,
    sections: [
      { name: 'A', bars: ['Em7', 'A7', 'Dmaj7', 'Dmaj7', 'Dm7', 'G7', 'Cmaj7', 'Cmaj7',
                          'Cm7', 'F7', 'Bbmaj7', 'Bbmaj7', 'Em7', 'F7', 'Bbmaj7', 'A7'] },
    ],
  },

  {
    id: 'i-got-rhythm',
    title: 'I Got Rhythm (rhythm changes)',
    composer: 'George Gershwin',
    year: 1930,
    tonic: 10, mode: 'major', bpb: 4, style: 'swing', bpm: 168,
    sections: [
      { name: 'A', bars: ['Bb6 G7', 'Cm7 F7', 'Dm7 G7', 'Cm7 F7',
                          'Fm7 Bb7', 'Eb6 Ebm6', 'Dm7 G7', 'Cm7 F7'] },
      { name: 'A', bars: ['Bb6 G7', 'Cm7 F7', 'Dm7 G7', 'Cm7 F7',
                          'Fm7 Bb7', 'Eb6 Ebm6', 'Cm7 F7', 'Bb6'] },
      { name: 'B', bars: ['D7', 'D7', 'G7', 'G7', 'C7', 'C7', 'F7', 'F7'] },
      { name: 'A', bars: ['Bb6 G7', 'Cm7 F7', 'Dm7 G7', 'Cm7 F7',
                          'Fm7 Bb7', 'Eb6 Ebm6', 'Cm7 F7', 'Bb6'] },
    ],
  },

  {
    id: 'f-blues',
    title: 'Jazz Blues in F',
    composer: 'common changes',
    year: '',
    tonic: 5, mode: 'major', bpb: 4, style: 'swing', bpm: 132,
    sections: [
      { name: 'A', bars: ['F7', 'Bb7', 'F7', 'Cm7 F7', 'Bb7', 'Bdim7',
                          'F7', 'Am7 D7', 'Gm7', 'C7', 'F7 D7', 'Gm7 C7'] },
    ],
  },

  {
    id: 'c-minor-blues',
    title: 'Minor Blues in C',
    composer: 'common changes',
    year: '',
    tonic: 0, mode: 'minor', bpb: 4, style: 'swing', bpm: 120,
    sections: [
      { name: 'A', bars: ['Cm7', 'Fm7', 'Cm7', 'Cm7', 'Fm7', 'Fm7',
                          'Cm7', 'Cm7', 'Ab7', 'G7', 'Cm7', 'Dm7b5 G7'] },
    ],
  },

  {
    id: 'sweet-georgia-brown',
    title: 'Sweet Georgia Brown',
    composer: 'Bernie, Pinkard & Casey',
    year: 1925,
    tonic: 5, mode: 'major', bpb: 4, style: 'swing', bpm: 180,
    sections: [
      { name: 'A', bars: ['D7', 'D7', 'D7', 'D7', 'G7', 'G7', 'G7', 'G7',
                          'C7', 'C7', 'C7', 'C7', 'F6', 'F6', 'F6', 'F6'] },
      { name: 'B', bars: ['D7', 'D7', 'D7', 'D7', 'G7', 'G7', 'G7', 'G7',
                          'Dm', 'A7', 'Dm', 'A7', 'F6', 'D7', 'G7 C7', 'F6'] },
    ],
  },

  {
    id: 'cantaloupe-island',
    title: 'Cantaloupe Island',
    composer: 'Herbie Hancock',
    year: 1964,
    tonic: 5, mode: 'minor', bpb: 4, style: 'bossa', bpm: 112,
    sections: [
      { name: 'A', bars: ['Fm7', 'Fm7', 'Fm7', 'Fm7', 'Db7', 'Db7', 'Db7', 'Db7',
                          'Dm7', 'Dm7', 'Dm7', 'Dm7', 'Fm7', 'Fm7', 'Fm7', 'Fm7'] },
    ],
  },

];

export { SONGS };
