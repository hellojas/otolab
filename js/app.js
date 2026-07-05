// app.js — glue: state, capture, timeline, palette, practice mode.

import {
  pcName, useFlats, detectChord, chordLabel, analyzeFunction, paletteForKey, guessKey,
  chordVoicing, voiceLeading,
} from './theory.js';
import { encodeShare, decodeShare, packState, unpackState } from './share.js';
import {
  onHeldChange, connectMidi, initComputerKeyboard, buildPiano, paintPiano,
} from './input.js';
import { playChord, ensureCtx, VOICES, setVoice, getVoice, setMasterVolume } from './audio.js';
import { fetchLyrics, parseTitle } from './lyrics.js';
import { parseProgression, gradeProgression } from './reference.js';
import { startListen, stopListen, isListening } from './listen.js';
import { initStandards, stopStandards } from './standards.js';
import { initDojo, stopDojo, stopDojoMic } from './dojo.js';
import { initSolo, soloLog, refreshSolo, stopSolo, stopSoloMic } from './solo.js';
import { record } from './progress.js';
import player from './player.js';

const $ = sel => document.querySelector(sel);

// Log a graded chord to the shared progress store under its function in the
// key — so real transcription in the lab feeds the same SRS/stats the dojo
// drills use. cat 'transcribe' keeps applied hearing separate from drilled.
function recordChord(root, quality, key, ok) {
  const a = analyzeFunction(root, quality, key);
  // namespace the id — the store keys on the bare id, and the dojo drills
  // record bare romans (e.g. 'ii7' for degrees); 'transcribe:ii7' keeps the
  // applied bucket from colliding with the drilled one.
  if (a && a.roman) record('transcribe', `transcribe:${a.roman}`, ok);
}

// Escape strings that reach innerHTML. Chord `quality` is trusted for live
// detection (it comes from our QUALITIES table) but arbitrary for imported
// JSON, so anything derived from chord data must be escaped before insertion.
const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const state = {
  key: { tonic: 0, mode: 'major' },
  chords: [],            // { t, root, quality, bass }
  solo: [],              // { t, midi } — transcribed single-line notes
  grid: null,            // { bpm, t0, bpb, snap } — beat grid for bar-aligned capture
  lyrics: null,          // { artist, track, synced: [{t,text}]|null, plain, offset }
  reference: '',         // pasted reference progression (raw text)
  playAlong: false,      // synth sounds each logged chord as the playhead crosses it
  alongVol: 0.45,        // play-along synth level, so it sits under the record
  practice: false,
  revealed: new Set(),   // indices revealed/answered in practice mode
  correct: 0,
  attempts: 0,
  quizIdx: null,         // segment currently being quizzed
  lastWrong: null,       // label of the last wrong guess on the current segment
};

let lastChord = null;    // last full detection (sticky after release)
let heldNow = [];

const flats = () => useFlats(state.key.tonic, state.key.mode);

// ---------- persistence ----------

const storeKey = id => `otolab:v1:${id}`;

function save() {
  if (!player.videoId) return;
  const data = { key: state.key, chords: state.chords, solo: state.solo, grid: state.grid,
                 lyrics: state.lyrics, reference: state.reference,
                 title: player.videoTitle() };
  localStorage.setItem(storeKey(player.videoId), JSON.stringify(data));
  const idx = JSON.parse(localStorage.getItem('otolab:v1:index') || '[]')
    .filter(e => e.id !== player.videoId);
  idx.unshift({ id: player.videoId, title: player.videoTitle() || player.videoId });
  localStorage.setItem('otolab:v1:index', JSON.stringify(idx.slice(0, 30)));
  renderRecent();
}

function loadSaved(id) {
  const raw = localStorage.getItem(storeKey(id));
  state.chords = []; state.solo = []; state.lyrics = null; state.reference = ''; state.grid = null;
  if (raw) {
    try {
      const data = JSON.parse(raw);
      state.key = data.key || state.key;
      state.chords = data.chords || [];
      state.solo = data.solo || [];
      state.grid = data.grid || null;
      state.lyrics = data.lyrics || null;
      state.reference = data.reference || '';
    } catch (e) { /* corrupted save — start clean */ }
  }
  applyPendingShare(id);
  $('#key-tonic').value = state.key.tonic;
  $('#key-mode').value = state.key.mode;
  syncLyricsControls();
  syncReferenceControls();
  resetQuiz();
  renderGrid();
  renderKeyDependent();
}

// ---------- detection display ----------

onHeldChange(notes => {
  heldNow = notes;
  paintPiano($('#piano'), notes);
  const det = detectChord(notes, flats());
  if (det) {
    $('#detected').textContent = det.label;
    if (det.kind === 'chord') {
      lastChord = { root: det.root, quality: det.quality, bass: det.bass };
      const a = analyzeFunction(det.root, det.quality, state.key);
      // flat-degree chords (bVI, bII…) read better spelled flat, even in sharp keys
      $('#detected').textContent =
        chordLabel(det.root, det.quality, det.bass, flats() || a.roman.startsWith('b'));
      $('#function-line').innerHTML =
        `<span class="roman tag-${a.tag}">${esc(a.roman)}</span> <span class="detail">${esc(a.detail)}</span>`;
      if (state.practice && state.quizIdx != null) checkQuizAnswer(det);
    } else {
      $('#function-line').textContent = '';
    }
  } else if (!lastChord) {
    $('#detected').textContent = '—';
    $('#function-line').textContent = '';
  }
});

// ---------- capture & timeline ----------

function captureChord(chord = lastChord) {
  if (!chord || !player.isReady) return;
  const t = snapT(player.time());
  state.chords.push({ t, root: chord.root, quality: chord.quality, bass: chord.bass });
  state.chords.sort((x, y) => x.t - y.t);
  save();
  renderChords();
}

function fmtTime(t) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function segmentBounds(i) {
  const a = state.chords[i].t;
  const b = i + 1 < state.chords.length ? state.chords[i + 1].t : a + 4;
  return [Math.max(0, a - 0.15), b];
}

// one-keypress loop around the chord under the playhead; spread=1 widens it
// to the previous and next chords' segments
function loopAroundCurrent(spread = 0) {
  if (!state.chords.length || !player.isReady) return;
  const t = player.time();
  let cur = -1;
  for (let i = 0; i < state.chords.length; i++) if (state.chords[i].t <= t) cur = i;
  if (cur < 0) cur = 0;
  const lo = Math.max(0, cur - spread);
  const hi = Math.min(state.chords.length - 1, cur + spread);
  player.loopSegment(segmentBounds(lo)[0], segmentBounds(hi)[1]);
  renderLoopStatus();
}

function renderTimeline() {
  const el = $('#timeline');
  el.innerHTML = '';
  if (!state.chords.length) {
    el.innerHTML = '<div class="empty">No chords logged yet — play what you hear, then press Enter to log it at the current time.</div>';
    return;
  }
  state.chords.forEach((c, i) => {
    // guide-tone motion from the previous chord, between the chips
    if (vlOn && !state.practice && i > 0) {
      const prev = state.chords[i - 1];
      if (prev.quality !== '?' && c.quality !== '?') {
        const f0 = flats();
        const vl = document.createElement('div');
        vl.className = 'vl';
        vl.title = 'guide-tone motion (3rds & 7ths)';
        for (const m of voiceLeading(prev, c)) {
          const d = document.createElement('div');
          if (m.d === 0) { d.className = 'common'; d.textContent = `${pcName(m.from, f0)} •`; }
          else d.textContent = `${pcName(m.from, f0)}→${pcName(m.to, f0)}`;
          vl.appendChild(d);
        }
        el.appendChild(vl);
      }
    }
    const chip = document.createElement('div');
    chip.className = 'chord-chip';
    const hidden = state.practice && !state.revealed.has(i);
    const a = analyzeFunction(c.root, c.quality, state.key);
    const f = flats() || a.roman.startsWith('b');
    chip.innerHTML = `
      <span class="time" title="${fmtTime(c.t)}">${fmtPos(c.t)}</span>
      <span class="name">${hidden ? '?' : esc(chordLabel(c.root, c.quality, c.bass, f))}</span>
      <span class="roman tag-${hidden ? 'hidden' : a.tag}">${hidden ? '' : esc(a.roman)}</span>
      ${state.practice ? '' : '<button class="del" title="delete">×</button>'}`;
    if (state.quizIdx === i) chip.classList.add('quizzing');
    if (state.practice && state.revealed.has(i)) chip.classList.add('revealed');
    chip.addEventListener('click', e => {
      if (e.target.classList.contains('del')) {
        state.chords.splice(i, 1);
        save(); renderChords();
        return;
      }
      if (state.practice) {
        state.quizIdx = i;
        state.lastWrong = null;
        const [a0, b0] = segmentBounds(i);
        player.loopSegment(a0, b0);
        renderTimeline();
      } else {
        player.seek(c.t);
        player.play();
      }
    });
    el.appendChild(chip);
  });
}

// ---------- practice mode ----------

function resetQuiz() {
  state.revealed = new Set();
  state.correct = 0;
  state.attempts = 0;
  state.quizIdx = null;
  state.lastWrong = null;
  renderScore();
}

function renderScore() {
  $('#quiz-score').textContent = state.practice
    ? `${state.correct} / ${state.attempts} correct` : '';
  $('#reveal-btn').style.display = state.practice && state.quizIdx != null ? '' : 'none';
}

function checkQuizAnswer(det) {
  const i = state.quizIdx;
  if (i == null || state.revealed.has(i)) return;
  const target = state.chords[i];
  const rootOk = det.root === target.root;
  const qualOk = det.quality === target.quality;
  if (rootOk && qualOk) {
    state.attempts++; state.correct++;
    state.revealed.add(i);
    recordChord(target.root, target.quality, state.key, true);
    flashResult(true);
    player.clearLoop();
    renderChords(); renderScore();
  } else if (heldNow.length >= 3) {
    // a full wrong chord counts as an attempt (held briefly is fine — only
    // count once per distinct guess); lastWrong resets per segment so the same
    // wrong chord recounts when you move on to another segment
    if (state.lastWrong !== det.label) {
      state.attempts++;
      state.lastWrong = det.label;
      recordChord(target.root, target.quality, state.key, false);
      flashResult(false);
      renderScore();
    }
  }
}

function revealCurrent() {
  if (state.quizIdx == null) return;
  const target = state.chords[state.quizIdx];
  if (target) recordChord(target.root, target.quality, state.key, false); // gave up = missed
  state.revealed.add(state.quizIdx);
  state.attempts++;
  player.clearLoop();
  renderChords(); renderScore();
}

function flashResult(ok) {
  const el = $('#detected');
  el.classList.remove('good', 'bad');
  void el.offsetWidth;
  el.classList.add(ok ? 'good' : 'bad');
}

// ---------- palette ----------

function renderPalette() {
  const pal = paletteForKey(state.key);
  const make = (list, container) => {
    container.innerHTML = '';
    for (const p of list) {
      const b = document.createElement('button');
      const f = flats() || p.roman.startsWith('b');
      b.className = `pal-chip tag-${p.tag}`;
      b.innerHTML = `<span class="roman">${p.roman}</span><span class="name">${chordLabel(p.root, p.quality, null, f)}</span>`;
      if (p.detail) b.title = p.detail;
      b.addEventListener('click', () => {
        const voicing = chordVoicing(p.root, p.quality);
        playChord(voicing);
        paintPiano($('#piano'), heldNow, voicing);
        setTimeout(() => paintPiano($('#piano'), heldNow), 900);
        lastChord = { root: p.root, quality: p.quality, bass: p.root };
        $('#detected').textContent = chordLabel(p.root, p.quality, null, f);
        const a = analyzeFunction(p.root, p.quality, state.key);
        $('#function-line').innerHTML =
          `<span class="roman tag-${a.tag}">${a.roman}</span> <span class="detail">${a.detail}</span>`;
      });
      container.appendChild(b);
    }
  };
  make(pal.diatonic, $('#palette-diatonic'));
  make(pal.outside, $('#palette-outside'));
}

function renderKeyDependent() {
  renderPalette();
  renderChords();
  renderScore();
}

function renderChords() {
  renderTimeline();
  renderLyrics();
  refreshSolo();
}

// ---------- recent videos ----------

function renderRecent() {
  const idx = JSON.parse(localStorage.getItem('otolab:v1:index') || '[]');
  const el = $('#recent');
  el.innerHTML = '';
  for (const e of idx.slice(0, 8)) {
    const a = document.createElement('button');
    a.className = 'recent-item';
    a.textContent = e.title || e.id;
    a.addEventListener('click', () => {
      $('#video-url').value = e.id;
      doLoad();
    });
    el.appendChild(a);
  }
}

// ---------- lyrics ----------

function syncLyricsControls() {
  $('#lyr-status').textContent = state.lyrics
    ? (state.lyrics.synced ? `synced — ${state.lyrics.artist} · ${state.lyrics.track}`
                           : `plain only — ${state.lyrics.artist} · ${state.lyrics.track}`)
    : '';
  $('#lyr-offset').value = state.lyrics?.offset || 0;
}

async function doFetchLyrics() {
  const artist = $('#lyr-artist').value.trim();
  const track = $('#lyr-track').value.trim();
  const st = $('#lyr-status');
  if (!artist && !track) { st.textContent = 'enter artist / track first'; return; }
  st.textContent = 'searching LRCLIB…';
  try {
    const r = await fetchLyrics(artist, track);
    if (!r) { st.textContent = 'no match on LRCLIB — tweak artist/track and retry'; return; }
    state.lyrics = { ...r, offset: state.lyrics?.offset || 0 };
    syncLyricsControls();
    if (!r.synced) st.textContent += ' (no timestamps — chords stay in the timeline)';
    save();
    renderLyrics();
  } catch (e) {
    st.textContent = 'fetch failed — ' + e.message;
  }
}

function renderLyrics() {
  const el = $('#lyrics');
  el.innerHTML = '';
  const ly = state.lyrics;
  if (!ly) {
    el.innerHTML = '<div class="empty">no lyrics yet — fill in artist / track and hit <b>grab lyrics</b>.</div>';
    return;
  }
  if (!ly.synced || !ly.synced.length) {
    const note = document.createElement('div');
    note.className = 'lyrics-note';
    note.textContent = 'plain lyrics only (no timestamps), so chords can’t be aligned over lines.';
    const body = document.createElement('div');
    body.className = 'lyrics-plain';
    body.textContent = ly.plain || '';
    el.append(note, body);
    return;
  }

  const off = Number(ly.offset) || 0;
  const lines = ly.synced.map(l => ({ t: l.t + off, text: l.text }));
  const rows = [];
  if (lines.length && lines[0].t > 0) rows.push({ t: 0, end: lines[0].t, text: '(intro)', instrumental: true });
  lines.forEach((l, i) => rows.push({ t: l.t, end: i + 1 < lines.length ? lines[i + 1].t : Infinity, text: l.text }));

  for (const row of rows) {
    const chords = [];
    state.chords.forEach((c, i) => { if (c.t >= row.t && c.t < row.end) chords.push({ c, i }); });
    if (!row.text && !chords.length) continue; // blank LRC section breaks
    if (row.instrumental && !chords.length) continue;

    const div = document.createElement('div');
    div.className = 'lyric-line' + (row.instrumental ? ' instrumental' : '');
    div.dataset.t = row.t;
    const dur = row.end === Infinity
      ? Math.max(4, (chords.length ? chords[chords.length - 1].c.t - row.t : 0) + 4)
      : row.end - row.t || 1;
    for (const { c, i } of chords) {
      const s = document.createElement('span');
      const hidden = state.practice && !state.revealed.has(i);
      const a = analyzeFunction(c.root, c.quality, state.key);
      const f = flats() || a.roman.startsWith('b');
      s.className = 'lyric-chord' + (hidden ? '' : ` tag-${a.tag}`);
      s.textContent = hidden ? '?' : chordLabel(c.root, c.quality, c.bass, f);
      s.style.left = `${Math.min(94, ((c.t - row.t) / dur) * 100)}%`;
      if (!state.practice) initChordDrag(s, div, c, i, row, dur);
      div.appendChild(s);
    }
    const txt = document.createElement('div');
    txt.className = 'txt';
    txt.textContent = row.text || ' ';
    div.appendChild(txt);
    div.addEventListener('click', () => { player.seek(row.t); player.play(); });
    el.appendChild(div);
  }
}

// drag a chord label along its lyric line to pin it to a word (rewrites the
// chord's timestamp within the line); a plain click previews the chord
function initChordDrag(span, line, chord, idx, row, dur) {
  span.addEventListener('click', ev => ev.stopPropagation()); // don't seek
  span.addEventListener('pointerdown', ev => {
    ev.preventDefault();
    ev.stopPropagation();
    const rect = line.getBoundingClientRect();
    const startX = ev.clientX;
    let frac = null;
    const move = mv => {
      if (frac === null && Math.abs(mv.clientX - startX) < 4) return;
      frac = Math.min(0.94, Math.max(0, (mv.clientX - rect.left) / rect.width));
      span.style.left = (frac * 100) + '%';
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (frac === null) { // click, not drag
        playChord(chordVoicing(chord.root, chord.quality), 1.0, 0.6);
        return;
      }
      state.chords[idx].t = row.t + frac * dur;
      state.chords.sort((x, y) => x.t - y.t);
      save();
      renderChords();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
}

function initLyrics() {
  $('#lyr-fetch').addEventListener('click', doFetchLyrics);
  for (const id of ['#lyr-artist', '#lyr-track']) {
    $(id).addEventListener('keydown', e => { if (e.key === 'Enter') doFetchLyrics(); });
  }
  $('#lyr-offset').addEventListener('change', e => {
    if (!state.lyrics) return;
    state.lyrics.offset = Number(e.target.value) || 0;
    save();
    renderLyrics();
  });
}

// ---------- check: reference chords, grading, audio suggestions ----------

let suggestions = []; // { t, root, quality, label } — session-only

function syncReferenceControls() {
  $('#ref-input').value = state.reference || '';
  $('#grade-result').innerHTML = '';
}

function doGrade() {
  const text = $('#ref-input').value.trim();
  state.reference = text;
  save();
  const el = $('#grade-result');
  const ref = parseProgression(text);
  if (!ref.length) { el.innerHTML = '<div class="grade-score">no chords recognized in the reference — try symbols like <b>Fmaj7 | Dm7 G7</b></div>'; return; }
  if (!state.chords.length) { el.innerHTML = '<div class="grade-score">log some chords first, then grade.</div>'; return; }
  const g = gradeProgression(state.chords, ref);
  // credit each reference chord you got (right root + family or better)
  for (const p of g.pairs) {
    if (p.ref) recordChord(p.ref.root, p.ref.quality, state.key, p.score >= 0.75);
  }
  el.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'grade-score';
  const verdict = g.pct >= 90 ? 'nailed it' : g.pct >= 70 ? 'close' : g.pct >= 40 ? 'getting there' : 'keep hunting';
  head.innerHTML = `<b>${g.pct}%</b> — ${g.total.toFixed(2).replace(/\.?0+$/, '')} / ${g.refCount} · ${verdict}
    <span class="grade-legend">right root counts half · right root + family ¾</span>`;
  el.appendChild(head);
  const row = document.createElement('div');
  row.className = 'grade-row';
  const f = flats();
  for (const p of g.pairs) {
    const d = document.createElement('div');
    d.className = 'grade-pair ' + (p.score >= 0.75 ? 'good' : p.score >= 0.5 ? 'partial' : 'bad');
    const refLbl = p.ref ? (p.ref.raw || chordLabel(p.ref.root, p.ref.quality, p.ref.bass, f)) : '·';
    const usrLbl = p.user ? chordLabel(p.user.root, p.user.quality, p.user.bass, f) : 'missed';
    d.innerHTML = `<div class="g-ref">${esc(refLbl)}</div><div class="g-usr">${esc(p.ref ? usrLbl : usrLbl + ' (extra)')}</div>`;
    if (p.user && p.user.t != null) {
      d.addEventListener('click', () => { player.seek(p.user.t); player.play(); });
    }
    row.appendChild(d);
  }
  el.appendChild(row);
}

function renderSuggestions() {
  const el = $('#suggestions');
  el.innerHTML = '';
  if (!suggestions.length) return;
  suggestions.forEach((s, i) => {
    const chip = document.createElement('div');
    chip.className = 'chord-chip suggestion';
    chip.innerHTML = `<span class="time">${fmtTime(s.t)}</span><span class="name">${esc(s.label)}</span><button class="del" title="discard">×</button>`;
    chip.addEventListener('click', e => {
      if (e.target.classList.contains('del')) { suggestions.splice(i, 1); renderSuggestions(); return; }
      player.seek(s.t); player.play();
    });
    el.appendChild(chip);
  });
  const use = document.createElement('button');
  use.className = 'use-ref';
  use.textContent = '→ use as reference';
  use.addEventListener('click', () => {
    $('#ref-input').value = suggestions.map(s => s.label).join(' ');
    state.reference = $('#ref-input').value;
    save();
  });
  const clear = document.createElement('button');
  clear.className = 'use-ref';
  clear.textContent = 'clear';
  clear.addEventListener('click', () => { suggestions = []; renderSuggestions(); });
  el.append(use, clear);
}

async function toggleListen() {
  const btn = $('#listen-btn'), st = $('#listen-status');
  if (isListening()) {
    stopListen();
    btn.classList.remove('on');
    st.textContent = suggestions.length ? `${suggestions.length} chords heard` : '';
    return;
  }
  try {
    await startListen(
      det => {
        const label = chordLabel(det.root, det.quality, null, flats());
        const last = suggestions[suggestions.length - 1];
        if (last && last.root === det.root && last.quality === det.quality) return;
        suggestions.push({ t: player.time(), root: det.root, quality: det.quality, label });
        st.textContent = `hearing ${label}`;
        renderSuggestions();
      },
      () => { btn.classList.remove('on'); st.textContent = 'capture ended'; },
    );
    btn.classList.add('on');
    st.textContent = 'listening — play the song (triads & 7ths, rough by design)';
  } catch (e) {
    st.textContent = e.message;
  }
}

function initCheck() {
  $('#grade-btn').addEventListener('click', doGrade);
  $('#listen-btn').addEventListener('click', toggleListen);
  $('#ref-input').addEventListener('change', () => {
    state.reference = $('#ref-input').value;
    save();
  });
}

// ---------- beat grid: tap tempo, bar-1 downbeat, snap-to-beat ----------

let taps = [];

const gridReady = () => !!(state.grid && state.grid.bpm && state.grid.t0 != null);

function tapTempo() {
  const now = performance.now();
  if (taps.length && now - taps[taps.length - 1] > 2500) taps = [];
  taps.push(now);
  if (taps.length < 4) {
    $('#grid-status').textContent = `${taps.length} tap${taps.length > 1 ? 's' : ''}… keep going`;
    return;
  }
  const iv = [];
  for (let i = Math.max(1, taps.length - 8); i < taps.length; i++) iv.push(taps[i] - taps[i - 1]);
  const bpm = Math.round(60000 / (iv.reduce((a, b) => a + b, 0) / iv.length));
  state.grid = { t0: null, bpb: 4, snap: false, ...(state.grid || {}), bpm };
  save();
  renderGrid();
}

function setDownbeat() {
  if (!player.isReady) return;
  state.grid = { bpm: null, bpb: 4, snap: false, ...(state.grid || {}), t0: player.time() };
  save();
  renderGrid();
}

function beatLen() { return 60 / state.grid.bpm; }

function snapT(t) {
  if (!gridReady() || !state.grid.snap) return t;
  return state.grid.t0 + Math.round((t - state.grid.t0) / beatLen()) * beatLen();
}

// bar·beat position when the grid is set, otherwise m:ss
function fmtPos(t) {
  if (!gridReady()) return fmtTime(t);
  const beats = Math.round((t - state.grid.t0) / beatLen());
  const bar = Math.floor(beats / state.grid.bpb) + 1;
  const beat = ((beats % state.grid.bpb) + state.grid.bpb) % state.grid.bpb + 1;
  return `${bar}·${beat}`;
}

function renderGrid() {
  const g = state.grid;
  $('#grid-status').textContent = g && g.bpm
    ? `≈${g.bpm} bpm${g.t0 != null ? ` · bar 1 @ ${fmtTime(g.t0)}` : ' — hit set 1 on the downbeat'}`
    : '';
  $('#snap-toggle').textContent = 'snap: ' + (g && g.snap ? 'on' : 'off');
  $('#snap-toggle').classList.toggle('on', !!(g && g.snap));
  if (g && g.bpb) $('#bpb').value = g.bpb;
  $('#snap-all').style.display = gridReady() ? '' : 'none';
}

function initGrid() {
  $('#tap-tempo').addEventListener('click', tapTempo);
  $('#set-one').addEventListener('click', setDownbeat);
  $('#bpb').addEventListener('change', e => {
    state.grid = { bpm: null, t0: null, snap: false, ...(state.grid || {}), bpb: Number(e.target.value) };
    save(); renderGrid(); renderChords();
  });
  $('#snap-toggle').addEventListener('click', () => {
    state.grid = { bpm: null, t0: null, bpb: 4, ...(state.grid || {}) };
    state.grid.snap = !state.grid.snap;
    save(); renderGrid();
  });
  $('#snap-all').addEventListener('click', () => {
    if (!gridReady()) return;
    const spb = beatLen();
    state.chords.forEach(c => { c.t = state.grid.t0 + Math.round((c.t - state.grid.t0) / spb) * spb; });
    state.chords.sort((x, y) => x.t - y.t);
    save(); renderChords();
  });
}

// ---------- voice-leading hints ----------

let vlOn = localStorage.getItem('otolab:v1:vl') === '1';

function initVoiceLeading() {
  const btn = $('#vl-toggle');
  const paint = () => {
    btn.textContent = 'voice leading: ' + (vlOn ? 'on' : 'off');
    btn.classList.toggle('on', vlOn);
  };
  paint();
  btn.addEventListener('click', () => {
    vlOn = !vlOn;
    localStorage.setItem('otolab:v1:vl', vlOn ? '1' : '0');
    paint();
    renderChords();
  });
}

// ---------- share links ----------

let pendingShare = null; // decoded payload from a #s= link, applied on load

function applyPendingShare(id) {
  if (!pendingShare || pendingShare.videoId !== id) return;
  const p = pendingShare;
  pendingShare = null;
  const hasLocal = state.chords.length > 0;
  if (hasLocal && !confirm('This link carries a transcription for this video — replace your local copy?')) return;
  state.key = p.key;
  state.chords = p.chords;
  state.grid = p.grid;
  if (state.lyrics) state.lyrics.offset = p.lyricsOffset;
  save();
}

function initShare() {
  $('#share-btn').addEventListener('click', async () => {
    if (!player.videoId || !state.chords.length) {
      $('#midi-status').textContent = 'load a video and log some chords first, then share';
      return;
    }
    const url = location.origin + location.pathname + '#s=' + encodeShare(packState({
      videoId: player.videoId, key: state.key, chords: state.chords,
      grid: state.grid, lyricsOffset: state.lyrics?.offset || 0,
    }));
    try {
      await navigator.clipboard.writeText(url);
      const btn = $('#share-btn');
      btn.textContent = 'copied!';
      setTimeout(() => { btn.textContent = 'share link'; }, 1500);
    } catch (e) {
      window.prompt('copy the share link:', url);
    }
  });
  const m = location.hash.match(/^#s=([A-Za-z0-9_-]+)/);
  if (m) {
    pendingShare = unpackState(decodeShare(m[1]));
    history.replaceState(null, '', location.pathname + location.search);
    if (pendingShare) {
      $('#video-url').value = pendingShare.videoId;
      doLoad();
    }
  }
}

// ---------- lab / dojo mode ----------

function initMode() {
  const btns = document.querySelectorAll('.mode-toggle button');
  const set = m => {
    document.body.dataset.mode = m;
    localStorage.setItem('otolab:v1:mode', m);
    btns.forEach(b => b.classList.toggle('on', b.dataset.mode === m));
    if (m === 'dojo') { player.pause?.(); stopSolo(); stopSoloMic(); }
    else { stopDojo(); stopDojoMic(); }
  };
  btns.forEach(b => b.addEventListener('click', () => set(b.dataset.mode)));
  set(localStorage.getItem('otolab:v1:mode') === 'dojo' ? 'dojo' : 'lab');
}

// ---------- themes ----------

const THEMES = ['yoru', 'sumi', 'washi', 'kissa'];

function setTheme(name) {
  document.body.dataset.theme = name;
  localStorage.setItem('otolab:v1:theme', name);
  document.querySelectorAll('.theme-dot').forEach(d =>
    d.classList.toggle('on', d.dataset.theme === name));
}

function initTheme() {
  const saved = localStorage.getItem('otolab:v1:theme');
  setTheme(THEMES.includes(saved) ? saved : 'washi');
  document.querySelectorAll('.theme-dot').forEach(d =>
    d.addEventListener('click', () => setTheme(d.dataset.theme)));
}

// ---------- settings: synth voice & volume ----------

function initSettings() {
  const btn = $('#settings-btn');
  const panel = $('#settings-panel');
  const sel = $('#voice-select');
  const vol = $('#synth-vol');

  for (const v of VOICES) {
    const opt = document.createElement('option');
    opt.value = v.id;
    opt.textContent = v.label;
    sel.appendChild(opt);
  }
  const savedVoice = localStorage.getItem('otolab:v1:voice');
  if (savedVoice) setVoice(savedVoice); // ignored if unknown
  sel.value = getVoice();

  const savedVol = Number(localStorage.getItem('otolab:v1:synthvol'));
  if (savedVol >= 10 && savedVol <= 100) vol.value = savedVol;
  setMasterVolume(Number(vol.value) / 100);

  const preview = () => {
    ensureCtx();
    playChord(chordVoicing(0, 'maj7'), 1.3, 0.7);
  };
  sel.addEventListener('change', () => {
    setVoice(sel.value);
    localStorage.setItem('otolab:v1:voice', sel.value);
    preview(); // hear the new voice right away
  });
  vol.addEventListener('input', () => {
    setMasterVolume(Number(vol.value) / 100);
    localStorage.setItem('otolab:v1:synthvol', vol.value);
  });
  $('#voice-preview').addEventListener('click', preview);

  btn.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    btn.classList.toggle('on', !panel.hidden);
  });
  document.addEventListener('click', e => {
    if (panel.hidden || panel.contains(e.target) || btn.contains(e.target)) return;
    panel.hidden = true;
    btn.classList.remove('on');
  });
}

// ---------- progress drawer (reachable in both lab & dojo) ----------
function initProgressDrawer() {
  const btn = $('#progress-btn');
  const drawer = $('#progress-drawer');
  const backdrop = $('#progress-backdrop');
  const open = () => {
    drawer.hidden = false;
    backdrop.hidden = false;
    btn.classList.add('on');
    // #stats-refresh is wired by initDojo to renderStats(); reuse it so the
    // drawer always shows a freshly computed picture.
    $('#stats-refresh')?.click();
  };
  const close = () => {
    drawer.hidden = true;
    backdrop.hidden = true;
    btn.classList.remove('on');
  };
  btn.addEventListener('click', () => (drawer.hidden ? open() : close()));
  $('#progress-close').addEventListener('click', close);
  backdrop.addEventListener('click', close);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !drawer.hidden) close(); });
}

// ---------- transport & wiring ----------

function showVideoError(msg) {
  const el = $('#video-error');
  el.textContent = msg ? `⚠ ${msg}` : '';
  el.classList.toggle('shown', !!msg);
}

async function doLoad() {
  const val = $('#video-url').value;
  ensureCtx();
  showVideoError('');
  const id = await player.loadVideo(val, () => {
    setTimeout(() => {
      save(); // pick up the title once metadata arrives
      const g = parseTitle(player.videoTitle());
      if (!$('#lyr-artist').value) $('#lyr-artist').value = g.artist;
      if (!$('#lyr-track').value) $('#lyr-track').value = g.track;
    }, 1500);
  });
  if (!id) { showVideoError('couldn’t parse a YouTube link or video id'); return; }
  loadSaved(id);
}

// ---------- hearing the progression back ----------

let progTimer = null; // non-null while "play progression" is running

function stopProgression() {
  if (progTimer) { clearTimeout(progTimer); progTimer = null; }
  $('#play-prog').classList.remove('on');
}

function playProgression() {
  if (progTimer) { stopProgression(); return; }
  if (!state.chords.length || state.practice) return;
  ensureCtx();
  $('#play-prog').classList.add('on');
  let i = 0;
  const step = () => {
    if (i >= state.chords.length) { stopProgression(); return; }
    const c = state.chords[i];
    playChord(chordVoicing(c.root, c.quality), 1.1, 0.6);
    document.querySelectorAll('#timeline .chord-chip').forEach((el, j) =>
      el.classList.toggle('playing', j === i));
    i++;
    progTimer = setTimeout(step, 1200);
  };
  step();
}

function renderLoopStatus() {
  const l = player.loop;
  const parts = [];
  if (l.a != null) parts.push('A ' + fmtTime(l.a));
  if (l.b != null) parts.push('B ' + fmtTime(l.b));
  $('#loop-status').textContent = parts.join(' → ') + (l.on ? ' ⟳' : '');
  $('#loop-toggle').classList.toggle('on', l.on);
}

function initTransport() {
  $('#load-btn').addEventListener('click', doLoad);
  $('#video-url').addEventListener('keydown', e => { if (e.key === 'Enter') doLoad(); });
  $('#speed').addEventListener('change', e => player.setRate(Number(e.target.value)));
  $('#back5').addEventListener('click', () => player.nudge(-5));
  $('#fwd5').addEventListener('click', () => player.nudge(5));
  $('#playpause').addEventListener('click', () => player.toggle());
  $('#loop-a').addEventListener('click', () => { player.setLoopA(); renderLoopStatus(); });
  $('#loop-b').addEventListener('click', () => { player.setLoopB(); renderLoopStatus(); });
  $('#loop-toggle').addEventListener('click', () => { player.toggleLoop(); renderLoopStatus(); });
  $('#loop-clear').addEventListener('click', () => { player.clearLoop(); renderLoopStatus(); });

  let lastAlongIdx = -1;
  let lastNowLine = null;
  player.onTick(t => {
    $('#time-display').textContent = `${fmtTime(t)} / ${fmtTime(player.duration())}`;
    // highlight the chord under the playhead
    let cur = -1;
    for (let i = 0; i < state.chords.length; i++) if (state.chords[i].t <= t) cur = i;
    if (!progTimer) {
      document.querySelectorAll('#timeline .chord-chip').forEach((el, i) =>
        el.classList.toggle('playing', i === cur));
    }
    // play-along: sound the logged chord when the playhead enters its segment
    // (off in practice mode — it would give the answer away)
    if (cur !== lastAlongIdx) {
      if (state.playAlong && !state.practice && player.playing() && cur >= 0) {
        const c = state.chords[cur];
        const end = cur + 1 < state.chords.length ? state.chords[cur + 1].t : t + 2;
        playChord(chordVoicing(c.root, c.quality), Math.min(Math.max(end - t, 0.5), 2.5), state.alongVol);
      }
      lastAlongIdx = cur;
    }
    // follow the lyrics
    const rows = document.querySelectorAll('#lyrics .lyric-line');
    let now = null;
    rows.forEach(r => { if (Number(r.dataset.t) <= t) now = r; });
    rows.forEach(r => r.classList.toggle('now', r === now));
    if (now && now !== lastNowLine && player.playing()) {
      now.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      lastNowLine = now;
    }
  });
}

function initKeyControls() {
  const tonicSel = $('#key-tonic');
  for (let pc = 0; pc < 12; pc++) {
    const opt = document.createElement('option');
    opt.value = pc;
    opt.textContent = `${pcName(pc, false)}${[1,3,6,8,10].includes(pc) ? ' / ' + pcName(pc, true) : ''}`;
    tonicSel.appendChild(opt);
  }
  tonicSel.value = state.key.tonic;
  const onChange = () => {
    state.key = { tonic: Number(tonicSel.value), mode: $('#key-mode').value };
    save();
    renderKeyDependent();
  };
  tonicSel.addEventListener('change', onChange);
  $('#key-mode').addEventListener('change', onChange);
  $('#guess-key').addEventListener('click', () => {
    const g = guessKey(state.chords);
    if (!g) return;
    state.key = { tonic: g.tonic, mode: g.mode };
    tonicSel.value = g.tonic;
    $('#key-mode').value = g.mode;
    save();
    renderKeyDependent();
  });
}

function initShortcuts() {
  window.addEventListener('keydown', e => {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    switch (e.key) {
      case ' ':          e.preventDefault(); player.toggle(); break;
      case 'ArrowLeft':  e.preventDefault(); player.nudge(-5); break;
      case 'ArrowRight': e.preventDefault(); player.nudge(5); break;
      case 'Enter':      e.preventDefault(); captureChord(); break;
      case '[':          player.setLoopA(); renderLoopStatus(); break;
      case ']':          player.setLoopB(); renderLoopStatus(); break;
      case '\\':         player.toggleLoop(); renderLoopStatus(); break;
      case '.':          loopAroundCurrent(0); break;
      case ',':          loopAroundCurrent(1); break;
      case 'b':          tapTempo(); break;
      case 'n':          soloLog(); break;
    }
  });
}

function initImportExport() {
  $('#export-btn').addEventListener('click', () => {
    const data = { videoId: player.videoId, title: player.videoTitle(),
                   key: state.key, chords: state.chords, solo: state.solo, grid: state.grid,
                   lyrics: state.lyrics, reference: state.reference };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `otolab-${player.videoId || 'untitled'}.json`;
    a.click();
  });
  $('#import-input').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const data = JSON.parse(await file.text());
    state.key = data.key || state.key;
    state.chords = data.chords || [];
    state.solo = data.solo || [];
    state.grid = data.grid || state.grid;
    state.lyrics = data.lyrics || state.lyrics;
    state.reference = data.reference || state.reference;
    renderGrid();
    syncLyricsControls();
    syncReferenceControls();
    $('#key-tonic').value = state.key.tonic;
    $('#key-mode').value = state.key.mode;
    if (data.videoId) { $('#video-url').value = data.videoId; doLoad(); }
    save();
    renderKeyDependent();
  });
}

function init() {
  initTheme();
  initSettings();
  initProgressDrawer();
  buildPiano($('#piano'));
  initComputerKeyboard(oct => { $('#kb-octave').textContent = `C${oct}`; });
  initTransport();
  initKeyControls();
  initShortcuts();
  initImportExport();
  initLyrics();
  initCheck();
  initGrid();
  initVoiceLeading();
  initShare();
  initSolo({
    getKey: () => state.key,
    getChords: () => state.chords,
    getNotes: () => state.solo,
    setNotes: arr => { state.solo = arr; save(); },
    onStart: () => { stopProgression(); },
  });
  initStandards({
    onStart: () => {
      stopProgression();
      stopDojo();
      stopSolo();
    },
  });
  initDojo({
    onStart: () => {
      stopProgression();
      stopStandards();
      stopSolo();
    },
    stopStandards,
  });
  initMode();
  player.onError(showVideoError);
  renderRecent();
  renderGrid();
  renderKeyDependent();

  $('#midi-btn').addEventListener('click', () => {
    ensureCtx();
    connectMidi($('#midi-status'));
  });
  $('#capture-btn').addEventListener('click', () => captureChord());
  $('#reveal-btn').addEventListener('click', revealCurrent);
  $('#play-prog').addEventListener('click', playProgression);
  $('#play-along').addEventListener('click', () => {
    state.playAlong = !state.playAlong;
    ensureCtx();
    $('#play-along').classList.toggle('on', state.playAlong);
    $('#play-along').textContent = state.playAlong ? 'play along: on' : 'play along: off';
  });
  const savedVol = Number(localStorage.getItem('otolab:v1:alongvol'));
  if (savedVol >= 5 && savedVol <= 100) state.alongVol = savedVol / 100;
  $('#along-vol').value = Math.round(state.alongVol * 100);
  $('#along-vol').addEventListener('input', e => {
    state.alongVol = Number(e.target.value) / 100;
    localStorage.setItem('otolab:v1:alongvol', e.target.value);
  });
  $('#practice-toggle').addEventListener('click', () => {
    state.practice = !state.practice;
    if (state.practice) { stopProgression(); }
    $('#practice-toggle').classList.toggle('on', state.practice);
    $('#practice-toggle').textContent = state.practice ? 'quiz: on' : 'quiz: off';
    resetQuiz();
    renderChords(); renderScore();
  });
}

init();
