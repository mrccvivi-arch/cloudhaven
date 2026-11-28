// Place recordings in public/assets/audio and list paths relative to public/.
export const winterWhaleVoice = { tracks: ["assets/audio/snow-whale-call.mp3"], volume: .48 };

export function createWinterWhaleVoice(mixer, settings, config = winterWhaleVoice, onPlayback = () => {}) {
  const tracks = new Map();
  let playing;

  function stop() {
    if (!playing) return;
    const { track } = playing;
    playing = undefined;
    track.pause();
    if (track.readyState) track.currentTime = 0;
  }

  const canPlay = () => !playing && config.tracks.length > 0 && settings.enabled && settings.volume > 0 && !document.hidden;

  return {
    canPlay,
    get busy() { return Boolean(playing); },
    stop,
    play() {
      if (!canPlay()) return;
      const path = config.tracks[Math.floor(Math.random() * config.tracks.length)];
      let entry = tracks.get(path);
      if (!entry) {
        const track = new Audio(`${import.meta.env.BASE_URL}${path}`);
        entry = { track };
        tracks.set(path, entry);
        for (const event of ["ended", "error"]) {
          track.addEventListener(event, () => { if (playing?.track === track) stop(); });
        }
      }
      const { track } = entry;
      const request = { track };
      playing = request;
      // Unlock and play in the same gesture for Safari.
      const unlocking = mixer.activate();
      try {
        entry.gain ??= mixer.connectMusic(track, config.volume);
        if (!entry.gain) track.volume = config.volume * settings.volume * .65;
        const playback = track.play();
        Promise.all([unlocking, playback]).then(([unlocked]) => {
          if (playing !== request) return;
          if (entry.gain && !unlocked) stop();
          else if (!track.paused) onPlayback();
        }).catch(() => { if (playing === request) stop(); });
      } catch {
        if (playing === request) stop();
      }
    },
  };
}
