import * as THREE from 'three';

export interface HarbourWater {
  mesh: THREE.Mesh;
  setTime: (seconds: number) => void;
  setLight: (sky: THREE.Color, sun: THREE.Color, sunDir: THREE.Vector3) => void;
  dispose: () => void;
}

const VERT = /* glsl */ `
#include <fog_pars_vertex>
uniform float uTime;
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec3 p = position;
  float w1 = sin(p.x * 0.16 + uTime * 0.70) * 0.08;
  float w2 = sin(p.z * 0.11 - uTime * 0.38 + p.x * 0.05) * 0.05;
  p.y += w1 + w2;
  float dwdx = cos(p.x * 0.16 + uTime * 0.70) * 0.0128 + cos(p.z * 0.11 - uTime * 0.38 + p.x * 0.05) * 0.0025;
  float dwdz = cos(p.z * 0.11 - uTime * 0.38 + p.x * 0.05) * 0.0055;
  vec3 nLocal = normalize(vec3(-dwdx, 1.0, -dwdz));
  vec4 world = modelMatrix * vec4(p, 1.0);
  vWorld = world.xyz;
  vNormalW = normalize(mat3(modelMatrix) * nLocal);
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
#include <fog_pars_fragment>
uniform sampler2D uNormal;
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uSky;
uniform vec3 uSun;
uniform vec3 uSunDir;
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec2 vUv;
void main() {
  vec3 n1 = texture2D(uNormal, vUv * vec2(16.0, 26.0) + vec2(uTime * 0.012, uTime * 0.007)).xyz * 2.0 - 1.0;
  vec3 n2 = texture2D(uNormal, vUv * vec2(9.0, 14.0) - vec2(uTime * 0.008, uTime * 0.013)).xyz * 2.0 - 1.0;
  vec3 n = normalize(vNormalW + vec3((n1.x + n2.x) * 0.28, 0.0, (n1.y + n2.y) * 0.28));
  vec3 viewDir = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - clamp(dot(n, viewDir), 0.0, 1.0), 3.1);
  vec3 col = mix(uDeep, uSky, fres);
  vec3 halfDir = normalize(normalize(uSunDir) + viewDir);
  float spec = pow(max(dot(n, halfDir), 0.0), 72.0);
  col += uSun * spec * 0.22;
  gl_FragColor = vec4(col, 1.0);
  #ifdef USE_FOG
    float hfAbove = vWorld.y - 1.0;
    float hfScale = hfAbove < 0.0
      ? mix(1.0, 1.75, clamp(-hfAbove / 2.2, 0.0, 1.0))
      : mix(1.0, 0.30, clamp(hfAbove / 10.0, 0.0, 1.0));
    float hfDensity = fogDensity * hfScale;
    float fogFactor = 1.0 - exp(-hfDensity * hfDensity * vFogDepth * vFogDepth);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
  #endif
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function seeded(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function rippleNormalTexture(): THREE.CanvasTexture {
  const size = 256;
  const height = document.createElement('canvas');
  height.width = size;
  height.height = size;
  const hctx = height.getContext('2d')!;
  hctx.fillStyle = '#808080';
  hctx.fillRect(0, 0, size, size);
  const rand = seeded(1914);
  for (let i = 0; i < 1400; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const len = 10 + rand() * 28;
    const ang = rand() * Math.PI;
    const shade = 150 + Math.floor(rand() * 80);
    hctx.strokeStyle = `rgb(${shade},${shade},${shade})`;
    hctx.lineWidth = 1 + rand() * 1.5;
    hctx.beginPath();
    hctx.moveTo(x, y);
    hctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len * 0.45);
    hctx.stroke();
  }
  const src = hctx.getImageData(0, 0, size, size).data;
  const sample = (x: number, y: number) => {
    const xx = (x + size) % size;
    const yy = (y + size) % size;
    return src[(yy * size + xx) * 4] / 255;
  };
  const out = document.createElement('canvas');
  out.width = size;
  out.height = size;
  const octx = out.getContext('2d')!;
  const img = octx.createImageData(size, size);
  const strength = 3.2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = sample(x + 1, y) - sample(x - 1, y);
      const dy = sample(x, y + 1) - sample(x, y - 1);
      let nx = -dx * strength;
      let ny = -dy * strength;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;
      const i = (y * size + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(out);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createHarbourWater(): HarbourWater {
  const normal = rippleNormalTexture();
  const deep = new THREE.Color(0x264859);
  const sky = new THREE.Color(0xd5e4ee);
  const sun = new THREE.Color(0xfff2d4);
  const sunDir = new THREE.Vector3(0.4, 0.8, -0.2);
  const uniforms = {
    uTime: { value: 0 },
    uNormal: { value: normal },
    uDeep: { value: deep },
    uSky: { value: sky },
    uSun: { value: sun },
    uSunDir: { value: sunDir },
    fogColor: { value: new THREE.Color(0xd5e4ee) },
    fogDensity: { value: 0.0042 },
    fogNear: { value: 1 },
    fogFar: { value: 2000 },
  };
  const geo = new THREE.PlaneGeometry(260, 560, 40, 80);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    fog: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(226, -1.3, 24);
  mesh.name = 'oamaru-harbour';

  return {
    mesh,
    setTime: (seconds: number) => {
      uniforms.uTime.value = seconds;
    },
    setLight: (nextSky: THREE.Color, nextSun: THREE.Color, nextDir: THREE.Vector3) => {
      sky.copy(nextSky);
      sun.copy(nextSun);
      sunDir.copy(nextDir);
    },
    dispose: () => {
      geo.dispose();
      mat.dispose();
      normal.dispose();
    },
  };
}
