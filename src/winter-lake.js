import * as THREE from "three";
import { seeded } from "./map.js";
import { winterLakeShapeGLSL } from "./winter-layout.js";

// Four independent masks share a single linear atlas: shallow fissures,
// deeper fractures, points of light, and trapped bubbles.
export function winterIceAtlas() {
  const width = 512, height = 768;
  const pixels = new Uint8Array(width * height * 4);
  const random = seeded(419063);
  const angle = () => random() * Math.PI * 2;
  const toPixel = (x, y) => [(x * .43 + .5) * width, (y * .43 + .5) * height];

  function stamp(x, y, radius, strength, channel, ring = false) {
    const extent = Math.ceil(radius + 1);
    for (let row = Math.max(0, Math.floor(y - extent)); row <= Math.min(height - 1, y + extent); row++) {
      for (let col = Math.max(0, Math.floor(x - extent)); col <= Math.min(width - 1, x + extent); col++) {
        const d = Math.hypot(col + .5 - x, row + .5 - y);
        const falloff = ring
          ? Math.max(0, 1 - Math.abs(d - radius * .72) / .85) * (.67 + .33 * Math.max(0, (y - row) / radius))
          : Math.max(0, 1 - d / (radius + .6)) ** 1.55;
        const k = (row * width + col) * 4 + channel;
        pixels[k] = Math.max(pixels[k], Math.round(strength * falloff));
      }
    }
  }

  function fracture(x, y, heading, steps, channel, strength, branches) {
    let direction = heading;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      direction += (random() - .5) * .74;
      const length = 3.3 + random() * 8.7;
      const dx = Math.cos(direction) * length, dy = Math.sin(direction) * length;
      const width = (.55 + .78 * Math.sin(t * Math.PI)) * (branches ? 1 : .68);
      for (let j = 0; j <= length; j += .56) {
        stamp(x + dx * j / length, y + dy * j / length, width, strength * (.38 + .62 * Math.sin(Math.PI * t)), channel);
      }
      x += dx;
      y += dy;
      if (branches && i > 1 && i < steps - 2 && random() < .25) {
        fracture(x, y, direction + (random() < .5 ? -1 : 1) * (.44 + random() * .79),
          2 + Math.floor(random() * 5), channel, strength * .62, false);
      }
    }
  }

  for (let i = 0; i < 23; i++) {
    const a = angle(), r = .27 + Math.sqrt(random()) * .67;
    const [x, y] = toPixel(Math.cos(a) * r, Math.sin(a) * r);
    fracture(x, y, a + Math.PI + (random() - .5) * 2.2,
      i % 6 === 0 ? 26 : 5 + Math.floor(random() * 13), i % 3 === 0 ? 1 : 0, 157 + random() * 98, true);
  }
  // A few long shelf fractures frame the approaches and break up the open ice.
  for (const [x, y, heading, steps] of [[.84, -.10, -2.73, 23], [.79, .46, -2.35, 24],
    [.16, .62, -.92, 23], [-.68, .18, .11, 26]]) {
    fracture(...toPixel(x, y), heading, steps, 0, 238, true);
  }
  for (let i = 0; i < 310; i++) {
    const a = angle(), r = Math.sqrt(random()) * .96;
    const [x, y] = toPixel(Math.cos(a) * r, Math.sin(a) * r);
    stamp(x, y, .50 + random() ** 2 * 2.2, 61 + random() * 190, 2);
  }
  for (let i = 0; i < 88; i++) {
    const a = angle(), r = .29 + Math.sqrt(random()) * .67;
    const [x, y] = toPixel(Math.cos(a) * r, Math.sin(a) * r);
    const count = 1 + Math.floor(random() * 6);
    for (let j = 0; j < count; j++) {
      stamp(x + (random() - .5) * 14, y + (random() - .5) * 16, .6 + random() ** 2 * 2.5,
        42 + random() * 112, 3, true);
    }
  }

  const texture = new THREE.DataTexture(pixels, width, height);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

export const winterIceGLSL = `
  ${winterLakeShapeGLSL}
  uniform sampler2D winterIceDetails;
  uniform float winterIceTime;

  vec3 lakeLighting(vec3 world, vec2 local, float extent, float darkness) {
    vec3 eye = cameraPosition - world;
    float eyeDistance = length(eye);
    vec3 sight = eye / max(eyeDistance, .01);
    float clearView = smoothstep(.08, .54, sight.y);
    float horizon = pow(1. - clamp(sight.y, 0., 1.), 4.);
    // Angular offsets make the internal features separate at oblique angles.
    vec2 slope = sight.xz / (max(0., sight.y) + .79);
    vec2 uv = local * .43 + .5;
    vec2 shallowUV = uv - slope * vec2(.006, .0035);
    vec2 deepUV = uv - slope * vec2(.022, .013);
    vec4 shallow = texture2D(winterIceDetails, shallowUV);
    vec4 deep = texture2D(winterIceDetails, deepUV);
    float trough = .5 + .5 * sin(4.4 * local.x - 5.4 * local.y + sin(local.y * 6.2));
    float basins = .5 + .5 * sin(5.6 * local.x + 7.8 * local.y + trough * 1.26);
    float depth = (1. - smoothstep(.21, .995, extent)) * (.80 + .20 * basins);
    float band = pow(.5 + .5 * sin(24. * local.y + 9.0 * local.x + 3.0 * sin(4.8 * local.x)), 3.);
    vec3 shore = mix(vec3(.144,.376,.52), vec3(.064,.218,.334), darkness);
    vec3 basin = mix(vec3(.023,.145,.277), vec3(.009,.047,.149), darkness);
    vec3 ice = mix(shore, basin, depth);
    ice += band * (.008 + .010 * trough) * vec3(.28,.94,1.);
    ice += trough * depth * vec3(.012,.035,.049);

    float detail = (1. - smoothstep(58., 164., eyeDistance)) * (.42 + .58 * clearView);
    float shelf = smoothstep(.12,.82,extent) * (1. - smoothstep(.92,1.01,extent));
    float shallowLine = smoothstep(.12, .48, shallow.r) * (1. - .37 * horizon);
    float deepLine = deep.g * (.42 + .58 * clearView);
    float rime = .77 + .23 * sin(11. * local.y + 6.6 * local.x + 3.1 * sight.x);
    ice -= detail * shallow.r * vec3(.025,.063,.073);
    ice += detail * vec3(.42,.72,.87) * rime * (shallowLine * .42 + deepLine * .43);
    ice += shallow.a * detail * (.37 + .42 * shelf) * vec3(.51,.79,.88);
    float breath = .66 + .34 * sin(winterIceTime * .69 + 17. * local.x + 31. * local.y);
    float glow = (shallow.b * .23 + deep.b * (.46 + breath * .34)) * (.14 + .86 * darkness);
    ice += glow * detail * mix(vec3(.35,.69,.92), vec3(.40,.96,.97), trough);
    // A broad sky sheen and restrained facets suggest polished ice.
    float fine = sin(dot(world.xz, vec2(2.77, .68))) * sin(dot(world.xz, vec2(-1.64, 3.21)) + sight.x);
    float facet = smoothstep(.82, .98, fine) * trough * smoothstep(.20, .65, sight.y);
    ice += detail * facet * (.030 + .014 * darkness) * vec3(.58,.86,1.);
    vec3 skySheen = mix(vec3(.24,.45,.61), vec3(.035,.097,.22), darkness);
    return mix(ice, skySheen, horizon * (.17 + .13 * trough));
  }
`;
