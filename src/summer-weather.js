import { MathUtils } from "three";
import { DAY_LENGTH } from "./day-night.js";

const { lerp, smoothstep } = MathUtils;
const LAST_RAIN = 135;

export function createSummerWeather(random = Math.random) {
  const weather = { time: 0, wind: 0, x: 0, z: 0, driftX: 0, driftZ: 0, overcast: 0, rain: 0, wet: 0, rainbow: 0, meteors: 0 };
  const between = (min, max) => lerp(min, max, random());
  let previous, entry, showerAt, duration, usedRain, rainingAt, wasRunning;
  let windAt, windFor, nextWind, windX, windZ, meteorTimes = [];

  function newCycle() {
    duration = between(20, 35);
    showerAt = random() < .45 ? between(27, LAST_RAIN - duration - 5) : Infinity;
    usedRain = false;
    rainingAt = undefined;
    weather.overcast = weather.rain = weather.wet = weather.rainbow = 0;
    const count = 1 + Math.floor(random() * 3);
    meteorTimes = Array.from({ length: count }, (_, i) =>
      between(197 + i * 76 / count, 197 + (i + 1) * 76 / count));
  }

  return {
    update(time, worldTime, inside, running, emit) {
      const elapsed = Math.min(.1, Math.max(0, time - weather.time));
      weather.time = time;
      weather.meteors = 0;
      if (previous === undefined || worldTime < previous) newCycle();
      const from = previous ?? worldTime;
      previous = worldTime;
      if (!inside) {
        entry = rainingAt = undefined;
        weather.wind = weather.x = weather.z = weather.driftX = weather.driftZ = weather.overcast = weather.rain = weather.wet = weather.rainbow = 0;
        return weather;
      }
      if (entry === undefined) {
        entry = time;
        nextWind = time + between(15, 30);
        windFor = 0;
      }
      if (time >= nextWind) {
        windAt = time;
        windFor = between(5, 10);
        nextWind = time + between(15, 30);
        const heading = between(-Math.PI, Math.PI);
        windX = Math.cos(heading);
        windZ = Math.sin(heading);
        emit?.("summer-sea-breeze");
      }
      const gust = windFor ? time - windAt : 0;
      const breeze = windFor ? smoothstep(gust, 0, 1.6) * (1 - smoothstep(gust, windFor - 2.6, windFor)) : 0;
      if (!usedRain && time - entry >= 14 && worldTime >= showerAt && worldTime <= LAST_RAIN - 25) {
        usedRain = true;
        rainingAt = worldTime;
        duration = Math.min(duration, LAST_RAIN - worldTime - 5);
        wasRunning = false;
      }
      if (rainingAt !== undefined) {
        const since = worldTime - rainingAt;
        const end = duration + 4;
        const prior = from - rainingAt;
        const recovery = since - end;
        if (prior < 4 && since >= 4 && since < end) emit?.("summer-shower-start");
        if (prior < end && since >= end && recovery < 3) emit?.("summer-shower-end");
        if (prior < end + 4 && since >= end + 4 && recovery < 9) emit?.("summer-weather-rainbow");
        const inRain = since >= 4 && since < end;
        if (running && inRain && !wasRunning) {
          wasRunning = true;
          emit?.("summer-shower-running");
        }
        weather.overcast = smoothstep(since, 0, 4) * (1 - smoothstep(recovery, -3, 5));
        weather.rain = smoothstep(since, 3, 5.5) * (1 - smoothstep(recovery, -3, 0));
        weather.wet = smoothstep(since, 5, 15) * (1 - smoothstep(recovery, 0, 28));
        weather.rainbow = smoothstep(recovery, 1, 5) * (1 - smoothstep(recovery, 31, 37)) *
          (1 - smoothstep(worldTime, 162, DAY_LENGTH));
      }
      const showerBreeze = weather.overcast * .31;
      const gustWeight = Math.min(breeze, 1 - showerBreeze);
      weather.wind = gustWeight + showerBreeze;
      weather.x = (windX ?? .8) * gustWeight + .8 * showerBreeze;
      weather.z = (windZ ?? .6) * gustWeight + .6 * showerBreeze;
      weather.driftX += weather.x * elapsed;
      weather.driftZ += weather.z * elapsed;
      for (const at of meteorTimes) {
        if (from < at && worldTime >= at && worldTime - at < 2.5) {
          weather.meteors = random() < .16 ? 2 : 1;
          break;
        }
      }
      return weather;
    },
  };
}
