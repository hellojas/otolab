// repertoire.js — the tune-study track. Jazz is learned one tune at a time, so
// this is a curated, ordered set of standards, each walked through the five
// steps a musician actually uses to own a tune: hear the form, transcribe the
// changes, learn the melody, comp the voicings, solo over it. Each step just
// launches the right existing surface (the standards room, the voicing drill)
// scoped to that tune; progress is ticked and saved so a tune is a project you
// return to. Nothing here re-implements a drill — it sequences them.

const KEY = 'otolab:v1:repertoire';

// Ordered easy → hard, referencing ids in the standards library (standards-data*.js).
const TUNES = [
  { id: 'f-blues',        why: 'the 12-bar blues — the form everything else is built on' },
  { id: 'blue-bossa',     why: 'a short minor tune with one modulation — gentle changes' },
  { id: 'autumn-leaves',  why: 'the definitive major/relative-minor ii–V–I workout' },
  { id: 'so-what',        why: 'modal AABA — two chords, all ears, no functional crutch' },
  { id: 'all-of-me',      why: 'clear major function with secondary dominants' },
  { id: 'a-train',        why: 'AABA with the signature ♯11 — hear the color' },
  { id: 'fly-me',         why: 'circle-of-fifths ii–Vs, one per bar' },
  { id: 'satin-doll',     why: 'ii–V chains and a key you have to hold' },
  { id: 'i-got-rhythm',   why: 'rhythm changes — the other form every player must own' },
  { id: 'all-the-things', why: 'the key-center marathon — modulates through four keys' },
  { id: 'stella',         why: 'advanced: half-diminished ii–Vs and a wandering form' },
];

const STEPS = [
  { key: 'form',    label: 'Hear the form',        note: 'comp it and count the sections (AABA? 12-bar? how many bars?)', mode: 'play' },
  { key: 'changes', label: 'Transcribe the changes', note: 'hide the chart and name the changes by ear',                     mode: 'chords' },
  { key: 'melody',  label: 'Learn the melody',       note: 'echo the head back phrase by phrase',                            mode: 'melody' },
  { key: 'comp',    label: 'Comp the voicings',      note: 'build shells / rootless voicings for its chords',                mode: 'voicing' },
  { key: 'solo',    label: 'Solo over it',           note: 'play the changes and improvise a chorus',                       mode: 'play' },
];

let deps = null; // { tuneById, isActive }

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
}
let done = load();
function persist() { localStorage.setItem(KEY, JSON.stringify(done)); }

const tuneDone = id => STEPS.filter(s => done[id] && done[id][s.key]).length;
const setStep = (id, step, on) => {
  (done[id] || (done[id] = {}))[step] = on;
  persist();
};

// launch a study step: drive the standards room (or the voicing drill) to this
// tune, the same way the curriculum's runAssignment drives a drill.
function launchStep(tune, step) {
  if (step.mode === 'voicing') {
    document.querySelector('#dojo-tabs button[data-tab="voicing"]')?.click();
    document.getElementById('vc-new')?.click();
  } else {
    document.querySelector('#dojo-tabs button[data-tab="standards"]')?.click();
    const sel = document.getElementById('std-song');
    if (sel) { sel.value = tune.id; sel.dispatchEvent(new Event('change')); }
    setTimeout(() => {
      if (step.mode === 'chords') document.getElementById('std-quiz-chords')?.click();
      else if (step.mode === 'melody') document.getElementById('std-quiz-melody')?.click();
      else document.getElementById('std-both')?.click();
    }, 70);
  }
  document.querySelector('.dojo-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function renderRepertoire() {
  const box = document.getElementById('repertoire-body');
  if (!box) return;
  box.innerHTML = '';
  // the current tune = the first not fully done; expand it, collapse the rest
  const currentIdx = TUNES.findIndex(t => tuneDone(t.id) < STEPS.length);

  TUNES.forEach((tune, i) => {
    const meta = deps.tuneById(tune.id);
    const title = meta ? meta.title : tune.id;
    const n = tuneDone(tune.id);
    const complete = n === STEPS.length;

    const card = el('div', 'rep-tune' + (complete ? ' done' : ''));
    const head = el('button', 'rep-tune-head');
    head.innerHTML =
      `<span class="rep-tune-n">${complete ? '✓' : i + 1}</span>`
      + `<span class="rep-tune-title">${title}</span>`
      + `<span class="rep-tune-why">${tune.why}</span>`
      + `<span class="rep-tune-prog">${n}/${STEPS.length}</span>`;
    card.appendChild(head);

    const body = el('div', 'rep-steps');
    if (i !== currentIdx) body.hidden = true; // only the current tune open by default
    head.onclick = () => { body.hidden = !body.hidden; };

    for (const step of STEPS) {
      const isDone = !!(done[tune.id] && done[tune.id][step.key]);
      const row = el('div', 'rep-step' + (isDone ? ' done' : ''));
      const chk = document.createElement('input');
      chk.type = 'checkbox'; chk.checked = isDone;
      chk.onchange = () => { setStep(tune.id, step.key, chk.checked); renderRepertoire(); };
      const lab = el('label', 'rep-step-lab');
      lab.appendChild(chk);
      lab.appendChild(el('span', 'rep-step-title', step.label));
      lab.appendChild(el('span', 'rep-step-note', step.note));
      row.appendChild(lab);
      const go = el('button', 'rep-step-go', 'practise →');
      go.onclick = () => launchStep(tune, step);
      row.appendChild(go);
      body.appendChild(row);
    }
    card.appendChild(body);
    box.appendChild(card);
  });
}

function initRepertoire(d) {
  deps = d;
  renderRepertoire();
}

export { initRepertoire, renderRepertoire };
