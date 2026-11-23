import { MUSIC_RATE } from "./music-score.js";

const CROSSFADE = 2.5;
export function musicTheme(layer, night) {
  return layer === "sky" ? "sky" : night ? "night" : "day";
}

export function createMusic(context, settings) {
  const master = context.createGain();
  master.connect(context.destination);
  const buffers = new Map();
  const requested = new Set();
  const tracks = new Map();
  const offsets = new Map();
  let worker;
  let theme;
  let paused = false;
  let parked = false;
  let workerFailed = false;

  function stop(name) {
    const track = tracks.get(name);
    if (!track) return;
    clearTimeout(track.timer);
    offsets.set(name, (track.offset + context.currentTime - track.started) % track.source.buffer.duration);
    tracks.delete(name);
    try { track.source.stop(); } catch { /* Source already stopped. */ }
    track.source.disconnect();
    track.gain.disconnect();
  }

  function failWorker() {
    workerFailed = true;
    worker?.terminate();
    worker = undefined;
    requested.clear();
  }

  function request(name) {
    if (workerFailed || requested.has(name)) return;
    try {
      if (!worker) {
        worker = new Worker(new URL("./music-worker.js", import.meta.url), { type: "module" });
        worker.onmessage = ({ data: { theme: key, samples } }) => {
          requested.delete(key);
          try {
            const buffer = context.createBuffer(1, samples.length, MUSIC_RATE);
            buffer.getChannelData(0).set(samples);
            buffers.set(key, buffer);
            reconcile();
            if (buffers.size === 3) {
              worker?.terminate();
              worker = undefined;
            }
          } catch { failWorker(); }
        };
        worker.onerror = failWorker;
      }
      requested.add(name);
      worker.postMessage(name);
    } catch { failWorker(); }
  }

  function fade(name, track, level, duration) {
    if (track.level === level) return;
    const time = context.currentTime;
    clearTimeout(track.timer);
    const elapsed = Math.min(1, Math.max(0, (time - track.at) / track.duration));
    const current = track.from + (track.level - track.from) * elapsed;
    track.gain.gain.cancelScheduledValues(time);
    track.gain.gain.setValueAtTime(current, time);
    track.gain.gain.linearRampToValueAtTime(level, time + duration);
    Object.assign(track, { at: time, from: current, level, duration });
    if (!level) {
      function finish() {
        if (context.state !== "running") return;
        const remaining = track.at + track.duration - context.currentTime;
        if (remaining > .025) track.timer = setTimeout(finish, remaining * 1000 + 30);
        else stop(name);
      }
      track.timer = setTimeout(finish, duration * 1000 + 45);
    }
  }

  function reconcile() {
    master.gain.value = settings.enabled && !paused ? settings.volume * .72 : 0;
    if (!settings.enabled || paused) {
      for (const name of tracks.keys()) stop(name);
      return;
    }
    if (!theme || parked || context.state !== "running" || document.hidden) return;
    if (!buffers.has(theme)) {
      request(theme);
      return;
    }
    let track = tracks.get(theme);
    const duration = tracks.size ? CROSSFADE : .8;
    if (!track) {
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffers.get(theme);
      source.loop = true;
      gain.gain.value = 0;
      source.connect(gain).connect(master);
      const now = context.currentTime;
      const offset = offsets.get(theme) ?? 0;
      source.start(now, offset);
      track = { source, gain, offset, started: now, from: 0, level: 0, at: now, duration };
      tracks.set(theme, track);
    }
    for (const [name, active] of tracks) fade(name, active, name === theme ? 1 : 0, duration);
  }

  function update() {
    try { reconcile(); } catch { /* Music failures must not interrupt the game. */ }
  }

  return {
    update,
    setTheme(value) {
      if (theme === value) return;
      theme = value;
      update();
    },
    pause(value) {
      if (paused === value) return;
      paused = value;
      update();
    },
    resume() {
      parked = false;
      update();
    },
    park() {
      parked = true;
      for (const name of tracks.keys()) stop(name);
    },
  };
}
