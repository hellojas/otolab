// app.js — glue: state, capture, timeline, palette, practice mode.

import {
  pcName, useFlats, detectChord, chordLabel, analyzeFunction, paletteForKey, guessKey,
} from './theory.js';
import {
  onHeldChange, connectMidi, initComputerKeyboard, buildPiano, paintPiano,
} from './input.js';
import { playChord, ensureCtx } from './audio.js';
import player from './player.js';

const $ = sel => document.querySelector(sel);

const state = {
  key: { tonic: 0, mode: 'major' },
  chords: [],            // { t, root, quality, bass }
  practice: false,
  revealed: new Set(),   // indices revealed/answered in practice mode
  correct: 0,
  attempts: 0,
  quizIdx: null,         // segment currently being quizzed
};

let lastChord = null;    // last full detection (sticky after release)
let heldNow = [];

const flats = () => useFlats(state.key.tonic, state.key.mode);

// ---------- persistence ----------

const storeKey = id => `otolab:v1:${id}`;

function save() {
  if (!player.videoId) return;
  const data = { key: state.key, chords: state.chords, title: player.videoTitle() };
  localStorage.setItem(storeKey(player.videoId), JSON.stringify(data));
  const idx = JSON.parse(localStorage.getItem('otolab:v1:index') || '[]')
    .filter(e => e.id !== player.videoId);
  idx.unshift({ id: player.videoId, title: player.videoTitle() || player.videoId });
  localStorage.setItem('otolab:v1:index', JSON.stringify(idx.slice(0, 30)));
  renderRecent();
}

function loadSaved(id) {
  const raw = localStorage.getItem(storeKey(id));
  if (!raw) { state.chords = []; renderTimeline(); return; }
  try {
    const data = JSON.parse(raw);
    state.key = data.key || state.key;
    state.chords = data.chords || [];
    $('#key-tonic').value = state.key.tonic;
    $('#key-mode').value = state.key.mode;
  } catch (e) { state.chords = []; }
  resetQuiz();
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
        `<span class="roman tag-${a.tag}">${a.roman}</span> <span class="detail">${a.detail}</span>`;
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
  const t = player.time();
  state.chords.push({ t, root: chord.root, quality: chord.quality, bass: chord.bass });
  state.chords.sort((x, y) => x.t - y.t);
  save();
  renderTimeline();
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

function renderTimeline() {
  const el = $('#timeline');
  el.innerHTML = '';
  if (!state.chords.length) {
    el.innerHTML = '<div class="empty">No chords logged yet — play what you hear, then press Enter to log it at the current time.</div>';
    return;
  }
  state.chords.forEach((c, i) => {
    const chip = document.createElement('div');
    chip.className = 'chord-chip';
    const hidden = state.practice && !state.revealed.has(i);
    const a = analyzeFunction(c.root, c.quality, state.key);
    const f = flats() || a.roman.startsWith('b');
    chip.innerHTML = `
      <span class="time">${fmtTime(c.t)}</span>
      <span class="name">${hidden ? '?' : chordLabel(c.root, c.quality, c.bass, f)}</span>
      <span class="roman tag-${hidden ? 'hidden' : a.tag}">${hidden ? '' : a.roman}</span>
      ${state.practice ? '' : '<button class="del" title="delete">×</button>'}`;
    if (state.quizIdx === i) chip.classList.add('quizzing');
    if (state.practice && state.revealed.has(i)) chip.classList.add('revealed');
    chip.addEventListener('click', e => {
      if (e.target.classList.contains('del')) {
        state.chords.splice(i, 1);
        save(); renderTimeline();
        return;
      }
      if (state.practice) {
        state.quizIdx = i;
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
    flashResult(true);
    player.clearLoop();
    renderTimeline(); renderScore();
  } else if (heldNow.length >= 3) {
    // a full wrong chord counts as an attempt (held briefly is fine — only
    // count once per distinct guess)
    if (!checkQuizAnswer._lastWrong || checkQuizAnswer._lastWrong !== det.label) {
      state.attempts++;
      checkQuizAnswer._lastWrong = det.label;
      flashResult(false);
      renderScore();
    }
  }
}

function revealCurrent() {
  if (state.quizIdx == null) return;
  state.revealed.add(state.quizIdx);
  state.attempts++;
  player.clearLoop();
  renderTimeline(); renderScore();
}

function flashResult(ok) {
  const el = $('#detected');
  el.classList.remove('good', 'bad');
  void el.offsetWidth;
  el.classList.add(ok ? 'good' : 'bad');
}

// ---------- palette ----------

function chordVoicing(root, quality) {
  // root position around middle C, bass root an octave down
  const sig = {
    '': [0,4,7], m: [0,3,7], dim: [0,3,6], aug: [0,4,8], sus2: [0,2,7], sus4: [0,5,7],
    '7': [0,4,7,10], maj7: [0,4,7,11], m7: [0,3,7,10], m7b5: [0,3,6,10], dim7: [0,3,6,9],
    '6': [0,4,7,9], m6: [0,3,7,9], mMaj7: [0,3,7,11], '7sus4': [0,5,7,10],
    '9': [0,4,7,10,14], maj9: [0,4,7,11,14], m9: [0,3,7,10,14],
  }[quality] || [0,4,7];
  const r = 60 + ((root % 12) + 12) % 12;
  const anchor = r > 66 ? r - 12 : r;
  return [anchor - 12, ...sig.map(iv => anchor + iv)];
}

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
  renderTimeline();
  renderScore();
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

// ---------- transport & wiring ----------

function doLoad() {
  const val = $('#video-url').value;
  ensureCtx();
  player.loadVideo(val, id => {
    loadSaved(id);
    setTimeout(save, 1500); // pick up the title once metadata arrives
  });
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

  player.onTick(t => {
    $('#time-display').textContent = `${fmtTime(t)} / ${fmtTime(player.duration())}`;
    // highlight the chord under the playhead
    let cur = -1;
    for (let i = 0; i < state.chords.length; i++) if (state.chords[i].t <= t) cur = i;
    document.querySelectorAll('#timeline .chord-chip').forEach((el, i) =>
      el.classList.toggle('playing', i === cur));
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
    }
  });
}

function initImportExport() {
  $('#export-btn').addEventListener('click', () => {
    const data = { videoId: player.videoId, title: player.videoTitle(),
                   key: state.key, chords: state.chords };
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
    $('#key-tonic').value = state.key.tonic;
    $('#key-mode').value = state.key.mode;
    if (data.videoId) { $('#video-url').value = data.videoId; doLoad(); }
    save();
    renderKeyDependent();
  });
}

function init() {
  initTheme();
  buildPiano($('#piano'));
  initComputerKeyboard(oct => { $('#kb-octave').textContent = `C${oct}`; });
  initTransport();
  initKeyControls();
  initShortcuts();
  initImportExport();
  renderRecent();
  renderKeyDependent();

  $('#midi-btn').addEventListener('click', () => {
    ensureCtx();
    connectMidi($('#midi-status'));
  });
  $('#capture-btn').addEventListener('click', () => captureChord());
  $('#reveal-btn').addEventListener('click', revealCurrent);
  $('#practice-toggle').addEventListener('click', () => {
    state.practice = !state.practice;
    $('#practice-toggle').classList.toggle('on', state.practice);
    $('#practice-toggle').textContent = state.practice ? 'practice: on' : 'practice: off';
    resetQuiz();
    renderTimeline(); renderScore();
  });
}

init();
