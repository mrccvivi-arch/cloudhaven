import * as THREE from "three";
import { makePoints } from "../previews/snow-whale/snow.js";

export function createWhaleMotes(parent, map, reduced) {
  const slots = Array.from({ length: reduced ? 12 : 16 }, () => ({
    born: -Infinity, location: new THREE.Vector3(),
  }));
  const batch = makePoints(parent, map, slots.length, .27, 3);
  const { smoothstep } = THREE.MathUtils;
  let cursor, clock, interval;

  function reset() {
    for (const mote of slots) mote.born = -Infinity;
    batch.material.visible = false;
    cursor = interval = clock = 0;
  }
  reset();

  return {
    reset,
    update(dt, whale, age, release, darkness) {
      clock += dt;
      interval = release ? interval + dt : 0;
      if (interval > .29) {
        interval %= .29;
        const mote = slots[cursor % slots.length];
        const source = 3 + cursor % 3;
        const side = Math.sin(cursor * 2.39);
        whale.snowPoint(mote.location, age, source, .96, side > 0 ? .04 : .96);
        mote.born = clock;
        mote.side = side;
        mote.life = 1.43 + .76 * Math.abs(side);
        mote.size = .53 + .52 * Math.abs(side);
        cursor++;
      }
      let count = 0;
      for (const mote of slots) {
        const elapsed = clock - mote.born;
        if (elapsed >= mote.life || !Number.isFinite(elapsed)) continue;
        const t = elapsed / mote.life;
        const opacity = smoothstep(t, 0, .16) * (1 - smoothstep(t, .25, 1));
        const drift = elapsed * (1.1 - .33 * t);
        const { x, y, z } = mote.location;
        batch.positions.setXYZ(count, x + drift * mote.side, y - .18 * drift, z + .65 * drift);
        batch.colors.setXYZW(count, .69 + .23 * Math.abs(mote.side), .77, 1, opacity * (.46 + darkness * .28));
        batch.scales.setX(count, mote.size);
        count++;
      }
      batch.material.visible = count > 0;
      if (!count) return;
      batch.geometry.setDrawRange(0, count);
      batch.positions.needsUpdate = batch.colors.needsUpdate = batch.scales.needsUpdate = true;
    },
  };
}
