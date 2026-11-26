import * as THREE from "three";
import {
  ISLAND_BRIDGE, PIER, TOWER, islandHeight, onRainbow, pierLocal, pierWidth, pondDistance, coastDistance,
} from "./summer-layout.js";

const TAU = Math.PI * 2;
const { lerp, smoothstep } = THREE.MathUtils;
const colors = [0xfff8eb, 0xffecab, 0xffffff, 0xc1def7, 0xfff4c1];
const capacity = 16;

function wingGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, .07);
  shape.lineTo(.15, .24);
  shape.lineTo(.29, .24);
  shape.lineTo(.34, .13);
  shape.lineTo(.29, .018);
  shape.lineTo(.21, -.025);
  shape.lineTo(.27, -.10);
  shape.lineTo(.20, -.19);
  shape.lineTo(.10, -.17);
  shape.lineTo(0, -.06);
  shape.closePath();
  return new THREE.ShapeGeometry(shape).rotateX(Math.PI / 2);
}

function safeFlight(x, z) {
  if (onRainbow(ISLAND_BRIDGE, x, z, 7.4) || Math.hypot(x - TOWER.x, z - TOWER.z) < TOWER.gallery + .35 ||
      pondDistance(x, z) < .95 || coastDistance(x, z) > .975) return false;
  const { across, along } = pierLocal(x, z);
  return along < -.6 || along > PIER.length + .6 || Math.abs(across) > pierWidth(along) / 2 + .6;
}

export function createSummerButterflies(parent, habitats, random = Math.random) {
  const wing = wingGeometry();
  const finish = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false });
  const body = new THREE.SphereGeometry(1, 6, 4).scale(.033, .034, .145);
  const bodyFinish = new THREE.MeshBasicMaterial({ color: 0x877a71 });
  const [left, right, bodies] = [wing, wing.clone().scale(-1, 1, 1), body].map((geometry, index) => {
    const batch = new THREE.InstancedMesh(geometry, index === 2 ? bodyFinish : finish, capacity);
    batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    batch.frustumCulled = false;
    batch.count = 0;
    parent.add(batch);
    return batch;
  });

  const beds = habitats.map(({ x, z, flowers }, index) => ({
    x, z, distance: Infinity, startle: -Infinity, ready: 0, flock: 0, escorted: false,
    birds: Array.from({ length: 4 }, (_, i) => {
      const flower = flowers[(index + i * 3) % flowers.length];
      return {
        flower, perch: islandHeight(flower.x, flower.z) + .52 * flower.scale,
        phase: random() * TAU, heading: 0, size: .80 + random() * .31,
        color: new THREE.Color(colors[(index * 2 + i) % colors.length]),
        x: flower.x, z: flower.z, y: 0, visible: false,
      };
    }),
  }));
  const nearby = [...beds];
  const pose = new THREE.Object3D();
  const pivot = new THREE.Matrix4();
  let age = 0, count = 0;

  function draw(bird, size, flap) {
    pose.position.set(bird.x, bird.y, bird.z);
    pose.rotation.set(.10, bird.heading, .08 * Math.cos(age * 2 + bird.phase));
    pose.scale.setScalar(size);
    pose.updateMatrix();
    bodies.setMatrixAt(count, pose.matrix);
    left.setMatrixAt(count, pivot.makeRotationZ(flap).premultiply(pose.matrix));
    right.setMatrixAt(count, pivot.makeRotationZ(-flap).premultiply(pose.matrix));
    left.setColorAt(count, bird.color);
    right.setColorAt(count++, bird.color);
  }

  function fly(bird, x, y, z, elapsed, speed) {
    const dx = x - bird.x, dz = z - bird.z;
    const factor = Math.min(1 - Math.exp(-elapsed * 3.5), elapsed * speed / Math.max(.001, Math.hypot(dx, dz)));
    const px = bird.x + dx * factor, pz = bird.z + dz * factor;
    if (safeFlight(px, pz)) {
      bird.x = px;
      bird.z = pz;
      if (dx * dx + dz * dz > .005) {
        const turn = Math.atan2(dx, dz) - bird.heading;
        bird.heading += Math.atan2(Math.sin(turn), Math.cos(turn)) * Math.min(1, elapsed * 7);
      }
    }
    bird.y = Math.max(islandHeight(bird.x, bird.z) + .25, lerp(bird.y, y, 1 - Math.exp(-elapsed * 5)));
  }

  return {
    reset() {
      for (const bed of beds) {
        bed.startle = -Infinity;
        for (const bird of bed.birds) bird.visible = false;
      }
      left.count = right.count = bodies.count = 0;
    },
    update(elapsed, night, player, facing, interactive, emit) {
      age += elapsed;
      count = 0;
      const daylight = 1 - smoothstep(night, .06, .79);
      for (const bed of beds) bed.distance = (bed.x - player.x) ** 2 + (bed.z - player.z) ** 2;
      nearby.sort((a, b) => a.distance - b.distance);
      const outdoors = safeFlight(player.x, player.z) && player.y < islandHeight(player.x, player.z) + 3.6;
      const closest = nearby.find((bed) => bed.distance < 3.45 ** 2 && age >= bed.ready);
      if (closest && outdoors && interactive && daylight > .35 &&
          beds.filter((bed) => age - bed.startle < 8).length < 2) {
        closest.startle = age;
        closest.ready = age + 30 + random() * 30;
        closest.flock = 2 + Math.floor(random() * 3);
        closest.follow = random() < .82 ? 1 + Number(closest.flock > 2 && random() < .5) : 0;
        closest.followUntil = .55 + 3 + random() * 2;
        closest.escorted = false;
        closest.departed = false;
        emit("summer-butterfly-startle");
      }

      let ambientBeds = Math.ceil(daylight * 4);
      for (const bed of nearby) {
        const since = age - bed.startle;
        const disturbed = since < 8;
        if (!daylight || bed.distance > (disturbed ? 55 : 18) ** 2 || (!disturbed && ambientBeds <= 0)) {
          for (const bird of bed.birds) bird.visible = false;
          continue;
        }
        if (!disturbed) ambientBeds--;
        const following = disturbed && bed.follow > 0 && since >= .55 && since < bed.followUntil &&
          outdoors && !bed.departed;
        if (following && !bed.escorted) {
          bed.escorted = true;
          if (interactive) emit("summer-butterfly-follow");
        }
        if (!following && bed.escorted && !bed.departed) {
          bed.departed = true;
          if (interactive) emit("summer-butterfly-leave");
        }

        const amount = disturbed ? bed.flock : daylight > .55 ? 2 : 1;
        for (let i = 0; i < amount; i++) {
          const bird = bed.birds[i];
          const { flower, perch, phase } = bird;
          if (!bird.visible) {
            bird.x = flower.x;
            bird.z = flower.z;
            bird.y = perch;
            bird.visible = true;
          }
          const loop = age * .63 + phase;
          const resting = 1 - smoothstep(Math.sin(age * .36 + phase), .35, .77);
          const spread = disturbed ? smoothstep(since, 0, 1.8) * (1 - smoothstep(since, 4.2, 8)) : resting;
          let x = flower.x + Math.cos(disturbed ? phase : loop) * (disturbed ? 3.7 : 1.05) * spread;
          let z = flower.z + Math.sin(disturbed ? phase : loop) * (disturbed ? 3.7 : 1.05) * spread;
          let y = perch + (.65 + .25 * Math.sin(loop * 1.8)) * spread + (disturbed ? .91 * spread : 0);
          if (following && i < bed.follow) {
            const side = i === 0 ? -1 : 1;
            const across = side * (2.15 + .4 * Math.sin(loop * 2));
            const behind = 1.45 + .48 * Math.cos(loop * 2);
            const px = player.x + Math.cos(facing) * across + Math.sin(facing) * behind;
            const pz = player.z - Math.sin(facing) * across + Math.cos(facing) * behind;
            if (safeFlight(px, pz)) {
              x = px;
              z = pz;
              y = islandHeight(px, pz) + 1.48 + .26 * Math.sin(loop * 2);
            }
          }
          if (!safeFlight(x, z)) {
            x = flower.x;
            z = flower.z;
          }
          fly(bird, x, y, z, elapsed, following && i < bed.follow ? 12 : disturbed ? 6.2 : 1.35);
          const flap = .25 + Math.sin(age * (disturbed ? 25 : 18) + phase) * (disturbed ? .91 : .14 + resting * .65);
          const fade = smoothstep(daylight, 0, .38) * (disturbed && i >= 2 ? 1 - smoothstep(since, 7.1, 8) : 1);
          draw(bird, bird.size * fade, flap);
        }
        for (let i = amount; i < bed.birds.length; i++) bed.birds[i].visible = false;
      }

      for (const batch of [left, right, bodies]) {
        batch.count = count;
        if (count) {
          batch.instanceMatrix.needsUpdate = true;
          if (batch.instanceColor) batch.instanceColor.needsUpdate = true;
        }
      }
    },
  };
}
