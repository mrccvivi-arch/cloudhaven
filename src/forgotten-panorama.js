import { Box3, MathUtils, Vector3 } from "three";

export const panoramaZoom = { min: .35, max: 1.32 };
export const panoramaFog = .00042;
export const panoramaLifeFade = .08;

export function createPanoramaFrame(landmarks) {
  const points = [];
  const point = new Vector3();
  let radius = 0;
  function record(x, y, z) {
    points.push(x, y, z);
    radius = Math.max(radius, Math.hypot(x, y, z));
  }

  for (const landmark of new Set(landmarks)) {
    landmark.updateWorldMatrix(true, true);
    if (landmark.isMesh) {
      // Use the actual island outlines instead of their empty bounding-box corners.
      const position = landmark.geometry.attributes.position;
      for (let i = 0; i < position.count; i++) {
        point.fromBufferAttribute(position, i).applyMatrix4(landmark.matrixWorld);
        record(point.x, point.y, point.z);
      }
    } else {
      const { min, max } = new Box3().setFromObject(landmark);
      for (const x of [min.x, max.x]) {
        for (const y of [min.y, max.y]) {
          for (const z of [min.z, max.z]) record(x, y, z);
        }
      }
    }
  }

  const outward = new Vector3(), right = new Vector3(), up = new Vector3();
  const cameraRight = new Vector3(), cameraUp = new Vector3();
  return (aspect, fov) => {
    const portrait = 1 - MathUtils.smoothstep(aspect, .50, 1.04);
    const yaw = MathUtils.lerp(-.50, -.65, portrait);
    const pitch = MathUtils.lerp(.33, .59, portrait);
    const roll = .43 * portrait;
    outward.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    right.set(Math.cos(yaw), 0, -Math.sin(yaw));
    up.crossVectors(outward, right);
    cameraRight.copy(right).multiplyScalar(Math.cos(roll)).addScaledVector(up, Math.sin(roll));
    cameraUp.copy(up).multiplyScalar(Math.cos(roll)).addScaledVector(right, -Math.sin(roll));

    const tangent = Math.tan(MathUtils.degToRad(fov / 2));
    const halfWidth = .94 * tangent * aspect;
    const halfHeight = .84 * tangent;
    let left = Infinity, rightEdge = -Infinity, bottom = Infinity, top = -Infinity;
    let near = -Infinity, far = Infinity;
    for (let i = 0; i < points.length; i += 3) {
      point.fromArray(points, i);
      const x = point.dot(cameraRight), y = point.dot(cameraUp), depth = point.dot(outward);
      // Perspective makes nearer landmarks occupy more of the same frame.
      left = Math.min(left, x - halfWidth * depth);
      rightEdge = Math.max(rightEdge, x + halfWidth * depth);
      bottom = Math.min(bottom, y - halfHeight * depth);
      top = Math.max(top, y + halfHeight * depth);
      near = Math.max(near, depth);
      far = Math.min(far, depth);
    }
    const centerDepth = (near + far) / 2;
    const target = cameraRight.clone().multiplyScalar((left + rightEdge) / 2)
      .addScaledVector(cameraUp, (bottom + top) / 2)
      .addScaledVector(outward, centerDepth);
    const distance = Math.max((rightEdge - left) / (2 * halfWidth), (top - bottom) / (2 * halfHeight), near + 10)
      - centerDepth;
    const clip = distance * panoramaZoom.max + radius + target.length() + 30;
    return { yaw, pitch, roll, target, distance, clip };
  };
}
