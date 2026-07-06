// player.js — media wrapper with two backends behind one interface: the
// YouTube IFrame API (load by URL) and a local audio file (drop an mp3). The
// lab, solo room and transcription timeline all talk to this `api` object and
// don't care which is playing — so the app works even where YouTube is blocked.

let player = null;
let ready = false;
let currentVideoId = null;
let loop = { a: null, b: null, on: false };
let tickListeners = [];
let errorListeners = [];

// ---- local-audio backend ----
let mode = 'yt';           // 'yt' | 'local'
let audio = null;          // HTMLAudioElement, created on first local load
let localTitle = '';

function ensureAudio() {
  if (!audio) { audio = new Audio(); audio.preload = 'auto'; audio.controls = true; }
  return audio;
}

// current time / raw seek, resolved against whichever backend is active — the
// ticker and every api method route through these instead of touching a backend.
function curTime() {
  if (mode === 'local') return audio ? audio.currentTime : 0;
  return player && player.getCurrentTime ? player.getCurrentTime() : 0;
}
function seekRaw(t) {
  t = Math.max(0, t);
  if (mode === 'local') { if (audio) audio.currentTime = t; }
  else if (player) player.seekTo(t, true);
}

// load a local audio File (from a file input / drop). Switches to the local
// backend and reuses the whole transport + timeline unchanged.
async function loadLocal(file, onReadyCb) {
  ensureAudio();
  if (player && player.pauseVideo) { try { player.pauseVideo(); } catch (e) { /* ignore */ } }
  if (audio.src) URL.revokeObjectURL(audio.src);
  audio.src = URL.createObjectURL(file);
  audio.playbackRate = 1;
  localTitle = file.name.replace(/\.[^.]+$/, '');
  currentVideoId = 'local:' + localTitle;
  mode = 'local';
  ready = true;
  loop = { a: null, b: null, on: false };
  audio.load();
  startTicker();
  if (onReadyCb) onReadyCb(currentVideoId);
  return currentVideoId;
}

function onTick(fn) { tickListeners.push(fn); }
function onError(fn) { errorListeners.push(fn); }

// YouTube IFrame API error codes -> human explanation
const ERROR_MESSAGES = {
  2: 'invalid video id',
  5: 'this video can’t be played here',
  100: 'video not found or removed',
  101: 'the owner disabled embedding for this video',
  150: 'the owner disabled embedding for this video',
};

function loadApi() {
  return new Promise(resolve => {
    if (window.YT && window.YT.Player) return resolve();
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
    window.onYouTubeIframeAPIReady = resolve;
  });
}

function parseVideoId(input) {
  input = input.trim();
  if (/^[\w-]{11}$/.test(input)) return input;
  try {
    const u = new URL(input);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1, 12);
    if (u.searchParams.get('v')) return u.searchParams.get('v');
    const m = u.pathname.match(/\/(embed|shorts|live)\/([\w-]{11})/);
    if (m) return m[2];
  } catch (e) { /* not a URL */ }
  return null;
}

async function loadVideo(idOrUrl, onReadyCb) {
  const id = parseVideoId(idOrUrl);
  if (!id) return null;
  if (audio) { try { audio.pause(); } catch (e) { /* ignore */ } }
  mode = 'yt';
  currentVideoId = id;
  await loadApi();
  if (player) {
    player.loadVideoById(id);
    if (onReadyCb) onReadyCb(id);
  } else {
    ready = false;
    player = new YT.Player('yt-player', {
      videoId: id,
      playerVars: { rel: 0, playsinline: 1 },
      events: {
        onReady: () => { ready = true; startTicker(); if (onReadyCb) onReadyCb(id); },
        onError: e => {
          const msg = ERROR_MESSAGES[e.data] || `playback error (${e.data})`;
          errorListeners.forEach(fn => fn(msg));
        },
      },
    });
  }
  return id;
}

let tickerStarted = false;
function startTicker() {
  if (tickerStarted) return;
  tickerStarted = true;
  setInterval(() => {
    if (!ready) return;
    const t = curTime();
    if (loop.on && loop.a != null && loop.b != null && t > loop.b) {
      seekRaw(loop.a);
    }
    tickListeners.forEach(fn => fn(t));
  }, 100);
}

const api = {
  onTick,
  onError,
  loadVideo,
  loadLocal,
  get videoId() { return currentVideoId; },
  get isReady() { return ready; },
  get isLocal() { return mode === 'local'; },
  get mediaElement() { return ensureAudio(); },
  time() { return ready ? curTime() : 0; },
  duration() {
    if (mode === 'local') return audio && isFinite(audio.duration) ? audio.duration : 0;
    return ready && player.getDuration ? player.getDuration() : 0;
  },
  playing() {
    if (mode === 'local') return !!(audio && !audio.paused);
    return ready && player.getPlayerState && player.getPlayerState() === 1;
  },
  play() { if (!ready) return; if (mode === 'local') audio.play(); else player.playVideo(); },
  pause() { if (!ready) return; if (mode === 'local') audio.pause(); else player.pauseVideo(); },
  toggle() { this.playing() ? this.pause() : this.play(); },
  seek(t) { if (ready) seekRaw(t); },
  nudge(dt) { this.seek(this.time() + dt); },
  setRate(r) { if (!ready) return; if (mode === 'local') audio.playbackRate = r; else player.setPlaybackRate(r); },
  videoTitle() {
    if (mode === 'local') return localTitle;
    try { return player.getVideoData().title || ''; } catch (e) { return ''; }
  },
  setLoopA(t = this.time()) { loop.a = t; if (loop.b != null && loop.b <= t) loop.b = null; return loop; },
  setLoopB(t = this.time()) { loop.b = t; if (loop.a == null || loop.a >= t) loop.a = 0; return loop; },
  toggleLoop() { loop.on = !loop.on && loop.a != null && loop.b != null; return loop; },
  clearLoop() { loop = { a: null, b: null, on: false }; return loop; },
  loopSegment(a, b) { loop.a = a; loop.b = b; loop.on = true; this.seek(a); this.play(); return loop; },
  get loop() { return loop; },
};

export default api;
