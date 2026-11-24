import * as THREE from 'three';

/**
 * Outdoor sky shared by the visible dome and the PMREM capture.
 * The capture shader stays linear. The dome applies the same tone map
 * and output colour space as the town, so the horizon meets the fog.
 */

const SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_BODY = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSun;
uniform vec3 uSunDir;
uniform float uNight;
varying vec3 vDir;
void main() {
  vec3 dir = normalize(vDir);
  float lift = smoothstep(-0.02, 0.32, dir.y);
  vec3 col = mix(uHorizon, uZenith, pow(lift, 0.72));
  float groundMix = smoothstep(0.04, -0.22, dir.y);
  col = mix(col, uGround, groundMix);
  float sunDot = dot(dir, normalize(uSunDir));
  float disc = smoothstep(0.9986, 0.99955, sunDot);
  float glow = pow(max(sunDot, 0.0), 42.0);
  float sunAmt = (1.0 - smoothstep(0.15, 0.72, uNight)) * (1.0 - groundMix);
  col += uSun * (disc * 1.2 + glow * 0.38) * sunAmt;
  float moon = smoothstep(0.9992, 0.9997, sunDot) * smoothstep(0.45, 0.85, uNight);
  col += vec3(0.72, 0.78, 0.9) * moon * (1.0 - groundMix);
  gl_FragColor = vec4(col, 1.0);
}
`;

const SKY_DOME_FRAGMENT = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSun;
uniform vec3 uSunDir;
uniform float uNight;
varying vec3 vDir;
void main() {
  vec3 dir = normalize(vDir);
  float lift = smoothstep(-0.02, 0.32, dir.y);
  vec3 col = mix(uHorizon, uZenith, pow(lift, 0.72));
  float groundMix = smoothstep(0.04, -0.22, dir.y);
  col = mix(col, uGround, groundMix);
  float sunDot = dot(dir, normalize(uSunDir));
  float disc = smoothstep(0.9986, 0.99955, sunDot);
  float glow = pow(max(sunDot, 0.0), 42.0);
  float sunAmt = (1.0 - smoothstep(0.15, 0.72, uNight)) * (1.0 - groundMix);
  col += uSun * (disc * 1.2 + glow * 0.38) * sunAmt;
  float moon = smoothstep(0.9992, 0.9997, sunDot) * smoothstep(0.45, 0.85, uNight);
  col += vec3(0.72, 0.78, 0.9) * moon * (1.0 - groundMix);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export interface OutdoorSky {
  dome: THREE.Mesh;
  captureScene: THREE.Scene;
  zenith: THREE.Color;
  horizon: THREE.Color;
  ground: THREE.Color;
  sun: THREE.Color;
  sunDir: THREE.Vector3;
  night: { value: number };
  dispose: () => void;
}

export function createOutdoorSky(): OutdoorSky {
  const zenith = new THREE.Color(0x6f97c4);
  const horizon = new THREE.Color(0xd5e4ee);
  const ground = new THREE.Color(0x6d624c);
  const sun = new THREE.Color(0xfff2d4);
  const sunDir = new THREE.Vector3(0.45, 0.75, -0.2).normalize();
  const night = { value: 0 };

  const shared = {
    uZenith: { value: zenith },
    uHorizon: { value: horizon },
    uGround: { value: ground },
    uSun: { value: sun },
    uSunDir: { value: sunDir },
    uNight: night,
  };

  const domeMat = new THREE.ShaderMaterial({
    uniforms: { ...shared },
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_DOME_FRAGMENT,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), domeMat);
  dome.scale.setScalar(400);
  dome.frustumCulled = false;
  dome.renderOrder = -1;
  dome.name = 'oamaru-sky';

  const captureMat = new THREE.ShaderMaterial({
    uniforms: { ...shared },
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_BODY,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  const captureScene = new THREE.Scene();
  captureScene.add(new THREE.Mesh(new THREE.SphereGeometry(20, 28, 16), captureMat));

  return {
    dome,
    captureScene,
    zenith,
    horizon,
    ground,
    sun,
    sunDir,
    night,
    dispose: () => {
      dome.geometry.dispose();
      domeMat.dispose();
      const captureMesh = captureScene.children[0] as THREE.Mesh;
      captureMesh.geometry.dispose();
      captureMat.dispose();
    },
  };
}
