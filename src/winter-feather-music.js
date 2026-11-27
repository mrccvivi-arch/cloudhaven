import { createMusicTrack } from "./music-track.js";

const url = `${import.meta.env.BASE_URL}assets/audio/winter-feather.mp3`;
const level = .23;
const fadeMs = 1500;
const labels = { idle: "听一会儿音乐", loading: "取消加载", playing: "暂停音乐", paused: "继续播放" };

export function createFeatherMusic(prompt, remote, settings, mixer, cue) {
  const button = prompt.querySelector("button");
  const status = prompt.querySelector('[role="status"]');
  const track = createMusicTrack(url);
  let state = "idle", active = false, started = false, request;
  let gain, fadeTimer, volumeTimer;

  function show(next, message = "") {
    state = next;
    button.textContent = labels[next];
    remote.setAttribute("aria-label", labels[next]);
    remote.title = labels[next];
    remote.textContent = next === "playing" ? "Ⅱ" : "♪";
    remote.hidden = !active || next === "idle";
    status.textContent = message;
  }

  function setVolume() {
    if (!gain) track.volume = settings.volume * .65 * level;
    if (!settings.enabled || settings.volume === 0) pause();
  }

  function pause(announce = false) {
    request = undefined;
    show(started ? "paused" : "idle");
    track.pause();
    if (announce && started) cue("pause");
  }

  function rewind() {
    clearTimeout(fadeTimer);
    clearInterval(volumeTimer);
    fadeTimer = volumeTimer = undefined;
    request = undefined;
    started = false;
    show("idle");
    track.pause();
    if (track.readyState) track.currentTime = 0;
    gain?.(level);
    setVolume();
  }

  function leave(fade = true) {
    const playing = active && state === "playing" && !track.paused;
    active = false;
    request = undefined;
    show("idle");
    if (!fade || (!playing && !fadeTimer)) {
      rewind();
    } else if (playing) {
      if (gain) gain(0, fadeMs / 1000);
      else {
        const base = track.volume, start = performance.now();
        volumeTimer = setInterval(() => {
          track.volume = base * Math.max(0, 1 - (performance.now() - start) / fadeMs);
        }, 50);
      }
      fadeTimer = setTimeout(rewind, fadeMs);
    }
  }

  async function toggle() {
    if (!active || document.hidden) return;
    if (request || !track.paused) {
      pause(state === "playing");
      return;
    }
    if (!settings.enabled || !settings.volume) {
      show(state, settings.enabled ? "请在设置中调高音量" : "请在设置中开启声音");
      return;
    }
    const attempt = {};
    request = attempt;
    show("loading");
    try {
      if (!gain) {
        void mixer.activate();
        try { gain = mixer.connectMusic(track, level); } catch { /* Use the media element directly. */ }
      }
      setVolume();
      if (track.error) track.load();
      // Stay in the click or pointerup handler for Safari's media activation.
      await track.play();
      if (request !== attempt) return;
      if (track.paused) {
        show(started ? "paused" : "idle");
        return;
      }
      if (!started) cue("start");
      started = true;
      show("playing");
    } catch {
      if (request === attempt) show(started ? "paused" : "idle", "音乐暂时无法播放，轻触重试");
    } finally {
      if (request === attempt) request = undefined;
    }
  }

  track.addEventListener("ended", () => { if (active || fadeTimer) rewind(); });
  track.addEventListener("pause", () => {
    if (active && state === "playing" && track.paused && !track.ended) pause();
  });
  track.addEventListener("error", () => {
    if (active && (request || state === "playing")) {
      pause();
      show(state, "音乐暂时无法播放，轻触重试");
    }
  });
  show("idle");

  return {
    enter() { rewind(); active = true; },
    leave, toggle, setVolume,
    interrupt() { if (active) pause(); else rewind(); },
    get playing() { return state === "playing"; },
  };
}
