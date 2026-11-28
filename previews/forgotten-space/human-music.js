import { createMusicTrack } from "../../src/music-track.js";
import fragmentedTime from "./fragmented-time.mp3";
export const humanTrackUrl = fragmentedTime;

export function bindHumanMusic(panel, url = humanTrackUrl, makeTrack = createMusicTrack) {
  const button = panel.querySelector("button");
  const status = panel.querySelector('[role="status"]');
  let track, attempt, active = false, restingState = "idle";

  function display(state, message = "") {
    button.textContent = {
      idle:"听一会儿音乐", loading:"正在加载…", playing:"暂停音乐", paused:"继续播放", ended:"再听一遍",
    }[state];
    button.setAttribute("aria-busy",String(state==="loading"));
    status.textContent = message;
    panel.dataset.state = state;
  }

  function pause() {
    attempt = undefined;
    if (track?.ended && active) restingState = "ended";
    display(restingState);
    track?.pause();
  }

  function fail() {
    pause();
    status.textContent = "音乐暂时无法播放，可轻触重试。";
  }

  button.addEventListener("click", async () => {
    if (!active || document.hidden || !track) return;
    if (attempt || !track.paused) {
      pause();
      return;
    }
    const session = track;
    const request = {};
    attempt = request;
    display("loading");
    try {
      if (track.error) track.load();
      if (restingState === "ended") session.currentTime = 0;
      // Start during the activation event so iPad Safari permits playback.
      await track.play();
      if (attempt !== request) return;
      if (!session.paused) {
        restingState = "paused";
        display("playing");
      } else pause();
    } catch {
      if (attempt === request) fail();
    } finally {
      if (attempt === request) attempt = undefined;
    }
  });

  return {
    enter() {
      active = true;
      panel.hidden = !url;
      if (!url || track) return;
      const session = makeTrack(url,false);
      track = session;
      track.preload = "auto";
      track.volume = .30;
      session.addEventListener("error", () => {
        if (track === session && (attempt || panel.dataset.state === "playing")) fail();
      });
      session.addEventListener("pause", () => {
        if (track === session && session.paused && panel.dataset.state === "playing") pause();
      });
      session.addEventListener("ended", () => {
        if (track !== session || !session.ended) return;
        attempt = undefined;
        restingState = "ended";
        display(restingState);
      });
      display("idle");
      session.load();
    },
    pause,
    leave() {
      active = false;
      restingState = "idle";
      pause();
      panel.hidden = true;
      const previous = track;
      track = undefined;
      if (previous) {
        previous.removeAttribute("src");
        previous.load();
      }
    },
  };
}
