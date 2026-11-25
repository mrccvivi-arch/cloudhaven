// All game sounds share one lazily unlocked mixer.
const effects = {
  pickup: [680, 920, .18, .046],
  click: [590, 480, .085, .036],
  affection: [650, 790, .29, .052],
  teleport: [470, 710, .38, .043],
  jump: [310, 540, .23, .065],
  magic: [330, 660, .85, .11],
  extinguish: [465, 230, .37, .072],
};
const runePitches = [440, 523.25, 587.33, 659.25, 783.99, 880];

export function createAudio(settings) {
  let context;
  let master;
  let noise;
  const voices = new Set();
  let lookoutPlayback;

  function release(voice) {
    voices.delete(voice);
    voice.source.onended = null;
    voice.source.disconnect();
    voice.filter?.disconnect();
    voice.gain.disconnect();
  }

  function ready() {
    return settings.enabled && !document.hidden && context?.state === "running";
  }

  function halt(channel) {
    for (const voice of voices) {
      if (channel && voice.channel !== channel) continue;
      try { voice.source.stop(); } catch { /* Already ended. */ }
      release(voice);
    }
  }

  function update() {
    if (master) master.gain.value = settings.enabled ? settings.volume * .65 : 0;
    if (!settings.enabled) {
      stopLookout();
      halt();
    }
  }

  async function activate() {
    if (!settings.enabled || document.hidden) return false;
    try {
      if (!context) {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) return false;
        context = new Audio();
        master = context.createGain();
        master.connect(context.destination);
        update();
      }
      if (context.state !== "running") await context.resume();
      return ready();
    } catch {
      return false;
    }
  }

  function playVoice(channel, duration, peak, makeSource, attack = .022, delay = 0) {
    if (!ready() || (channel !== "lookout" && voices.size >= 12)) return;
    let voice;
    try {
      const time = context.currentTime + delay;
      const gain = context.createGain();
      const { source, filter } = makeSource(time);
      voice = { source, filter, gain, channel };
      gain.gain.setValueAtTime(.0001, time);
      gain.gain.exponentialRampToValueAtTime(peak, time + attack);
      gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
      source.connect(filter ?? gain);
      if (filter) filter.connect(gain);
      gain.connect(master);
      source.onended = () => release(voice);
      source.start(time);
      source.stop(time + duration + .01);
      voices.add(voice);
    } catch {
      if (voice) release(voice);
    }
  }

  function tone(channel, from, to, duration, peak, delay) {
    playVoice(channel, duration, peak, (time) => {
      const source = context.createOscillator();
      source.frequency.setValueAtTime(from, time);
      source.frequency.exponentialRampToValueAtTime(to, time + duration);
      return { source };
    }, .022, delay);
  }

  function air(channel, duration, peak, frequency, attack) {
    playVoice(channel, duration, peak, () => {
      if (!noise) {
        noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
        const data = noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      }
      const source = context.createBufferSource();
      const filter = context.createBiquadFilter();
      source.buffer = noise;
      filter.type = "lowpass";
      filter.frequency.value = frequency;
      return { source, filter };
    }, attack);
  }

  function stopLookout() {
    lookoutPlayback = undefined;
    halt("lookout");
  }

  async function playLookout(lit, runeInterval) {
    stopLookout();
    const playback = {};
    lookoutPlayback = playback;
    if (!await activate() || lookoutPlayback !== playback) return;
    if (lit) {
      tone("lookout", ...effects.magic);
      runePitches.forEach((pitch, index) => tone("lookout", pitch, pitch, .42, .075, index * runeInterval));
      air("lookout", 1.9, .18, 560, .44);
    } else tone("lookout", ...effects.extinguish);
  }

  return {
    activate, update,
    async unlockTrack() {
      if (await activate()) return { context, output: master };
    },
    resume() { if (context) void activate(); },
    note(frequency) { tone("piano", frequency, frequency, .55, .11); },
    stopPiano() { halt("piano"); },
    playLookout, stopLookout,
    suspend() {
      stopLookout();
      halt();
      if (context) context.suspend().catch(() => {});
    },
    play(name) {
      if (name === "land") return air("movement", .19, .20, 270, .016);
      if (name === "step") return air("movement", .115, .108, 410, .013);
      const effect = effects[name];
      if (effect) tone(name, ...effect);
    },
  };
}
