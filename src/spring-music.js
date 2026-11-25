export const SPRING_MUSIC_TARGET_VOLUME = .30;

const FADE_IN = 3;
const PAUSE_FADE = 1.5;
const LEAVE_FADE = 3;
const LOOP_EDGE_FADE = .035;
const trackUrl = `${import.meta.env.BASE_URL}assets/audio/spring-sanctuary.mp3`;

export function createSpringMusic(panel, audio, settings) {
  const button = panel.querySelector("button");
  const status = panel.querySelector('[role="status"]');
  let seated = false;
  let request;
  let loading;
  let offset = 0;
  let track;
  let fadeTimer;

  function show(state, message = "") {
    panel.dataset.state = state;
    button.setAttribute("aria-label", {
      idle: "播放春日秘境音乐",
      loading: "取消加载春日秘境音乐",
      playing: "暂停春日秘境音乐",
    }[state]);
    status.textContent = message;
  }

  function load(context) {
    // Keep one download and decoded buffer for the page, even across seat changes.
    loading ??= fetch(trackUrl).then((response) => {
      if (!response.ok) throw new Error("Spring music download failed");
      return response.arrayBuffer();
    }).then((data) => context.decodeAudioData(data)).then((buffer) => {
      // The MP3 ends above zero. Soften the loop boundary in memory to avoid a click.
      const edge = Math.min(buffer.length, Math.round(buffer.sampleRate * LOOP_EDGE_FADE));
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const samples = buffer.getChannelData(channel);
        for (let i = 0; i < edge; i++) samples[samples.length - 1 - i] *= i / edge;
      }
      return buffer;
    }).catch((error) => {
      loading = undefined;
      throw error;
    });
    return loading;
  }

  function stop(keepPosition) {
    clearTimeout(fadeTimer);
    if (track) {
      const { context, source, gain, started, startOffset } = track;
      if (keepPosition) offset = (startOffset + context.currentTime - started) % source.buffer.duration;
      source.stop();
      source.disconnect();
      gain.disconnect();
      track = undefined;
    }
    if (!keepPosition) offset = 0;
  }

  function fade(to, seconds, keepPosition) {
    clearTimeout(fadeTimer);
    const { context, gain, envelope } = track;
    const now = context.currentTime;
    const progress = Math.min(1, (now - envelope.start) / (envelope.end - envelope.start));
    const from = envelope.from + (envelope.to - envelope.from) * progress;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(from, now);
    gain.gain.linearRampToValueAtTime(to, now + seconds);
    track.envelope = { from, to, start: now, end: now + seconds };
    if (to !== 0) return;

    function finish() {
      const remaining = now + seconds - context.currentTime;
      if (remaining > .01 && context.state === "running") {
        fadeTimer = setTimeout(finish, remaining * 1000);
      } else {
        stop(keepPosition);
      }
    }
    fadeTimer = setTimeout(finish, seconds * 1000);
  }

  async function play() {
    const attempt = {};
    request = attempt;
    show("loading");
    try {
      // Invoke resume during the button gesture, before fetching or decoding the MP3.
      const mixer = await audio.unlockTrack();
      if (request !== attempt) return;
      if (!mixer) throw new Error("Audio is unavailable");
      const { context, output } = mixer;
      const buffer = await load(context);
      if (request !== attempt) return;
      if (context.state !== "running" || document.hidden || !seated || !settings.enabled) {
        show("idle");
        return;
      }
      if (!track) {
        const gain = context.createGain();
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        gain.gain.value = 0;
        source.connect(gain);
        gain.connect(output);
        const started = context.currentTime;
        track = { context, source, gain, started, startOffset: offset,
          envelope: { from: 0, to: 0, start: started, end: started + FADE_IN } };
        source.start(started, offset);
      }
      fade(SPRING_MUSIC_TARGET_VOLUME, FADE_IN);
      show("playing");
    } catch {
      if (request !== attempt) return;
      stop(true);
      show("idle", "音乐暂时无法播放，轻触重试");
    } finally {
      if (request === attempt) request = undefined;
    }
  }

  button.addEventListener("click", () => {
    if (!seated || document.hidden) return;
    const playing = panel.dataset.state === "playing";
    if (!settings.enabled) {
      show("idle", "请在设置中开启声音");
    } else if (request || playing) {
      request = undefined;
      if (playing) fade(0, PAUSE_FADE, true);
      show("idle");
    } else {
      void play();
    }
  });

  return {
    update(inside, settled) {
      if (!inside && track) stop(false);
      const available = inside && settled;
      if (seated === available) return;
      seated = available;
      panel.classList.toggle("visible", seated);
      button.disabled = !seated;
      request = undefined;
      offset = 0;
      show("idle");
      if (seated) stop(false);
      else if (track) fade(0, LEAVE_FADE, false);
    },
    pause() {
      request = undefined;
      stop(seated);
      show("idle");
    },
  };
}
