// All game sounds share one lazily unlocked mixer.
const effects = {
  click: [590, 480, .085, .036],
  affection: [650, 790, .29, .052],
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

  function ready() {
    return settings.enabled && !document.hidden && context?.state === "running";
  }

  function halt(channel) {
    for (const voice of voices) {
      if (channel && voice.channel !== channel) continue;
      try { voice.source.stop(); } catch { /* Already ended. */ }
      voice.gain.disconnect();
      voices.delete(voice);
    }
  }

  function update() {
    if (master) master.gain.value = settings.enabled ? settings.volume * .65 : 0;
    if (!settings.enabled) halt();
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

  function playVoice(channel, duration, peak, makeSource, attack = .022) {
    if (!ready() || voices.size >= 12) return;
    try {
      const time = context.currentTime;
      const gain = context.createGain();
      const { source, filter } = makeSource(time);
      const voice = { source, gain, channel };
      gain.gain.setValueAtTime(.0001, time);
      gain.gain.exponentialRampToValueAtTime(peak, time + attack);
      gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
      source.connect(filter ?? gain);
      if (filter) filter.connect(gain);
      gain.connect(master);
      source.onended = () => {
        source.disconnect();
        filter?.disconnect();
        gain.disconnect();
        voices.delete(voice);
      };
      source.start(time);
      source.stop(time + duration + .01);
      voices.add(voice);
    } catch { /* Audio hardware and autoplay failures must never interrupt play. */ }
  }

  function tone(channel, from, to, duration, peak) {
    playVoice(channel, duration, peak, (time) => {
      const source = context.createOscillator();
      source.frequency.setValueAtTime(from, time);
      source.frequency.exponentialRampToValueAtTime(to, time + duration);
      return { source };
    });
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

  return {
    activate, update,
    resume() { if (context) void activate(); },
    note(frequency) { tone("piano", frequency, frequency, .55, .11); },
    stopPiano() { halt("piano"); },
    suspend() {
      halt();
      if (context) context.suspend().catch(() => {});
    },
    play(name, index = 0) {
      if (name === "wind") return air("lookout", 1.9, .18, 560, .44);
      if (name === "land") return air("movement", .19, .20, 270, .016);
      if (name === "step") return air("movement", .115, .108, 410, .013);
      if (name === "rune") {
        const pitch = runePitches[index];
        return tone("lookout", pitch, pitch, .42, .075);
      }
      const effect = effects[name];
      if (effect) tone(name, ...effect);
    },
  };
}
