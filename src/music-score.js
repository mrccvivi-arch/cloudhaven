// Original eight-bar loops. MIDI pitches are synthesized into a seamless mono buffer.
const scores = {
  day: {
    beat: .64, lead: "piano", backing: "guitar", accent: "mallet",
    chords: [[48, 55, 60, 64, 69], [45, 52, 57, 60, 64], [41, 48, 53, 57, 64], [43, 50, 55, 59, 62],
      [48, 55, 60, 64, 67], [45, 52, 57, 60, 67], [41, 48, 53, 57, 62], [43, 50, 55, 59, 67]],
    motif: [[72, 76, 79, 76], [74, 72, 69], [69, 72, 76, 77], [74, 71, 67],
      [72, 76, 81, 79], [76, 72, 69], [74, 72, 69, 65], [67, 71, 74, 71]],
  },
  night: {
    beat: .81, lead: "box", backing: "piano", accent: "pad",
    chords: [[45, 52, 57, 60, 64], [41, 48, 53, 57, 64], [48, 55, 60, 64, 67], [43, 50, 55, 59, 62],
      [45, 52, 57, 60, 67], [38, 45, 53, 57, 64], [41, 48, 53, 57, 64], [40, 47, 55, 59, 62]],
    motif: [[81, 84, 76], [77, 76, 72], [79, 76, 72], [74, 71, 67],
      [76, 79, 81], [84, 81, 77], [76, 72, 77], [74, 71, 76]],
  },
  sky: {
    beat: .72, lead: "harp", backing: "strings", accent: "pad",
    chords: [[50, 57, 62, 66, 69], [47, 54, 59, 62, 66], [43, 50, 55, 59, 66], [45, 52, 57, 59, 64],
      [50, 57, 62, 66, 76], [54, 61, 66, 69, 73], [43, 50, 55, 59, 64], [45, 52, 57, 61, 64]],
    motif: [[69, 74, 78, 81], [78, 74, 71, 66], [67, 71, 74, 78], [76, 71, 69, 64],
      [74, 78, 81, 88], [85, 81, 78, 76], [79, 76, 71, 67], [69, 73, 76, 81]],
  },
};

const voices = {
  piano: { harmonics: [[1, .78], [2, .17], [3, .05]], attack: .014, decay: 2.4 },
  guitar: { harmonics: [[1, .58], [2, .26], [3, .12], [5, .04]], attack: .018, decay: 2.8 },
  mallet: { harmonics: [[1, .89], [3.98, .11]], attack: .009, decay: 4.6 },
  box: { harmonics: [[1, .78], [2, .07], [2.76, .15]], attack: .011, decay: 3.1 },
  harp: { harmonics: [[1, .7], [2, .19], [3, .08], [4, .03]], attack: .015, decay: 1.8 },
  strings: { harmonics: [[1, .77], [2, .16], [3, .07]], attack: .60, decay: .29 },
  pad: { harmonics: [[1, .87], [2.005, .13]], attack: .74, decay: .31 },
};

export const MUSIC_RATE = 22050;

export function renderTheme(theme) {
  const { beat, chords, motif, lead, backing, accent } = scores[theme];
  const buffer = new Float32Array(Math.round(beat * 4 * chords.length * MUSIC_RATE));

  function note(at, pitch, duration, velocity, instrument) {
    const { harmonics, attack, decay } = voices[instrument];
    const start = Math.round(at * MUSIC_RATE);
    const end = Math.round(duration * MUSIC_RATE);
    const phase = 2 * Math.PI * 440 * 2 ** ((pitch - 69) / 12) / MUSIC_RATE;
    for (let i = 0; i < end; i++) {
      const t = i / MUSIC_RATE;
      const edge = Math.min(1, t / attack, (duration - t) / Math.min(.36, duration * .38));
      let wave = 0;
      for (const [partial, weight] of harmonics) wave += weight * Math.sin(i * phase * partial);
      buffer[(start + i) % buffer.length] += wave * velocity * edge * edge * Math.exp(-t * decay);
    }
  }

  chords.forEach((chord, bar) => {
    const start = bar * 4 * beat;
    const sustained = theme !== "day";
    note(start, chord[0], beat * (sustained ? 4.7 : 2.5), .21, backing);
    for (let i = 1; i < chord.length; i++) {
      const offset = theme === "sky" ? i * .13 : (i - 1) * .79 + .28;
      note(start + beat * offset, chord[i], beat * (theme === "sky" ? 4.4 : 2.65), .098, backing);
    }
    const rhythm = theme === "day" ? [.18, 1.17, 2, 3.14] : theme === "night" ? [.55, 1.78, 2.85] : [.12, .91, 1.85, 3.12];
    motif[bar].forEach((pitch, index) => {
      note(start + rhythm[index] * beat, pitch, beat * (sustained ? 3.1 : 2.1), .24 - index * .024, lead);
    });
    if (theme === "day") {
      note(start + 2.57 * beat, chord[3] + 12, beat * .65, .064, accent);
    } else {
      note(start + .24 * beat, chord[1] - (theme === "sky" ? 0 : 12), beat * 5.1, .084, accent);
      note(start + 1.14 * beat, chord[3], beat * 3.75, .046, accent);
    }
  });

  let peak = .01;
  for (const sample of buffer) peak = Math.max(peak, Math.abs(sample));
  for (let i = 0; i < buffer.length; i++) buffer[i] *= .46 / peak;
  return buffer;
}
