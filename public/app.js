const STREAM_URL = 'https://d3d4yli4hf5bmh.cloudfront.net/hls/live.m3u8';
const METADATA_URL = 'https://d3d4yli4hf5bmh.cloudfront.net/metadatav2.json';
const COVER_URL = 'https://d3d4yli4hf5bmh.cloudfront.net/cover.jpg';

const audio = document.getElementById('audio');
const playBtn = document.getElementById('playBtn');
const statusEl = document.getElementById('status');
const volumeEl = document.getElementById('volume');
const muteBtn = document.getElementById('muteBtn');
const nowPlaying = document.getElementById('nowPlaying');

let isPlaying = false;

function setStatus(text) {
  statusEl.textContent = text;
}

function setLoading(loading) {
  nowPlaying.classList.toggle('is-loading', loading);
}

function setReady() {
  playBtn.disabled = false;
  setStatus('Ready to play');
}

function setupNativeHls() {
  audio.src = STREAM_URL;
  setReady();
}

function setupHlsJs() {
  const hls = new Hls({
    // Sit further behind the live edge and keep more audio buffered so
    // brief network dips don't stall playback.
    liveSyncDurationCount: 4,
    liveMaxLatencyDurationCount: 6,
    maxBufferLength: 30,
    backBufferLength: 30,
    fragLoadingMaxRetry: 6,
    manifestLoadingMaxRetry: 6,
    levelLoadingMaxRetry: 6,
  });
  hls.loadSource(STREAM_URL);
  hls.attachMedia(audio);

  // The manifest under-reports the FLAC bitrate (~140 kbps declared vs
  // ~700 kbps actual), so ABR never steps down from it. Track the AAC
  // level and fall back to it if FLAC stalls.
  let aacLevel = -1;
  let stalls = 0;
  hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
    aacLevel = data.levels.findIndex((l) => /mp4a/.test(l.audioCodec || l.attrs.CODECS || ''));
    setReady();
  });

  hls.on(Hls.Events.ERROR, (event, data) => {
    if (data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR) {
      stalls += 1;
      if (stalls >= 2 && aacLevel !== -1 && hls.currentLevel !== aacLevel) {
        hls.currentLevel = aacLevel;
        setStatus('Switched to AAC for smoother playback');
      }
    }
    if (!data.fatal) return;
    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
      setStatus('Reconnecting…');
      hls.startLoad();
    } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
      hls.recoverMediaError();
    } else {
      setLoading(false);
      setStatus('Stream error: ' + data.type);
    }
  });
}

// Prefer hls.js (MSE) for its buffering/recovery control; only use
// native HLS where MSE isn't available (e.g. iOS Safari).
if (window.Hls && Hls.isSupported()) {
  setupHlsJs();
} else if (audio.canPlayType('application/vnd.apple.mpegurl')) {
  setupNativeHls();
} else {
  setStatus('HLS playback is not supported in this browser.');
}

playBtn.addEventListener('click', () => {
  if (!isPlaying) {
    setLoading(true);
    audio.play().catch((err) => {
      setLoading(false);
      setStatus('Playback failed: ' + err.message);
    });
  } else {
    audio.pause();
  }
});

audio.addEventListener('playing', () => {
  isPlaying = true;
  setLoading(false);
  nowPlaying.classList.add('is-playing');
  playBtn.setAttribute('aria-label', 'Pause');
  setStatus('Playing live');
});

audio.addEventListener('pause', () => {
  isPlaying = false;
  setLoading(false);
  nowPlaying.classList.remove('is-playing');
  playBtn.setAttribute('aria-label', 'Play');
  setStatus('Paused');
});

audio.addEventListener('waiting', () => {
  setLoading(true);
  setStatus('Buffering…');
});

audio.addEventListener('error', () => {
  setLoading(false);
  setStatus('Playback error. Try again.');
});

// Volume
function renderVolume() {
  const level = audio.muted ? 0 : audio.volume;
  volumeEl.style.setProperty('--fill', level * 100 + '%');
  document.getElementById('volMuted').style.display = level === 0 ? '' : 'none';
  document.getElementById('volWave1').style.display = level > 0 ? '' : 'none';
  document.getElementById('volWave2').style.display = level > 0.5 ? '' : 'none';
  muteBtn.setAttribute('aria-label', audio.muted ? 'Unmute' : 'Mute');
}

volumeEl.addEventListener('input', () => {
  audio.volume = Number(volumeEl.value);
  audio.muted = audio.volume === 0;
  renderVolume();
});

muteBtn.addEventListener('click', () => {
  audio.muted = !audio.muted;
  if (!audio.muted && audio.volume === 0) {
    audio.volume = 0.5;
    volumeEl.value = 0.5;
  }
  volumeEl.value = audio.muted ? 0 : audio.volume;
  renderVolume();
});

renderVolume();

// Track metadata
const artistEl = document.getElementById('artist');
const titleEl = document.getElementById('title');
const albumEl = document.getElementById('album');
const coverImg = document.getElementById('coverImg');
const badgeEl = document.getElementById('badge');
const historyEl = document.getElementById('history');
let currentTrackKey = null;

coverImg.addEventListener('load', () => coverImg.classList.remove('loading'));
coverImg.addEventListener('error', () => coverImg.classList.add('loading'));

function formatQuality(meta) {
  if (!meta.bit_depth || !meta.sample_rate) return '—';
  return `${meta.bit_depth}-bit ${meta.sample_rate / 1000}kHz`;
}

function renderHistory(meta) {
  historyEl.replaceChildren();
  for (let i = 1; i <= 5; i++) {
    const artist = meta[`prev_artist_${i}`];
    const title = meta[`prev_title_${i}`];
    if (!artist && !title) continue;
    const li = document.createElement('li');
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = i;
    const text = document.createElement('span');
    const a = document.createElement('span');
    a.className = 'artist';
    a.textContent = artist;
    const t = document.createElement('span');
    t.className = 'title';
    t.textContent = title;
    text.append(a, ' — ', t);
    li.append(num, text);
    historyEl.append(li);
  }
  if (!historyEl.children.length) {
    historyEl.innerHTML = '<li class="empty">No previous tracks yet.</li>';
  }
}

async function refreshMetadata() {
  try {
    const res = await fetch(METADATA_URL + '?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return;
    const meta = await res.json();

    const key = `${meta.artist}|${meta.title}`;
    if (key !== currentTrackKey) {
      currentTrackKey = key;
      artistEl.textContent = meta.artist || 'Radio Calico';
      titleEl.textContent = meta.title ? meta.title + (meta.date ? ` (${meta.date})` : '') : '';
      albumEl.textContent = meta.album || '';
      document.title = meta.title ? `${meta.artist} – ${meta.title} · Radio Calico` : 'Radio Calico';
      coverImg.classList.add('loading');
      coverImg.src = COVER_URL + '?t=' + Date.now();
    }

    badgeEl.hidden = !meta.is_new;
    document.getElementById('sourceQuality').textContent = formatQuality(meta);
    renderHistory(meta);
  } catch {
    // Metadata is best-effort; keep showing the last known track.
  }
}

refreshMetadata();
setInterval(refreshMetadata, 15000);
