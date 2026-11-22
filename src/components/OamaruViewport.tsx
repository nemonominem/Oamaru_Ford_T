import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ModelTAudioEngine } from '../sim/audio';
import { buildFordModelT } from '../sim/modelTGeometry';
import { buildOamaruTraffic } from '../sim/oamaruTraffic';
import { buildOamaruWorld } from '../sim/oamaruWorld';
import { stepVehiclePhysics } from '../sim/physics';
import { createProceduralTextures } from '../sim/textures';
import { CameraMode, ControlMode, EnvironmentState, VehicleControls, VehicleState } from '../sim/types';
import { MinimapOverlay } from './MinimapOverlay';

interface OamaruViewportProps {
  vehicleStateRef: React.MutableRefObject<VehicleState>;
  controlsRef: React.MutableRefObject<VehicleControls>;
  envRef: React.MutableRefObject<EnvironmentState>;
  cameraModeRef: React.MutableRefObject<CameraMode>;
  controlModeRef: React.MutableRefObject<ControlMode>;
  headlightsManualRef: React.MutableRefObject<boolean | null>;
  audioRef: React.MutableRefObject<ModelTAudioEngine>;
  onTelemetryTick: (snapshot: VehicleState, envSnapshot: EnvironmentState) => void;
}

// Pre-allocated math helpers outside render loop (zero GC)
const _desiredCamPos = new THREE.Vector3();
const _desiredLookAt = new THREE.Vector3();
const _currentLookAt = new THREE.Vector3();
const _carQuat = new THREE.Quaternion();
const _carEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const _offsetVec = new THREE.Vector3();
const _lookOffsetVec = new THREE.Vector3();
const _rearWheelPos = new THREE.Vector3();

// Pre-allocated atmosphere color interpolants
const _cDaySky = new THREE.Color(0xcfd8dc);
const _cDuskSky = new THREE.Color(0xc97f5c);
const _cNightSky = new THREE.Color(0x161d2b);
const _cRainSky = new THREE.Color(0x75818a);
const _cFogSky = new THREE.Color(0xb8c2c5);

const _cDaySun = new THREE.Color(0xfff1d6);
const _cDuskSun = new THREE.Color(0xff8e47);
const _cNightMoon = new THREE.Color(0x7f9bc4);

const _cSkyCurrent = new THREE.Color();
const _cSunCurrent = new THREE.Color();
const _cHemiSky = new THREE.Color();
const _cHemiGround = new THREE.Color();

function detectSoftwareGl(): boolean {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export const OamaruViewport: React.FC<OamaruViewportProps> = ({
  vehicleStateRef,
  controlsRef,
  envRef,
  cameraModeRef,
  controlModeRef,
  headlightsManualRef,
  audioRef,
  onTelemetryTick,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const onTelemetryRef = useRef(onTelemetryTick);
  onTelemetryRef.current = onTelemetryTick;

  const [contextLost, setContextLost] = useState(false);
  const [minimapTelemetry, setMinimapTelemetry] = useState<VehicleState>(() => ({
    ...vehicleStateRef.current,
    wheels: [...vehicleStateRef.current.wheels] as VehicleState['wheels'],
  }));

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareGl();
    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const handleContextRestored = () => {
      setContextLost(false);
    };
    canvas.addEventListener('webglcontextlost', handleContextLost);
    canvas.addEventListener('webglcontextrestored', handleContextRestored);

    const scene = new THREE.Scene();
    const bgColor = new THREE.Color(0xcfd8dc);
    const fog = new THREE.FogExp2(0xcfd8dc, 0.0042);
    scene.background = bgColor;
    scene.fog = fog;

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(
      64,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.12,
      480
    );

    const orbitControls = new OrbitControls(camera, canvas);
    orbitControls.enableDamping = !isSoftwareGl;
    orbitControls.dampingFactor = 0.08;
    orbitControls.maxPolarAngle = Math.PI * 0.485;
    orbitControls.minDistance = 3.2;
    orbitControls.maxDistance = 32;
    orbitControls.enabled = false;

    const hemiLight = new THREE.HemisphereLight(0xd9e8f2, 0x6f624c, 0.72);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfff1d6, 2.15);
    sunLight.position.set(55, 78, -32);
    sunLight.castShadow = !isSoftwareGl;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 210;
    const d = 58;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0005;
    sunLight.shadow.normalBias = 0.02;
    scene.add(sunLight);
    scene.add(sunLight.target);

    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const textures = createProceduralTextures(maxAniso);
    const world = buildOamaruWorld(textures, isSoftwareGl);
    scene.add(world.group);

    const traffic = buildOamaruTraffic();
    scene.add(traffic.group);

    const modelT = buildFordModelT(isSoftwareGl);
    scene.add(modelT.root);

    // Contact shadow beneath car
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 128;
    shadowCanvas.height = 128;
    const sCtx = shadowCanvas.getContext('2d')!;
    const grad = sCtx.createRadialGradient(64, 64, 8, 64, 64, 62);
    grad.addColorStop(0, 'rgba(15, 13, 10, 0.62)');
    grad.addColorStop(0.65, 'rgba(15, 13, 10, 0.24)');
    grad.addColorStop(1, 'rgba(15, 13, 10, 0)');
    sCtx.fillStyle = grad;
    sCtx.fillRect(0, 0, 128, 128);
    const contactShadowTex = new THREE.CanvasTexture(shadowCanvas);
    const contactShadowMat = new THREE.MeshBasicMaterial({
      map: contactShadowTex,
      transparent: true,
      depthWrite: false,
    });
    const contactShadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.8), contactShadowMat);
    contactShadowPlane.rotation.x = -Math.PI / 2;
    contactShadowPlane.position.y = 0.05;
    modelT.root.add(contactShadowPlane);

    // Tire Dust / Water Spray Particle Pool
    const dustCount = 48;
    const dustPositions = new Float32Array(dustCount * 3);
    const dustVel: [number, number, number][] = Array.from({ length: dustCount }, () => [0, 0, 0]);
    const dustLife = new Float32Array(dustCount);
    for (let i = 0; i < dustCount; i++) dustPositions[i * 3 + 1] = -50;
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    const dustMat = new THREE.PointsMaterial({
      color: 0xc2b296,
      size: 0.42,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    const dustPoints = new THREE.Points(dustGeo, dustMat);
    dustPoints.frustumCulled = false;
    scene.add(dustPoints);
    let dustCursor = 0;

    // 3D Rain Streaks Pool
    const rainCount = 360;
    const rainPositions = new Float32Array(rainCount * 6);
    const rainDrops: [number, number, number][] = [];
    for (let i = 0; i < rainCount; i++) {
      rainDrops.push([
        (Math.random() - 0.5) * 44,
        Math.random() * 22,
        (Math.random() - 0.5) * 44,
      ]);
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
    const rainMat = new THREE.LineBasicMaterial({
      color: 0xcad6df,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    const rainMesh = new THREE.LineSegments(rainGeo, rainMat);
    rainMesh.frustumCulled = false;
    rainMesh.visible = false;
    scene.add(rainMesh);

    // Initialize camera directly in the active initial mode (Driver Cockpit by default)
    const initState = vehicleStateRef.current;
    _carEuler.set(0, initState.yaw, 0);
    _carQuat.setFromEuler(_carEuler);
    if (cameraModeRef.current === 'cockpit') {
      _offsetVec.set(-0.23, 1.44, -0.36).applyQuaternion(_carQuat);
      _lookOffsetVec.set(-0.18, 1.20, 14.0).applyQuaternion(_carQuat);
    } else if (cameraModeRef.current === 'bonnet') {
      _offsetVec.set(0, 1.42, 0.35).applyQuaternion(_carQuat);
      _lookOffsetVec.set(0, 1.15, 16.0).applyQuaternion(_carQuat);
    } else {
      _offsetVec.set(0, 2.45, -6.2).applyQuaternion(_carQuat);
      _lookOffsetVec.set(0, 1.0, 3.2).applyQuaternion(_carQuat);
    }
    camera.position.set(initState.x + _offsetVec.x, initState.y + _offsetVec.y, initState.z + _offsetVec.z);
    _currentLookAt.set(
      initState.x + _lookOffsetVec.x,
      initState.y + _lookOffsetVec.y,
      initState.z + _lookOffsetVec.z
    );
    camera.lookAt(_currentLookAt);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = Math.max(1, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    let frameId = 0;
    let disposed = false;
    let lastTime = performance.now();
    let accumulator = 0;
    let elapsed = 0;
    let lastUiPush = 0;
    let prevCamMode: CameraMode = cameraModeRef.current;

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const status = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (status === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    };

    const tick = () => {
      if (disposed) return;
      const now = performance.now();
      const frameDt = Math.min(0.08, (now - lastTime) / 1000);
      lastTime = now;
      elapsed += frameDt;

      const state = vehicleStateRef.current;
      const controls = controlsRef.current;
      const mode = controlModeRef.current;
      const env = envRef.current;

      if (env.timePreset === 'auto') {
        env.timeHour = (env.timeHour + frameDt * 0.5) % 24;
      }

      const targetWet = env.weather === 'rain' ? 1.0 : env.weather === 'fog' ? 0.32 : 0.0;
      env.wetness = THREE.MathUtils.damp(env.wetness, targetWet, 2.5, frameDt);
      env.windMps = env.weather === 'rain' ? 7.5 + Math.sin(elapsed * 0.7) * 2.5 : 1.5;
      env.visibilityMeters = env.weather === 'fog' ? 42 : env.weather === 'rain' ? 110 : 280;

      // Fixed 120Hz physics substeps
      const fixedDt = 1 / 120;
      accumulator += frameDt;
      let steps = 0;
      while (accumulator >= fixedDt && steps < 8) {
        stepVehiclePhysics(state, controls, mode, env, fixedDt);
        accumulator -= fixedDt;
        steps++;
      }

      // Soft collision resolution against moving horse carts & vintage automobiles
      const dynObstacles = traffic.getObstacles();
      for (let i = 0; i < dynObstacles.length; i++) {
        const obs = dynObstacles[i];
        const dx = state.x - obs.x;
        const dz = state.z - obs.z;
        const minDist = obs.radius + 1.2;
        const distSq = dx * dx + dz * dz;
        if (distSq < minDist * minDist) {
          const dist = Math.sqrt(distSq) || 0.001;
          const nx = dx / dist;
          const nz = dz / dist;
          const pen = minDist - dist;
          state.x += nx * pen;
          state.z += nz * pen;
          const vn = state.vx * nx + state.vz * nz;
          if (vn < 0) {
            state.vx -= 1.2 * vn * nx;
            state.vz -= 1.2 * vn * nz;
          }
        }
      }

      audioRef.current.update(state, env);
      world.update(elapsed);

      // Atmosphere: Solar / Lunar Arc, Dusk Glow, Rain & Sea Fog
      const h = env.timeHour;
      const sunAngle = ((h - 6.0) / 13.0) * Math.PI;
      const sunSin = Math.sin(sunAngle);
      const dayFactor = THREE.MathUtils.clamp((sunSin + 0.1) / 0.65, 0, 1);
      const duskFactor = THREE.MathUtils.clamp(1 - Math.abs(sunSin) * 2.8, 0, 1);
      const nightFactor = THREE.MathUtils.clamp((-sunSin + 0.12) * 1.9, 0, 1);

      _cSkyCurrent.copy(_cNightSky).lerp(_cDaySky, dayFactor);
      if (duskFactor > 0.05) {
        _cSkyCurrent.lerp(_cDuskSky, duskFactor * 0.75);
      }
      if (env.weather === 'rain') {
        _cSkyCurrent.lerp(_cRainSky, 0.58 * (1 - nightFactor * 0.65));
      } else if (env.weather === 'fog') {
        _cSkyCurrent.lerp(_cFogSky, 0.72 * (1 - nightFactor * 0.72));
      }

      bgColor.copy(_cSkyCurrent);
      fog.color.copy(_cSkyCurrent);

      const targetFogDensity =
        env.weather === 'fog' ? 0.024 : env.weather === 'rain' ? 0.011 : 0.0042 + duskFactor * 0.0015;
      fog.density = THREE.MathUtils.damp(fog.density, targetFogDensity, 3.0, frameDt);

      const sunAzimuth = ((h - 6.0) / 13.0) * Math.PI;
      const sunHeight = Math.max(14, Math.abs(sunSin) * 84);
      const sunDirX = Math.cos(sunAzimuth) * 65;
      sunLight.position.set(state.x + sunDirX, sunHeight, state.z - 32);
      sunLight.target.position.set(state.x, state.y, state.z);

      _cSunCurrent.copy(_cDaySun);
      if (duskFactor > 0.05) _cSunCurrent.lerp(_cDuskSun, duskFactor * 0.85);
      if (nightFactor > 0.4) _cSunCurrent.lerp(_cNightMoon, (nightFactor - 0.4) / 0.6);
      sunLight.color.copy(_cSunCurrent);

      const weatherDim = env.weather === 'rain' ? 0.55 : env.weather === 'fog' ? 0.62 : 1.0;
      sunLight.intensity = THREE.MathUtils.lerp(2.2, 0.42, nightFactor) * weatherDim;

      _cHemiSky.copy(_cSkyCurrent);
      _cHemiGround.setHex(0x6f624c).lerp(_cNightSky, nightFactor * 0.8);
      hemiLight.color.copy(_cHemiSky);
      hemiLight.groundColor.copy(_cHemiGround);
      hemiLight.intensity = THREE.MathUtils.lerp(0.75, 0.28, nightFactor);

      renderer.toneMappingExposure = THREE.MathUtils.lerp(1.08, 0.88, nightFactor);

      world.setAtmosphereVisuals(env.wetness, nightFactor);

      const autoLamps = nightFactor > 0.32 || env.weather === 'fog';
      const lightsOn = headlightsManualRef.current !== null ? headlightsManualRef.current : autoLamps;

      // Update period citizens, horse carts, vintage cars, dogs & seagulls
      traffic.update(frameDt, elapsed, state.x, state.z, lightsOn);

      // Rain Particle System
      if (env.weather === 'rain') {
        rainMesh.visible = true;
        const rAttr = rainGeo.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < rainCount; i++) {
          const drop = rainDrops[i];
          drop[1] -= 22 * frameDt;
          drop[0] -= env.windMps * 0.35 * frameDt;
          if (drop[1] < 0) {
            drop[0] = (Math.random() - 0.5) * 44;
            drop[1] = 16 + Math.random() * 8;
            drop[2] = (Math.random() - 0.5) * 44;
          }
          const wx = state.x + drop[0];
          const wy = state.y + drop[1];
          const wz = state.z + drop[2];
          rAttr.setXYZ(i * 2, wx, wy, wz);
          rAttr.setXYZ(i * 2 + 1, wx + 0.14, wy - 0.72, wz);
        }
        rAttr.needsUpdate = true;
      } else {
        rainMesh.visible = false;
      }

      // Update 3D Model T Transform & Sub-parts
      modelT.root.position.set(state.x, state.y, state.z);
      _carEuler.set(state.pitch, state.yaw, state.roll, 'YXZ');
      modelT.root.quaternion.setFromEuler(_carEuler);

      modelT.frontKnuckles[0].rotation.y = state.wheels[0].steerAngle;
      modelT.frontKnuckles[1].rotation.y = state.wheels[1].steerAngle;
      modelT.steeringWheel.rotation.y = state.steerAngle * 2.2;

      for (let i = 0; i < 4; i++) {
        modelT.wheelSpinGroups[i].rotation.x = state.wheels[i].spinAngle;
        modelT.wheelHubs[i].position.y = 0.38 + (state.wheels[i].compression - 0.45) * 0.14;
      }

      modelT.handCrank.rotation.z = state.crankingProgress > 0 ? state.crankingProgress * Math.PI * 6 : 0;
      modelT.handbrakeLever.rotation.x = -(state.handbrakePos - 0.5) * 0.65;
      modelT.pedals.low.position.z = controls.lowPedal || state.gear === 'LOW' ? 0.13 : 0.06;
      modelT.pedals.reverse.position.z = controls.reversePedal || state.gear === 'REV' ? 0.13 : 0.06;
      modelT.pedals.brake.position.z = controls.brakePedal || controls.brakeInput > 0.1 ? 0.13 : 0.06;

      modelT.headlights[0].intensity = lightsOn ? 26 : 0;
      modelT.headlights[1].intensity = lightsOn ? 26 : 0;
      const bulbMat = modelT.headlightBulbs[0].material as THREE.MeshStandardMaterial;
      bulbMat.emissiveIntensity = lightsOn ? 2.4 : 0.35;

      // Tire dust / water spray particles
      dustMat.color.setHex(env.weather === 'rain' ? 0xb5c2cb : 0xc2b296);
      if (
        state.speedMps > 2.2 &&
        (env.weather === 'rain' ||
          state.currentSurface === 'macadam' ||
          state.currentSurface === 'mud' ||
          state.currentSurface === 'grass')
      ) {
        for (let w = 2; w <= 3; w++) {
          const lx = w === 2 ? 0.71 : -0.71;
          _rearWheelPos.set(lx, 0.12, -1.35).applyQuaternion(modelT.root.quaternion);
          const idx = dustCursor % dustCount;
          dustPositions[idx * 3] = state.x + _rearWheelPos.x + (Math.random() - 0.5) * 0.25;
          dustPositions[idx * 3 + 1] = state.y + 0.12;
          dustPositions[idx * 3 + 2] = state.z + _rearWheelPos.z + (Math.random() - 0.5) * 0.25;
          dustVel[idx][0] = -state.vx * 0.18 + (Math.random() - 0.5) * 0.4;
          dustVel[idx][1] = 0.55 + Math.random() * 0.45;
          dustVel[idx][2] = -state.vz * 0.18 + (Math.random() - 0.5) * 0.4;
          dustLife[idx] = 1.0;
          dustCursor++;
        }
      }
      for (let i = 0; i < dustCount; i++) {
        if (dustLife[i] > 0) {
          dustLife[i] -= frameDt * 1.4;
          dustPositions[i * 3] += dustVel[i][0] * frameDt;
          dustPositions[i * 3 + 1] += dustVel[i][1] * frameDt;
          dustPositions[i * 3 + 2] += dustVel[i][2] * frameDt;
          if (dustLife[i] <= 0) dustPositions[i * 3 + 1] = -50;
        }
      }
      dustGeo.attributes.position.needsUpdate = true;

      // Camera Choreography
      const camMode = cameraModeRef.current;
      if (camMode !== prevCamMode) {
        orbitControls.enabled = camMode === 'orbit';
        if (camMode === 'orbit') {
          orbitControls.target.set(state.x, state.y + 0.9, state.z);
        }
        prevCamMode = camMode;
      }

      if (camMode === 'orbit') {
        orbitControls.target.set(
          THREE.MathUtils.damp(orbitControls.target.x, state.x, 8, frameDt),
          THREE.MathUtils.damp(orbitControls.target.y, state.y + 0.95, 8, frameDt),
          THREE.MathUtils.damp(orbitControls.target.z, state.z, 8, frameDt)
        );
        orbitControls.update();
      } else {
        _carQuat.copy(modelT.root.quaternion);

        if (camMode === 'cockpit') {
          _offsetVec.set(-0.23, 1.44, -0.36).applyQuaternion(_carQuat);
          _lookOffsetVec.set(-0.18, 1.20, 14.0).applyQuaternion(_carQuat);
        } else if (camMode === 'bonnet') {
          _offsetVec.set(0, 1.42, 0.35).applyQuaternion(_carQuat);
          _lookOffsetVec.set(0, 1.15, 16.0).applyQuaternion(_carQuat);
        } else {
          const speedPullback = Math.min(1.4, state.speedMps * 0.08);
          _offsetVec.set(0, 2.4 + speedPullback * 0.25, -5.8 - speedPullback).applyQuaternion(_carQuat);
          _lookOffsetVec.set(0, 1.05, 3.2).applyQuaternion(_carQuat);
        }

        _desiredCamPos.set(state.x + _offsetVec.x, state.y + _offsetVec.y, state.z + _offsetVec.z);
        _desiredLookAt.set(state.x + _lookOffsetVec.x, state.y + _lookOffsetVec.y, state.z + _lookOffsetVec.z);

        const posLambda = camMode === 'chase' ? 7.5 : 34;
        const lookLambda = camMode === 'chase' ? 9.5 : 34;

        camera.position.x = THREE.MathUtils.damp(camera.position.x, _desiredCamPos.x, posLambda, frameDt);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, Math.max(state.y + 0.5, _desiredCamPos.y), posLambda, frameDt);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, _desiredCamPos.z, posLambda, frameDt);

        _currentLookAt.x = THREE.MathUtils.damp(_currentLookAt.x, _desiredLookAt.x, lookLambda, frameDt);
        _currentLookAt.y = THREE.MathUtils.damp(_currentLookAt.y, _desiredLookAt.y, lookLambda, frameDt);
        _currentLookAt.z = THREE.MathUtils.damp(_currentLookAt.z, _desiredLookAt.z, lookLambda, frameDt);
        camera.lookAt(_currentLookAt);

        const targetFov = camMode === 'cockpit' ? 64 : 55 + Math.min(7, state.speedMph * 0.18);
        if (Math.abs(camera.fov - targetFov) > 0.05) {
          camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 5, frameDt);
          camera.updateProjectionMatrix();
        }
      }

      renderer.render(scene, camera);

      if (now - lastUiPush > 50) {
        lastUiPush = now;
        const snapshot: VehicleState = {
          ...state,
          wheels: [
            { ...state.wheels[0] },
            { ...state.wheels[1] },
            { ...state.wheels[2] },
            { ...state.wheels[3] },
          ],
        };
        setMinimapTelemetry(snapshot);
        onTelemetryRef.current(snapshot, { ...env });
      }

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    if (isSoftwareGl) {
      afterDraw(tick);
    } else {
      frameId = requestAnimationFrame(tick);
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', handleResize);
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      orbitControls.dispose();
      dustGeo.dispose();
      dustMat.dispose();
      rainGeo.dispose();
      rainMat.dispose();
      contactShadowPlane.geometry.dispose();
      contactShadowMat.dispose();
      contactShadowTex.dispose();
      envTex.dispose();
      traffic.dispose();
      modelT.dispose();
      world.dispose();
      textures.dispose();
      renderer.dispose();
      if (canvas.parentElement === container) {
        container.removeChild(canvas);
      }
    };
  }, [vehicleStateRef, controlsRef, envRef, cameraModeRef, controlModeRef, headlightsManualRef, audioRef]);

  return (
    <div className="relative h-full w-full bg-[#1a1815]">
      <div ref={mountRef} className="absolute inset-0 h-full w-full" />

      <MinimapOverlay telemetry={minimapTelemetry} />

      {contextLost && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#181512] text-[#F4EFE6]">
          <div className="max-w-md border border-white/15 bg-[#221e19] p-6 text-center">
            <h2 className="font-display text-xl font-semibold">Graphics Context Paused</h2>
            <p className="mt-2 text-sm text-[#cfc6b6]">
              The WebGL rendering context was interrupted. Reload the page to resume the Oamaru 1914 Model T simulation.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
