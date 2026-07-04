// standards.js — the jazz-standards practice room: a built-in lead-sheet
// library, a synth comper (swing / bossa / ballad / waltz with a count-in),
// transposition to any key, and two quizzes — transcribe the changes by ear
// (graded by sequence alignment) or echo a melody back on the keyboard.
// No video, no internet: the whole "iReal" loop lives in the synth.

import { pcName, useFlats, chordLabel, chordVoicing, midiName } from './theory.js';
import { parseChordSymbol, parseProgression, gradeProgression, alignSequences } from './reference.js';
import { playNoteAt, playChordAt, clickAt, audioNow, ensureCtx } from './audio.js';
import { onHeldChange } from './input.js';
import { SONGS as SONGS_CORE } from './standards-data.js';
import { SONGS_EXTRA } from './standards-data-extra.js';

const SONGS = [...SONGS_CORE, ...SONGS_EXTRA];

const $ = sel => document.querySelector(sel);
const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const st = {
  song: SONGS[0],
  bpm: SONGS[0].bpm,
  keyChoice: 'original',  // 'original' | 'random' | '0'…'11' (target tonic pc)
  transpose: 0,
  loop: false,
  lastMode: 'both',       // what a chart-bar click replays
  quiz: null,             // null | 'chords' | 'melody'
  revealed: false,
  // playback
  timer: null, t0: 0, spb: 0, events: null, evIdx: 0, startBar: 0, totalBeats: 0,
  // melody echo recording
  recording: false, recorded: [],
};
let onStartCb = null;
let prevHeld = new Set();

// ---------- parsing ----------

const NOTE_PC = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

function parseMelody(str) {
  const out = [];
  let beat = 0;
  for (const tok of str.trim().split(/\s+/)) {
    const [name, d] = tok.split(':');
    const dur = Number(d);
    if (name !== 'r') {
      const m = name.match(/^([A-Ga-g])([#b]?)(\d)$/);
      let pc = NOTE_PC[m[1].toLowerCase()];
      if (m[2] === '#') pc++;
      if (m[2] === 'b') pc--;
      out.push({ beat, midi: (Number(m[3]) + 1) * 12 + pc, dur });
    }
    beat += dur;
  }
  return out;
}

// flatten a song into [{ section, chords: [{root, quality, beat, dur}] }]
function flatBars(song) {
  const out = [];
  for (const sec of song.sections) {
    sec.bars.forEach((barStr, i) => {
      const toks = barStr.trim().split(/\s+/);
      const dur = song.bpb / toks.length;
      const chords = toks.map((tk, j) => {
        const c = parseChordSymbol(tk);
        return { root: c.root, quality: c.quality ?? '', beat: j * dur, dur };
      });
      out.push({ section: i === 0 ? sec.name : '', chords });
    });
  }
  return out;
}

// ---------- key & display helpers ----------

const targetTonic = () => (st.song.tonic + st.transpose) % 12;
const dispFlats = () => useFlats(targetTonic(), st.song.mode);
// melodies & bass transpose down past the tritone so nothing jumps register
const noteShift = () => (st.transpose > 6 ? st.transpose - 12 : st.transpose);

function keyLabel() {
  if (st.quiz && st.keyChoice === 'random' && !st.revealed) return '?';
  return pcName(targetTonic(), dispFlats()) + (st.song.mode === 'minor' ? 'm' : '');
}

function rollTranspose() {
  if (st.keyChoice === 'original') st.transpose = 0;
  else if (st.keyChoice === 'random') st.transpose = Math.floor(Math.random() * 12);
  else st.transpose = ((Number(st.keyChoice) - st.song.tonic) + 12) % 12;
}

// ---------- comp patterns ----------

function addComp(events, style, s, len, rootPc, quality) {
  const comp = chordVoicing(rootPc, quality).slice(1); // synth bass covers the low root
  let b = 36 + rootPc;
  if (b > 43) b -= 12;
  const fifth = b + 7;
  const bass = (t, m, d = 0.95, v = 0.55) => events.push({ t, midi: m, dur: d, vel: v });
  const hit = (t, d, v = 0.3) => events.push({ t, chord: comp, dur: d, vel: v });

  if (style === 'ballad') {
    bass(s, b, len);
    hit(s, len * 0.95, 0.28);
    if (len >= 4) hit(s + 2, 1.8, 0.2);
  } else if (style === 'waltz') {
    bass(s, b, 1.2);
    hit(s + 1, 0.8, 0.26);
    hit(s + 2, 0.8, 0.24);
  } else if (style === 'bossa') {
    if (len >= 4) {
      bass(s, b, 1.4); bass(s + 1.5, fifth, 0.45, 0.45);
      bass(s + 2, b, 1.4); bass(s + 3.5, fifth, 0.45, 0.45);
      hit(s, 0.6, 0.26); hit(s + 1.5, 0.9, 0.3); hit(s + 3, 0.9, 0.26);
    } else {
      bass(s, b, 1.4); bass(s + 1.5, fifth, 0.45, 0.45);
      hit(s + 0.5, 1.1, 0.3);
    }
  } else { // swing
    for (let k = 0; k < Math.floor(len); k++) bass(s + k, k % 2 ? fifth : b, 0.9, 0.5);
    if (len >= 4) { hit(s + 1, 1.3, 0.3); hit(s + 2.5, 1.0, 0.24); }
    else hit(s + 0.5, 1.2, 0.3);
  }
}

function buildEvents(mode, startBar) {
  const song = st.song;
  const bars = flatBars(song);
  const events = [];
  if (mode !== 'melody') {
    bars.forEach((bar, bi) => {
      if (bi < startBar) return;
      const base = (bi - startBar) * song.bpb;
      for (const c of bar.chords) {
        addComp(events, song.style, base + c.beat, c.dur, (c.root + st.transpose) % 12, c.quality);
      }
    });
  }
  if (mode !== 'chords' && song.melody) {
    const shift = noteShift();
    const melVel = mode === 'melody' ? 0.85 : 0.8;
    for (const n of parseMelody(song.melody)) {
      if (Math.floor(n.beat / song.bpb) < startBar) continue;
      events.push({ t: n.beat - startBar * song.bpb, midi: n.midi + shift,
                    dur: n.dur * 0.92, vel: melVel, melody: true });
    }
  }
  events.sort((a, b) => a.t - b.t);
  return { events, totalBeats: (bars.length - startBar) * song.bpb };
}

// ---------- transport ----------

// swing: melody/comp offbeat eighths land on the back of a triplet
function swung(t) {
  if (st.song.style !== 'swing') return t;
  const frac = t % 1;
  return Math.abs(frac - 0.5) < 0.01 ? t + 1 / 6 : t;
}

function fire(ev) {
  const when = st.t0 + swung(ev.t) * st.spb;
  const dur = ev.dur * st.spb;
  if (ev.chord) playChordAt(ev.chord, when, dur, ev.vel);
  else playNoteAt(ev.midi, when, dur, ev.vel);
}

function stopPlayback() {
  if (st.timer) { clearInterval(st.timer); st.timer = null; }
  document.querySelectorAll('#std-chart .std-bar.playing')
    .forEach(el => el.classList.remove('playing'));
  $('#std-status').textContent = '';
  paintPlayButtons();
}

function startPlayback(mode, startBar = 0) {
  stopPlayback();
  ensureCtx();
  if (onStartCb) onStartCb();
  if (mode !== 'chords' && !st.song.melody) mode = 'chords';
  st.lastMode = mode;
  const { events, totalBeats } = buildEvents(mode, startBar);
  st.events = events; st.evIdx = 0; st.startBar = startBar; st.totalBeats = totalBeats;
  st.spb = 60 / st.bpm;
  const bpb = st.song.bpb;
  const countStart = audioNow() + 0.15;
  for (let i = 0; i < bpb; i++) clickAt(countStart + i * st.spb, i === 0);
  st.t0 = countStart + bpb * st.spb;

  const barEls = document.querySelectorAll('#std-chart .std-bar');
  const totalBars = flatBars(st.song).length;
  st.timer = setInterval(() => {
    const now = audioNow();
    while (st.evIdx < st.events.length && st.t0 + swung(st.events[st.evIdx].t) * st.spb < now + 0.4) {
      fire(st.events[st.evIdx]);
      st.evIdx++;
    }
    const beat = (now - st.t0) / st.spb;
    const bar = st.startBar + Math.floor(beat / bpb);
    barEls.forEach((el, i) => el.classList.toggle('playing', beat >= 0 && i === bar));
    $('#std-status').textContent = beat < 0
      ? 'count-in…'
      : `bar ${Math.min(bar + 1, totalBars)} / ${totalBars}`;
    if (st.evIdx >= st.events.length && beat > st.totalBeats + 1) {
      if (st.loop) startPlayback(mode, startBar);
      else stopPlayback();
    }
  }, 80);
  paintPlayButtons();
}

function paintPlayButtons() {
  const on = mode => !!st.timer && st.lastMode === mode;
  $('#std-play').classList.toggle('on', on('chords'));
  $('#std-melody-btn').classList.toggle('on', on('melody'));
  $('#std-both').classList.toggle('on', on('both'));
}

// ---------- chart ----------

function renderChart() {
  const el = $('#std-chart');
  el.innerHTML = '';
  const bars = flatBars(st.song);
  const hidden = st.quiz === 'chords' && !st.revealed;
  const f = dispFlats();
  bars.forEach((bar, i) => {
    const div = document.createElement('div');
    div.className = 'std-bar';
    if (bar.section) {
      div.style.gridColumnStart = '1';
      const sec = document.createElement('span');
      sec.className = 'sec';
      sec.textContent = bar.section;
      div.appendChild(sec);
    }
    for (const c of bar.chords) {
      const ch = document.createElement('span');
      ch.className = 'ch';
      ch.textContent = hidden ? '·' : chordLabel((c.root + st.transpose) % 12, c.quality, null, f);
      div.appendChild(ch);
    }
    div.title = `play from bar ${i + 1}`;
    div.addEventListener('click', () => startPlayback(st.lastMode, i));
    el.appendChild(div);
  });
}

function renderInfo() {
  const song = st.song;
  const bars = flatBars(song).length;
  const form = song.sections.length > 1 ? song.sections.map(s => s.name).join('') : `${bars} bars`;
  const meter = song.bpb === 3 ? '3/4 · ' : '';
  const bits = [
    `${bars} bars${song.sections.length > 1 ? ` · ${form}` : ''}`,
    `${meter}${song.style}`,
    `key ${keyLabel()}`,
    song.composer + (song.year ? `, ${song.year}` : ''),
  ];
  if (song.melody) bits.push(`melody: ${song.melodyNote || 'included'}`);
  else bits.push('melody: not included (copyrighted heads stay out — chords only, iReal-style)');
  $('#std-info').textContent = bits.join(' · ');
}

function renderAll() {
  renderInfo();
  renderChart();
  $('#std-melody-btn').disabled = !st.song.melody;
  $('#std-quiz-melody').disabled = !st.song.melody;
}

// ---------- quiz: chords ----------

function setQuiz(kind) {
  st.quiz = st.quiz === kind ? null : kind;
  st.revealed = false;
  stopEcho();
  if (st.quiz && st.keyChoice === 'random') rollTranspose();
  $('#std-answer').hidden = st.quiz !== 'chords';
  $('#std-melody-quiz').hidden = st.quiz !== 'melody';
  $('#std-quiz-chords').classList.toggle('on', st.quiz === 'chords');
  $('#std-quiz-melody').classList.toggle('on', st.quiz === 'melody');
  $('#std-reveal').style.display = st.quiz ? '' : 'none';
  $('#std-grade-result').innerHTML = '';
  $('#std-melody-result').innerHTML = '';
  $('#std-quiz-status').textContent =
    st.quiz === 'chords' ? 'listen, then type the changes you hear — the whole form, in the sounding key' :
    st.quiz === 'melody' ? 'listen, then record your echo on the keyboard' : '';
  renderAll();
}

function gradeChords() {
  const el = $('#std-grade-result');
  const user = parseProgression($('#std-answer-input').value);
  if (!user.length) {
    el.innerHTML = '<div class="grade-score">no chords recognized — try symbols like <b>Cm7 F7 | Bbmaj7</b></div>';
    return;
  }
  const f = dispFlats();
  const ref = flatBars(st.song).flatMap(bar => bar.chords.map(c => {
    const root = (c.root + st.transpose) % 12;
    return { root, quality: c.quality, raw: chordLabel(root, c.quality, null, f) };
  }));
  const g = gradeProgression(user, ref);
  const verdict = g.pct >= 90 ? 'nailed it' : g.pct >= 70 ? 'close' : g.pct >= 40 ? 'getting there' : 'keep listening';
  el.innerHTML = `<div class="grade-score"><b>${g.pct}%</b> — ${verdict}
    <span class="grade-legend">right root counts half · right root + family ¾ · reveal shows the chart</span></div>`;
  const row = document.createElement('div');
  row.className = 'grade-row';
  for (const p of g.pairs) {
    const d = document.createElement('div');
    d.className = 'grade-pair ' + (p.score >= 0.75 ? 'good' : p.score >= 0.5 ? 'partial' : 'bad');
    const refLbl = p.ref ? p.ref.raw : '·';
    const usrLbl = p.user ? (p.user.raw || '?') : 'missed';
    d.innerHTML = `<div class="g-ref">${st.revealed ? esc(refLbl) : '?'}</div>
                   <div class="g-usr">${esc(p.ref ? usrLbl : usrLbl + ' (extra)')}</div>`;
    row.appendChild(d);
  }
  el.appendChild(row);
}

// ---------- quiz: melody ----------

onHeldChange(notes => {
  const cur = new Set(notes);
  if (st.recording) {
    for (const n of cur) if (!prevHeld.has(n)) st.recorded.push(n);
    $('#std-echo-status').textContent = `${st.recorded.length} notes recorded…`;
  }
  prevHeld = cur;
});

function stopEcho() {
  st.recording = false;
  $('#std-echo').classList.remove('on');
  $('#std-echo').textContent = '● record my echo';
}

function toggleEcho() {
  if (st.recording) { stopEcho(); return; }
  st.recording = true;
  st.recorded = [];
  $('#std-echo').classList.add('on');
  $('#std-echo').textContent = '■ recording — play it back';
  $('#std-echo-status').textContent = 'play the melody on your keyboard…';
}

function gradeMelody() {
  stopEcho();
  const el = $('#std-melody-result');
  if (!st.recorded.length) {
    el.innerHTML = '<div class="grade-score">record an echo first — hit ● and play the line back.</div>';
    return;
  }
  const shift = noteShift();
  const ref = parseMelody(st.song.melody).map(n => n.midi + shift);
  const g = alignSequences(st.recorded, ref,
    (a, b) => a === b ? 1 : (((a - b) % 12 + 12) % 12 === 0 ? 0.75 : 0));
  const verdict = g.pct >= 90 ? 'nailed it' : g.pct >= 70 ? 'close' : g.pct >= 40 ? 'getting there' : 'keep listening';
  el.innerHTML = `<div class="grade-score"><b>${g.pct}%</b> — ${verdict}
    <span class="grade-legend">exact pitch 1 · right note wrong octave ¾</span></div>`;
  const f = dispFlats();
  const row = document.createElement('div');
  row.className = 'grade-row';
  for (const p of g.pairs) {
    const d = document.createElement('div');
    d.className = 'grade-pair ' + (p.score >= 0.75 ? 'good' : 'bad');
    const refLbl = p.ref != null ? (st.revealed ? midiName(p.ref, f) : '?') : '·';
    const usrLbl = p.user != null ? midiName(p.user, f) : 'missed';
    d.innerHTML = `<div class="g-ref">${esc(refLbl)}</div>
                   <div class="g-usr">${esc(p.ref != null ? usrLbl : usrLbl + ' (extra)')}</div>`;
    row.appendChild(d);
  }
  el.appendChild(row);
}

function reveal() {
  st.revealed = true;
  renderAll();
  if (st.quiz === 'melody' && st.song.melody) {
    const f = dispFlats();
    const shift = noteShift();
    $('#std-quiz-status').textContent = 'the line: ' +
      parseMelody(st.song.melody)
        .map(n => midiName(n.midi + shift, f) + (n.dur > 1.5 ? '—' : ''))
        .join(' ');
  }
  if (st.quiz === 'chords' && $('#std-answer-input').value.trim()) gradeChords();
}

// ---------- wiring ----------

function initStandards(opts = {}) {
  onStartCb = opts.onStart || null;

  const songSel = $('#std-song');
  const byTitle = (a, b) => a.title.localeCompare(b.title);
  const withMel = SONGS.filter(s => s.melody);
  const chordsOnly = SONGS.filter(s => !s.melody).sort(byTitle);
  const addGroup = (label, songs) => {
    const g = document.createElement('optgroup');
    g.label = label;
    for (const s of songs) {
      const o = document.createElement('option');
      o.value = s.id;
      o.textContent = s.title;
      g.appendChild(o);
    }
    songSel.appendChild(g);
  };
  addGroup('melody + chords (public domain & etudes)', withMel);
  addGroup('chords only (standards)', chordsOnly);

  const keySel = $('#std-key');
  const addKey = (v, label) => {
    const o = document.createElement('option');
    o.value = v; o.textContent = label;
    keySel.appendChild(o);
  };
  addKey('original', 'original key');
  addKey('random', 'random key');
  for (let pc = 0; pc < 12; pc++) {
    addKey(String(pc), `in ${pcName(pc, false)}${[1,3,6,8,10].includes(pc) ? '/' + pcName(pc, true) : ''}`);
  }

  const pickSong = id => {
    st.song = SONGS.find(s => s.id === id) || SONGS[0];
    st.bpm = st.song.bpm;
    $('#std-tempo').value = st.bpm;
    $('#std-bpm').textContent = `${st.bpm} bpm`;
    rollTranspose();
    stopPlayback();
    st.revealed = false;
    if (st.quiz === 'melody' && !st.song.melody) setQuiz('melody'); // toggles it off
    $('#std-grade-result').innerHTML = '';
    $('#std-melody-result').innerHTML = '';
    $('#std-answer-input').value = '';
    renderAll();
  };

  songSel.addEventListener('change', () => pickSong(songSel.value));
  keySel.addEventListener('change', () => {
    st.keyChoice = keySel.value;
    rollTranspose();
    stopPlayback();
    renderAll();
  });
  $('#std-tempo').addEventListener('input', e => {
    st.bpm = Number(e.target.value);
    $('#std-bpm').textContent = `${st.bpm} bpm`;
  });
  $('#std-play').addEventListener('click', () =>
    st.timer && st.lastMode === 'chords' ? stopPlayback() : startPlayback('chords'));
  $('#std-melody-btn').addEventListener('click', () =>
    st.timer && st.lastMode === 'melody' ? stopPlayback() : startPlayback('melody'));
  $('#std-both').addEventListener('click', () =>
    st.timer && st.lastMode === 'both' ? stopPlayback() : startPlayback('both'));
  $('#std-stop').addEventListener('click', stopPlayback);
  $('#std-loop').addEventListener('click', () => {
    st.loop = !st.loop;
    $('#std-loop').textContent = 'loop: ' + (st.loop ? 'on' : 'off');
    $('#std-loop').classList.toggle('on', st.loop);
  });
  $('#std-quiz-chords').addEventListener('click', () => setQuiz('chords'));
  $('#std-quiz-melody').addEventListener('click', () => setQuiz('melody'));
  $('#std-reveal').addEventListener('click', reveal);
  $('#std-grade').addEventListener('click', gradeChords);
  $('#std-echo').addEventListener('click', toggleEcho);
  $('#std-echo-done').addEventListener('click', gradeMelody);

  $('#std-reveal').style.display = 'none';
  pickSong(SONGS[0].id);
}

function stopStandards() {
  stopPlayback();
  stopEcho();
}

export { initStandards, stopStandards };
