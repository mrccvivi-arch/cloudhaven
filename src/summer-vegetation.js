export function bendSummerPlants(material, wind, low, high, reach) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.seaBreeze = wind;
    shader.vertexShader = `uniform vec3 seaBreeze;
      ${shader.vertexShader}`.replace("#include <begin_vertex>", `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 origin = instanceMatrix[3].xyz;
          float lift = smoothstep(${low.toFixed(2)}, ${high.toFixed(2)}, position.y);
          float sway = .67 + .33 * sin(seaBreeze.z * 1.8 + origin.x * .22 + origin.z * .17);
          vec3 push = vec3(seaBreeze.x, 0., seaBreeze.y) * lift * sway * ${reach.toFixed(2)};
          mat3 basis = mat3(instanceMatrix);
          transformed += vec3(dot(basis[0], push) / dot(basis[0], basis[0]),
            dot(basis[1], push) / dot(basis[1], basis[1]), dot(basis[2], push) / dot(basis[2], basis[2]));
        #endif`);
  };
  material.customProgramCacheKey = () => `summer-breeze-${low}-${high}-${reach}`;
  return material;
}
