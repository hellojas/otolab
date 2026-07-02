// share.js — pack a transcription into a URL fragment and back.
// Lyrics are deliberately left out (too big for a URL; refetchable) — only
// their offset travels.

function encodeShare(d) {
  const json = JSON.stringify(d);
  return btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeShare(s) {
  try {
    const json = decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
    return JSON.parse(json);
  } catch (e) { return null; }
}

function packState({ videoId, key, chords, grid, lyricsOffset }) {
  return {
    v: videoId,
    k: [key.tonic, key.mode],
    g: grid || null,
    o: lyricsOffset || 0,
    c: chords.map(c => [Math.round(c.t * 100) / 100, c.root, c.quality, c.bass ?? null]),
  };
}

function unpackState(d) {
  if (!d || !d.v || !Array.isArray(d.c)) return null;
  return {
    videoId: String(d.v),
    key: { tonic: (Number(d.k?.[0]) || 0) % 12, mode: d.k?.[1] === 'minor' ? 'minor' : 'major' },
    grid: d.g && typeof d.g === 'object' ? d.g : null,
    lyricsOffset: Number(d.o) || 0,
    chords: d.c
      .map(([t, root, quality, bass]) => ({
        t: Number(t), root: Number(root),
        quality: typeof quality === 'string' ? quality : '',
        bass: bass == null ? Number(root) : Number(bass),
      }))
      .filter(c => Number.isFinite(c.t) && Number.isFinite(c.root))
      .sort((a, b) => a.t - b.t),
  };
}

export { encodeShare, decodeShare, packState, unpackState };
