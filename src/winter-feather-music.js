import { createMusicTrack } from "./music-track.js";

const url = `${import.meta.env.BASE_URL}assets/audio/winter-feather2.mp3`;
const level = .23;
const preloadDelay = 750;
const introFade = 900;
const leaveFade = 1500;
const introGain = [.85, 1];
const labels = { idle: "听一会儿音乐", loading: "取消加载", playing: "暂停音乐", paused: "继续播放" };
const playbackError = "音乐暂时无法播放，轻触重试";

export function createFeatherMusic(prompt, remote, settings, mixer, cue) {
  const button = prompt.querySelector("button");
  const status = prompt.querySelector('[role="status"]');
  const track = createMusicTrack(url);
  let state = "idle", active = false, started = false;
  let request, gain, preloadTimer, fadeTimer, volumeTimer;

  function show(next, message = "") {
    state = next;
    button.textContent = labels[next];
    remote.setAttribute("aria-label", labels[next]);
    remote.title = labels[next];
    remote.textContent = next === "playing" ? "Ⅱ" : "♪";
    remote.hidden = !active || next === "idle";
    status.textContent = message;
  }

  const normalVolume = () => settings.volume * .65 * level;

  function shapeVolume(values, duration) {
    clearInterval(volumeTimer);
    if (gain) {
      gain.shape(values.map(value => level * value), duration / 1000);
      return;
    }
    const start = performance.now();
    const update = () => {
      const step = Math.min(1, (performance.now() - start) / duration) * (values.length - 1);
      const i = Math.min(values.length - 2, Math.floor(step));
      track.volume = Math.min(1, normalVolume() * (values[i] + (values[i + 1] - values[i]) * (step - i)));
      if (step === values.length - 1) {
        clearInterval(volumeTimer);
        volumeTimer = undefined;
      }
    };
    volumeTimer = setInterval(update, 30);
    update();
  }

  function useNormalVolume() {
    clearInterval(volumeTimer);
    volumeTimer = undefined;
    if (gain) gain.set(level);
    else track.volume = normalVolume();
  }

  function pause(announce = false) {
    request = undefined;
    show(started ? "paused" : "idle");
    track.pause();
    useNormalVolume();
    if (announce && started) cue("pause");
  }

  function setVolume() {
    if (!settings.enabled || settings.volume === 0) pause();
    else if (!gain && !volumeTimer) track.volume = normalVolume();
  }

  function rewind() {
    clearTimeout(fadeTimer);
    fadeTimer = undefined;
    started = false;
    pause();
    if (track.currentTime !== 0) track.currentTime = 0;
  }

  function leave(fade = true) {
    const playing = active && state === "playing" && !track.paused;
    active = false;
    request = undefined;
    clearTimeout(preloadTimer);
    show("idle");
    if (!fade || (!playing && !fadeTimer)) rewind();
    else if (playing) {
      if (gain) gain.fade(0, leaveFade / 1000);
      else shapeVolume([normalVolume() ? track.volume / normalVolume() : 0, 0], leaveFade);
      fadeTimer = setTimeout(rewind, leaveFade);
    }
  }

  function showPlaying() {
    if (!request?.unlocked || !request.mediaPlaying || track.paused || track.seeking || track.readyState < 3) return;
    request.hasPlayed = true;
    if (!started) {
      started = true;
      shapeVolume(introGain, introFade);
      cue("start");
    }
    show("playing");
  }

  async function toggle() {
    if (!active || document.hidden) return;
    if (request || !track.paused) {
      pause(request?.hasPlayed);
      return;
    }
    if (!settings.enabled || !settings.volume) {
      show(state, settings.enabled ? "请在设置中调高音量" : "请在设置中开启声音");
      return;
    }

    const attempt = { unlocked: false, mediaPlaying: false };
    request = attempt;
    show("loading");
    try {
      clearTimeout(preloadTimer);
      track.preload = "auto";
      if (track.error) track.load();
      // Both calls must run in this gesture before awaiting either promise.
      const unlocking = mixer.activate();
      if (!gain) {
        try { gain = mixer.connectMusic(track, level); } catch { /* The element can play without Web Audio. */ }
      }
      setVolume();
      const playing = track.play();
      const [unlocked] = await Promise.all([unlocking, playing]);
      if (request !== attempt) return;
      if (gain && !unlocked) throw new Error(playbackError);
      attempt.unlocked = true;
      showPlaying();
    } catch {
      if (request !== attempt) return;
      pause();
      show(state, playbackError);
    }
  }

  track.addEventListener("seeked", showPlaying);
  track.addEventListener("playing", () => {
    if (!request) return;
    request.mediaPlaying = true;
    showPlaying();
  });
  track.addEventListener("waiting", () => {
    if (!request || track.paused) return;
    request.mediaPlaying = false;
    show("loading");
  });
  track.addEventListener("ended", () => { if (active || fadeTimer) rewind(); });
  track.addEventListener("pause", () => {
    if (request && track.paused && !track.ended) pause();
  });
  track.addEventListener("error", () => {
    if (!active || !request) return;
    pause();
    show(state, playbackError);
  });
  show("idle");

  return {
    enter() {
      active = true;
      rewind();
      if (track.preload === "none") {
        preloadTimer = setTimeout(() => {
          if (!active) return;
          track.preload = "auto";
          track.load();
        }, preloadDelay);
      }
    },
    leave, toggle, setVolume,
    interrupt() { if (active) pause(); else rewind(); },
    get playing() { return state === "playing"; },
  };
}
