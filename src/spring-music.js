const SPRING_MUSIC_TARGET_VOLUME = .30;
const trackUrl = `${import.meta.env.BASE_URL}assets/audio/spring-sanctuary.mp3`;
const playbackError = "音乐暂时无法播放，轻触重试";

export function createSpringMusic(panel, settings) {
  const button = panel.querySelector("button");
  const status = panel.querySelector('[role="status"]');
  const track = new Audio();
  track.preload = "none";
  track.loop = true;
  track.src = trackUrl;
  let seated = false;
  let request;

  function show(state, message = "") {
    panel.dataset.state = state;
    button.setAttribute("aria-label", {
      idle: "播放春日秘境音乐",
      loading: "取消加载春日秘境音乐",
      playing: "暂停春日秘境音乐",
    }[state]);
    status.textContent = message;
  }

  function pause() {
    request = undefined;
    track.pause();
    show("idle");
  }

  function updateVolume() {
    // Match the previous track and master gain on browsers with media volume control.
    track.volume = settings.volume * .65 * SPRING_MUSIC_TARGET_VOLUME;
    if (settings.volume === 0) pause();
  }

  track.addEventListener("pause", () => {
    if (track.paused && panel.dataset.state === "playing") pause();
  });
  track.addEventListener("error", () => {
    if (!track.error || (!request && panel.dataset.state !== "playing")) return;
    pause();
    show("idle", playbackError);
  });

  button.addEventListener("click", async () => {
    if (!seated || document.hidden) return;
    if (request || !track.paused) {
      pause();
      return;
    }
    if (!settings.enabled || settings.volume === 0) {
      show("idle", settings.enabled ? "请在设置中调高音量" : "请在设置中开启声音");
      return;
    }

    const attempt = {};
    request = attempt;
    show("loading");
    try {
      updateVolume();
      if (track.error) track.load();
      // Call play before yielding so Safari can use this click's user activation.
      await track.play();
      if (request === attempt) show(track.paused ? "idle" : "playing");
    } catch {
      if (request === attempt) {
        pause();
        show("idle", playbackError);
      }
    } finally {
      if (request === attempt) request = undefined;
    }
  });

  return {
    update(inside, settled) {
      const available = inside && settled;
      if (seated === available) return;
      seated = available;
      panel.classList.toggle("visible", seated);
      button.disabled = !seated;
      if (!seated) {
        pause();
        track.currentTime = 0;
      }
    },
    pause,
    updateVolume,
  };
}
