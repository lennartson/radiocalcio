const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// public/app.js is a browser script with no exports, so run it in a sandbox
// with minimal stand-ins for the DOM, audio element, fetch and hls.js.
function loadPlayer({ metadata = {}, fetchOk = true, hlsSupported = true } = {}) {
  const elements = {};
  const makeEl = (id) => {
    const el = {
      id,
      textContent: '',
      innerHTML: '',
      hidden: false,
      disabled: false,
      value: '1',
      children: [],
      listeners: {},
      style: { setProperty() {} },
      classList: {
        set: new Set(),
        toggle(name, on) { on ? this.set.add(name) : this.set.delete(name); },
        add(name) { this.set.add(name); },
        remove(name) { this.set.delete(name); },
        contains(name) { return this.set.has(name); },
      },
      setAttribute(k, v) { this[k] = v; },
      addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
      replaceChildren() { this.children = []; },
      append(...nodes) { this.children.push(...nodes); },
      querySelector() { return null; },
    };
    elements[id] = el;
    return el;
  };

  const audio = makeEl('audio');
  makeEl('streamQuality');
  audio.canPlayType = () => '';
  audio.volume = 1;
  audio.muted = false;

  const hlsEvents = {};
  let hlsInstance = null;
  class FakeHls {
    constructor(config) {
      this.config = config;
      this.levels = [];
      this.currentLevel = -1;
      hlsInstance = this;
    }
    loadSource() {}
    attachMedia() {}
    on(event, fn) { (hlsEvents[event] ||= []).push(fn); }
    startLoad() {}
    recoverMediaError() {}
  }
  FakeHls.isSupported = () => hlsSupported;
  FakeHls.Events = {
    MANIFEST_PARSED: 'manifestParsed',
    LEVEL_SWITCHED: 'levelSwitched',
    ERROR: 'error',
  };
  FakeHls.ErrorTypes = { NETWORK_ERROR: 'net', MEDIA_ERROR: 'media' };
  FakeHls.ErrorDetails = { BUFFER_STALLED_ERROR: 'bufferStalledError' };

  const timers = [];
  const context = {
    Hls: FakeHls,
    window: {},
    document: {
      getElementById: (id) => elements[id] || makeEl(id),
      createElement: (tag) => makeEl(tag),
      title: '',
    },
    fetch: async () => ({
      ok: fetchOk,
      json: async () => metadata,
    }),
    setInterval: (fn, ms) => timers.push({ fn, ms }),
    console,
    Date,
    JSON,
    Number,
    Math,
    Promise,
    Set,
    Map,
  };
  context.window = context;
  context.audio = audio;

  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  vm.createContext(context);
  vm.runInContext(source, context);

  return {
    context,
    elements,
    audio,
    get hls() { return hlsInstance; },
    fire(event, data) { (hlsEvents[event] || []).forEach((fn) => fn(null, data)); },
    timers,
  };
}

test('stream URLs point at the CloudFront origin', () => {
  const { context } = loadPlayer();
  assert.match(vm.runInContext('STREAM_URL', context), /cloudfront\.net\/hls\/live\.m3u8$/);
  assert.match(vm.runInContext('METADATA_URL', context), /metadatav2\.json$/);
  assert.match(vm.runInContext('COVER_URL', context), /cover\.jpg$/);
});

test('formatQuality shows bit depth and sample rate, or a dash when missing', () => {
  const { context } = loadPlayer();
  const format = vm.runInContext('formatQuality', context);
  assert.equal(format({ bit_depth: 24, sample_rate: 48000 }), '24-bit 48kHz');
  assert.equal(format({ bit_depth: 16, sample_rate: 44100 }), '16-bit 44.1kHz');
  assert.equal(format({ bit_depth: 24 }), '—');
  assert.equal(format({}), '—');
});

test('refreshMetadata fills in the track and recent history', async () => {
  const metadata = {
    artist: 'Artist',
    title: 'Song',
    album: 'Album',
    date: '2020',
    bit_depth: 24,
    sample_rate: 48000,
    is_new: true,
    prev_artist_1: 'Prev A',
    prev_title_1: 'Prev T',
  };
  const player = loadPlayer({ metadata });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(player.elements.artist.textContent, 'Artist');
  assert.equal(player.elements.title.textContent, 'Song (2020)');
  assert.equal(player.elements.album.textContent, 'Album');
  assert.equal(player.elements.badge.hidden, false);
  assert.equal(player.elements.sourceQuality.textContent, '24-bit 48kHz');
  assert.equal(player.context.document.title, 'Artist – Song · Radio Calico');
  assert.equal(player.elements.history.children.length, 1);
});

test('refreshMetadata leaves the track text alone when the request fails', async () => {
  const player = loadPlayer({ fetchOk: false });
  player.elements.artist.textContent = 'Last Artist';
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(player.elements.artist.textContent, 'Last Artist');
});

test('metadata refresh is scheduled every 15 seconds', () => {
  const player = loadPlayer();
  assert.ok(player.timers.some((t) => t.ms === 15000));
});

test('hls.js is configured with the buffering settings', () => {
  const player = loadPlayer();
  assert.equal(player.hls.config.maxBufferLength, 30);
  assert.equal(player.hls.config.liveSyncDurationCount, 4);
});

test('LEVEL_SWITCHED to an AAC level shows AAC / HLS', () => {
  const player = loadPlayer();
  player.hls.levels = [
    { audioCodec: 'fLaC', attrs: {} },
    { audioCodec: 'mp4a.40.2', attrs: {} },
  ];
  player.fire('levelSwitched', { level: 1 });
  assert.equal(player.elements.streamQuality.textContent, 'AAC / HLS');
});

test('LEVEL_SWITCHED to a FLAC level shows the FLAC label', () => {
  const player = loadPlayer();
  player.hls.levels = [
    { audioCodec: 'fLaC', attrs: {} },
    { audioCodec: 'mp4a.40.2', attrs: {} },
  ];
  player.fire('levelSwitched', { level: 1 });
  player.fire('levelSwitched', { level: 0 });
  assert.equal(player.elements.streamQuality.textContent, '48kHz FLAC / HLS Lossless');
});

test('play button is enabled once the manifest is parsed', () => {
  const player = loadPlayer();
  player.fire('manifestParsed', { levels: [] });
  assert.equal(player.elements.playBtn.disabled, false);
  assert.equal(player.elements.status.textContent, 'Ready to play');
});

test('without MSE or native HLS the page reports it is unsupported', () => {
  const player = loadPlayer({ hlsSupported: false });
  assert.equal(player.elements.status.textContent, 'HLS playback is not supported in this browser.');
});

test('mute button toggles audio.muted and restores volume when unmuting', () => {
  const player = loadPlayer();
  const muteClick = player.elements.muteBtn.listeners.click[0];
  muteClick();
  assert.equal(player.audio.muted, true);
  muteClick();
  assert.equal(player.audio.muted, false);
});
