import { createMusicTrack } from "../../src/music-track.js";
import fragmentedTime from "./fragmented-time.mp3";
export const humanTrackUrl = fragmentedTime;

// Match the Snow Sea feather at the default sound setting, after compensating
// for the difference in the two source recordings' integrated loudness.
const level = .184;
const fadeIn = 3000;
const fadeOut = 1000;
const leaveFade = 950;

export function bindHumanMusic(panel, url = humanTrackUrl, makeTrack = createMusicTrack) {
  const button = panel.querySelector("button");
  const status = panel.querySelector('[role="status"]');
  let track, attempt, active = false, restingState = "idle";
  let context, source, gain;
  let levelAtRest = 0, ramp, fadeTimer, fadeFrame;

  function display(state, message = "") {
    button.textContent = {
      idle: "听一会儿音乐", loading: "正在加载…", playing: "暂停音乐",
      fading: "继续播放", paused: "继续播放", ended: "再听一遍",
    }[state];
    button.setAttribute("aria-busy", String(state === "loading"));
    status.textContent = message;
    panel.dataset.state = state;
  }

  const clock = () => gain ? context.currentTime * 1000 : performance.now();

  function levelAt(now) {
    if (!ramp) return levelAtRest;
    const progress = Math.max(0, Math.min(1, (now - ramp.start) / ramp.duration));
    const blend = progress * progress * (3 - 2 * progress);
    return ramp.from + (ramp.to - ramp.from) * blend;
  }

  function cancelFade() {
    levelAtRest = levelAt(clock());
    ramp = undefined;
    clearTimeout(fadeTimer);
    if (fadeFrame !== undefined) cancelAnimationFrame(fadeFrame);
    fadeFrame = undefined;
  }

  function setLevel(value) {
    cancelFade();
    levelAtRest = value;
    if (gain) {
      gain.gain.cancelScheduledValues(context.currentTime);
      gain.gain.setValueAtTime(value, context.currentTime);
    } else if (track) track.volume = value;
  }

  function fadeTo(to, duration, done) {
    cancelFade();
    const start = clock();
    ramp = { from: levelAtRest, to, start, duration };
    if (gain) {
      const now = start / 1000;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(levelAtRest, now);
      for (let i = 1; i <= 24; i++) {
        const sample = start + duration * i / 24;
        gain.gain.linearRampToValueAtTime(levelAt(sample), sample / 1000);
      }
    } else {
      const tick = () => {
        if (!ramp || !track) return;
        const now = clock();
        track.volume = levelAt(now);
        fadeFrame = now < start + duration ? requestAnimationFrame(tick) : undefined;
      };
      tick();
    }
    if (done) fadeTimer = setTimeout(() => {
      setLevel(to);
      done();
    }, duration);
  }

  function connectAudio(session) {
    if (gain) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    try {
      context ??= new AudioContext();
      const nextGain = context.createGain();
      nextGain.gain.value = 0;
      const nextSource = context.createMediaElementSource(session);
      nextSource.connect(nextGain);
      nextGain.connect(context.destination);
      source = nextSource;
      gain = nextGain;
      session.volume = 1;
    } catch { /* Keep the element-volume fallback when Web Audio is unavailable. */ }
  }

  function pause() {
    attempt = undefined;
    setLevel(0);
    if (track?.ended && active) restingState = "ended";
    track?.pause();
    if (active) display(restingState);
    else release();
  }

  function release() {
    const previous = track;
    setLevel(0);
    track = attempt = undefined;
    if (!previous) return;
    previous.pause();
    previous.removeAttribute("src");
    previous.load();
    source?.disconnect();
    gain?.disconnect();
    source = gain = undefined;
    if (context?.state === "running") void context.suspend().catch(() => {});
  }

  function fail() {
    pause();
    if (active) status.textContent = "音乐暂时无法播放，可轻触重试。";
  }

  button.addEventListener("click", async () => {
    if (!active || document.hidden || !track) return;
    if (attempt) {
      pause();
      return;
    }
    if (!track.paused) {
      if (panel.dataset.state === "fading") {
        fadeTo(level, fadeIn);
        display("playing");
      } else {
        display("fading");
        fadeTo(0, fadeOut, pause);
      }
      return;
    }
    const session = track;
    const request = {};
    attempt = request;
    display("loading");
    try {
      if (session.error) session.load();
      if (restingState === "ended") session.currentTime = 0;
      connectAudio(session);
      setLevel(0);
      // Unlock and start playback during the same activation gesture.
      const unlocked = gain && context.state !== "running" ? context.resume() : undefined;
      await Promise.all([session.play(), unlocked]);
      if (attempt !== request) return;
      if (session.paused) pause();
      else {
        restingState = "paused";
        fadeTo(level, fadeIn);
        display("playing");
      }
    } catch {
      if (attempt === request) fail();
    } finally {
      if (attempt === request) attempt = undefined;
    }
  });

  return {
    enter() {
      if (active) return;
      release();
      active = true;
      panel.hidden = !url;
      if (!url) return;
      const session = makeTrack(url, false);
      track = session;
      session.preload = "auto";
      session.volume = 0;
      restingState = "idle";
      session.addEventListener("error", () => {
        if (track === session && (attempt || !session.paused)) fail();
      });
      session.addEventListener("pause", () => {
        if (track === session && session.paused && !session.ended) pause();
      });
      session.addEventListener("ended", () => {
        if (track !== session || !session.ended) return;
        attempt = undefined;
        if (!active) release();
        else {
          setLevel(0);
          restingState = "ended";
          display(restingState);
        }
      });
      display("idle");
      session.load();
    },
    pause,
    fadeOut() {
      if (!active) return;
      active = false;
      const audible = !attempt && track && !track.paused && !track.ended;
      attempt = undefined;
      panel.hidden = true;
      if (audible) fadeTo(0, leaveFade, release);
      else release();
    },
    leave() {
      active = false;
      panel.hidden = true;
      release();
    },
  };
}
