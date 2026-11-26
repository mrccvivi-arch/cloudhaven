import * as THREE from "three";

const smoothSphere = new THREE.SphereGeometry(1, 24, 16);
export const BODY_RADIUS = .80;
const ivory = new THREE.Color(0xfffaf1);
const rose = new THREE.Color(0xf5bfd0);
const lavender = new THREE.Color(0xd9cee9);
const petal = new THREE.Color(0xf5a7b8);

function createVelvetTexture() {
  const size = 128;
  const grains = new Uint8Array(size * size);
  const pixels = new Uint8Array(size * size * 4);
  let seed = 81241;
  for (let i = 0; i < grains.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    grains[i] = seed >>> 24;
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = y * size + x;
      const previous = ((y + size - 1) % size) * size + x;
      const next = ((y + 1) % size) * size + (x + 1) % size;
      const tuft = (grains[previous] + grains[index] * 2 + grains[next]) / 4;
      const cellSize = 4;
      const left = x - x % cellSize;
      const top = y - y % cellSize;
      const right = (left + cellSize) % size;
      const bottom = (top + cellSize) % size;
      const mixX = (x - left) / cellSize;
      const mixY = (y - top) / cellSize;
      const { lerp } = THREE.MathUtils;
      const nap = lerp(lerp(grains[top * size + left], grains[top * size + right], mixX),
        lerp(grains[bottom * size + left], grains[bottom * size + right], mixX), mixY);
      const value = Math.round(209 + tuft * .085 + nap * .105);
      pixels.set([value, value, value, 255], index * 4);
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 1);
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

const cream = new THREE.MeshStandardMaterial({
  color: 0xffffff, vertexColors: true, map: createVelvetTexture(),
  emissive: 0xffedf2, emissiveIntensity: .26, roughness: .92,
});

function paintCream(color, x, height, front) {
  const warm = THREE.MathUtils.smoothstep(front, .12, .91)
    * (1 - THREE.MathUtils.smoothstep(height, .42, .86));
  const cool = (1 - THREE.MathUtils.smoothstep(height, .02, .61))
    * (.43 + .46 * THREE.MathUtils.smoothstep(Math.abs(x), .10, .85));
  return color.copy(ivory).lerp(rose, warm * .35).lerp(lavender, cool * .57);
}

function paintCreamGeometry(geometry, width, bottom, height, depth) {
  const points = geometry.getAttribute("position");
  const colors = new Float32Array(points.count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < points.count; i++) {
    paintCream(color, points.getX(i) / width, (points.getY(i) - bottom) / height,
      -points.getZ(i) / depth).toArray(colors, i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

const tailGeometry = paintCreamGeometry(smoothSphere.clone(), 1, -1, 2, 1);
const eyeColor = new THREE.MeshStandardMaterial({ color: 0x251829, roughness: .23 });
const glint = new THREE.MeshBasicMaterial({ color: 0xfff9f0 });
const blushSize = 32;
const blushPixels = new Uint8Array(blushSize * blushSize * 4);
for (let y = 0; y < blushSize; y++) {
  for (let x = 0; x < blushSize; x++) {
    const radius = Math.hypot((x + .5) / blushSize * 2 - 1, (y + .5) / blushSize * 2 - 1);
    blushPixels[(y * blushSize + x) * 4 + 1] =
      Math.round(255 * (1 - THREE.MathUtils.smoothstep(radius, .15, 1)));
  }
}
const blushAlpha = new THREE.DataTexture(blushPixels, blushSize, blushSize);
blushAlpha.magFilter = THREE.LinearFilter;
blushAlpha.minFilter = THREE.LinearFilter;
blushAlpha.needsUpdate = true;
const blush = new THREE.MeshBasicMaterial({
  color: 0xef8fa8, alphaMap: blushAlpha, transparent: true, opacity: .62, depthWrite: false,
});

function surface(parent, geometry, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function oval(parent, material, x, y, z, width, height, depth) {
  const mesh = surface(parent, smoothSphere, material, x, y, z);
  mesh.scale.set(width, height, depth);
  return mesh;
}

function faceDepth(x, y) {
  return -Math.sqrt(Math.max(0, BODY_RADIUS ** 2 - x ** 2 - (y - BODY_RADIUS) ** 2));
}

const roundBody = paintCreamGeometry(
  new THREE.SphereGeometry(BODY_RADIUS, 48, 32).translate(0, BODY_RADIUS, 0),
  BODY_RADIUS, 0, 2 * BODY_RADIUS, BODY_RADIUS,
);

function earSurface(side) {
  const lengthSegments = 24;
  const ringSegments = 20;
  const radius = .148;
  const length = radius * 2;
  const points = [0, 0, 0];
  const colors = [ivory.r, ivory.g, ivory.b];
  const uvs = [.5, 0];
  const indices = [];
  const color = new THREE.Color();

  function triangle(a, b, c) {
    if (side < 0) indices.push(a, c, b);
    else indices.push(a, b, c);
  }

  // Closed elliptical sections taper to poles at the concealed root and rounded tip.
  for (let row = 1; row < lengthSegments; row++) {
    const t = (1 - Math.cos(row / lengthSegments * Math.PI)) * .5;
    const envelope = Math.sqrt(4 * t * (1 - t));
    const ring = points.length / 3;
    for (let column = 0; column < ringSegments; column++) {
      const angle = column / ringSegments * Math.PI * 2;
      const across = Math.cos(angle) * envelope;
      const through = Math.sin(angle) * envelope;
      const x = radius * across;
      const y = length * t;
      const z = radius * through;
      points.push(side * x, y, z);
      uvs.push((across + 1) * .5, t);
      const innerRose = 1 - THREE.MathUtils.smoothstep(
        Math.hypot(across / .84, (t - .54) / .39), .64, 1,
      );
      paintCream(color, across, t, -through).lerp(petal, innerRose
        * THREE.MathUtils.smoothstep(-through, .03, .45) * (.80 + .16 * t));
      colors.push(color.r, color.g, color.b);

      const next = ring + (column + 1) % ringSegments;
      const here = ring + column;
      if (row === 1) triangle(0, here, next);
      else {
        triangle(here - ringSegments, here, next);
        triangle(here - ringSegments, next, next - ringSegments);
      }
      if (row === lengthSegments - 1) triangle(here, 1 + (lengthSegments - 1) * ringSegments, next);
    }
  }
  points.push(0, length, 0);
  uvs.push(.5, 1);
  colors.push(ivory.r, ivory.g, ivory.b);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

const MOON_WIDTH = .32;
const MOON_HEIGHT = .32;

function createMoonMaterial() {
  const size = 64;
  const pixels = new Uint8Array(size * size * 4);
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      const x = ((column + .5) / size - .5) * MOON_WIDTH;
      const y = ((row + .5) / size - .5) * MOON_HEIGHT;
      const outer = .125 - Math.hypot(x, y + .008);
      const cutout = Math.hypot(x, y - .073) - .104;
      const edge = Math.min(outer, cutout);
      pixels[(row * size + column) * 4 + 1] =
        Math.round(255 * THREE.MathUtils.smoothstep(edge, -.012, .018));
    }
  }
  const mask = new THREE.DataTexture(pixels, size, size);
  mask.magFilter = THREE.LinearFilter;
  mask.minFilter = THREE.LinearFilter;
  mask.needsUpdate = true;
  return new THREE.MeshBasicMaterial({
    color: 0xffe49d, alphaMap: mask, transparent: true, opacity: .86, depthWrite: false,
  });
}

const moonGold = createMoonMaterial();
const crescent = fitToFace(new THREE.PlaneGeometry(MOON_WIDTH, MOON_HEIGHT, 16, 16)
  .rotateY(Math.PI), 0, 1.274, .004);

function fitToFace(geometry, centerX, centerY, offset) {
  const vertices = geometry.getAttribute("position");
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i) + centerX;
    const y = vertices.getY(i) + centerY;
    vertices.setXYZ(i, x, y, faceDepth(x, y) + vertices.getZ(i) - offset);
  }
  geometry.computeVertexNormals();
  return geometry;
}

const wingShape = new THREE.Shape();
wingShape.moveTo(0, 0);
wingShape.bezierCurveTo(.16, .32, .57, .46, .59, .26);
wingShape.bezierCurveTo(.62, .15, .53, .08, .43, .063);
wingShape.bezierCurveTo(.48, -.05, .34, -.12, .28, -.097);
wingShape.bezierCurveTo(.21, -.15, .08, -.083, 0, 0);
const wingGeometry = new THREE.ShapeGeometry(wingShape, 12);
const wingMaterial = new THREE.MeshBasicMaterial({
  color: 0xd4b4f3, transparent: true, opacity: .48, side: THREE.DoubleSide, depthWrite: false,
});
const wingOutline = new THREE.BufferGeometry().setFromPoints(wingShape.getPoints(12));
const wingEdge = new THREE.LineBasicMaterial({
  color: 0xf5e0ff, transparent: true, opacity: .78, depthWrite: false,
});

export function createCottonCandy() {
  const root = new THREE.Group();
  root.name = "Cotton Candy";
  const actionRig = new THREE.Group();
  const body = new THREE.Group();
  const restRim = { value: 0 };
  const fur = cream.clone();
  fur.customProgramCacheKey = () => "cotton-candy-rest-rim";
  fur.onBeforeCompile = (shader) => {
    shader.uniforms.restRim = restRim;
    shader.fragmentShader = `uniform float restRim;\n${shader.fragmentShader}`.replace(
      "#include <emissivemap_fragment>", `#include <emissivemap_fragment>
      if (restRim > 0.0) {
        float facing = clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0);
        float rim = pow(1.0 - facing, 3.0);
        totalEmissiveRadiance += vec3(1.0, .86, .66) * rim * restRim;
      }`);
  };
  // Scaling around the ground plane keeps the round body in contact.
  root.add(actionRig);
  actionRig.add(body);
  surface(body, roundBody, fur).name = "Round body";
  const tail = surface(body, tailGeometry, fur, 0, BODY_RADIUS, .764);
  tail.scale.setScalar(.175);
  tail.name = "Centered tail";
  surface(body, crescent, moonGold);

  const ears = [];
  const wings = [];
  const eyes = [];
  for (const side of [-1, 1]) {
    const ear = new THREE.Group();
    ear.name = side < 0 ? "Lower ear" : "Higher ear";
    ear.position.set(side * .337, side < 0 ? 1.459 : 1.479, -.022);
    body.add(ear);
    surface(ear, earSurface(side), fur);
    ears.push(ear);

    const wing = new THREE.Group();
    wing.position.set(side * .54, .95, .53);
    wing.scale.x = side;
    surface(wing, wingGeometry, wingMaterial);
    wing.add(new THREE.Line(wingOutline, wingEdge));
    body.add(wing);
    wings.push(wing);

    const eye = new THREE.Group();
    eye.position.set(side * .247, 1.001, faceDepth(side * .247, 1.001) - .012);
    eye.rotation.y = -side * .36;
    body.add(eye);
    oval(eye, eyeColor, 0, 0, 0, .079, .085, .042);
    oval(eye, glint, -.023, .027, -.038, .016, .015, .009);
    oval(eye, glint, .019, -.019, -.039, .007, .007, .006);
    eyes.push(eye);
    const cheek = new THREE.PlaneGeometry(.31, .172, 12, 8).rotateY(Math.PI);
    surface(body, fitToFace(cheek, side * .385, .883, .008), blush);

  }

  const touchMeshes = [];
  body.traverse((object) => { if (object.isMesh) touchMeshes.push(object); });

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(.66, 24).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x284538, transparent: true, opacity: .23, depthWrite: false }),
  );

  let clock = 0;
  let stride = 0;
  let pace = 0;
  let run = 0;
  let air = 0;
  let pitch = 0;
  let squash = 0;
  let landing = Infinity;
  let wasGrounded = true;
  let nextBlink = 2.8;
  let blinkTime = Infinity;
  const actions = new Map();
  actions.set("first-touch", {
    duration: .72,
    pose(_rig, progress, weight) {
      for (const [index, ear] of ears.entries()) {
        const side = index === 0 ? -1 : 1;
        ear.rotation.z += side * Math.sin(progress * Math.PI * 3 + index * .4) * weight * .14;
        ear.rotation.x += weight * .07;
      }
    },
  });
  let action;

  function update(dt, moving, grounded, verticalSpeed, seated = 0, breeze = 0, running = 0) {
    const { damp } = THREE.MathUtils;
    clock += dt;
    pace = damp(pace, moving && grounded ? 1 : 0, 10, dt);
    air = damp(air, grounded ? 0 : 1, 11, dt);
    pitch = damp(pitch, grounded ? 0 : Math.tanh(verticalSpeed / 5), 11, dt);
    run = damp(run, running, 10, dt);
    stride += dt * (12.5 * pace + (5 + air * 4) * run);
    if (!wasGrounded && grounded) landing = 0;
    wasGrounded = grounded;
    landing += dt;
    const recoil = Number.isFinite(landing) ? Math.sin(landing * 18) * Math.exp(-landing * 9) : 0;
    squash = damp(squash, air * (.041 + .045 * pitch) - .20 * recoil, 19, dt);

    if (clock >= nextBlink) {
      blinkTime = 0;
      nextBlink = clock + 3.1 + Math.random() * 2.2;
    }
    blinkTime += dt;
    const blink = Math.sin(Math.PI * Math.min(1, blinkTime / .16)) ** 2;
    const breath = (Math.sin(clock * 1.8) + .17 * Math.sin(clock * 2.71)) * .012;
    const step = Math.sin(stride) * pace;
    body.scale.set(1 - squash * .58 - breath * .25 + Math.abs(step) * .016,
      1 + squash + breath - Math.abs(step) * .018 - seated * .105, 1 - squash * .58);
    const hop = (.5 - .5 * Math.cos(stride)) * run * pace;
    body.position.set(0, hop * .15, 0);
    body.rotation.x = -.105 * run * (1 - air * .65);
    tail.rotation.x = -.15 + step * .23;
    eyes.forEach((eye) => { eye.scale.y = 1 - blink * .91; });

    for (let i = 0; i < ears.length; i++) {
      const side = i === 0 ? -1 : 1;
      wings[i].rotation.y = side * (.23 + Math.sin(clock * 3.4 + i * .25) * .10 + air * .14);
      wings[i].rotation.z = side * (.04 + Math.sin(clock * 2.5) * .04);
      const wind = seated * breeze * Math.sin(clock * 2.8 + i * .35);
      wings[i].rotation.z += wind * .105 + side * run * Math.sin(stride - .65) * .27;
      wings[i].rotation.y += side * run * Math.cos(stride - .65) * .16;
      const swing = Math.sin(stride - i * 2.55 - .75) * pace;
      const idleSwing = (i === 0 ? .088 : .064) *
        (Math.sin(clock * (i === 0 ? 1.68 : 1.41) + i * 1.7) + .10 * Math.sin(clock * .79 + i));
      ears[i].rotation.set(
        .13 + idleSwing * .38 + swing * .067 + air * .19 + pitch * .07 - recoil * .23,
        side * .12 + swing * .047 + wind * .07,
        -side * ((i === 0 ? .35 : .26) + idleSwing + swing * .046 + recoil * .15),
      );
    }

    actionRig.position.set(0, 0, 0);
    actionRig.rotation.set(0, 0, 0);
    actionRig.scale.setScalar(1);
    if (action) {
      action.elapsed += dt;
      const progress = Math.min(1, action.elapsed / action.duration);
      action.pose(actionRig, progress, Math.sin(Math.PI * progress) ** 2);
      if (progress === 1) action = undefined;
    }
  }

  return {
    root, shadow, update, touchMeshes,
    setSpringRim(strength) { restRim.value = strength; },
    reset() {
      stride = pace = run = air = pitch = squash = 0;
      landing = Infinity;
      wasGrounded = true;
      action = undefined;
    },
    // Overlay presentation-only clips for petting and play.
    registerAction(name, duration, pose) {
      actions.set(name, { duration, pose });
    },
    playAction(name) {
      const clip = actions.get(name);
      if (!clip) return false;
      action = { ...clip, elapsed: 0 };
      return true;
    },
  };
}
