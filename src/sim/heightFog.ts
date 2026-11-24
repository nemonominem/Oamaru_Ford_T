import * as THREE from 'three';

/**
 * Street-level density stays on scene.fog (FogExp2). Fragments below the
 * quay thicken toward the harbour; fragments up Wanbrow thin out.
 * y = 1 is the Harbour Street grade.
 */

const VERT_COMMON = /* glsl */ `#include <common>
varying vec3 vHeightFogWorld;`;

const VERT_WORLD = /* glsl */ `#include <project_vertex>
{
  vec4 hfWorld = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    hfWorld = instanceMatrix * hfWorld;
  #endif
  #ifdef USE_BATCHING
    hfWorld = batchingMatrix * hfWorld;
  #endif
  vHeightFogWorld = (modelMatrix * hfWorld).xyz;
}`;

const FRAG_COMMON = /* glsl */ `#include <common>
varying vec3 vHeightFogWorld;`;

const FRAG_FOG = /* glsl */ `#ifdef USE_FOG
  float hfAbove = vHeightFogWorld.y - 1.0;
  float hfScale = hfAbove < 0.0
    ? mix(1.0, 1.75, clamp(-hfAbove / 2.2, 0.0, 1.0))
    : mix(1.0, 0.30, clamp(hfAbove / 10.0, 0.0, 1.0));
  float hfDensity = fogDensity * hfScale;
  float fogFactor = 1.0 - exp(-hfDensity * hfDensity * vFogDepth * vFogDepth);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
#endif`;

export function installHeightFog(root: THREE.Object3D): void {
  const seen = new Set<THREE.Material>();
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of list) {
      if (seen.has(material)) continue;
      seen.add(material);
      if ((material as THREE.ShaderMaterial).isShaderMaterial) continue;
      if ('fog' in material && material.fog === false) continue;

      const previous = material.onBeforeCompile;
      const previousKey = material.customProgramCacheKey.bind(material);
      material.onBeforeCompile = (shader, renderer) => {
        previous.call(material, shader, renderer);
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', VERT_COMMON)
          .replace('#include <project_vertex>', VERT_WORLD);
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', FRAG_COMMON)
          .replace('#include <fog_fragment>', FRAG_FOG);
      };
      material.customProgramCacheKey = () => `${previousKey()}|height-fog`;
      material.needsUpdate = true;
    }
  });
}
