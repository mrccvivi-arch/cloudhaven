import { NOTES } from "./piano-rules.js";

export function createPianoAudio() {
  let context;
  let output;
  const voices = new Set();

  function activate() {
    try {
      if (!context) {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) return Promise.resolve(false);
        context = new Audio();
        output = context.createGain();
        output.gain.value = .63;
        output.connect(context.destination);
      }
      return context.state === "running" ? Promise.resolve(true) : context.resume().then(() => true, () => false);
    } catch {
      return Promise.resolve(false);
    }
  }

  function play(index) {
    if (context?.state !== "running" || voices.size >= 8) return;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = NOTES[index].frequency;
    envelope.gain.setValueAtTime(.0001, now);
    envelope.gain.exponentialRampToValueAtTime(.125, now + .028);
    envelope.gain.exponentialRampToValueAtTime(.035, now + .16);
    envelope.gain.exponentialRampToValueAtTime(.0001, now + .54);
    oscillator.connect(envelope).connect(output);
    voices.add(oscillator);
    oscillator.onended = () => {
      oscillator.disconnect();
      envelope.disconnect();
      voices.delete(oscillator);
    };
    oscillator.start(now);
    oscillator.stop(now + .55);
  }

  return {
    activate,
    play,
    stop() {
      for (const voice of voices) voice.stop();
      voices.clear();
    },
  };
}
