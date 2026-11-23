import * as THREE from "three";

const smoothSphere = new THREE.SphereGeometry(1, 24, 16);
const HEIGHT = 1.723;
const FOOT_RADIUS = .108;
const FOOT_Z = -.152;
const PAW_X = .321;
const PAW_Y = .598;
const PAW_Z = -.405;
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

const velvetSphere = paintCreamGeometry(smoothSphere.clone(), 1, -1, 2, 1);
const eyeColor = new THREE.MeshStandardMaterial({ color: 0x251829, roughness: .23 });
const glint = new THREE.MeshBasicMaterial({ color: 0xfff9f0 });
const moonGold = new THREE.MeshStandardMaterial({
  color: 0xffe8af, emissive: 0xffda87, emissiveIntensity: .66, roughness: .48,
});
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
  const mesh = surface(parent, material === cream ? velvetSphere : smoothSphere, material, x, y, z);
  mesh.scale.set(width, height, depth);
  return mesh;
}

// A single surface runs from the belly through the cheeks to the crown.
const profile = new THREE.SplineCurve([
  [0, .09], [.29, .105], [.415, .175], [.50, .285], [.535, .435], [.515, .575],
  [.475, .685], [.48, .748], [.575, .818], [.662, .926], [.692, 1.064],
  [.678, 1.214], [.62, 1.373], [.519, 1.521], [.379, 1.635],
  [.203, 1.701], [0, HEIGHT],
].map(([r, y]) => new THREE.Vector2(r, y))).getPoints(52);

function headOffset(y) {
  return THREE.MathUtils.smoothstep(y, .62, 1.06) * .17;
}

function depthRatio(y) {
  return 1.04 - THREE.MathUtils.smoothstep(y, .55, 1.1) * .185;
}

function faceDepth(x, y) {
  const row = profile.findIndex((point) => point.y >= y);
  const lower = profile[row - 1];
  const upper = profile[row];
  const radius = THREE.MathUtils.lerp(lower.x, upper.x, (y - lower.y) / (upper.y - lower.y));
  return -depthRatio(y) * Math.sqrt(Math.max(0, radius * radius - x * x)) - headOffset(y);
}

function silhouette() {
  const segments = 40;
  const geometry = new THREE.LatheGeometry(profile, segments);
  const vertices = geometry.getAttribute("position");
  for (let i = 0; i < vertices.count; i++) {
    const y = vertices.getY(i);
    vertices.setZ(i, vertices.getZ(i) * depthRatio(y) - headOffset(y));
  }
  geometry.computeVertexNormals();
  // Lathe duplicates the seam, so share the resulting normals across it.
  const normals = geometry.getAttribute("normal");
  for (let row = 0; row < profile.length; row++) {
    const end = segments * profile.length + row;
    const normal = new THREE.Vector3().fromBufferAttribute(normals, row)
      .add(new THREE.Vector3().fromBufferAttribute(normals, end)).normalize();
    normals.setXYZ(row, normal.x, normal.y, normal.z);
    normals.setXYZ(end, normal.x, normal.y, normal.z);
  }
  return paintCreamGeometry(geometry, .70, .09, HEIGHT - .09, .72);
}

function earSurface(side) {
  const lengthSegments = 24;
  const ringSegments = 20;
  const axis = new THREE.CubicBezierCurve(
    new THREE.Vector2(),
    new THREE.Vector2(.25, side < 0 ? .55 : .81),
    new THREE.Vector2(.79, side < 0 ? .63 : 1.08),
    new THREE.Vector2(1.08, side < 0 ? .10 : .87),
  );
  const points = [0, 0, 0];
  const colors = [ivory.r, ivory.g, ivory.b];
  const uvs = [.5, 0];
  const indices = [];
  const center = new THREE.Vector2();
  const tangent = new THREE.Vector2();
  const color = new THREE.Color();
  const tip = axis.getPoint(1);

  function triangle(a, b, c) {
    if (side < 0) indices.push(a, c, b);
    else indices.push(a, b, c);
  }

  // Closed elliptical sections taper to poles at the concealed root and rounded tip.
  for (let row = 1; row < lengthSegments; row++) {
    const t = (1 - Math.cos(row / lengthSegments * Math.PI)) * .5;
    axis.getPoint(t, center);
    axis.getTangent(t, tangent);
    const envelope = Math.sqrt(4 * t * (1 - t));
    const width = .22 + (side < 0 ? .23 : .19) * t;
    const crossX = THREE.MathUtils.lerp(.73, tangent.y, .36);
    const crossY = THREE.MathUtils.lerp(.68, tangent.x, .36);
    const ring = points.length / 3;
    for (let column = 0; column < ringSegments; column++) {
      const angle = column / ringSegments * Math.PI * 2;
      const across = Math.cos(angle) * envelope;
      const through = Math.sin(angle) * envelope;
      const x = .83 * center.x + crossX * across * width;
      const y = .84 * center.y - crossY * across * width;
      const z = .06 * t * t + through * (.116 + .041 * t);
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
  points.push(side * .83 * tip.x, .84 * tip.y, .06);
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

function crescent() {
  const shape = new THREE.Shape();
  shape.moveTo(-.088, .079);
  shape.bezierCurveTo(-.182, -.01, -.107, -.132, 0, -.12);
  shape.bezierCurveTo(.114, -.122, .171, -.005, .091, .076);
  shape.bezierCurveTo(.129, -.064, -.131, -.066, -.088, .079);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: .012, bevelEnabled: true, bevelThickness: .009, bevelSize: .008,
    bevelSegments: 2, curveSegments: 10, steps: 1,
  });
  geometry.rotateY(Math.PI);
  return fitToFace(geometry, 0, 1.464, .016);
}

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

export function createCottonCandy() {
  const root = new THREE.Group();
  root.name = "Cotton Candy";
  const actionRig = new THREE.Group();
  const body = new THREE.Group();
  body.name = "Cotton Candy body";
  // Feet and the squash pivot share the root's ground plane.
  root.add(actionRig);
  actionRig.add(body);
  surface(body, silhouette(), cream);
  const tail = oval(body, cream, .275, .368, .499, .243, .238, .238);
  surface(body, crescent(), moonGold);

  const ears = [];
  const eyes = [];
  const paws = [];
  const feet = [];
  for (const side of [-1, 1]) {
    const ear = new THREE.Group();
    ear.name = side < 0 ? "Lower ear" : "Higher ear";
    ear.position.set(side * .30, side < 0 ? 1.495 : 1.55, -.14);
    ear.scale.setScalar(side < 0 ? 1.04 : .94);
    body.add(ear);
    surface(ear, earSurface(side), cream);
    ears.push(ear);

    const eye = new THREE.Group();
    eye.position.set(side * .264, 1.17, faceDepth(side * .264, 1.17) - .012);
    eye.rotation.y = -side * .36;
    body.add(eye);
    oval(eye, eyeColor, 0, 0, 0, .079, .085, .042);
    oval(eye, glint, -.023, .027, -.038, .016, .015, .009);
    oval(eye, glint, .019, -.019, -.039, .007, .007, .006);
    eyes.push(eye);
    const cheek = new THREE.PlaneGeometry(.31, .172, 12, 8).rotateY(Math.PI);
    surface(body, fitToFace(cheek, side * .408, 1.045, .008), blush);

    const paw = oval(body, cream, side * PAW_X, PAW_Y, PAW_Z, .166, .145, .158);
    paw.name = side < 0 ? "Left paw" : "Right paw";
    paw.rotation.z = -side * .32;
    paws.push(paw);
    feet.push(oval(actionRig, cream, side * .192, FOOT_RADIUS, FOOT_Z, .183, FOOT_RADIUS, .199));
  }

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(.66, 24).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x284538, transparent: true, opacity: .23, depthWrite: false }),
  );

  let clock = 0;
  let stride = 0;
  let pace = 0;
  let air = 0;
  let pitch = 0;
  let squash = 0;
  let landing = Infinity;
  let wasGrounded = true;
  let nextBlink = 2.8;
  let blinkTime = Infinity;
  const actions = new Map();
  let action;

  function update(dt, moving, grounded, verticalSpeed) {
    const { damp } = THREE.MathUtils;
    clock += dt;
    pace = damp(pace, moving && grounded ? 1 : 0, 10, dt);
    air = damp(air, grounded ? 0 : 1, 11, dt);
    pitch = damp(pitch, grounded ? 0 : Math.tanh(verticalSpeed / 5), 11, dt);
    stride += dt * 12.5 * pace;
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
    body.scale.set(1 - squash * .58 - breath * .25, 1 + squash + breath, 1 - squash * .58);
    body.position.y = Math.abs(step) * .022 + breath * .25;
    body.rotation.x = 0;
    body.rotation.z = step * .030 + Math.sin(clock * 1.03) * .008;
    tail.rotation.x = -.15 + step * .23;
    eyes.forEach((eye) => { eye.scale.y = 1 - blink * .91; });

    for (let i = 0; i < ears.length; i++) {
      const side = i === 0 ? -1 : 1;
      const swing = Math.sin(stride - i * 2.55 - .75) * pace;
      const idleSwing = (i === 0 ? .088 : .064) *
        (Math.sin(clock * (i === 0 ? 1.68 : 1.41) + i * 1.7) + .10 * Math.sin(clock * .79 + i));
      ears[i].rotation.set(
        .13 + idleSwing * .38 + swing * .067 + air * .19 + pitch * .07 - recoil * .23,
        side * .12 + swing * .047,
        -side * ((i === 0 ? .24 : .10) + idleSwing + swing * .046 + recoil * .15),
      );
      paws[i].position.set(side * PAW_X, PAW_Y, PAW_Z);
      paws[i].rotation.x = -side * step * .26 - air * .19;
      feet[i].position.y = FOOT_RADIUS + Math.max(0, side * step) * .075;
      feet[i].position.z = FOOT_Z - side * step * .145 + air * .023;
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
    root, shadow, update,
    bathRig: actionRig,
    poseFeeding(reach, hold, chew, time, grip) {
      body.rotation.x = -.23 * reach - .10 * hold + Math.sin(time * 31) * .014 * chew;
      for (const [i, paw] of paws.entries()) {
        const side = i === 0 ? -1 : 1;
        paw.position.set(side * (PAW_X - .20 * (reach + hold)),
          PAW_Y - .16 * reach + .26 * hold, PAW_Z - .39 * reach - .21 * hold);
        paw.rotation.x = .72 * (reach + hold);
      }
      grip.copy(paws[0].position).lerp(paws[1].position, .5);
      grip.z -= .065;
      body.localToWorld(grip);
    },
    reset() {
      stride = pace = air = pitch = squash = 0;
      landing = Infinity;
      wasGrounded = true;
      action = undefined;
    },
    // Overlay presentation-only clips for feeding, bathing, petting or play.
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
