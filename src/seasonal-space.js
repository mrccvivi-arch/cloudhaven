import { GOLDEN_GINKGO } from "./map.js";
import { springPoint, SPRING_POOL } from "./spring-layout.js";

function bounds(xMin, zMin, xMax, zMax) {
  return Object.freeze({ xMin, zMin, xMax, zMax });
}

const springMin = springPoint(35, -19), springMax = springPoint(81, 24);

// Development planning only. Bounds do not drive rendering, collision, or minimap markers.
export const SEASONAL_SPACE = Object.freeze({
  spring: Object.freeze({
    center: Object.freeze({ x: SPRING_POOL.x, z: SPRING_POOL.z }),
    bounds: bounds(springMin.x, springMin.z, springMax.x, springMax.z),
    status: "landscape",
  }),
  summer: Object.freeze({
    center: Object.freeze({ x: 57.5, z: -51.5 }),
    bounds: bounds(43, -69, 72, -34),
    status: "reserved",
  }),
  autumn: Object.freeze({
    center: Object.freeze({ x: GOLDEN_GINKGO.x, z: GOLDEN_GINKGO.z }),
    bounds: bounds(52, 22, 76, 44),
    status: "landscape",
  }),
  winter: Object.freeze({
    center: Object.freeze({ x: 21.5, z: 57.5 }),
    bounds: bounds(3, 42, 40, 73),
    status: "reserved",
    // Continuous interior available for a future frozen lake and a bank for exploration.
    lakeStudy: bounds(12, 47, 32, 67),
  }),
});
