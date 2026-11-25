import { SPRING_FALLS, SPRING_POOL, SPRING_REST_ROCK, springPoint } from "./spring-layout.js";

export const SPRING_ENTRY_LINES = [
  "被你发现啦。",
  "这里很适合发呆。",
  "我还以为你找不到这里呢。",
  "你来得正好，花还没落完。",
  "我喜欢这里，也喜欢你来这里。",
];

export const SPRING_LINES = [
  "原来这里还有春天。",
  "水一直在走，我们可以不用走。",
  "人类，你也喜欢发呆吗？",
  "我刚刚数到第十七片花瓣，然后忘了。",
  "你说，水会不会也有记忆？",
  "春天的声音原来是这样的。",
  "有一片花瓣落在我头上了。",
  "我怀疑这些树在偷偷下雪。",
  "如果你不说话，我也可以不说话。",
  "我们今天就浪费一点时间吧。",
  "我喜欢这里，没有什么事情非做不可。",
  "人类为什么总是急着去下一个地方？",
  "你看，花瓣比我还轻。",
  "不知道水里的月亮摸起来是什么感觉。",
  "再坐一小会儿吧。",
  "今天的春天，和昨天的不太一样。",
  "我什么都没想，你呢？",
  "这里可以是我们的秘密。",
];

export const SPRING_ENVIRONMENT_LINES = {
  rising: "起风了。",
  peak: "你看，春天在下雪。",
  calm: "刚才好像做了一场很短的梦。",
  dusk: "原来春天也会有夜晚。",
  dawn: "我们好像坐了很久。",
};

const threshold = springPoint(57.5, 7.4);
const facing = Math.atan2(
  SPRING_REST_ROCK.x - (SPRING_FALLS.x * .78 + SPRING_POOL.x * .22),
  SPRING_REST_ROCK.z - (SPRING_FALLS.z * .78 + SPRING_POOL.z * .22),
);

export function insideSpring(player, alreadyInside = false) {
  const pad = alreadyInside ? 1.25 : 0;
  return player.layer === "ground" &&
    (player.x >= threshold.x - pad || player.z <= threshold.z + pad) &&
    Math.hypot((player.x - SPRING_POOL.x) / (11.4 + pad), (player.z - SPRING_POOL.z - 2.2) / (11.5 + pad)) < 1;
}

export function canReachSpringSeat(player) {
  return player.layer === "ground" && player.grounded &&
    Math.hypot(player.x - SPRING_REST_ROCK.x, player.z - SPRING_REST_ROCK.z) <= 3;
}

export function nearSpringFalls(player) {
  return insideSpring(player) &&
    Math.hypot(player.x - SPRING_FALLS.x, player.z - SPRING_FALLS.z) <= 8.5;
}

export function createSpringDialogue(save, initialPlayer, random = Math.random) {
  let inside = save.discovered && insideSpring(initialPlayer);
  let firstClearAt;
  let lastEntry, lastQuiet;
  let autoAt = -Infinity;
  let sittingSince, sitLineAt;
  let previousNight, previousWindPhase, windEvent, windCue;

  function choose(lines, previous) {
    const eligible = lines.filter((line) => line !== previous);
    return eligible[Math.floor(random() * eligible.length)];
  }

  function quietLine(night) {
    lastQuiet = choose(SPRING_LINES.filter((_, index) => index !== 13 || night), lastQuiet);
    return lastQuiet;
  }

  return {
    get inside() { return inside; },
    noteAutomatic(time) { autoAt = time; },
    automaticCoolingDown(time) { return inside && (!save.discovered || time - autoAt < 30_000); },
    touch: quietLine,
    update(player, { time, wallTime, seated, night, wind, available, canWelcome }) {
      const wasInside = inside;
      inside = insideSpring(player, inside);
      const newVisit = inside && !wasInside;
      if (!inside) firstClearAt = undefined;
      if (inside && !save.discovered && !canWelcome) firstClearAt = time + 1500;
      if (!seated) {
        sittingSince = sitLineAt = undefined;
      } else if (sittingSince === undefined) {
        sittingSince = time;
        sitLineAt = time + 15_000 + random() * 15_000;
      }

      if (wind?.event !== windEvent) {
        windEvent = wind?.event;
        windCue = windEvent && random() < .30 ? ["rising", "peak", "calm"][Math.floor(random() * 3)] : undefined;
      }
      const windChanged = wind?.phase !== previousWindPhase;
      previousWindPhase = wind?.phase;
      const windLine = windChanged && windCue === wind?.phase ? SPRING_ENVIRONMENT_LINES[windCue] : undefined;
      if (windLine) windCue = undefined;

      const nightChanged = previousNight !== undefined && previousNight !== night;
      previousNight = night;
      const dayLine = nightChanged && (night || time - sittingSince >= 60_000)
        ? SPRING_ENVIRONMENT_LINES[night ? "dusk" : "dawn"] : undefined;

      const firstWelcome = inside && !save.discovered && time >= (firstClearAt ?? -Infinity);
      const repeatWelcome = save.discovered && newVisit && wallTime - save.lastEntryAt >= 180_000 &&
        time - autoAt >= 30_000;
      if ((firstWelcome || repeatWelcome) && canWelcome) {
        const text = save.discovered ? choose(SPRING_ENTRY_LINES, lastEntry) : SPRING_ENTRY_LINES[0];
        lastEntry = text;
        save.discovered = true;
        save.lastEntryAt = wallTime;
        firstClearAt = undefined;
        autoAt = time;
        return { text, kind: "spring-entry" };
      }
      const sitDue = time >= sitLineAt;
      if (sitDue) sitLineAt = undefined;
      if (!seated || !save.discovered || time - autoAt < 30_000 || !(dayLine || windLine || sitDue) || !available()) return;
      if (dayLine || windLine) {
        if (!dayLine && windLine) sitLineAt = undefined;
        autoAt = time;
        return { text: dayLine ?? windLine, kind: "spring-environment" };
      }
      if (sitDue) {
        autoAt = time;
        return { text: quietLine(night), kind: "spring-settled" };
      }
    },
  };
}

function ease(t) { return t * t * (3 - 2 * t); }

export function createSpringSeat() {
  let bank, perch, blend = 0, leaving = false, jumpOnExit = false;
  return {
    get active() { return Boolean(bank); },
    get settled() { return Boolean(bank) && blend === 1 && !leaving; },
    get poseForSave() { return bank; },
    get sitAmount() { return ease(Math.max(0, (blend - .55) / .45)); },
    get facing() { return facing; },
    sit(player, position) {
      if (bank || !canReachSpringSeat(player)) return false;
      bank = { x: player.x, y: player.y, z: player.z, layer: player.layer };
      perch = position;
      return true;
    },
    stand(jumping = false) {
      if (!bank) return;
      leaving = true;
      jumpOnExit ||= jumping;
    },
    clear() {
      bank = perch = undefined;
      blend = 0;
      leaving = jumpOnExit = false;
    },
    update(player, dt) {
      if (!bank) return false;
      blend = Math.max(0, Math.min(1, blend + (leaving ? -1 : 1) * dt / .62));
      const horizontal = ease(Math.min(1, Math.max(0, (blend - .31) / .69)));
      const vertical = ease(Math.min(1, blend / .43));
      player.x = bank.x + (perch.x - bank.x) * horizontal;
      player.z = bank.z + (perch.z - bank.z) * horizontal;
      player.y = bank.y + (perch.y - bank.y) * vertical + .17 * Math.sin(Math.PI * vertical);
      if (!leaving || blend > 0) return false;
      const shouldJump = jumpOnExit;
      this.clear();
      return shouldJump;
    },
  };
}
