import { Group } from "three";
import { createWalker,s1 } from "./layout.js";
import { s2 } from "./loop-layout.js";
import { clockStone,createStoneSpace } from "./stone.js";
import { placePlantings } from "./plantings.js";
import { createBrokenClock } from "./broken-clock.js";
import { createAmbientMotion } from "./ambient-motion.js";

const planted = new WeakMap();

export function createForgottenWorld(layout=s2,timeStudy=true,ambient=true) {
  const world = new Group();
  const source = ambient ? {stairs:[],shards:[]} : undefined;
  const rocks = createStoneSpace(world,layout,timeStudy,source);
  if (!planted.has(layout)) {
    const plants = new Group();
    const floral = layout === s1 ? undefined : {blooms:[]};
    planted.set(layout,{plants,floral,volumes:placePlantings(plants,layout,floral)});
  }
  const {plants,floral,volumes:plantVolumes} = planted.get(layout);
  const plantGroup = plants.clone();
  world.add(plantGroup);
  const clock = timeStudy ? createBrokenClock(clockStone) : null;
  if (clock) {
    world.add(clock.root);
    rocks.push(clock.plate);
  }
  const motion = ambient ? createAmbientMotion(world,Object.assign(source,floral),layout) : null;
  const walker = createWalker(layout.spawn,layout);
  world.updateMatrixWorld(true);
  return {world,rocks,plantGroup,plantVolumes,walker,clock,motion,clockSeconds:0};
}

export const forgottenView = {
  orbit:{yaw:-.65,pitch:.18,distance:12.7},
  wide:{yaw:-.50,pitch:.33,distance:194,target:[9,7,1]},
};
