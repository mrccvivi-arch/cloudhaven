import * as THREE from "three";
import { normalizeParameters } from "./parameters.js";

const shellKeys = [
  "width", "height", "depth", "flat", "lean", "lobes", "amplitude", "roundness", "asymmetry",
  "crest", "crestSize", "crestLength", "crestPosition", "crestBend", "crestAsym",
  "feet", "feetSize", "feetPosition", "feetLength", "tail", "tailSize", "tailPosition", "tailLength",
];
const materialKeys = ["bodyColor", "roughness", "sheen", "glow"];
const animationKeys = ["speed", "motion", "hover"];
const tau = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;

function cloudSurface(p) {
  const geometry = new THREE.SphereGeometry(1, 80, 52);
  const points = geometry.attributes.position;
  const direction = new THREE.Vector3();
  const crestDirection = (x, z) => new THREE.Vector3(x, 1, z).normalize();
  const crestLeft = crestDirection(p.crestPosition - (p.crest === "double" ? 0.49 : 0), -0.07);
  const crestRight = crestDirection(p.crestPosition + 0.49, -0.17);
  const tail = new THREE.Vector3(0.52 * p.tailPosition, -0.69, -0.84).normalize();
  const footX = lerp(0.24, 0.61, p.feetPosition);
  const footLeft = new THREE.Vector3(-footX, -0.85, 0.57).normalize();
  const footRight = new THREE.Vector3(footX, -0.85, 0.58).normalize();
  const lobe = (axis, spread) => Math.exp((direction.dot(axis) - 1) / spread);
  const exponent = lerp(0.83, 1.04, p.roundness);
  const ground = -1 + 0.34 * p.flat;

  const nearShoulder = new THREE.Vector3(-0.53, 0.76, 0.37).normalize();
  const farShoulder = new THREE.Vector3(0.57, 0.75, 0.19).normalize();
  const cloudShoulders = Array.from({ length: p.lobes }, (_, index) => {
    const angle = index / p.lobes * tau + 0.36;
    const axis = new THREE.Vector3(Math.cos(angle), 0.68 + 0.21 * Math.sin(index * 2.7), Math.sin(angle)).normalize();
    return { axis, height: 0.64 + p.asymmetry * Math.sin(index * 2.14 + 0.55) };
  });

  for (let i = 0; i < points.count; i++) {
    direction.fromBufferAttribute(points, i);
    const { x, y, z } = direction;
    const angle = Math.atan2(z, x);
    const shoulder = Math.exp(-((y - 0.42) ** 2) / 0.21);
    const ripple = Math.cos(p.lobes * angle + 0.75 + y * 1.2) * 0.49
      + Math.sin(2 * angle - 0.35 + y * 0.8) * p.asymmetry * 1.35;
    const poleFade = THREE.MathUtils.smoothstep(Math.hypot(x, z), 0.03, 0.53);
    const swell = 1 + p.amplitude * shoulder * (0.22 + ripple * poleFade);
    const power = (value) => Math.sign(value) * Math.abs(value) ** exponent;
    let px = power(x) * swell + p.asymmetry * 0.19 * (y + 0.3) ** 2;
    let py = power(y) * swell + p.amplitude * 0.57 * (x * x - z * z) * Math.max(0, y)
      + p.asymmetry * 0.25 * x * (y + 0.8);
    let pz = power(z) * swell * (1 - p.asymmetry * 0.19 * y);

    // Broad, oblique shoulder swells leave the front lower area clear for the face.
    for (const { axis, height } of cloudShoulders) {
      const puff = lobe(axis, 0.059 + p.roundness * 0.052) * p.amplitude * height;
      px += axis.x * puff * 0.74;
      py += puff * 1.39;
      pz += axis.z * puff * 0.64;
    }

    const near = lobe(nearShoulder, 0.074) * p.amplitude * (0.92 + p.asymmetry * 0.5);
    const far = lobe(farShoulder, 0.085) * p.amplitude * (0.88 - p.asymmetry * 0.36);
    py += near + far;
    px += (far - near) * 0.26;
    pz += near * 0.26;

    if (p.crest !== "none") {
      const spread = lerp(0.023, 0.115, p.crestSize) * (p.crest === "feeler" ? 0.6 : 1);
      const left = lobe(crestLeft, spread);
      const right = p.crest === "double" ? lobe(crestRight, spread * 0.86) * (1 - p.crestAsym * 0.62) : 0;
      const lift = (left + right) * p.crestLength * (p.crest === "feeler" ? 0.82 : 0.58);
      py += lift;
      px += p.crestBend * lift * (left - right) * 0.55 + (right - left) * lift * 0.17;
    }
    if (p.tail !== "none") {
      const weight = lobe(tail, lerp(0.024, 0.13, p.tailSize));
      const extension = weight * p.tailLength * (p.tail === "flowing" ? 1 : 0.48);
      px += extension * (p.tailPosition * 0.42 + weight * p.tailPosition * 0.48);
      py -= extension * (0.47 - weight * 0.37);
      pz -= extension * 0.83;
    }

    // Smooth maximum forms a soft contact patch without a hard edge.
    const blend = Math.max(0, 0.23 * p.flat - Math.abs(py - ground));
    py = Math.max(py, ground) + blend * blend / (0.92 * p.flat || 1);
    if (p.feet !== "none") {
      const bulge = Math.max(lobe(footLeft, 0.045 * p.feetSize), lobe(footRight, 0.046 * p.feetSize));
      py -= bulge * p.feetSize * (p.feet === "short" ? 0.24 : 0.105);
      pz += bulge * p.feetLength * (p.feet === "short" ? 0.31 : 0.17);
    }
    points.setXYZ(i, (px + p.lean * py) * p.width / 2, py * p.height / 2, pz * p.depth / 2);
  }
  geometry.computeVertexNormals();
  // SphereGeometry duplicates vertices at the seam and poles for UVs.
  const normals = geometry.attributes.normal;
  const average = new THREE.Vector3();
  for (let row = 0; row <= 52; row++) {
    const first = row * 81;
    const pole = row === 0 || row === 52;
    average.set(0, 0, 0);
    for (let col = 0; col <= 80; col += pole ? 1 : 80) average.add(direction.fromBufferAttribute(normals, first + col));
    average.normalize();
    for (let col = 0; col <= 80; col += pole ? 1 : 80) normals.setXYZ(first + col, average.x, average.y, average.z);
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

const faceBounds = { x: 0.96, bottom: -0.68, top: 0.76 };

function faceSurface(shell, p) {
  const { x, bottom, top } = faceBounds;
  const columns = 48;
  const rows = 36;
  const stride = columns + 1;
  const count = stride * (rows + 1);
  const depth = new Float32Array(count).fill(-Infinity);
  const vertices = shell.attributes.position;
  const triangles = shell.index.array;
  const projected = new Float32Array(vertices.count * 2);
  for (let i = 0; i < vertices.count; i++) {
    const y = vertices.getY(i) * 2 / p.height;
    projected[i * 2] = (vertices.getX(i) * 2 / p.width - p.lean * y + x) / (2 * x) * columns;
    projected[i * 2 + 1] = (y - bottom) / (top - bottom) * rows;
  }

  // Rasterize the shell in face space to sample the frontmost triangle at each point.
  for (let i = 0; i < triangles.length; i += 3) {
    const a = triangles[i], b = triangles[i + 1], c = triangles[i + 2];
    const ax = projected[a * 2], ay = projected[a * 2 + 1];
    const bx = projected[b * 2], by = projected[b * 2 + 1];
    const cx = projected[c * 2], cy = projected[c * 2 + 1];
    const determinant = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (determinant < 1e-8) continue;
    const minX = Math.max(0, Math.ceil(Math.min(ax, bx, cx)));
    const maxX = Math.min(columns, Math.floor(Math.max(ax, bx, cx)));
    const minY = Math.max(0, Math.ceil(Math.min(ay, by, cy)));
    const maxY = Math.min(rows, Math.floor(Math.max(ay, by, cy)));
    for (let row = minY; row <= maxY; row++) {
      for (let col = minX; col <= maxX; col++) {
        const u = ((col - ax) * (cy - ay) - (row - ay) * (cx - ax)) / determinant;
        const v = ((bx - ax) * (row - ay) - (by - ay) * (col - ax)) / determinant;
        if (u < -1e-6 || v < -1e-6 || u + v > 1.000001) continue;
        const z = vertices.getZ(a) * (1 - u - v) + vertices.getZ(b) * u + vertices.getZ(c) * v;
        const index = row * stride + col;
        depth[index] = Math.max(depth[index], z);
      }
    }
  }

  const points = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const indices = [];
  for (let row = 0; row <= rows; row++) {
    for (let col = 0; col <= columns; col++) {
      const index = row * stride + col;
      const u = col / columns;
      const v = row / rows;
      const y = lerp(bottom, top, v);
      points[index * 3] = (lerp(-x, x, u) + p.lean * y) * p.width / 2;
      points[index * 3 + 1] = y * p.height / 2;
      points[index * 3 + 2] = Number.isFinite(depth[index]) ? depth[index] + 0.009 : 0;
      uv.set([u, v], index * 2);
      if (!row || !col) continue;
      const a = index - stride - 1, b = a + 1, c = index - 1;
      if ([a, b, c].every((point) => Number.isFinite(depth[point]))) indices.push(a, b, c);
      if ([b, index, c].every((point) => Number.isFinite(depth[point]))) indices.push(b, index, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(points, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  return geometry;
}

function paintFace(canvas, p, blink, expression) {
  const ctx = canvas.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const sx = canvas.width / (p.width * faceBounds.x);
  const sy = canvas.height / (p.height / 2 * (faceBounds.top - faceBounds.bottom));
  ctx.setTransform(sx, 0, 0, sy, canvas.width / 2, faceBounds.top * p.height / 2 * sy);
  const ellipse = (x, y, rx, ry, color) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, tau);
    ctx.fill();
  };
  const eyeX = p.eyeGap * p.width / 2;
  const eyeY = -p.eyeHeight * p.height / 2;
  const eyeSize = p.eyeSize * Math.min(1, p.height / 1.24, p.width / 1.55);
  const aspect = eyeSize * p.eyeAspect;
  const open = (expression === "sleepy" ? 0.38 : expression === "curious" ? 1.16 : 1) * (1 - blink);
  ctx.lineCap = "round";
  for (const side of [-1, 1]) {
    const x = eyeX * side;
    const y = eyeY + (side > 0 ? p.asymmetry * 0.025 : 0);
    const blushX = side * Math.min(eyeX + 0.125, p.width * 0.37);
    const blushY = y + eyeSize * 1.2;
    const blushRadius = Math.min(0.135, p.width * 0.1);
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, blushRadius);
    gradient.addColorStop(0, p.blushColor);
    gradient.addColorStop(1, p.blushColor + "00");
    ctx.save();
    ctx.translate(blushX, blushY);
    ctx.scale(1, 0.61);
    ctx.globalAlpha = p.blush;
    ellipse(0, 0, blushRadius, blushRadius, gradient);
    ctx.restore();

    if (expression === "closed" || open < 0.19) {
      ctx.strokeStyle = p.eyeColor;
      ctx.lineWidth = eyeSize * 0.24;
      ctx.beginPath();
      ctx.moveTo(x - aspect, y + eyeSize * 0.2);
      ctx.quadraticCurveTo(x, y + eyeSize * (expression === "closed" ? -0.73 : 0.82), x + aspect, y + eyeSize * 0.2);
      ctx.stroke();
    } else {
      const ry = eyeSize * open * (p.eyeShape === "round" ? 0.91 : 1);
      const iris = ctx.createLinearGradient(x, y - ry, x, y + ry);
      iris.addColorStop(0, p.eyeColor);
      iris.addColorStop(1, p.eyeColor + "dc");
      if (p.eyeShape === "seed") {
        ctx.fillStyle = iris;
        ctx.beginPath();
        ctx.moveTo(x - aspect * 0.19, y - ry);
        ctx.bezierCurveTo(x + aspect * 0.94, y - ry, x + aspect * 1.48, y + ry * 0.64, x + aspect * 0.35, y + ry);
        ctx.bezierCurveTo(x - aspect * 1.16, y + ry * 1.15, x - aspect * 1.15, y - ry * 0.81, x - aspect * 0.19, y - ry);
        ctx.fill();
      } else {
        ellipse(x, y, aspect, ry, iris);
      }
      if (p.highlight > 0) {
        const r = eyeSize * p.highlight;
        ellipse(x - aspect * 0.27, y - ry * 0.39, r, r * Math.min(1, open), "#fff9ee");
        ellipse(x + aspect * 0.36, y + ry * 0.38, r * 0.44, r * Math.min(1, open) * 0.44, "#fff5e0a8");
      }
    }
  }

  const mouthY = -p.mouthHeight * p.height / 2;
  const mouth = p.mouthSize;
  if (p.mouth === "round") {
    const happy = expression === "happy";
    ellipse(0, mouthY, mouth * (happy ? 1.06 : 0.68), mouth * (happy ? 0.66 : 0.58), p.eyeColor);
    if (happy) ellipse(0, mouthY + mouth * 0.27, mouth * 0.49, mouth * 0.23, "#ce8f8c");
  } else {
    ctx.strokeStyle = p.eyeColor;
    ctx.lineWidth = mouth * 0.22;
    ctx.beginPath();
    ctx.moveTo(-mouth, mouthY);
    ctx.quadraticCurveTo(0, mouthY + mouth * (p.mouth === "small" ? 0.24 : expression === "happy" ? 1.47 : 1.02), mouth, mouthY);
    ctx.stroke();
  }

  if (p.mark) {
    const x = p.markX * p.width / 2;
    const y = -p.markY * p.height / 2;
    const r = p.markSize;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.38);
    const gold = ctx.createLinearGradient(-r, -r, r, r);
    gold.addColorStop(0, "#fff1c3");
    gold.addColorStop(0.54, p.markColor);
    gold.addColorStop(1, p.markColor);
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.arc(0, 0, r, -1.15, 1.15, true);
    ctx.bezierCurveTo(-r * 0.83, r * 0.42, -r * 0.84, -r * 0.48, r * Math.cos(1.15), -r * Math.sin(1.15));
    ctx.fill();
    ctx.restore();
  }
}

const loops = new Set(["breathe", "float"]);
const durations = { blink: 0.46, land: 0.64 };

function samplePose(mode, time, p, out) {
  const wave = Math.sin(time * 2.2);
  const motion = p.motion;
  const progress = clamp(time / (durations[mode] || 1), 0, 1);
  out.y = p.hover + (p.hover > 0 ? wave * 0.054 * motion : 0);
  out.sy = 1 + wave * 0.019 * motion;
  out.glow = p.glow * 0.44;
  out.blink = mode === "blink" ? Math.sin(Math.PI * progress) ** 1.6 : 0;
  if (mode === "float") out.y += (0.25 + wave * 0.14) * motion;
  if (mode === "land") out.sy -= Math.sin(progress * tau * 1.55) * (1 - progress) * 0.3 * motion;

}

// Each instance owns its GPU resources. The host controls lighting, camera and time.
export function createMoonModel(input) {
  const root = new THREE.Group();
  const pose = new THREE.Group();
  root.add(pose);
  const bodyMaterial = new THREE.MeshPhysicalMaterial({
    sheenColor: 0xfff7ee, sheenRoughness: 0.72, specularIntensity: 0.25,
    emissive: 0xffdfb4,
  });
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 768;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const faceMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
  const body = new THREE.Mesh(new THREE.BufferGeometry(), bodyMaterial);
  const face = new THREE.Mesh(new THREE.BufferGeometry(), faceMaterial);
  face.renderOrder = 1;
  pose.add(body, face);
  let p;
  let floor = 0;
  let faceSignature = "";
  let mode = "breathe";
  let time = 0;
  let clock = 0;
  const current = {};
  const target = {};
  const faceKeys = Object.keys(normalizeParameters(input)).filter(
    (key) => !shellKeys.includes(key) && !materialKeys.includes(key) && !animationKeys.includes(key) && key !== "preset",
  );

  function setParameters(values) {
    const next = normalizeParameters(values);
    if (shellKeys.some((key) => next[key] !== p?.[key])) {
      const geometry = cloudSurface(next);
      body.geometry.dispose();
      body.geometry = geometry;
      floor = geometry.boundingBox.min.y;
      face.geometry.dispose();
      face.geometry = faceSurface(geometry, next);
      faceSignature = "";
    }
    if (faceKeys.some((key) => next[key] !== p?.[key])) faceSignature = "";
    bodyMaterial.color.set(next.bodyColor);
    bodyMaterial.roughness = next.roughness;
    bodyMaterial.sheen = next.sheen;
    p = next;
  }

  function update(dt) {
    clock += dt;
    time += dt * p.speed;
    samplePose(mode, time, p, target);
    if (durations[mode] && time >= durations[mode]) {
      mode = "breathe";
      time = 0;
    }
    for (const key of Object.keys(target)) {
      current[key] = lerp(current[key] ?? target[key], target[key], key === "blink" ? 1 : 1 - Math.exp(-dt * 13));
    }
    const spread = 1 + (1 - current.sy) * 0.56;
    pose.scale.set(spread, current.sy, spread);
    pose.position.y = current.y - floor * current.sy;
    bodyMaterial.emissiveIntensity = current.glow;
    const autoBlink = Math.max(0, 1 - Math.abs(clock % 5.9 - 5.5) / 0.12);
    const blink = Math.round(Math.max(current.blink, autoBlink) * 10) / 10;
    const expression = p.expression;
    const signature = expression + blink;
    if (signature !== faceSignature) {
      paintFace(canvas, p, blink, expression);
      texture.needsUpdate = true;
      faceSignature = signature;
    }
  }

  setParameters(input);
  update(0);
  return {
    root,
    setParameters,
    update,
    play(name) {
      mode = loops.has(name) || Object.prototype.hasOwnProperty.call(durations, name) ? name : "breathe";
      time = 0;
    },
    getBounds() {
      return body.geometry.boundingBox.clone().translate(new THREE.Vector3(0, -floor + p.hover, 0));
    },
    dispose() {
      body.geometry.dispose();
      face.geometry.dispose();
      bodyMaterial.dispose();
      faceMaterial.dispose();
      texture.dispose();
    },
  };
}
