import * as THREE from "three";

// A continuous line in the loft's cross section. Shared by the light bands and stars.
export function galaxyAngle(u, side) {
  return side * (1.06 + .29 * Math.sin(8.4 * u + side * .55) - .18 * Math.sin(16 * u));
}

// Both depths use the same small, prefiltered texture. The channels contain
// the softer cloud around a star and the smaller point at its center.
function galaxyTexture() {
  const width = 256;
  const height = 128;
  const bytes = new Uint8Array(width * height * 4);
  let seed = 14829;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  for (let star = 0; star < 330; star++) {
    const x = Math.floor(random() * width);
    const y = Math.floor(random() * height);
    const size = .52 + random() ** 3 * 1.62;
    const light = .38 + random() * .62;
    const extent = Math.ceil(4 * size);
    for (let row = -extent; row <= extent; row++) {
      for (let column = -extent; column <= extent; column++) {
        const index = (((y + row + height) % height) * width + (x + column + width) % width) * 4;
        const radius = Math.hypot(row, column) / size;
        const halo = Math.exp(-radius * radius * .20) * light;
        const core = Math.exp(-radius * radius * 1.6) * light;
        bytes[index] = Math.max(bytes[index], 255 * halo);
        bytes[index + 1] = Math.max(bytes[index + 1], 255 * core);
        bytes[index + 3] = 255;
      }
    }
  }
  const texture = new THREE.DataTexture(bytes, width, height);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

export function applyWhaleReveal(shader, reveal) {
  shader.uniforms.whaleReveal = reveal;
  shader.fragmentShader = shader.fragmentShader.replace("#include <common>",
    "#include <common>\nuniform float whaleReveal;").replace("#include <alphatest_fragment>", `
      #include <alphatest_fragment>
      if (whaleReveal < 1.0 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715)))) > whaleReveal) discard;
    `);
}

export function createSkin() {
  const night = { value: 0 };
  const breath = { value: 1 };
  const reveal = { value: 1 };
  const underside = { value: 0 };
  const galaxy = { value: galaxyTexture() };
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .94 });
  material.onBeforeCompile = shader => {
    applyWhaleReveal(shader, reveal);
    shader.uniforms.whaleUnderside = underside;
    shader.uniforms.whaleNight = night;
    shader.uniforms.whaleBreath = breath;
    shader.uniforms.whaleGalaxy = galaxy;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `
      #include <common>
      attribute vec4 whaleSurface;
      varying vec4 vWhaleSurface;
    `).replace("#include <begin_vertex>", `
      #include <begin_vertex>
      vWhaleSurface = whaleSurface;
    `);
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `
      #include <common>
      uniform float whaleNight;
      uniform float whaleBreath;
      uniform float whaleUnderside;
      uniform sampler2D whaleGalaxy;
      varying vec4 vWhaleSurface;
      float square(float x) { return x * x; }
    `).replace("#include <opaque_fragment>", `
      float u = vWhaleSurface.x;
      float fin = max(0.0, vWhaleSurface.w);
      float body = 1.0 - step(0.0, vWhaleSurface.w);
      float facing = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
      float rim = pow(1.0 - facing, 2.2);
      vec3 ice = vec3(.51, .77, 1.0);
      vec3 pearl = mix(vec3(.91, .96, 1.0), vec3(1.0, .97, .96), square(normal.x));

      // Thin parts transmit a cooler tint at grazing angles without overlapping
      // transparent layers or a refraction pass.
      vec3 tipTint = mix(vec3(1.0), vec3(.72, .87, 1.0), fin * (.33 + .35 * rim));
      outgoingLight *= tipTint;
      if (whaleNight < .5) {
        outgoingLight += pearl * ((.14 + whaleUnderside * .14) * rim) + ice * fin * (.095 + .14 * rim);
        outgoingLight += whaleUnderside * vec3(.91,.95,1.) * .045;
      } else {
        vec3 silver = mix(vec3(.87, .93, 1.0), ice, .29 * fin);
        outgoingLight += silver * (.22 + (.24 + whaleUnderside * .10) * rim + fin * (.11 + .24 * rim));
        if (body > .5) {
          vec2 surface = normalize(vWhaleSurface.yz);
          float side = sign(surface.y);
          float angle = side * (1.06 + .29 * sin(8.4 * u + side * .55) - .18 * sin(16.0 * u));
          float arc = length(surface - vec2(cos(angle), sin(angle)));
          float window = smoothstep(.12, .28, u) * (1.0 - smoothstep(.93, .995, u));
          float pocket = exp(-20.0 * square(u - .47 + side * .055))
            + .52 * exp(-78.0 * square(u - .83));
          float lane = window * exp(-(15.0 + 5.0 * sin(17.0 * u)) * arc * arc);
          float ridge = exp(-19.0 * square(length(surface - vec2(1.0, 0.0))))
            * exp(-23.0 * square(u - .46));
          float undersideArc = length(surface - vec2(-.63, side * .78));
          float ventral = whaleUnderside * exp(-26.0 * undersideArc * undersideArc)
            * exp(-20.0 * square(u - .51));
          float area = clamp(lane * (.32 + .68 * pocket) + ridge * .60 + ventral * .85, 0.0, 1.0);
          vec2 lookup = vec2(u * 1.11, atan(surface.y, surface.x) / 6.2831853);
          vec2 haze = texture2D(whaleGalaxy, lookup + vec2(.03 * normal.x, -.025 * normal.y)).rg;
          vec2 stars = texture2D(whaleGalaxy, lookup * vec2(.79, 1.30) + vec2(.26, .37)).rg;
          vec3 blue = mix(ice, vec3(.68, .55, .92), pow(haze.r, 2.5) * .29);
          vec3 depth = blue * area * (.12 + .22 * haze.r + .11 * ridge);
          vec3 points = mix(ice, vec3(1.0), .64) * area * (.25 * stars.r + (.65 + whaleUnderside * .32) * stars.g + (.12 + whaleUnderside * .15) * haze.g);
          outgoingLight *= mix(vec3(1.0), vec3(.51, .68, .89), area * (.75 - .38 * haze.r));
          outgoingLight += whaleBreath * (depth + points);
        }
      }
      #include <opaque_fragment>
    `);
  };
  return { material, night, breath, reveal, underside };
}

// Keep the existing Three.js point attenuation, but vary size within a single draw call.
export function varyPointSize(material) {
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `
      #include <common>
      attribute float pointScale;
    `).replace("gl_PointSize = size;", "gl_PointSize = size * pointScale;");
  };
}
