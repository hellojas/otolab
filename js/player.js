// player.js — YouTube IFrame wrapper: load by URL, speed, seek, A/B loop.

let player = null;
let ready = false;
let currentVideoId = null;
let loop = { a: null, b: null, on: false };
let tickListeners = [];

function onTick(fn) { tickListeners.push(fn); }

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
  currentVideoId = id;
  await loadApi();
  if (player) {
    player.loadVideoById(id);
    if (onReadyCb) onReadyCb(id);
  } else {
    player = new YT.Player('yt-player', {
      videoId: id,
      playerVars: { rel: 0, playsinline: 1 },
      events: {
        onReady: () => { ready = true; startTicker(); if (onReadyCb) onReadyCb(id); },
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
    const t = player.getCurrentTime ? player.getCurrentTime() : 0;
    if (loop.on && loop.a != null && loop.b != null && t > loop.b) {
      player.seekTo(loop.a, true);
    }
    tickListeners.forEach(fn => fn(t));
  }, 100);
}

const api = {
  onTick,
  loadVideo,
  get videoId() { return currentVideoId; },
  get isReady() { return ready; },
  time() { return ready && player.getCurrentTime ? player.getCurrentTime() : 0; },
  duration() { return ready && player.getDuration ? player.getDuration() : 0; },
  playing() { return ready && player.getPlayerState && player.getPlayerState() === 1; },
  play() { if (ready) player.playVideo(); },
  pause() { if (ready) player.pauseVideo(); },
  toggle() { this.playing() ? this.pause() : this.play(); },
  seek(t) { if (ready) player.seekTo(Math.max(0, t), true); },
  nudge(dt) { this.seek(this.time() + dt); },
  setRate(r) { if (ready) player.setPlaybackRate(r); },
  videoTitle() {
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
