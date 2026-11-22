import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ModelTAudioEngine } from '../sim/audio';
import { computeAmbientTempC, getSeasonClimateInfo, pickLikelyWeather } from '../sim/climate';
import {
  ActiveErrandState,
  OAMARU_ERRANDS,
  loadTrialRecords,
  saveTrialRecords,
} from '../sim/errands';
import { buildFordModelT } from '../sim/modelTGeometry';
import { buildOamaruTraffic } from '../sim/oamaruTraffic';
import { buildOamaruWorld } from '../sim/oamaruWorld';
import { stepVehiclePhysics } from '../sim/physics';
import {
  BadDrivingReason,
  StreetDialogueEvent,
  pickCasualStreetLine,
  pickScoldingLine,
} from '../sim/streetVoices';
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
  wiperOnRef: React.MutableRefObject<boolean>;
  audioRef: React.MutableRefObject<ModelTAudioEngine>;
  hornTriggerRef?: React.MutableRefObject<number>;
  errandState: ActiveErrandState;
  errandStateRef: React.MutableRefObject<ActiveErrandState>;
  onErrandUpdate: React.Dispatch<React.SetStateAction<ActiveErrandState>>;
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
const _radCapPos = new THREE.Vector3();
const _trackDummy = new THREE.Object3D();

// Pre-allocated atmosphere color interpolants
const _cDaySky = new THREE.Color(0xcfd8dc);
const _cCloudySky = new THREE.Color(0x9ca6ad);
const _cDuskSky = new THREE.Color(0xc97f5c);
const _cNightSky = new THREE.Color(0x161d2b);
const _cRainSky = new THREE.Color(0x707c85);
const _cSnowSky = new THREE.Color(0xd5dfe6);
const _cWindSky = new THREE.Color(0xc8c2b0);

const _cDaySun = new THREE.Color(0xfff1d6);
const _cDuskSun = new THREE.Color(0xff8e47);
const _cNightMoon = new THREE.Color(0x7f9bc4);

const _cSkyCurrent = new THREE.Color();
const _cSunCurrent = new THREE.Color();
const _cHemiSky = new THREE.Color();
const _cHemiGround = new THREE.Color();
const _cFenderClean = new THREE.Color(0x121315);
const _cFenderMud = new THREE.Color(0x4b3b27);

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
  wiperOnRef,
  audioRef,
  hornTriggerRef,
  errandState,
  errandStateRef,
  onErrandUpdate,
  onTelemetryTick,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const onTelemetryRef = useRef(onTelemetryTick);
  onTelemetryRef.current = onTelemetryTick;
  const onErrandUpdateRef = useRef(onErrandUpdate);
  onErrandUpdateRef.current = onErrandUpdate;

  const [contextLost, setContextLost] = useState(false);
  const [dialogue, setDialogue] = useState<StreetDialogueEvent | null>(null);
  const [minimapTelemetry, setMinimapTelemetry] = useState<VehicleState>(() => ({
    ...vehicleStateRef.current,
    wheels: [...vehicleStateRef.current.wheels] as VehicleState['wheels'],
  }));
  const [minimapMeta, setMinimapMeta] = useState<{
    rivals: { x: number; z: number }[];
    trainPos: { x: number; z: number } | null;
  }>({ rivals: [], trainPos: null });

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
      520
    );

    const orbitControls = new OrbitControls(camera, canvas);
    orbitControls.enableDamping = !isSoftwareGl;
    orbitControls.dampingFactor = 0.08;
    orbitControls.maxPolarAngle = Math.PI * 0.485;
    orbitControls.minDistance = 3.2;
    orbitControls.maxDistance = 36;
    orbitControls.enabled = false;

    const hemiLight = new THREE.HemisphereLight(0xd9e8f2, 0x6f624c, 0.72);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfff1d6, 2.15);
    sunLight.position.set(55, 78, -32);
    sunLight.castShadow = !isSoftwareGl;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 220;
    const d = 64;
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

    // Ring-buffer mud / grass / snow tire track decals
    const trackCount = 180;
    const trackGeo = new THREE.PlaneGeometry(0.18, 0.56);
    trackGeo.rotateX(-Math.PI / 2);
    const trackMat = new THREE.MeshBasicMaterial({
      color: 0x3b3022,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    const trackInst = new THREE.InstancedMesh(trackGeo, trackMat, trackCount);
    trackInst.frustumCulled = false;
    _trackDummy.position.set(0, -50, 0);
    _trackDummy.updateMatrix();
    for (let i = 0; i < trackCount; i++) {
      trackInst.setMatrixAt(i, _trackDummy.matrix);
    }
    trackInst.instanceMatrix.needsUpdate = true;
    scene.add(trackInst);
    let trackCursor = 0;
    let lastTrackStampX = vehicleStateRef.current.x;
    let lastTrackStampZ = vehicleStateRef.current.z;

    // Radiator boiling steam particle pool
    const steamCount = 26;
    const steamPositions = new Float32Array(steamCount * 3);
    const steamVel: [number, number, number][] = Array.from({ length: steamCount }, () => [0, 0, 0]);
    const steamLife = new Float32Array(steamCount);
    for (let i = 0; i < steamCount; i++) steamPositions[i * 3 + 1] = -50;
    const steamGeo = new THREE.BufferGeometry();
    steamGeo.setAttribute('position', new THREE.BufferAttribute(steamPositions, 3));
    const steamMat = new THREE.PointsMaterial({
      color: 0xf4f7fa,
      size: 0.45,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    const steamPoints = new THREE.Points(steamGeo, steamMat);
    steamPoints.frustumCulled = false;
    scene.add(steamPoints);
    let steamCursor = 0;

    // Tire Dust / Water Spray / Snow Plume Particle Pool
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
      rainDrops.push([(Math.random() - 0.5) * 46, Math.random() * 22, (Math.random() - 0.5) * 46]);
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
    const rainMat = new THREE.LineBasicMaterial({
      color: 0xcad6df,
      transparent: true,
      opacity: 0.44,
      depthWrite: false,
    });
    const rainMesh = new THREE.LineSegments(rainGeo, rainMat);
    rainMesh.frustumCulled = false;
    rainMesh.visible = false;
    scene.add(rainMesh);

    // 3D Snowflake Particle Pool
    const snowCount = 320;
    const snowPositions = new Float32Array(snowCount * 3);
    const snowFlakes: [number, number, number, number][] = [];
    for (let i = 0; i < snowCount; i++) {
      snowFlakes.push([
        (Math.random() - 0.5) * 48,
        Math.random() * 22,
        (Math.random() - 0.5) * 48,
        Math.random() * Math.PI * 2,
      ]);
    }
    const snowGeo = new THREE.BufferGeometry();
    snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPositions, 3));
    const snowMat = new THREE.PointsMaterial({
      color: 0xf4f8fc,
      size: 0.22,
      transparent: true,
      opacity: 0.86,
      depthWrite: false,
    });
    const snowPoints = new THREE.Points(snowGeo, snowMat);
    snowPoints.frustumCulled = false;
    snowPoints.visible = false;
    scene.add(snowPoints);

    // 3D Coastal Wind Gust Streaks
    const windStreakCount = 130;
    const windStreakPositions = new Float32Array(windStreakCount * 6);
    const windStreaks: [number, number, number][] = [];
    for (let i = 0; i < windStreakCount; i++) {
      windStreaks.push([(Math.random() - 0.5) * 52, 0.3 + Math.random() * 9, (Math.random() - 0.5) * 52]);
    }
    const windGeo = new THREE.BufferGeometry();
    windGeo.setAttribute('position', new THREE.BufferAttribute(windStreakPositions, 3));
    const windMat = new THREE.LineBasicMaterial({
      color: 0xcfc4ac,
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
    });
    const windMesh = new THREE.LineSegments(windGeo, windMat);
    windMesh.frustumCulled = false;
    windMesh.visible = false;
    scene.add(windMesh);

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
    let autoWeatherTimer = 0;
    let autoRollSeed = 0;
    let lastScoldAt = -10000;
    let lastChatAt = -10000;
    let dialogueExpireAt = 0;
    let dialogueId = 0;
    let chatCursor = 0;
    let scoldCursor = 0;
    let lastHornCount = hornTriggerRef?.current ?? 0;
    let lastBackfireCount = vehicleStateRef.current.backfireTrigger;
    let prevKickbackWarning = vehicleStateRef.current.crankKickbackWarning;
    let badDrivingMomentum = 0;
    let errandCooldownUntil = 0;

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
        env.timeHour = (env.timeHour + frameDt * 0.45) % 24;
      }

      if (env.autoWeather) {
        autoWeatherTimer += frameDt;
        if (autoWeatherTimer >= 36) {
          autoWeatherTimer = 0;
          autoRollSeed += 1;
          env.weather = pickLikelyWeather(env.dayOfYear, env.timeHour, autoRollSeed);
        }
      }

      const seasonInfo = getSeasonClimateInfo(env.dayOfYear);
      env.seasonName = seasonInfo.seasonName;
      env.dateLabel = seasonInfo.dateLabel;
      env.sunriseHour = seasonInfo.sunriseHour;
      env.sunsetHour = seasonInfo.sunsetHour;
      env.temperatureC = computeAmbientTempC(env.dayOfYear, env.timeHour, env.weather);

      const targetWet =
        env.weather === 'rainy'
          ? 1.0
          : env.weather === 'cloudy'
            ? 0.14
            : env.weather === 'snowy'
              ? 0.16
              : 0.0;
      const targetSnow = env.weather === 'snowy' ? 1.0 : 0.0;

      env.wetness = THREE.MathUtils.damp(env.wetness, targetWet, 2.2, frameDt);
      env.snowCover = THREE.MathUtils.damp(env.snowCover, targetSnow, 0.9, frameDt);

      env.windMps =
        env.weather === 'windy'
          ? 14.8 + Math.sin(elapsed * 0.85) * 3.8
          : env.weather === 'rainy'
            ? 7.8 + Math.sin(elapsed * 0.7) * 2.5
            : env.weather === 'snowy'
              ? 4.8 + Math.sin(elapsed * 0.5) * 1.4
              : env.weather === 'cloudy'
                ? 3.2
                : 1.8;

      env.visibilityMeters =
        env.weather === 'snowy'
          ? 85
          : env.weather === 'rainy'
            ? 110
            : env.weather === 'cloudy'
              ? 195
              : env.weather === 'windy'
                ? 220
                : 300;

      // Fixed 120Hz physics substeps
      const fixedDt = 1 / 120;
      accumulator += frameDt;
      let steps = 0;
      while (accumulator >= fixedDt && steps < 8) {
        stepVehiclePhysics(state, controls, mode, env, fixedDt);
        accumulator -= fixedDt;
        steps++;
      }

      // Soft collision resolution against moving vintage automobiles & grain dray
      const dynObstacles = traffic.getObstacles();
      for (let i = 0; i < dynObstacles.length; i++) {
        const obs = dynObstacles[i];
        const dx = state.x - obs.x;
        const dz = state.z - obs.z;
        const minDist = obs.radius + 1.25;
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
            if (vn < -1.1) {
              state.impactStrength = Math.max(state.impactStrength, Math.min(1, Math.abs(vn) / 5));
            }
            state.vx -= 1.2 * vn * nx;
            state.vz -= 1.2 * vn * nz;
          }
        }
      }

      if (state.backfireTrigger !== lastBackfireCount) {
        lastBackfireCount = state.backfireTrigger;
        audioRef.current.playBackfirePop();
      }
      if (state.crankKickbackWarning && !prevKickbackWarning) {
        audioRef.current.playCrankKickback();
      }
      prevKickbackWarning = state.crankKickbackWarning;

      const curHornCount = hornTriggerRef?.current ?? lastHornCount;
      const hornFired = curHornCount !== lastHornCount;
      lastHornCount = curHornCount;

      const isSpeeding = state.speedMph > 21;
      const isOffroadBad =
        (state.currentSurface === 'grass' || state.currentSurface === 'mud') && state.speedMps > 3.2;
      const isSkidding = state.wheels[2].slipRatio > 0.40 && state.speedMps > 4.0;
      const instantBad =
        state.impactStrength > 0.24 || isSpeeding || isOffroadBad || isSkidding || hornFired;

      if (instantBad) {
        const boost =
          state.impactStrength > 0.24
            ? 1.0
            : isSkidding || isOffroadBad
              ? 0.9
              : isSpeeding
                ? 0.82
                : 0.75;
        badDrivingMomentum = Math.max(badDrivingMomentum, boost);
      } else {
        badDrivingMomentum = Math.max(0, badDrivingMomentum - frameDt * 0.42);
      }

      // Update period citizens, horse carts, vintage cars, reactive dogs, fleeing sheep & seagulls
      const lightsOnPreview =
        headlightsManualRef.current !== null
          ? headlightsManualRef.current
          : env.timeHour < env.sunriseHour ||
            env.timeHour > env.sunsetHour ||
            env.weather === 'rainy' ||
            env.weather === 'snowy';
      traffic.update(frameDt, elapsed, env.windMps, lightsOnPreview, {
        x: state.x,
        z: state.z,
        yaw: state.yaw,
        speedMps: state.speedMps,
        badDrivingIntensity: badDrivingMomentum,
        hornJustFired: hornFired,
        surface: state.currentSurface,
      });

      world.update(elapsed);
      const trainPos = world.getTrainPos();
      state.racePosition = traffic.getRacePosition(state.x, state.z, state.lapCount);

      const spatialHints = traffic.getSpatialAudioHints(state.x, state.z, state.yaw, trainPos);
      audioRef.current.update(state, env, spatialHints);

      // Errand progression check
      const curErrand = errandStateRef.current;
      if (now > errandCooldownUntil && (curErrand.phase === 'to-pickup' || curErrand.phase === 'to-dropoff')) {
        const job = OAMARU_ERRANDS[curErrand.errandIndex];
        const target = curErrand.phase === 'to-pickup' ? job.pickup : job.dropoff;
        const distToStop = Math.hypot(state.x - target.x, state.z - target.z);
        if (distToStop < 16 && state.speedMph < 10.5) {
          errandCooldownUntil = now + 2000;
          audioRef.current.playErrandChime();
          if (curErrand.phase === 'to-pickup') {
            onErrandUpdateRef.current((prev) => ({
              ...prev,
              phase: 'to-dropoff',
              statusMessage: `Collected from ${job.pickup.label}. Head to ${job.dropoff.label}.`,
            }));
          } else {
            const prevRec = loadTrialRecords();
            saveTrialRecords({
              bestLapSec: state.bestLapSec ?? prevRec.bestLapSec,
              bestCourtesy: Math.max(prevRec.bestCourtesy, Math.round(state.courtesyScore)),
              errandsCompleted: prevRec.errandsCompleted + 1,
            });
            onErrandUpdateRef.current((prev) => ({
              ...prev,
              phase: 'completed',
              completedCount: prev.completedCount + 1,
              cleanStreak: state.courtesyScore >= 85 ? prev.cleanStreak + 1 : 0,
              statusMessage: job.rewardNote,
            }));
          }
        }
      }

      let badReason: BadDrivingReason | null = null;
      if (state.impactStrength > 0.28) {
        badReason = 'impact';
      } else if (spatialHints.nearestCrowdDist < 23 && state.speedMph > 21) {
        badReason = 'speeding';
      } else if (
        spatialHints.nearestCrowdDist < 24 &&
        (state.currentSurface === 'grass' || state.currentSurface === 'mud') &&
        state.speedMps > 3.5
      ) {
        badReason = 'offroad';
      } else if (
        spatialHints.nearestCrowdDist < 22 &&
        state.wheels[2].slipRatio > 0.42 &&
        state.speedMps > 4.2
      ) {
        badReason = 'skid';
      } else if (hornFired && spatialHints.nearestCrowdDist < 21) {
        badReason = 'hornSpam';
      } else if (spatialHints.sheepPanicIntensity > 0.42 && badDrivingMomentum > 0.22) {
        badReason = 'livestock';
      }

      if (badReason && now - lastScoldAt > 3800) {
        lastScoldAt = now;
        const penalty =
          badReason === 'impact' ? 8 : badReason === 'livestock' ? 6 : badReason === 'offroad' || badReason === 'skid' ? 4 : 3;
        state.courtesyScore = Math.max(0, state.courtesyScore - penalty);

        scoldCursor += 1;
        const entry = pickScoldingLine(badReason, scoldCursor);
        dialogueId += 1;
        dialogueExpireAt = now + 4500;
        setDialogue({
          id: dialogueId,
          speaker: entry.role,
          location: spatialHints.nearestClusterLabel,
          text: entry.text,
          isScolding: true,
        });
        audioRef.current.speakStreetLine(entry.text, entry.role, true, 0.95);
      } else if (
        !badReason &&
        spatialHints.nearestCrowdDist < 17.5 &&
        state.speedMph < 18 &&
        now - lastChatAt > 6800 &&
        now - lastScoldAt > 4600
      ) {
        lastChatAt = now;
        chatCursor += 1;
        const entry = pickCasualStreetLine(chatCursor);
        dialogueId += 1;
        dialogueExpireAt = now + 4600;
        const vol = Math.min(0.88, 0.45 + spatialHints.crowdProximity * 0.45);
        setDialogue({
          id: dialogueId,
          speaker: entry.role,
          location: spatialHints.nearestClusterLabel,
          text: entry.text,
          isScolding: false,
        });
        audioRef.current.speakStreetLine(entry.text, entry.role, false, vol);
      } else if (dialogueExpireAt > 0 && now > dialogueExpireAt) {
        dialogueExpireAt = 0;
        setDialogue(null);
      }

      // Seasonal Solar / Lunar Arc (using Oamaru 45.1°S sunriseHour & sunsetHour)
      const h = env.timeHour;
      const daySpan = Math.max(6, env.sunsetHour - env.sunriseHour);
      const sunAngle = ((h - env.sunriseHour) / daySpan) * Math.PI;
      const sunSin = Math.sin(sunAngle);
      const dayFactor = THREE.MathUtils.clamp((sunSin + 0.1) / 0.65, 0, 1);
      const duskFactor = THREE.MathUtils.clamp(1 - Math.abs(sunSin) * 2.8, 0, 1);
      const nightFactor = THREE.MathUtils.clamp((-sunSin + 0.12) * 1.9, 0, 1);

      _cSkyCurrent.copy(_cNightSky).lerp(_cDaySky, dayFactor);
      if (duskFactor > 0.05) {
        _cSkyCurrent.lerp(_cDuskSky, duskFactor * 0.72);
      }
      if (env.weather === 'cloudy') {
        _cSkyCurrent.lerp(_cCloudySky, 0.56 * (1 - nightFactor * 0.6));
      } else if (env.weather === 'rainy') {
        _cSkyCurrent.lerp(_cRainSky, 0.66 * (1 - nightFactor * 0.65));
      } else if (env.weather === 'snowy') {
        _cSkyCurrent.lerp(_cSnowSky, 0.72 * (1 - nightFactor * 0.72));
      } else if (env.weather === 'windy') {
        _cSkyCurrent.lerp(_cWindSky, 0.38 * (1 - nightFactor * 0.65));
      }

      bgColor.copy(_cSkyCurrent);
      fog.color.copy(_cSkyCurrent);

      const targetFogDensity =
        env.weather === 'snowy'
          ? 0.015
          : env.weather === 'rainy'
            ? 0.011
            : env.weather === 'cloudy'
              ? 0.0068
              : env.weather === 'windy'
                ? 0.0058
                : 0.0042 + duskFactor * 0.0015;
      fog.density = THREE.MathUtils.damp(fog.density, targetFogDensity, 3.0, frameDt);

      const seasonalCos = Math.cos(((env.dayOfYear - 355) / 365) * Math.PI * 2);
      const maxSolarElevHeight = 62 + seasonalCos * 26;
      const sunHeight = Math.max(14, Math.abs(sunSin) * maxSolarElevHeight);
      const sunDirX = Math.cos(sunAngle) * 65;
      sunLight.position.set(state.x + sunDirX, sunHeight, state.z - 32);
      sunLight.target.position.set(state.x, state.y, state.z);

      _cSunCurrent.copy(_cDaySun);
      if (duskFactor > 0.05) _cSunCurrent.lerp(_cDuskSun, duskFactor * 0.85);
      if (nightFactor > 0.4) _cSunCurrent.lerp(_cNightMoon, (nightFactor - 0.4) / 0.6);
      sunLight.color.copy(_cSunCurrent);

      const weatherDim =
        env.weather === 'rainy'
          ? 0.52
          : env.weather === 'snowy'
            ? 0.58
            : env.weather === 'cloudy'
              ? 0.64
              : env.weather === 'windy'
                ? 0.88
                : 1.0;
      sunLight.intensity = THREE.MathUtils.lerp(2.2, 0.42, nightFactor) * weatherDim;

      _cHemiSky.copy(_cSkyCurrent);
      _cHemiGround.setHex(0x6f624c).lerp(_cNightSky, nightFactor * 0.8);
      hemiLight.color.copy(_cHemiSky);
      hemiLight.groundColor.copy(_cHemiGround);
      hemiLight.intensity = THREE.MathUtils.lerp(0.75, 0.28, nightFactor);

      renderer.toneMappingExposure = THREE.MathUtils.lerp(1.08, 0.88, nightFactor);

      world.setAtmosphereVisuals(env.wetness, env.snowCover, nightFactor);

      const autoLamps = nightFactor > 0.32 || env.weather === 'rainy' || env.weather === 'snowy';
      const lightsOn = headlightsManualRef.current !== null ? headlightsManualRef.current : autoLamps;

      // Rain Particle System
      if (env.weather === 'rainy') {
        rainMesh.visible = true;
        const rAttr = rainGeo.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < rainCount; i++) {
          const drop = rainDrops[i];
          drop[1] -= 22 * frameDt;
          drop[0] -= env.windMps * 0.35 * frameDt;
          if (drop[1] < 0) {
            drop[0] = (Math.random() - 0.5) * 46;
            drop[1] = 16 + Math.random() * 8;
            drop[2] = (Math.random() - 0.5) * 46;
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

      // Snow Particle System
      if (env.weather === 'snowy') {
        snowPoints.visible = true;
        const sAttr = snowGeo.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < snowCount; i++) {
          const fl = snowFlakes[i];
          fl[1] -= 3.2 * frameDt;
          fl[0] += (Math.sin(elapsed * 1.4 + fl[3]) * 0.8 - env.windMps * 0.22) * frameDt;
          fl[2] += Math.cos(elapsed * 1.1 + fl[3]) * 0.6 * frameDt;
          if (fl[1] < 0) {
            fl[0] = (Math.random() - 0.5) * 48;
            fl[1] = 15 + Math.random() * 7;
            fl[2] = (Math.random() - 0.5) * 48;
          }
          sAttr.setXYZ(i, state.x + fl[0], state.y + fl[1], state.z + fl[2]);
        }
        sAttr.needsUpdate = true;
      } else {
        snowPoints.visible = false;
      }

      // Coastal Wind Gust Streaks
      if (env.weather === 'windy') {
        windMesh.visible = true;
        const wAttr = windGeo.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < windStreakCount; i++) {
          const st = windStreaks[i];
          st[0] -= env.windMps * 1.25 * frameDt;
          st[1] += Math.sin(elapsed * 3.5 + i) * 0.45 * frameDt;
          if (st[0] < -26) {
            st[0] = 26;
            st[1] = 0.3 + Math.random() * 9;
            st[2] = (Math.random() - 0.5) * 52;
          }
          const wx = state.x + st[0];
          const wy = state.y + st[1];
          const wz = state.z + st[2];
          wAttr.setXYZ(i * 2, wx, wy, wz);
          wAttr.setXYZ(i * 2 + 1, wx + 1.35, wy + 0.05, wz);
        }
        wAttr.needsUpdate = true;
      } else {
        windMesh.visible = false;
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

      // Cockpit working speedometer, magneto ammeter, windscreen wiper & muddy fender tint
      const targetSpeedoAngle = -Math.PI * 0.75 + Math.min(1, state.speedMph / 45) * Math.PI * 1.5;
      modelT.speedometerNeedle.rotation.z = THREE.MathUtils.damp(
        modelT.speedometerNeedle.rotation.z,
        targetSpeedoAngle,
        9,
        frameDt
      );

      const targetAmmAngle = !state.ignitionOn
        ? 0
        : !state.engineRunning
          ? -0.32
          : 0.14 + Math.min(0.62, (state.rpm / 2200) * 0.62);
      modelT.ammeterNeedle.rotation.z = THREE.MathUtils.damp(
        modelT.ammeterNeedle.rotation.z,
        targetAmmAngle,
        8,
        frameDt
      );

      const targetWiperAngle = wiperOnRef.current ? Math.sin(elapsed * 3.8) * 0.85 : 0.78;
      modelT.wiperPivot.rotation.z = THREE.MathUtils.damp(
        modelT.wiperPivot.rotation.z,
        targetWiperAngle,
        12,
        frameDt
      );

      modelT.fenderPaint.color.copy(_cFenderClean).lerp(_cFenderMud, state.mudAccumulation * 0.82);
      modelT.fenderPaint.roughness = 0.28 + state.mudAccumulation * 0.6;

      // Magneto-driven headlamp output scales with engine RPM
      const magnetoFactor = state.engineRunning
        ? Math.min(1.18, 0.42 + (state.rpm / 1500) * 0.74)
        : state.ignitionOn
          ? 0.14
          : 0.08;
      modelT.headlights[0].intensity = lightsOn ? 28 * magnetoFactor : 0;
      modelT.headlights[1].intensity = lightsOn ? 28 * magnetoFactor : 0;
      const bulbMat = modelT.headlightBulbs[0].material as THREE.MeshStandardMaterial;
      bulbMat.emissiveIntensity = lightsOn ? 0.4 + 2.2 * magnetoFactor : 0.25;

      // Stamp tire track decals on mud, grass & snowy roads
      const stampDist = Math.hypot(state.x - lastTrackStampX, state.z - lastTrackStampZ);
      if (
        state.speedMps > 1.2 &&
        stampDist >= 0.56 &&
        (state.currentSurface === 'mud' || state.currentSurface === 'grass' || env.snowCover > 0.22)
      ) {
        lastTrackStampX = state.x;
        lastTrackStampZ = state.z;
        trackMat.color.setHex(env.snowCover > 0.35 ? 0x626b73 : 0x3b3022);
        [-0.71, 0.71].forEach((lx) => {
          _rearWheelPos.set(lx, 0, -1.27).applyQuaternion(modelT.root.quaternion);
          _trackDummy.position.set(state.x + _rearWheelPos.x, state.y + 0.028, state.z + _rearWheelPos.z);
          _trackDummy.rotation.set(0, state.yaw, 0);
          _trackDummy.scale.set(1, 1, 1);
          _trackDummy.updateMatrix();
          trackInst.setMatrixAt(trackCursor % trackCount, _trackDummy.matrix);
          trackCursor++;
        });
        trackInst.instanceMatrix.needsUpdate = true;
      }

      // Radiator boiling steam puffs
      if (state.isOverheating || state.engineTempC > 98) {
        _radCapPos.set(0, 1.15, 1.38).applyQuaternion(modelT.root.quaternion);
        if (Math.random() < (state.isOverheating ? 0.85 : 0.4)) {
          const idx = steamCursor % steamCount;
          steamPositions[idx * 3] = state.x + _radCapPos.x + (Math.random() - 0.5) * 0.08;
          steamPositions[idx * 3 + 1] = state.y + _radCapPos.y;
          steamPositions[idx * 3 + 2] = state.z + _radCapPos.z + (Math.random() - 0.5) * 0.08;
          steamVel[idx][0] = state.vx * 0.35 + (Math.random() - 0.5) * 0.4;
          steamVel[idx][1] = 1.2 + Math.random() * 0.7;
          steamVel[idx][2] = state.vz * 0.35 + (Math.random() - 0.5) * 0.4;
          steamLife[idx] = 1.0;
          steamCursor++;
        }
      }
      for (let i = 0; i < steamCount; i++) {
        if (steamLife[i] > 0) {
          steamLife[i] -= frameDt * 1.2;
          steamPositions[i * 3] += steamVel[i][0] * frameDt;
          steamPositions[i * 3 + 1] += steamVel[i][1] * frameDt;
          steamPositions[i * 3 + 2] += steamVel[i][2] * frameDt;
          if (steamLife[i] <= 0) steamPositions[i * 3 + 1] = -50;
        }
      }
      steamGeo.attributes.position.needsUpdate = true;

      // Tire dust / water spray / snow plume particles
      dustMat.color.setHex(
        env.weather === 'snowy' ? 0xedf2f7 : env.weather === 'rainy' ? 0xb5c2cb : 0xc2b296
      );
      if (
        state.speedMps > 2.2 &&
        (env.weather === 'rainy' ||
          env.weather === 'snowy' ||
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
        setMinimapMeta({
          rivals: traffic.getRivalMapPoints(),
          trainPos,
        });
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
      trackGeo.dispose();
      trackMat.dispose();
      steamGeo.dispose();
      steamMat.dispose();
      dustGeo.dispose();
      dustMat.dispose();
      rainGeo.dispose();
      rainMat.dispose();
      snowGeo.dispose();
      snowMat.dispose();
      windGeo.dispose();
      windMat.dispose();
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
  }, [
    vehicleStateRef,
    controlsRef,
    envRef,
    cameraModeRef,
    controlModeRef,
    headlightsManualRef,
    wiperOnRef,
    audioRef,
    hornTriggerRef,
    errandStateRef,
  ]);

  const activeErrandTarget =
    errandState.phase === 'to-pickup' || errandState.phase === 'to-dropoff'
      ? (() => {
          const job = OAMARU_ERRANDS[errandState.errandIndex];
          const isDropoff = errandState.phase === 'to-dropoff';
          const stop = isDropoff ? job.dropoff : job.pickup;
          return { x: stop.x, z: stop.z, label: stop.label, isDropoff };
        })()
      : null;

  return (
    <div className="relative h-full w-full bg-[#1a1815]">
      <div ref={mountRef} className="absolute inset-0 h-full w-full" />

      {dialogue && (
        <div
          aria-live="polite"
          className={`pointer-events-none fixed top-20 left-6 z-15 max-w-md rounded-xl border px-3.5 py-2.5 shadow-xl ${
            dialogue.isScolding
              ? 'border-[#d96b52]/70 bg-[#261613]/94 text-[#fbeae6]'
              : 'border-[#D4A656]/45 bg-[#161411]/92 text-[#F4EFE6]'
          }`}
        >
          <div className="flex items-center justify-between gap-3 text-[11px]">
            <span
              className={`font-semibold ${
                dialogue.isScolding ? 'text-[#f2917b]' : 'text-[#E8C073]'
              }`}
            >
              {dialogue.speaker}
            </span>
            <span className="text-[#9E9280]">{dialogue.location}</span>
          </div>
          <p className="mt-1 text-xs leading-snug">“{dialogue.text}”</p>
        </div>
      )}

      <MinimapOverlay
        telemetry={minimapTelemetry}
        rivals={minimapMeta.rivals}
        trainPos={minimapMeta.trainPos}
        errandTarget={activeErrandTarget}
      />

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
