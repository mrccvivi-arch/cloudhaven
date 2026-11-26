const INVITATIONS = [
  "走呀，我们去海边撒欢！",
  "这里可以一直跑，一直跑！",
  "要不要和我一起追风？",
  "今天不用慢慢走，我们跑起来吧！",
];
const NIGHT_INVITATIONS = [
  "走呀，我们去踩星星！",
  "今晚的大海会发光，去看看吧！",
  "要不要沿着星光跑一圈？",
];
const ENCOURAGEMENT = [
  "对啦，就是这样！",
  "哈哈，我们跑起来啦！",
  "再快一点，去追风！",
  "你看，整个夏天都是我们的！",
];

export const summerSpeechDuration = (line) => Math.min(5000, 3800 + line.length * 48);

export function createSummerRunGuide(random = Math.random) {
  let phase = "done";
  let nextAt = 0, hintUntil = 0, startedRunning = false, lastLine;

  function finish() {
    phase = "done";
    hintUntil = 0;
  }

  function pick(lines) {
    const choices = lines.filter((line) => line !== lastLine);
    lastLine = choices[Math.floor(random() * choices.length)];
    return lastLine;
  }

  return {
    enter() {
      phase = "welcome";
      hintUntil = 0;
      startedRunning = false;
    },
    leave: finish,
    welcomed(time, line) {
      if (phase !== "welcome") return;
      nextAt = time + summerSpeechDuration(line) + 3000 + random() * 2000;
      phase = "invite";
    },
    get holdsSpeech() {
      return phase === "invite" || phase === "follow-up" || phase === "success";
    },
    showHint(time) { return time < hintUntil; },
    update(time, { running, atTower, canSpeak, glowingNight = false }) {
      if (phase === "done") return;
      if (atTower || (running && (phase === "welcome" || phase === "invite"))) {
        finish();
        return;
      }
      if (running && (phase === "follow-up" || phase === "ready")) {
        hintUntil = 0;
        startedRunning = true;
        if (phase === "ready") phase = "success";
      }
      if (phase === "invite" && time >= nextAt) {
        if (time > nextAt + 10_000) {
          finish();
        } else if (canSpeak(true)) {
          const line = glowingNight ? pick(NIGHT_INVITATIONS) : "我们沿着大海跑一圈吧！";
          nextAt = time + summerSpeechDuration(line);
          hintUntil = time + 8000;
          phase = glowingNight ? "ready" : "follow-up";
          return line;
        }
      }
      if (phase === "follow-up" && time >= nextAt) {
        if (time > nextAt + 10_000) {
          phase = startedRunning ? "success" : "ready";
        } else if (canSpeak(true)) {
          phase = startedRunning ? "success" : "ready";
          return pick(INVITATIONS);
        }
      }
      if (phase === "success" && canSpeak(false)) {
        finish();
        return pick(ENCOURAGEMENT);
      }
    },
  };
}
