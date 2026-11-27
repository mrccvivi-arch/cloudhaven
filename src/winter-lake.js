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
      const width = (.38 + .55 * Math.sin(t * Math.PI)) * (branches ? 1 : .68);
      for (let j = 0; j <= length; j += .56) {
        stamp(x + dx * j / length, y + dy * j / length, width, strength * (.38 + .62 * Math.sin(Math.PI * t)), channel);
      }
      x += dx;
      y += dy;
      if (branches && i > 1 && i < steps - 2 && random() < .32) {
        fracture(x, y, direction + (random() < .5 ? -1 : 1) * (.44 + random() * .79),
          2 + Math.floor(random() * 5), channel, strength * .62, false);
      }
    }
  }

  for (let i = 0; i < 23; i++) {
    const a = angle(), r = .27 + Math.sqrt(random()) * .67;
    const [x, y] = toPixel(Math.cos(a) * r, Math.sin(a) * r);
    fracture(x, y, a + Math.PI + (random() - .5) * 2.2,
      i % 6 === 0 ? 26 : 5 + Math.floor(random() * 13), i % 3 === 0 ? 1 : 0, 140 + random() * 88, true);
  }
  // A few long shelf fractures frame the approaches and break up the open ice.
  for (const [x, y, heading, steps] of [[.84, -.10, -2.73, 23], [.79, .46, -2.35, 24],
    [.16, .62, -.92, 23], [-.68, .18, .11, 26]]) {
    fracture(...toPixel(x, y), heading, steps, 0, 204, true);
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
  uniform sampler2D winterWhaleStamp;
  uniform vec4 winterWhaleEcho;
  uniform float winterWhaleEchoStrength;

  vec3 lakeLighting(vec3 world, vec2 local, float extent, float darkness) {
    vec3 eye = cameraPosition - world;
    float eyeDistance = length(eye);
    vec3 sight = eye / max(eyeDistance, .01);
    float clearView = smoothstep(.045, .53, sight.y);
    float sheen = pow(1. - clamp(sight.y, 0., 1.), 4.5);
    // Samples move at different rates with the viewing angle, as if below the surface.
    vec2 ray = sight.xz / (max(0., sight.y) + .64);
    vec2 uv = local * .43 + .5;
    vec2 middleUV = uv - ray * vec2(.012, .007);
    vec2 deepUV = uv - ray * vec2(.039, .022);
    vec4 upper = texture2D(winterIceDetails, uv - ray * vec2(.0025, .0014));
    vec4 middle = texture2D(winterIceDetails, middleUV);
    vec4 deep = texture2D(winterIceDetails, deepUV);
    vec2 strata = (deepUV - .5) / .43;
    float drift = sin(5.1 * strata.x + 3.8 * strata.y + .65 * cos(9.1 * strata.y));
    float basin = .50 + .50 * sin(3.9 * strata.x - 6.6 * strata.y + 1.7 * drift);
    float depth = (1. - smoothstep(.18, .997, extent)) * (.61 + .32 * basin + .07 * drift);
    float shelf = smoothstep(.23, .94, extent);
    vec3 pale = mix(vec3(.227,.345,.467), vec3(.089,.148,.240), darkness);
    vec3 below = mix(vec3(.046,.100,.195), vec3(.016,.036,.091), darkness);
    vec3 ice = mix(pale, below, depth);
    float shelfVeil = pow(.50 + .50 * sin(12.0 * strata.y + 7.0 * strata.x + 2.8 * drift), 5.);
    ice += shelfVeil * (1. - .58 * shelf) * vec3(.021,.042,.068);

    float detail = (1. - smoothstep(53., 161., eyeDistance)) * (.49 + .51 * clearView);
    float fissure = smoothstep(.16, .59, upper.r);
    float fracture = smoothstep(.085, .63, deep.g);
    ice -= vec3(.035,.058,.085) * detail * (upper.r * .69 + middle.g * .39);
    ice += vec3(.46,.62,.76) * detail * (fissure * .24 + fracture * .27);
    ice += detail * middle.a * (.35 + .31 * shelf) * vec3(.60,.74,.85);
    float breath = .58 + .42 * sin(winterIceTime * .53 + 17. * strata.x + 31. * strata.y);
    float glimmer = deep.b * (.35 + .56 * breath) + middle.b * .17;
    ice += glimmer * detail * mix(.13,.86,darkness) * vec3(.47,.70,1.);

    float surfaceGrain = sin(dot(world.xz, vec2(3.26,.91))) * sin(dot(world.xz, vec2(-1.73,3.7)));
    float facet = smoothstep(.85, .997, surfaceGrain) * smoothstep(.15,.87,basin);
    ice += detail * facet * mix(.039,.022,darkness) * vec3(.62,.78,.91);
    vec3 skySheen = mix(vec3(.28,.39,.53), vec3(.044,.081,.154), darkness);
    ice = mix(ice, skySheen, sheen * (.15 + .115 * basin));

    if (winterWhaleEchoStrength > .001) {
      vec2 tail = winterWhaleEcho.zw;
      vec2 delta = world.xz - winterWhaleEcho.xy;
      // Widen the diffused light under the ice at grazing angles so a chase
      // camera can still read the silhouette rather than a thin horizon seam.
      float spread = mix(40., 23., smoothstep(.065, .29, sight.y));
      vec2 imprint = vec2(dot(delta, tail) / 37.2, dot(delta, vec2(-tail.y, tail.x)) / spread);
      if (max(abs(imprint.x), abs(imprint.y)) < .5) {
        vec2 stamp = texture2D(winterWhaleStamp, imprint + .5).rg;
        float veil = stamp.g * (.70 + .30 * basin);
        float echo = (stamp.r * .55 + veil * .45) * winterWhaleEchoStrength;
        echo *= (1. - smoothstep(.955, 1.01, extent)) * (.79 + .21 * clearView);
        vec3 silver = mix(vec3(.52,.68,.83), vec3(.29,.46,.73), darkness);
        ice = mix(ice, silver, echo * mix(.29,.43,darkness));
      }
    }
    return ice;
  }
`;
