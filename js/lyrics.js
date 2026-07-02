// lyrics.js — fetch lyrics from LRCLIB (lrclib.net, free & CORS-open) and
// parse LRC timestamps so chords can be aligned over the lines.

const API = 'https://lrclib.net/api';

// "[01:23.45] some words" → { t: 83.45, text: 'some words' }
// A line may carry several timestamps (repeated choruses).
function parseLrc(lrc) {
  const lines = [];
  for (const raw of lrc.split('\n')) {
    const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    if (!stamps.length) continue;
    const text = raw.replace(/\[\d+:\d+(?:\.\d+)?\]/g, '').trim();
    for (const m of stamps) lines.push({ t: Number(m[1]) * 60 + Number(m[2]), text });
  }
  return lines.sort((a, b) => a.t - b.t);
}

// best-effort split of a YouTube title into artist / track
function parseTitle(title) {
  const t = (title || '')
    .replace(/[([][^)\]]*(official|lyric|audio|video|visuali[sz]er|remaster|live|hd|4k|mv)[^)\]]*[)\]]/gi, '')
    .replace(/[([][^)\]]*[)\]]\s*$/g, '')
    .replace(/official (music )?video|official audio/gi, '')
    .trim();
  const parts = t.split(/\s+[-–—|]\s+/).filter(Boolean);
  if (parts.length >= 2) return { artist: parts[0].trim(), track: parts.slice(1).join(' ').trim() };
  return { artist: '', track: t };
}

// returns { artist, track, synced: [{t,text}]|null, plain: string|null } or null
async function fetchLyrics(artist, track) {
  const q = [artist, track].filter(Boolean).join(' ');
  const res = await fetch(`${API}/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error(`LRCLIB responded ${res.status}`);
  const hits = await res.json();
  if (!Array.isArray(hits) || !hits.length) return null;
  const best = hits.find(h => h.syncedLyrics) || hits[0];
  return {
    artist: best.artistName || artist,
    track: best.trackName || track,
    synced: best.syncedLyrics ? parseLrc(best.syncedLyrics) : null,
    plain: best.plainLyrics || null,
  };
}

export { fetchLyrics, parseTitle, parseLrc };
