import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ModelTAudioEngine } from '../sim/audio';
import { computeAmbientTempC, getSeasonClimateInfo, pickLikelyWeather } from '../sim/climate';
import {
  ActiveErrandState,
  OAMARU_ERRANDS,
  loadTrialRecords,
  saveTrialRecords,
} from '../sim/errands';
import { ModelTInstrumentKey, buildFordModelT } from '../sim/modelTGeometry';
import { buildOamaruTraffic } from '../sim/oamaruTraffic';
import { buildOamaruWorld } from '../sim/oamaruWorld';
import {
  ARTHUR_LESSON_STEPS,
  PASSENGERS,
  PassengerHudState,
  PassengerRideEvent,
  WaitingMapPoint,
  buildPassengerSystem,
  getMechanicLiveTipWithFocus,
  getPassengerById,
  pickPassengerRideLine,
} from '../sim/passengers';
import { stepVehiclePhysics } from '../sim/physics';
import {
  BadDrivingReason,
  StreetDialogueEvent,
  pickCasualStreetLine,
  pickScoldingLine,
} from '../sim/streetVoices';
import { WORLD_COLLIDERS, getTerrainHeightAndSurface } from '../sim/terrain';
import { installHeightFog } from '../sim/heightFog';
import { createOutdoorSky } from '../sim/outdoorSky';
import { createProceduralTextures } from '../sim/textures';
import { CameraMode, ControlMode, EnvironmentState, VehicleControls, VehicleState } from '../sim/types';
import { MinimapOverlay } from './MinimapOverlay';

export interface RecorderControlHandle {
  start: () => void;
  stop: () => void;
}

export interface RecordingStatusState {
  isRecording: boolean;
  elapsedSec: number;
  recordedMode: CameraMode;
  error: string | null;
  lastSavedFilename: string | null;
}

interface OamaruViewportProps {
  vehicleStateRef: React.MutableRefObject<VehicleState>;
  controlsRef: React.MutableRefObject<VehicleControls>;
  envRef: React.MutableRefObject<EnvironmentState>;
  cameraModeRef: React.MutableRefObject<CameraMode>;
  recordCameraModeRef: React.MutableRefObject<CameraMode>;
  controlModeRef: React.MutableRefObject<ControlMode>;
  headlightsManualRef: React.MutableRefObject<boolean | null>;
  wiperOnRef: React.MutableRefObject<boolean>;
  audioRef: React.MutableRefObject<ModelTAudioEngine>;
  hornTriggerRef?: React.MutableRefObject<number>;
  passengerActionTriggerRef?: React.MutableRefObject<number>;
  resetTriggerRef?: React.MutableRefObject<number>;
  recorderControlRef: React.MutableRefObject<RecorderControlHandle | null>;
  startShieldOpen: boolean;
  passengerHud: PassengerHudState;
  onPassengerHudChange: (hud: PassengerHudState) => void;
  onPassengerAction: () => void;
  onJumpToArthur: () => void;
  onRecordingStateChange: (status: RecordingStatusState) => void;
  errandState: ActiveErrandState;
  errandStateRef: React.MutableRefObject<ActiveErrandState>;
  onErrandUpdate: React.Dispatch<React.SetStateAction<ActiveErrandState>>;
  onTelemetryTick: (snapshot: VehicleState, envSnapshot: EnvironmentState) => void;
}

// Pre-allocated math helpers outside render loop (zero GC)
const _desiredCamPos = new THREE.Vector3();
const _desiredLookAt = new THREE.Vector3();
const _currentLookAt = new THREE.Vector3();
const _recLookAt = new THREE.Vector3();
const _carQuat = new THREE.Quaternion();
const _carEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const _offsetVec = new THREE.Vector3();
const _lookOffsetVec = new THREE.Vector3();
const _rearWheelPos = new THREE.Vector3();
const _radCapPos = new THREE.Vector3();
const _trackDummy = new THREE.Object3D();
const _segDir = new THREE.Vector3();
const _shadowBiasVec = new THREE.Vector3();

type CinemaShotKind =
  | 'roadside-pass'
  | 'balcony'
  | 'pedestrian'
  | 'rival-passenger'
  | 'rolling-quarter';

function isBuildingCollider(label?: string): boolean {
  if (!label) return true;
  return (
    !label.includes('Barrier') &&
    !label.includes('Carts') &&
    !label.includes('Barricade') &&
    !label.includes('Seawall')
  );
}

function rayHitsBox(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  minZ: number,
  maxZ: number
): number {
  let tMin = 0;
  let tMax = 1;

  if (Math.abs(dx) < 1e-6) {
    if (ox < minX || ox > maxX) return -1;
  } else {
    const inv = 1 / dx;
    let t1 = (minX - ox) * inv;
    let t2 = (maxX - ox) * inv;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return -1;
  }

  if (Math.abs(dy) < 1e-6) {
    if (oy < minY || oy > maxY) return -1;
  } else {
    const inv = 1 / dy;
    let t1 = (minY - oy) * inv;
    let t2 = (maxY - oy) * inv;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return -1;
  }

  if (Math.abs(dz) < 1e-6) {
    if (oz < minZ || oz > maxZ) return -1;
  } else {
    const inv = 1 / dz;
    let t1 = (minZ - oz) * inv;
    let t2 = (maxZ - oz) * inv;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return -1;
  }

  return tMin >= 0 && tMin <= 1 ? tMin : -1;
}

function isCameraSightClear(
  cx: number,
  cy: number,
  cz: number,
  tx: number,
  ty: number,
  tz: number,
  pad = 1.05
): boolean {
  const dx = cx - tx;
  const dy = cy - ty;
  const dz = cz - tz;
  for (let i = 0; i < WORLD_COLLIDERS.length; i++) {
    const box = WORLD_COLLIDERS[i];
    if (!isBuildingCollider(box.label)) continue;
    const minX = box.minX - pad;
    const maxX = box.maxX + pad;
    const minZ = box.minZ - pad;
    const maxZ = box.maxZ + pad;
    const minY = -2;
    const maxY = 17.5;
    // Point inside building footprint
    if (cx >= minX && cx <= maxX && cz >= minZ && cz <= maxZ && cy <= maxY) {
      return false;
    }
    // Ray from target (car) to camera hits building wall
    const t = rayHitsBox(tx, ty, tz, dx, dy, dz, minX, maxX, minY, maxY, minZ, maxZ);
    if (t > 0.04 && t < 0.995) {
      return false;
    }
  }
  return true;
}

function clampCameraOutsideBuildings(pos: THREE.Vector3, target: THREE.Vector3): void {
  const pad = 0.9;
  const maxBuildingY = 17.5;
  _segDir.subVectors(pos, target);

  // 1. Pull camera in front of any building wall blocking line-of-sight from target
  let bestT = 1.0;
  for (let i = 0; i < WORLD_COLLIDERS.length; i++) {
    const box = WORLD_COLLIDERS[i];
    if (!isBuildingCollider(box.label)) continue;
    const t = rayHitsBox(
      target.x,
      target.y,
      target.z,
      _segDir.x,
      _segDir.y,
      _segDir.z,
      box.minX - pad,
      box.maxX + pad,
      -2,
      maxBuildingY,
      box.minZ - pad,
      box.maxZ + pad
    );
    if (t > 0.08 && t < bestT) {
      bestT = t;
    }
  }
  if (bestT < 1.0) {
    pos.copy(target).addScaledVector(_segDir, Math.max(0.22, bestT * 0.94));
  }

  // 2. Hard point-out-of-box pushout if still inside any building footprint
  for (let i = 0; i < WORLD_COLLIDERS.length; i++) {
    const box = WORLD_COLLIDERS[i];
    if (!isBuildingCollider(box.label)) continue;
    const minX = box.minX - pad;
    const maxX = box.maxX + pad;
    const minZ = box.minZ - pad;
    const maxZ = box.maxZ + pad;
    if (pos.x > minX && pos.x < maxX && pos.z > minZ && pos.z < maxZ && pos.y < maxBuildingY) {
      const dLeft = pos.x - minX;
      const dRight = maxX - pos.x;
      const dBack = pos.z - minZ;
      const dFront = maxZ - pos.z;
      const minD = Math.min(dLeft, dRight, dBack, dFront);
      if (minD === dLeft) pos.x = minX;
      else if (minD === dRight) pos.x = maxX;
      else if (minD === dBack) pos.z = minZ;
      else pos.z = maxZ;
    }
  }

  // 3. Keep camera cleanly above ground/kerb height
  const groundH = getTerrainHeightAndSurface(pos.x, pos.z).height;
  if (pos.y < groundH + 0.65) {
    pos.y = groundH + 0.65;
  }
}

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
const _cZenithDay = new THREE.Color(0x6f97c4);
const _cHorizonDay = new THREE.Color(0xd7e6ef);
const _cZenithDusk = new THREE.Color(0x243656);
const _cHorizonApricot = new THREE.Color(0xf0c09a);
const _cHorizonNight = new THREE.Color(0x2c3548);
const _cGroundDay = new THREE.Color(0x6d624c);
const _sunDir = new THREE.Vector3();
const _trackTint = new THREE.Color();

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
  recordCameraModeRef,
  controlModeRef,
  headlightsManualRef,
  wiperOnRef,
  audioRef,
  hornTriggerRef,
  passengerActionTriggerRef,
  resetTriggerRef,
  recorderControlRef,
  startShieldOpen,
  passengerHud,
  onPassengerHudChange,
  onPassengerAction,
  onJumpToArthur,
  onRecordingStateChange,
  errandState,
  errandStateRef,
  onErrandUpdate,
  onTelemetryTick,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const vignetteRef = useRef<HTMLDivElement | null>(null);
  const onTelemetryRef = useRef(onTelemetryTick);
  onTelemetryRef.current = onTelemetryTick;
  const onErrandUpdateRef = useRef(onErrandUpdate);
  onErrandUpdateRef.current = onErrandUpdate;
  const onPassengerHudRef = useRef(onPassengerHudChange);
  onPassengerHudRef.current = onPassengerHudChange;
  const onRecordingStateRef = useRef(onRecordingStateChange);
  onRecordingStateRef.current = onRecordingStateChange;

  const [contextLost, setContextLost] = useState(false);
  const [dialogue, setDialogue] = useState<StreetDialogueEvent | null>(null);
  const [startupDismissed, setStartupDismissed] = useState(false);
  const [hasMetArthur, setHasMetArthur] = useState(false);
  const [tourActive, setTourActive] = useState(false);
  const [tourStepIdx, setTourStepIdx] = useState(0);
  const tourActiveRef = useRef(false);
  tourActiveRef.current = tourActive;
  const tourStepIdxRef = useRef(0);
  tourStepIdxRef.current = tourStepIdx;
  const [minimapTelemetry, setMinimapTelemetry] = useState<VehicleState>(() => ({
    ...vehicleStateRef.current,
    wheels: [...vehicleStateRef.current.wheels] as VehicleState['wheels'],
  }));
  const [minimapMeta, setMinimapMeta] = useState<{
    rivals: { x: number; z: number }[];
    trainPos: { x: number; z: number } | null;
    piperPos: { x: number; z: number; down: boolean } | null;
    waitingPassengers: WaitingMapPoint[];
    passengerTarget: { x: number; z: number; label: string; name: string } | null;
  }>({ rivals: [], trainPos: null, piperPos: null, waitingPassengers: [], passengerTarget: null });

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
    renderer.shadowMap.type = THREE.PCFShadowMap;

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

    const sky = createOutdoorSky();
    scene.add(sky.dome);
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    let envTex = pmremGenerator.fromScene(sky.captureScene, 0.04).texture;
    scene.environment = envTex;
    let envKey = '';

    const camera = new THREE.PerspectiveCamera(
      cameraModeRef.current === 'orbit' ? 46 : 50,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.12,
      520
    );
    const orbitControls = new OrbitControls(camera, canvas);
    orbitControls.enableDamping = !isSoftwareGl;
    orbitControls.dampingFactor = 0.08;
    orbitControls.maxPolarAngle = Math.PI * 0.485;
    orbitControls.minDistance = 3.0;
    orbitControls.maxDistance = 18;
    orbitControls.enabled = cameraModeRef.current === 'orbit';

    const hemiLight = new THREE.HemisphereLight(0xd9e8f2, 0x6f624c, 0.72);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfff1d6, 2.15);
    sunLight.position.set(55, 78, -32);
    sunLight.castShadow = !isSoftwareGl;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 160;
    const d = 28;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0005;
    sunLight.shadow.normalBias = 0.02;
    sunLight.shadow.camera.updateProjectionMatrix();
    scene.add(sunLight);
    scene.add(sunLight.target);

    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const textures = createProceduralTextures(maxAniso);
    const world = buildOamaruWorld(textures, isSoftwareGl);
    scene.add(world.group);

    const traffic = buildOamaruTraffic();
    scene.add(traffic.group);

    const modelT = buildFordModelT(isSoftwareGl, textures.radiatorHoneycomb);
    modelT.driverRig.setFirstPersonMode(cameraModeRef.current === 'cockpit');
    scene.add(modelT.root);

    const passengers = buildPassengerSystem(modelT.chassisGroup);
    scene.add(passengers.group);

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
      color: 0xffffff,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    const trackInst = new THREE.InstancedMesh(trackGeo, trackMat, trackCount);
    trackInst.frustumCulled = false;
    _trackDummy.position.set(0, -50, 0);
    _trackDummy.updateMatrix();
    _trackTint.set(0x3b3022);
    for (let i = 0; i < trackCount; i++) {
      trackInst.setMatrixAt(i, _trackDummy.matrix);
      trackInst.setColorAt(i, _trackTint);
    }
    trackInst.instanceMatrix.needsUpdate = true;
    if (trackInst.instanceColor) trackInst.instanceColor.needsUpdate = true;
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

    installHeightFog(scene);

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
    let piperHitCursor = 0;
    let lastHornCount = hornTriggerRef?.current ?? 0;
    let lastPassengerActionCount = passengerActionTriggerRef?.current ?? 0;
    let lastResetCount = resetTriggerRef?.current ?? 0;
    let lastBackfireCount = vehicleStateRef.current.backfireTrigger;
    let prevKickbackWarning = vehicleStateRef.current.crankKickbackWarning;
    let badDrivingMomentum = 0;
    let errandCooldownUntil = 0;
    let lastPassengerBanterAt = -10000;
    let lastFullCarLineAt = -10000;
    let lastImpactAt = -10000;
    let passengerBanterCursor = 0;
    let autoDropoffDwellSec = 0;
    let passengerNotice: string | null = null;
    let passengerNoticeUntil = 0;
    let prevCoachTipFocusKey: ModelTInstrumentKey | null = null;
    let liveFocusKey: ModelTInstrumentKey | null = null;
    let liveFocusUntil = -1;
    let liveFocusCooldownUntil = -1;
    let prevFocusStepActive = false;
    let prevTourActiveInLoop = false;
    let prevTourStepInLoop = -1;

    // Reusable Cinema Director Orbit Factory (powers both Main Orbit and independent Recording Orbit)
    const createCinemaDirector = () => {
      let shot: CinemaShotKind = 'roadside-pass';
      let shotStartedAt = 0;
      let shotMinEndAt = 0;
      let shotMaxEndAt = 0;
      let cutIndex = 0;
      let sideSign: 1 | -1 = 1;
      let rivalIdx = 0;
      let quarterAngle = 0.92;
      let wasBehindCounter = 0;
      const fwd = new THREE.Vector2(0, 1);
      const anchor = new THREE.Vector3();
      const target = new THREE.Vector3();

      const pickNextShot = (st: VehicleState, curElapsed: number) => {
        const hasMotion = st.speedMps > 0.75;
        const fx = hasMotion ? st.vx / st.speedMps : Math.sin(st.yaw);
        const fz = hasMotion ? st.vz / st.speedMps : Math.cos(st.yaw);
        fwd.set(fx, fz);
        const rx = -fz;
        const rz = fx;

        const rivals = traffic.getRivalCarStates();
        let bestRivalIdx = -1;
        let bestRivalDist = 46;
        for (let i = 0; i < rivals.length; i++) {
          const rv = rivals[i];
          const d = Math.hypot(st.x - rv.x, st.z - rv.z);
          if (d > 4.0 && d < bestRivalDist) {
            bestRivalDist = d;
            bestRivalIdx = i;
          }
        }

        const cycle: CinemaShotKind[] = [
          'roadside-pass',
          'balcony',
          'rolling-quarter',
          'pedestrian',
          'rival-passenger',
        ];

        let chosen: CinemaShotKind = 'rolling-quarter';
        for (let attempt = 0; attempt < cycle.length; attempt++) {
          const candidate = cycle[(cutIndex + attempt) % cycle.length];
          if (candidate === 'rival-passenger' && bestRivalIdx < 0) continue;
          chosen = candidate;
          cutIndex = (cutIndex + attempt + 1) % cycle.length;
          break;
        }

        sideSign = cutIndex % 2 === 0 ? 1 : -1;
        shotStartedAt = curElapsed;
        wasBehindCounter = 0;

        const tryStaticAnchor = (
          aheadDist: number,
          latDist: number,
          eyeAboveGround: number
        ): boolean => {
          const signs: (1 | -1)[] = [sideSign, (sideSign === 1 ? -1 : 1) as 1 | -1];
          for (let si = 0; si < signs.length; si++) {
            const sgn = signs[si];
            const ax = st.x + fx * aheadDist + rx * latDist * sgn;
            const az = st.z + fz * aheadDist + rz * latDist * sgn;
            const surf = getTerrainHeightAndSurface(ax, az);
            if (surf.surface === 'water') continue;
            const ay = surf.height + eyeAboveGround;
            const clearNow = isCameraSightClear(ax, ay, az, st.x, st.y + 1.0, st.z, 1.0);
            const midX = st.x + fx * (aheadDist * 0.65);
            const midZ = st.z + fz * (aheadDist * 0.65);
            const clearMid = isCameraSightClear(ax, ay, az, midX, st.y + 1.0, midZ, 1.0);
            if (clearNow && clearMid) {
              anchor.set(ax, ay, az);
              sideSign = sgn;
              return true;
            }
          }
          return false;
        };

        if (chosen === 'rival-passenger' && bestRivalIdx >= 0) {
          shot = 'rival-passenger';
          rivalIdx = bestRivalIdx;
          shotMinEndAt = curElapsed + 2.4;
          shotMaxEndAt = curElapsed + 6.8;
          return;
        }
        if (chosen === 'balcony') {
          const speedLead = Math.min(18, 9.5 + st.speedMps * 1.1);
          if (tryStaticAnchor(speedLead, 7.6, 4.35)) {
            shot = 'balcony';
            shotMinEndAt = curElapsed + 2.2;
            shotMaxEndAt = curElapsed + 6.4;
            return;
          }
        }
        if (chosen === 'pedestrian') {
          const speedLead = Math.min(17, 9.0 + st.speedMps * 1.05);
          if (tryStaticAnchor(speedLead, 6.2, 1.68)) {
            shot = 'pedestrian';
            shotMinEndAt = curElapsed + 2.0;
            shotMaxEndAt = curElapsed + 6.0;
            return;
          }
        }
        if (chosen === 'roadside-pass') {
          const speedLead = Math.min(18, 10.0 + st.speedMps * 1.15);
          if (tryStaticAnchor(speedLead, 4.4, 1.18)) {
            shot = 'roadside-pass';
            shotMinEndAt = curElapsed + 2.0;
            shotMaxEndAt = curElapsed + 6.2;
            return;
          }
        }

        shot = 'rolling-quarter';
        quarterAngle = (0.72 + (cutIndex % 3) * 0.24) * sideSign;
        shotMinEndAt = curElapsed + 3.2;
        shotMaxEndAt = curElapsed + 6.5;
      };

      const stepCamera = (
        cam: THREE.PerspectiveCamera,
        lookAtVec: THREE.Vector3,
        st: VehicleState,
        curElapsed: number,
        dt: number,
        forceSnap = false
      ) => {
        target.set(st.x, st.y + 1.02, st.z);
        let needCut = curElapsed > shotMaxEndAt;
        let targetFov = 46;
        let instantCutMove = forceSnap || curElapsed - shotStartedAt < 0.08;

        const hasVel = st.speedMps > 0.7;
        const curFx = hasVel ? st.vx / st.speedMps : Math.sin(st.yaw);
        const curFz = hasVel ? st.vz / st.speedMps : Math.cos(st.yaw);

        if (shot === 'rival-passenger') {
          const rivals = traffic.getRivalCarStates();
          const rv = rivals[rivalIdx];
          if (!rv) {
            needCut = true;
          } else {
            const rDist = Math.hypot(st.x - rv.x, st.z - rv.z);
            if (rDist > 52 || rDist < 2.2) {
              needCut = true;
            } else {
              const ry = getTerrainHeightAndSurface(rv.x, rv.z).height;
              const sinR = Math.sin(rv.yaw);
              const cosR = Math.cos(rv.yaw);
              const px = rv.x + cosR * 0.34 - sinR * 0.15;
              const pz = rv.z - sinR * 0.34 - cosR * 0.15;
              _desiredCamPos.set(px, ry + 1.38, pz);
              if (!isCameraSightClear(px, ry + 1.38, pz, target.x, target.y, target.z, 0.85)) {
                needCut = true;
              }
              const zoomClose = Math.max(0, 1 - rDist / 32);
              targetFov = 48 - zoomClose * 10;
            }
          }
        } else if (shot === 'rolling-quarter') {
          const breathe = Math.sin((curElapsed - shotStartedAt) * 1.15);
          const dist = 4.9 - breathe * 1.05;
          const relAngle = quarterAngle + Math.sin((curElapsed - shotStartedAt) * 0.55) * 0.22;
          const worldAz = Math.atan2(curFx, curFz) + relAngle;
          const h = 1.25 + Math.cos((curElapsed - shotStartedAt) * 0.75) * 0.34;
          _desiredCamPos.set(
            st.x + Math.sin(worldAz) * dist,
            st.y + h,
            st.z + Math.cos(worldAz) * dist
          );
          clampCameraOutsideBuildings(_desiredCamPos, target);
          targetFov = 46 - Math.max(0, breathe) * 6.5;
        } else {
          _desiredCamPos.copy(anchor);
          const toCarX = st.x - anchor.x;
          const toCarZ = st.z - anchor.z;
          const distToCar = Math.hypot(toCarX, toCarZ);
          const pastProgress = toCarX * fwd.x + toCarZ * fwd.y;

          if (shot === 'pedestrian') {
            _desiredCamPos.y += Math.sin(curElapsed * 2.1) * 0.025;
          }

          const passZoom = Math.max(0, 1 - distToCar / 15);
          targetFov = shot === 'balcony' ? 48 - passZoom * 7 : 49 - passZoom * 9.5;

          if (curElapsed > shotMinEndAt) {
            if (pastProgress > 12.5 || distToCar > 25) {
              needCut = true;
            }
            const dirDot = (toCarX * curFx + toCarZ * curFz) / Math.max(0.01, distToCar);
            if (dirDot > 0.93 && pastProgress > 6.5) {
              wasBehindCounter += dt;
              if (wasBehindCounter > 1.1) needCut = true;
            } else {
              wasBehindCounter = 0;
            }
          }
          if (!isCameraSightClear(_desiredCamPos.x, _desiredCamPos.y, _desiredCamPos.z, target.x, target.y, target.z, 0.85)) {
            needCut = true;
          }
        }

        if (needCut) {
          pickNextShot(st, curElapsed);
          instantCutMove = true;
          if (shot === 'rolling-quarter') {
            const worldAz = Math.atan2(curFx, curFz) + quarterAngle;
            _desiredCamPos.set(
              st.x + Math.sin(worldAz) * 5.0,
              st.y + 1.35,
              st.z + Math.cos(worldAz) * 5.0
            );
          } else if (shot === 'rival-passenger') {
            const rv = traffic.getRivalCarStates()[rivalIdx];
            if (rv) {
              const ry = getTerrainHeightAndSurface(rv.x, rv.z).height;
              const sinR = Math.sin(rv.yaw);
              const cosR = Math.cos(rv.yaw);
              _desiredCamPos.set(
                rv.x + cosR * 0.34 - sinR * 0.15,
                ry + 1.38,
                rv.z - sinR * 0.34 - cosR * 0.15
              );
            }
          } else {
            _desiredCamPos.copy(anchor);
          }
        }

        clampCameraOutsideBuildings(_desiredCamPos, target);

        if (instantCutMove) {
          cam.position.copy(_desiredCamPos);
          lookAtVec.copy(target);
        } else {
          const camLambda = shot === 'rolling-quarter' ? 7.5 : shot === 'rival-passenger' ? 14 : 18;
          cam.position.x = THREE.MathUtils.damp(cam.position.x, _desiredCamPos.x, camLambda, dt);
          cam.position.y = THREE.MathUtils.damp(cam.position.y, _desiredCamPos.y, camLambda, dt);
          cam.position.z = THREE.MathUtils.damp(cam.position.z, _desiredCamPos.z, camLambda, dt);
          lookAtVec.x = THREE.MathUtils.damp(lookAtVec.x, target.x, 12, dt);
          lookAtVec.y = THREE.MathUtils.damp(lookAtVec.y, target.y, 12, dt);
          lookAtVec.z = THREE.MathUtils.damp(lookAtVec.z, target.z, 12, dt);
        }

        clampCameraOutsideBuildings(cam.position, target);
        cam.lookAt(lookAtVec);

        if (Math.abs(cam.fov - targetFov) > 0.08) {
          cam.fov = THREE.MathUtils.damp(cam.fov, targetFov, instantCutMove ? 18 : 2.8, dt);
          cam.updateProjectionMatrix();
        }
      };

      return { pickNextShot, stepCamera };
    };

    const mainCinema = createCinemaDirector();
    const recCinema = createCinemaDirector();
    let manualOrbitDragging = false;
    let manualOrbitResumeAt = -1;

    const onOrbitDragStart = () => {
      manualOrbitDragging = true;
      manualOrbitResumeAt = elapsed + 7.5;
    };
    const onOrbitDragEnd = () => {
      manualOrbitDragging = false;
      manualOrbitResumeAt = elapsed + 6.5;
    };
    orbitControls.addEventListener('start', onOrbitDragStart);
    orbitControls.addEventListener('end', onOrbitDragEnd);

    // Frame-0 Cinema Orbit placement when Orbit is the initial default mode
    if (cameraModeRef.current === 'orbit') {
      const initSt = vehicleStateRef.current;
      orbitControls.target.set(initSt.x, initSt.y + 1.02, initSt.z);
      _currentLookAt.set(initSt.x, initSt.y + 1.02, initSt.z);
      mainCinema.pickNextShot(initSt, 0);
      camera.position.set(initSt.x + 4.4, initSt.y + 2.1, initSt.z + 3.6);
      clampCameraOutsideBuildings(camera.position, _currentLookAt);
      camera.lookAt(_currentLookAt);
    }

    // Independent Multi-Angle Video Recorder Setup
    const recCamera = new THREE.PerspectiveCamera(56, camera.aspect, 0.12, 520);
    const recCanvas = document.createElement('canvas');
    const recCtx = recCanvas.getContext('2d');
    let mediaRecorder: MediaRecorder | null = null;
    let recordedChunks: BlobPart[] = [];
    let isRecordingActive = false;
    let recordingStartedAtMs = 0;
    let activeRecAngle: CameraMode = recordCameraModeRef.current;
    let lastRecModeInLoop: CameraMode | null = null;
    let lastSavedFilename: string | null = null;
    let lastRecUiPush = 0;
    let displayMediaStream: MediaStream | null = null;

    const updateStandardCameraPose = (
      targetCam: THREE.PerspectiveCamera,
      lookVec: THREE.Vector3,
      modeToUse: Exclude<CameraMode, 'orbit'>,
      st: VehicleState,
      dt: number,
      snap = false
    ) => {
      _carQuat.copy(modelT.root.quaternion);
      if (modeToUse === 'cockpit') {
        _offsetVec.set(-0.23, 1.44, -0.36).applyQuaternion(_carQuat);
        _lookOffsetVec.set(-0.18, 1.20, 14.0).applyQuaternion(_carQuat);
      } else if (modeToUse === 'bonnet') {
        _offsetVec.set(0, 1.42, 0.35).applyQuaternion(_carQuat);
        _lookOffsetVec.set(0, 1.15, 16.0).applyQuaternion(_carQuat);
      } else {
        const speedPullback = Math.min(1.4, st.speedMps * 0.08);
        // Car local +z is the bonnet, the same forward physics uses
        // (yaw 0 keeps local +z on world +z). Chase sits on local −z
        // and looks toward local +z; lookAt then aims the camera's own −z.
        _offsetVec.set(0, 2.05 + speedPullback * 0.18, -6.7 - speedPullback).applyQuaternion(_carQuat);
        _lookOffsetVec.set(0, 0.92, 4.4).applyQuaternion(_carQuat);
      }

      _desiredCamPos.set(st.x + _offsetVec.x, Math.max(st.y + 0.5, st.y + _offsetVec.y), st.z + _offsetVec.z);
      _desiredLookAt.set(st.x + _lookOffsetVec.x, st.y + _lookOffsetVec.y, st.z + _lookOffsetVec.z);

      if (snap) {
        targetCam.position.copy(_desiredCamPos);
        lookVec.copy(_desiredLookAt);
      } else {
        const posLambda = modeToUse === 'chase' ? 7.5 : 34;
        const lookLambda = modeToUse === 'chase' ? 9.5 : 34;
        targetCam.position.x = THREE.MathUtils.damp(targetCam.position.x, _desiredCamPos.x, posLambda, dt);
        targetCam.position.y = THREE.MathUtils.damp(targetCam.position.y, _desiredCamPos.y, posLambda, dt);
        targetCam.position.z = THREE.MathUtils.damp(targetCam.position.z, _desiredCamPos.z, posLambda, dt);
        if (modeToUse === 'chase') {
          clampCameraOutsideBuildings(targetCam.position, _desiredLookAt);
        }
        lookVec.x = THREE.MathUtils.damp(lookVec.x, _desiredLookAt.x, lookLambda, dt);
        lookVec.y = THREE.MathUtils.damp(lookVec.y, _desiredLookAt.y, lookLambda, dt);
        lookVec.z = THREE.MathUtils.damp(lookVec.z, _desiredLookAt.z, lookLambda, dt);
      }

      targetCam.lookAt(lookVec);
      const targetFov =
        modeToUse === 'cockpit' ? 64 : modeToUse === 'bonnet' ? 52 : 50 + Math.min(3, st.speedMph * 0.06);
      if (snap || Math.abs(targetCam.fov - targetFov) > 0.05) {
        targetCam.fov = snap ? targetFov : THREE.MathUtils.damp(targetCam.fov, targetFov, 5, dt);
        targetCam.updateProjectionMatrix();
      }
    };

    const syncRecCanvasSize = () => {
      const srcW = Math.max(2, canvas.width || container.clientWidth);
      const srcH = Math.max(2, canvas.height || container.clientHeight);
      const maxH = isSoftwareGl ? 480 : 720;
      const targetH = Math.max(240, Math.min(srcH, maxH)) & ~1;
      const targetW = Math.max(320, Math.round((targetH * srcW) / srcH)) & ~1;
      if (recCanvas.width !== targetW || recCanvas.height !== targetH) {
        recCanvas.width = targetW;
        recCanvas.height = targetH;
      }
    };

    const stopRecordingInternal = () => {
      if (!isRecordingActive && !mediaRecorder && !displayMediaStream) return;
      isRecordingActive = false;
      // Stop system audio capture stream (getDisplayMedia)
      if (displayMediaStream) {
        displayMediaStream.getTracks().forEach((t) => t.stop());
        displayMediaStream = null;
      }
      try {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
          mediaRecorder.stop();
        }
      } catch {
        mediaRecorder = null;
        onRecordingStateRef.current({
          isRecording: false,
          elapsedSec: 0,
          recordedMode: activeRecAngle,
          error: null,
          lastSavedFilename,
        });
      }
    };

    const startRecordingInternal = async () => {
      if (isRecordingActive) return;
      if (typeof MediaRecorder === 'undefined' || typeof recCanvas.captureStream !== 'function' || !recCtx) {
        onRecordingStateRef.current({
          isRecording: false,
          elapsedSec: 0,
          recordedMode: recordCameraModeRef.current,
          error: 'Video recording is not supported in this browser.',
          lastSavedFilename,
        });
        return;
      }

      syncRecCanvasSize();
      activeRecAngle = recordCameraModeRef.current;
      lastRecModeInLoop = null;
      const st = vehicleStateRef.current;
      if (activeRecAngle === 'orbit') {
        recCinema.pickNextShot(st, elapsed);
        recCinema.stepCamera(recCamera, _recLookAt, st, elapsed, 0.016, true);
      } else {
        updateStandardCameraPose(recCamera, _recLookAt, activeRecAngle, st, 0.016, true);
      }

      const fps = isSoftwareGl ? 15 : 30;
      const videoStream = recCanvas.captureStream(fps);
      const audioStream = audioRef.current.getRecordingAudioStream();
      const tracks: MediaStreamTrack[] = [...videoStream.getVideoTracks()];
      if (audioStream) {
        audioStream.getAudioTracks().forEach((t) => tracks.push(t));
      }
      // Capture system/tab audio so Web Speech API dialogue (speakStreetLine)
      // and all system sounds are included in the recording, not just Web Audio API nodes.
      try {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: false });
        displayStream.getAudioTracks().forEach((t) => tracks.push(t));
        displayMediaStream = displayStream;
      } catch {
        // User denied permission or browser doesn't support system audio capture.
        // Recording continues with Web Audio API audio only.
      }
      const combinedStream = new MediaStream(tracks);

      const mimeCandidates = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'video/mp4',
      ];
      let chosenMime = '';
      for (const mime of mimeCandidates) {
        if (MediaRecorder.isTypeSupported(mime)) {
          chosenMime = mime;
          break;
        }
      }

      try {
        recordedChunks = [];
        const recorder = chosenMime
          ? new MediaRecorder(combinedStream, { mimeType: chosenMime, videoBitsPerSecond: 3_500_000 })
          : new MediaRecorder(combinedStream);
        const angleAtStop = activeRecAngle;

        recorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) {
            recordedChunks.push(ev.data);
          }
        };

        recorder.onstop = () => {
          const mimeOut = recorder.mimeType || chosenMime || 'video/webm';
          const ext = mimeOut.includes('mp4') ? 'mp4' : 'webm';
          const blob = new Blob(recordedChunks, { type: mimeOut });
          recordedChunks = [];
          videoStream.getTracks().forEach((t) => t.stop());
          if (blob.size > 0) {
            const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const filename = `oamaru-1914-${angleAtStop}-${stamp}.${ext}`;
            lastSavedFilename = filename;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.setTimeout(() => URL.revokeObjectURL(url), 1500);
          }
          mediaRecorder = null;
          isRecordingActive = false;
          onRecordingStateRef.current({
            isRecording: false,
            elapsedSec: 0,
            recordedMode: angleAtStop,
            error: null,
            lastSavedFilename,
          });
        };

        recorder.onerror = () => {
          mediaRecorder = null;
          isRecordingActive = false;
          onRecordingStateRef.current({
            isRecording: false,
            elapsedSec: 0,
            recordedMode: angleAtStop,
            error: 'Recording interrupted by browser media encoder.',
            lastSavedFilename,
          });
        };

        mediaRecorder = recorder;
        isRecordingActive = true;
        recordingStartedAtMs = performance.now();
        recorder.start(250);
        onRecordingStateRef.current({
          isRecording: true,
          elapsedSec: 0,
          recordedMode: activeRecAngle,
          error: null,
          lastSavedFilename,
        });
      } catch {
        mediaRecorder = null;
        isRecordingActive = false;
        onRecordingStateRef.current({
          isRecording: false,
          elapsedSec: 0,
          recordedMode: activeRecAngle,
          error: 'Could not start browser video recorder.',
          lastSavedFilename,
        });
      }
    };

    recorderControlRef.current = {
      start: startRecordingInternal,
      stop: stopRecordingInternal,
    };

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
            const inbound = -vn;
            if (inbound > 0.8) {
              state.impactStrength = Math.max(state.impactStrength, Math.min(1, Math.max(0.38, inbound / 3.1)));
            }
            state.vx -= 1.06 * vn * nx;
            state.vz -= 1.06 * vn * nz;
            if (inbound > 1.65) {
              const keep = inbound > 4.2 ? 0.46 : 0.58;
              state.vx *= keep;
              state.vz *= keep;
              state.yawRate *= 0.55;
            }
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

      world.update(elapsed, env.timeHour, camera.position);
      const trainPos = world.getTrainPos();
      state.racePosition = traffic.getRacePosition(state.x, state.z, state.lapCount);

      const spatialHints = traffic.getSpatialAudioHints(state.x, state.z, state.yaw, trainPos);
      audioRef.current.update(state, env, spatialHints);

      if (spatialHints.piperJustHit) {
        audioRef.current.playBagpipeDeflateCrash(spatialHints.piperPan);
        state.impactStrength = Math.max(state.impactStrength, 0.54);
        state.courtesyScore = Math.max(0, state.courtesyScore - 15);
        lastScoldAt = now;
        const entry = pickScoldingLine('piperHit', piperHitCursor);
        piperHitCursor += 1;
        dialogueId += 1;
        dialogueExpireAt = now + 5200;
        setDialogue({
          id: dialogueId,
          speaker: entry.role,
          location: spatialHints.nearestClusterLabel,
          text: entry.text,
          isScolding: true,
        });
        audioRef.current.speakStreetLine(entry.text, entry.role, true, 1.0);
      }

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

      if ((resetTriggerRef?.current ?? 0) !== lastResetCount) {
        lastResetCount = resetTriggerRef?.current ?? 0;
        passengers.resetAll();
        autoDropoffDwellSec = 0;
        passengerNotice = null;
        liveFocusKey = null;
        liveFocusUntil = -1;
        tourActiveRef.current = false;
        setTourActive(false);
        setTourStepIdx(0);
      }

      if (state.impactStrength > 0.35) {
        lastImpactAt = now;
      }

      const pUpdate = passengers.update(frameDt, elapsed, state);
      let curOnboardId = passengers.getOnboardId();

      const speakPassengerDialogue = (
        speakerName: string,
        voiceRole: string,
        locationLabel: string,
        text: string,
        interrupt = true
      ) => {
        dialogueId += 1;
        dialogueExpireAt = now + 5400;
        setDialogue({
          id: dialogueId,
          speaker: speakerName,
          location: locationLabel,
          text,
          isScolding: false,
        });
        audioRef.current.speakStreetLine(text, voiceRole, interrupt, 0.96);
      };

      const curPassengerAction = passengerActionTriggerRef?.current ?? lastPassengerActionCount;
      const passengerActionTriggered = curPassengerAction !== lastPassengerActionCount;
      lastPassengerActionCount = curPassengerAction;

      if (passengerActionTriggered) {
        if (curOnboardId) {
          if (state.speedMph > 16) {
            passengerNotice = 'Slow down under 16 mph to unload safely!';
            passengerNoticeUntil = now + 2600;
          } else {
            const unloaded = passengers.unloadPassenger(state.x, state.z, pUpdate.atPreferredDropoff);
            curOnboardId = null;
            autoDropoffDwellSec = 0;
            liveFocusKey = null;
            liveFocusUntil = -1;
            if (tourActiveRef.current) {
              tourActiveRef.current = false;
              setTourActive(false);
            }
            if (unloaded) {
              audioRef.current.playPassengerBell(false);
              if (pUpdate.atPreferredDropoff) {
                state.courtesyScore = Math.min(100, state.courtesyScore + 10);
                passengerNotice = `Dropped off ${unloaded.shortName} at ${unloaded.dropoffLabel}!`;
                passengerNoticeUntil = now + 3500;
                speakPassengerDialogue(
                  unloaded.shortName,
                  unloaded.voiceRole,
                  unloaded.dropoffLabel,
                  unloaded.dropoffSuccessLine,
                  true
                );
              } else {
                passengerNotice = `${unloaded.shortName} stepped out onto the kerb.`;
                passengerNoticeUntil = now + 2800;
                speakPassengerDialogue(
                  unloaded.shortName,
                  unloaded.voiceRole,
                  spatialHints.nearestClusterLabel,
                  unloaded.earlyUnloadLine,
                  true
                );
              }
            }
          }
        } else if (pUpdate.nearbyWaiting) {
          if (state.speedMph > 14) {
            passengerNotice = `Slow below 14 mph to pick up ${pUpdate.nearbyWaiting.shortName}!`;
            passengerNoticeUntil = now + 2600;
          } else {
            const boarded = pUpdate.nearbyWaiting;
            passengers.boardPassenger(boarded);
            curOnboardId = boarded.id;
            autoDropoffDwellSec = 0;
            audioRef.current.playPassengerBell(true);
            if (boarded.id === 'mechanic') {
              setHasMetArthur(true);
              tourStepIdxRef.current = 0;
              tourActiveRef.current = true;
              setTourStepIdx(0);
              setTourActive(true);
              liveFocusKey = null;
              liveFocusUntil = -1;
              passengerNotice = 'Arthur is aboard! Inspect each control in the Model T lesson.';
            } else {
              passengerNotice = `Picked up ${boarded.shortName}! Destination: ${boarded.dropoffLabel}.`;
            }
            passengerNoticeUntil = now + 4200;
            lastPassengerBanterAt = now;
            speakPassengerDialogue(
              boarded.shortName,
              boarded.voiceRole,
              boarded.pickupLabel,
              boarded.greetingLine,
              true
            );
          }
        }
      }

      // Friendly auto-dropoff when stopped cleanly at a non-instructor passenger's preferred destination
      if (curOnboardId && curOnboardId !== 'mechanic' && pUpdate.atPreferredDropoff && state.speedMph < 2.8) {
        autoDropoffDwellSec += frameDt;
        if (autoDropoffDwellSec >= 1.1) {
          const unloaded = passengers.unloadPassenger(state.x, state.z, true);
          curOnboardId = null;
          autoDropoffDwellSec = 0;
          if (unloaded) {
            audioRef.current.playPassengerBell(false);
            state.courtesyScore = Math.min(100, state.courtesyScore + 10);
            passengerNotice = `Arrived! ${unloaded.shortName} hopped out at ${unloaded.dropoffLabel}!`;
            passengerNoticeUntil = now + 3800;
            speakPassengerDialogue(
              unloaded.shortName,
              unloaded.voiceRole,
              unloaded.dropoffLabel,
              unloaded.dropoffSuccessLine,
              true
            );
          }
        }
      } else {
        autoDropoffDwellSec = 0;
      }

      if (passengerNotice && now > passengerNoticeUntil) {
        passengerNotice = null;
      }

      // Funny protest when slowing past another waving hitchhiker with a full front seat (max 1!)
      if (
        curOnboardId &&
        pUpdate.nearbyWaiting &&
        state.speedMph < 12 &&
        now - lastFullCarLineAt > 8500 &&
        now - lastScoldAt > 3500
      ) {
        lastFullCarLineAt = now;
        const waver = pUpdate.nearbyWaiting;
        speakPassengerDialogue(
          waver.shortName,
          waver.voiceRole,
          'Front Seat Full (Max 1)',
          waver.fullCarLine,
          false
        );
      }

      let badReason: BadDrivingReason | null = null;
      if (state.impactStrength > 0.22) {
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
          badReason === 'impact' ? 14 : badReason === 'livestock' ? 6 : badReason === 'offroad' || badReason === 'skid' ? 4 : 3;
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
      } else if (curOnboardId) {
        // Active passenger reacts dynamically to bumps, horn, skids, speeding, bagpiper, or gives Ford T lessons!
        let rideEvt: PassengerRideEvent | null = null;
        if (state.impactStrength > 0.25) rideEvt = 'bump';
        else if (hornFired) rideEvt = 'horn';
        else if (isSkidding) rideEvt = 'skid';
        else if (isSpeeding) rideEvt = 'speeding';
        else if (spatialHints.piperProximity > 0.48 && !spatialHints.piperDown) rideEvt = 'near_piper';

        const cooldownMs = rideEvt ? 4800 : 9800;
        if (now - lastPassengerBanterAt > cooldownMs && now - lastScoldAt > 4200) {
          lastPassengerBanterAt = now;
          passengerBanterCursor += 1;
          const spec = getPassengerById(curOnboardId);
          const line = pickPassengerRideLine(
            curOnboardId,
            rideEvt ?? 'slow_cruise',
            passengerBanterCursor,
            state,
            mode
          );
          speakPassengerDialogue(
            spec.shortName,
            spec.voiceRole,
            curOnboardId === 'mechanic' ? 'Ford T Lesson' : `En route: ${spec.dropoffLabel}`,
            line,
            rideEvt !== null
          );
        }
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
      }

      if (dialogueExpireAt > 0 && now > dialogueExpireAt) {
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

      sky.zenith.copy(_cNightSky).lerp(_cZenithDay, dayFactor);
      sky.horizon.copy(_cHorizonDay);
      if (duskFactor > 0.05) {
        sky.zenith.lerp(_cZenithDusk, duskFactor * 0.55);
        sky.horizon.lerp(_cDuskSky, duskFactor * 0.72);
        sky.horizon.lerp(_cHorizonApricot, duskFactor * 0.28);
      }
      sky.zenith.lerp(_cNightSky, nightFactor);
      sky.horizon.lerp(_cHorizonNight, nightFactor);
      sky.ground.copy(_cGroundDay).lerp(_cNightSky, nightFactor * 0.85);
      const weatherSky =
        env.weather === 'cloudy'
          ? _cCloudySky
          : env.weather === 'rainy'
            ? _cRainSky
            : env.weather === 'snowy'
              ? _cSnowSky
              : env.weather === 'windy'
                ? _cWindSky
                : null;
      if (weatherSky) {
        const pull = env.weather === 'windy' ? 0.35 : 0.62;
        sky.zenith.lerp(weatherSky, pull * (1 - nightFactor * 0.45));
        sky.horizon.lerp(weatherSky, pull * 0.72 * (1 - nightFactor * 0.45));
      }
      sky.night.value = nightFactor;
      _cSkyCurrent.copy(sky.horizon);

      bgColor.copy(sky.horizon);
      fog.color.copy(sky.horizon);

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
      const shadowLead = 12;
      sunLight.position.set(state.x + sunDirX, sunHeight, state.z - 32);
      sunLight.target.position.set(
        state.x + Math.sin(state.yaw) * shadowLead,
        state.y,
        state.z + Math.cos(state.yaw) * shadowLead
      );
      // Bias shadow ortho box ahead of the camera so cornice and car shadows
      // read sharper where the player is looking (Pass 1).
      camera.getWorldDirection(_shadowBiasVec);
      _shadowBiasVec.multiplyScalar(14); // half of d=28, shift frustum forward
      sunLight.position.add(_shadowBiasVec);
      sunLight.target.position.add(_shadowBiasVec);
      _sunDir.set(sunDirX, sunHeight, -32).normalize();
      sky.sunDir.copy(_sunDir);

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

      renderer.toneMappingExposure = THREE.MathUtils.lerp(1.08, 0.5, nightFactor);

      sky.sun.copy(_cSunCurrent);
      const timeBucket = nightFactor > 0.72 ? 'n' : duskFactor > 0.4 ? 'd' : dayFactor > 0.8 ? 'day' : 't';
      const nextEnvKey = `${env.weather}|${timeBucket}|${Math.round(sunAngle * 3)}`;
      if (nextEnvKey !== envKey && !(isSoftwareGl && envKey !== '')) {
        envKey = nextEnvKey;
        const nextEnv = pmremGenerator.fromScene(sky.captureScene, 0.04).texture;
        scene.environment = nextEnv;
        envTex.dispose();
        envTex = nextEnv;
      }

      world.setAtmosphereVisuals(env.wetness, env.snowCover, nightFactor, sky.horizon, _sunDir, _cSunCurrent);

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
      modelT.sparkLeverPivot.rotation.y = (state.sparkAdvance - 0.5) * 1.1;
      modelT.throttleLeverPivot.rotation.y = -(state.handThrottle - 0.5) * 1.1;
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

      modelT.fenderMud.value = state.mudAccumulation;

      // Magneto-driven headlamp output scales with engine RPM
      const magnetoFactor = state.engineRunning
        ? Math.min(1.18, 0.42 + (state.rpm / 1500) * 0.74)
        : state.ignitionOn
          ? 0.14
          : 0.08;
      modelT.headlights[0].intensity = lightsOn ? 28 * magnetoFactor : 0;
      modelT.headlights[1].intensity = lightsOn ? 28 * magnetoFactor : 0;
      const beam =
        lightsOn && nightFactor > 0.2 ? (nightFactor - 0.2) * 0.55 * magnetoFactor : 0;
      for (let hi = 0; hi < modelT.headlightCones.length; hi++) {
        const cone = modelT.headlightCones[hi];
        (cone.material as THREE.MeshBasicMaterial).opacity = beam;
        cone.visible = beam > 0.03;
      }
      const bulbMat = modelT.headlightBulbs[0].material as THREE.MeshStandardMaterial;
      bulbMat.emissiveIntensity = lightsOn ? 0.4 + 2.2 * magnetoFactor : 0.25;

      // Stamp tire track decals on mud, grass & snowy roads
      const stampDist = Math.hypot(state.x - lastTrackStampX, state.z - lastTrackStampZ);
      const leavesARut =
        state.currentSurface === 'mud' ||
        state.currentSurface === 'grass' ||
        state.currentSurface === 'macadam' ||
        state.currentSurface === 'cobbles' ||
        env.snowCover > 0.22;
      if (state.speedMps > 1.2 && stampDist >= 0.5 && leavesARut) {
        lastTrackStampX = state.x;
        lastTrackStampZ = state.z;
        if (env.snowCover > 0.35) _trackTint.setHex(0x626b73);
        else if (state.currentSurface === 'cobbles') _trackTint.setHex(env.wetness > 0.45 ? 0x1c1916 : 0x3a342e);
        else if (state.currentSurface === 'mud') _trackTint.setHex(0x3b3022);
        else if (state.currentSurface === 'grass') _trackTint.setHex(0x3e4a30);
        else if (env.wetness > 0.45) _trackTint.setHex(0x4a4034);
        else _trackTint.setHex(0xc6b394);
        const stretch = THREE.MathUtils.clamp(stampDist / 0.5, 1.15, 2.8);
        [-0.71, 0.71].forEach((lx) => {
          _rearWheelPos.set(lx, 0, -1.27).applyQuaternion(modelT.root.quaternion);
          _trackDummy.position.set(state.x + _rearWheelPos.x, state.y + 0.028, state.z + _rearWheelPos.z);
          _trackDummy.rotation.set(0, state.yaw, 0);
          _trackDummy.scale.set(1, 1, stretch);
          _trackDummy.updateMatrix();
          const slot = trackCursor % trackCount;
          trackInst.setMatrixAt(slot, _trackDummy.matrix);
          trackInst.setColorAt(slot, _trackTint);
          trackCursor++;
        });
        trackInst.instanceMatrix.needsUpdate = true;
        if (trackInst.instanceColor) trackInst.instanceColor.needsUpdate = true;
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

      // Arthur Lesson Instrument Camera Choreography + Live Contextual Control Focus
      const liveTipInfo =
        curOnboardId === 'mechanic'
          ? getMechanicLiveTipWithFocus(state, mode, (now - lastImpactAt) / 1000)
          : null;

      if (curOnboardId === 'mechanic' && tourActiveRef.current) {
        prevCoachTipFocusKey = liveTipInfo?.focusKey ?? null;
        if (!prevTourActiveInLoop || tourStepIdxRef.current !== prevTourStepInLoop) {
          prevTourStepInLoop = tourStepIdxRef.current;
          const stepObj = ARTHUR_LESSON_STEPS[tourStepIdxRef.current] ?? ARTHUR_LESSON_STEPS[0];
          // Step 0 already speaks Arthur's greetingLine on boarding; speak subsequent steps aloud
          if (prevTourActiveInLoop) {
            audioRef.current.speakStreetLine(stepObj.instruction, 'Mechanic', true, 0.96);
          }
        }
        prevTourActiveInLoop = true;
        // Driving briskly naturally exits the parked guided tour back to road camera
        if (state.speedMph > 7.5) {
          tourActiveRef.current = false;
          setTourActive(false);
          liveFocusCooldownUntil = elapsed + 4.5;
        }
      } else {
        if (prevTourActiveInLoop) {
          prevTourActiveInLoop = false;
          prevTourStepInLoop = -1;
          liveFocusCooldownUntil = elapsed + 5.0;
        }
        const userActivelyDriving =
          Math.abs(controls.steer) > 0.1 ||
          controls.throttleInput > 0.1 ||
          controls.brakeInput > 0.1;
        if (
          curOnboardId === 'mechanic' &&
          liveTipInfo?.focusKey &&
          elapsed > liveFocusCooldownUntil &&
          !userActivelyDriving
        ) {
          if (liveTipInfo.focusKey !== prevCoachTipFocusKey && state.speedMph < 7.5) {
            liveFocusKey = liveTipInfo.focusKey;
            liveFocusUntil = elapsed + 3.4;
          }
          prevCoachTipFocusKey = liveTipInfo.focusKey;
        } else if (!liveTipInfo?.focusKey) {
          prevCoachTipFocusKey = null;
        }
      }

      if (
        state.speedMph > 8.5 ||
        manualOrbitDragging ||
        Math.abs(controls.steer) > 0.15 ||
        controls.throttleInput > 0.15
      ) {
        liveFocusKey = null;
        liveFocusUntil = -1;
      }

      const activeInstrumentStep =
        curOnboardId === 'mechanic' && tourActiveRef.current
          ? ARTHUR_LESSON_STEPS[tourStepIdxRef.current] ?? ARTHUR_LESSON_STEPS[0]
          : curOnboardId === 'mechanic' && liveFocusKey && elapsed < liveFocusUntil
            ? ARTHUR_LESSON_STEPS.find((s) => s.key === liveFocusKey) ?? null
            : null;

      modelT.setHighlightedInstrument(activeInstrumentStep ? activeInstrumentStep.key : null, elapsed);

      // Camera Choreography & Kiwi Farmer Driver Steering IK
      const camMode = cameraModeRef.current;
      if (camMode !== prevCamMode) {
        orbitControls.enabled = camMode === 'orbit' && !activeInstrumentStep;
        if (camMode === 'orbit') {
          manualOrbitDragging = false;
          manualOrbitResumeAt = -1;
          orbitControls.target.set(state.x, state.y + 0.95, state.z);
          _currentLookAt.set(state.x, state.y + 0.95, state.z);
          mainCinema.pickNextShot(state, elapsed);
        }
        prevCamMode = camMode;
      }

      if (activeInstrumentStep) {
        orbitControls.enabled = false;
      } else if (prevFocusStepActive) {
        orbitControls.enabled = camMode === 'orbit';
        if (camMode === 'orbit') {
          manualOrbitDragging = false;
          manualOrbitResumeAt = -1;
          mainCinema.pickNextShot(state, elapsed);
        }
      }
      prevFocusStepActive = activeInstrumentStep !== null;

      const mainFirstPerson = camMode === 'cockpit' || (activeInstrumentStep?.interiorShot ?? false);
      modelT.driverRig.setFirstPersonMode(mainFirstPerson);
      modelT.driverRig.updatePose(
        modelT.steeringWheel,
        state.speedMps,
        state.roll,
        state.steerAngle,
        elapsed
      );

      if (activeInstrumentStep) {
        _carQuat.copy(modelT.root.quaternion);
        _offsetVec
          .set(
            activeInstrumentStep.camOffset[0],
            activeInstrumentStep.camOffset[1],
            activeInstrumentStep.camOffset[2]
          )
          .applyQuaternion(_carQuat);
        _lookOffsetVec
          .set(
            activeInstrumentStep.lookOffset[0],
            activeInstrumentStep.lookOffset[1],
            activeInstrumentStep.lookOffset[2]
          )
          .applyQuaternion(_carQuat);

        _desiredCamPos.set(
          state.x + _offsetVec.x,
          state.y + _offsetVec.y,
          state.z + _offsetVec.z
        );
        _desiredLookAt.set(
          state.x + _lookOffsetVec.x,
          state.y + _lookOffsetVec.y,
          state.z + _lookOffsetVec.z
        );

        if (!activeInstrumentStep.interiorShot) {
          clampCameraOutsideBuildings(_desiredCamPos, _desiredLookAt);
        }

        camera.position.x = THREE.MathUtils.damp(camera.position.x, _desiredCamPos.x, 8.5, frameDt);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, _desiredCamPos.y, 8.5, frameDt);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, _desiredCamPos.z, 8.5, frameDt);
        _currentLookAt.x = THREE.MathUtils.damp(_currentLookAt.x, _desiredLookAt.x, 10, frameDt);
        _currentLookAt.y = THREE.MathUtils.damp(_currentLookAt.y, _desiredLookAt.y, 10, frameDt);
        _currentLookAt.z = THREE.MathUtils.damp(_currentLookAt.z, _desiredLookAt.z, 10, frameDt);
        camera.lookAt(_currentLookAt);

        if (Math.abs(camera.fov - activeInstrumentStep.fov) > 0.08) {
          camera.fov = THREE.MathUtils.damp(camera.fov, activeInstrumentStep.fov, 7, frameDt);
          camera.updateProjectionMatrix();
        }
      } else if (camMode === 'orbit') {
        const underManualOrbit = manualOrbitDragging || elapsed < manualOrbitResumeAt;

        if (underManualOrbit) {
          orbitControls.target.set(
            THREE.MathUtils.damp(orbitControls.target.x, state.x, 8, frameDt),
            THREE.MathUtils.damp(orbitControls.target.y, state.y + 0.95, 8, frameDt),
            THREE.MathUtils.damp(orbitControls.target.z, state.z, 8, frameDt)
          );
          orbitControls.update();
          clampCameraOutsideBuildings(camera.position, orbitControls.target);
          camera.lookAt(orbitControls.target);
          if (Math.abs(camera.fov - 46) > 0.1) {
            camera.fov = THREE.MathUtils.damp(camera.fov, 46, 4, frameDt);
            camera.updateProjectionMatrix();
          }
        } else {
          mainCinema.stepCamera(camera, _currentLookAt, state, elapsed, frameDt, false);
          orbitControls.target.copy(_currentLookAt);
        }
      } else {
        updateStandardCameraPose(camera, _currentLookAt, camMode, state, frameDt, false);
      }

      // Independent Multi-Angle Recording Pass (captures selected angle even if viewing another camera)
      if (isRecordingActive && recCtx) {
        syncRecCanvasSize();
        const recMode = recordCameraModeRef.current;
        activeRecAngle = recMode;
        const recSwitched = lastRecModeInLoop !== recMode;
        if (recSwitched && recMode === 'orbit') {
          recCinema.pickNextShot(state, elapsed);
        }
        lastRecModeInLoop = recMode;

        const sameAsMain =
          recMode === camMode &&
          !activeInstrumentStep &&
          !(camMode === 'orbit' && (manualOrbitDragging || elapsed < manualOrbitResumeAt));

        if (sameAsMain) {
          sky.dome.position.copy(camera.position);
          renderer.render(scene, camera);
          recCtx.drawImage(canvas, 0, 0, recCanvas.width, recCanvas.height);
        } else {
          recCamera.aspect = camera.aspect;
          recCamera.updateProjectionMatrix();
          if (recMode === 'orbit') {
            recCinema.stepCamera(recCamera, _recLookAt, state, elapsed, frameDt, recSwitched);
          } else {
            updateStandardCameraPose(recCamera, _recLookAt, recMode, state, frameDt, recSwitched);
          }
          modelT.driverRig.setFirstPersonMode(recMode === 'cockpit');
          sky.dome.position.copy(recCamera.position);
          renderer.render(scene, recCamera);
          recCtx.drawImage(canvas, 0, 0, recCanvas.width, recCanvas.height);

          modelT.driverRig.setFirstPersonMode(mainFirstPerson);
          sky.dome.position.copy(camera.position);
          renderer.render(scene, camera);
        }

        if (now - lastRecUiPush > 240) {
          lastRecUiPush = now;
          onRecordingStateRef.current({
            isRecording: true,
            elapsedSec: Math.floor((now - recordingStartedAtMs) / 1000),
            recordedMode: recMode,
            error: null,
            lastSavedFilename,
          });
        }
      } else {
        sky.dome.position.copy(camera.position);
        renderer.render(scene, camera);
      }
      if (vignetteRef.current) {
        vignetteRef.current.style.opacity = camMode === 'cockpit' ? '1' : '0';
      }

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
        const onboardSpec = curOnboardId ? getPassengerById(curOnboardId) : null;
        const waitingPts = passengers.getWaitingMapPoints();
        setMinimapMeta({
          rivals: traffic.getRivalMapPoints(),
          trainPos,
          piperPos: traffic.getPiperMapPoint(),
          waitingPassengers: waitingPts,
          passengerTarget: onboardSpec
            ? {
                x: onboardSpec.dropoffX,
                z: onboardSpec.dropoffZ,
                label: onboardSpec.dropoffLabel,
                name: onboardSpec.shortName,
              }
            : null,
        });
        onPassengerHudRef.current({
          onboardId: curOnboardId,
          onboardName: onboardSpec ? onboardSpec.shortName : null,
          onboardRole: onboardSpec ? onboardSpec.roleLabel : null,
          dropoffLabel: onboardSpec ? onboardSpec.dropoffLabel : null,
          dropoffX: onboardSpec ? onboardSpec.dropoffX : null,
          dropoffZ: onboardSpec ? onboardSpec.dropoffZ : null,
          nearbyWaitingId: pUpdate.nearbyWaiting ? pUpdate.nearbyWaiting.id : null,
          nearbyWaitingName: pUpdate.nearbyWaiting ? pUpdate.nearbyWaiting.shortName : null,
          nearbyWaitingRole: pUpdate.nearbyWaiting ? pUpdate.nearbyWaiting.roleLabel : null,
          nearbyWaitingDist: pUpdate.nearbyWaiting ? Math.round(pUpdate.nearbyDist) : null,
          waitingPoints: waitingPts,
          coachTip: liveTipInfo ? liveTipInfo.text : null,
          coachFocusKey: activeInstrumentStep ? activeInstrumentStep.key : null,
          noticeText: passengerNotice,
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
      recorderControlRef.current = null;
      stopRecordingInternal();
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', handleResize);
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      orbitControls.removeEventListener('start', onOrbitDragStart);
      orbitControls.removeEventListener('end', onOrbitDragEnd);
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
      pmremGenerator.dispose();
      sky.dispose();
      passengers.dispose();
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
    recordCameraModeRef,
    controlModeRef,
    headlightsManualRef,
    wiperOnRef,
    audioRef,
    hornTriggerRef,
    passengerActionTriggerRef,
    resetTriggerRef,
    recorderControlRef,
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

  const arthurSpec = PASSENGERS[0];
  const distToArthurM = Math.max(
    0,
    Math.round(Math.hypot(arthurSpec.pickupX - minimapTelemetry.x, arthurSpec.pickupZ - minimapTelemetry.z))
  );
  const showArthurTourCard = !startShieldOpen && tourActive && passengerHud.onboardId === 'mechanic';
  const showStartupPrompt =
    !startShieldOpen &&
    !hasMetArthur &&
    !startupDismissed &&
    passengerHud.onboardId === null &&
    passengerHud.nearbyWaitingId === null &&
    passengerHud.noticeText === null;
  const showPassengerBanner =
    !startShieldOpen &&
    !showArthurTourCard &&
    (passengerHud.onboardId !== null ||
      passengerHud.nearbyWaitingId !== null ||
      passengerHud.noticeText !== null);
  const currentTourStep = ARTHUR_LESSON_STEPS[tourStepIdx] ?? ARTHUR_LESSON_STEPS[0];
  const focusedInstrumentTitle = passengerHud.coachFocusKey
    ? ARTHUR_LESSON_STEPS.find((s) => s.key === passengerHud.coachFocusKey)?.title ?? null
    : null;

  return (
    <div className="relative h-full w-full bg-[#1a1815] touch-none">
      <div ref={mountRef} className="absolute inset-0 h-full w-full touch-none" />
      <div
        ref={vignetteRef}
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          opacity: 0,
          background:
            'radial-gradient(ellipse at center, transparent 46%, rgba(16, 12, 8, 0.5) 100%)',
        }}
      />

      {dialogue && !showArthurTourCard && (
        <div
          aria-live="polite"
          className={`pointer-events-none fixed top-16 left-3 sm:top-20 sm:left-6 z-15 w-[calc(100vw-24px)] sm:w-auto max-w-md rounded-xl border px-3.5 py-2 shadow-xl ${
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

      {showStartupPrompt && (
        <div
          className={`fixed left-1/2 -translate-x-1/2 z-20 flex w-[calc(100vw-24px)] sm:w-auto max-w-xl flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4 rounded-xl border border-[#D4A656]/50 bg-[#161411]/94 px-3.5 py-2 sm:px-4 sm:py-2.5 text-[#F4EFE6] shadow-xl ${
            !minimapTelemetry.engineRunning ? 'top-[7.25rem] sm:top-17' : 'top-15 sm:top-5'
          }`}
        >
          <div className="min-w-0 text-xs leading-snug">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-[#E8C073]">First Lesson: Mechanic Arthur</span>
              <span className="text-[#9E9280]" aria-hidden="true">·</span>
              <span className="font-mono-tabular text-[#D8CEBE]">{distToArthurM}m ahead</span>
            </div>
            <p className="mt-0.5 text-[11px] text-[#CFC5B4]">
              Drive straight to Harbour St Garage Steps and press P to take a quick Ford Model T lesson.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onJumpToArthur}
              className="rounded-md bg-[#D4A656] px-3 py-1.5 text-xs font-semibold text-[#17130E] hover:bg-[#e1b76a] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Pull Up to Arthur
            </button>
            <button
              type="button"
              onClick={() => setStartupDismissed(true)}
              aria-label="Dismiss startup instruction"
              className="rounded-md px-2 py-1 text-xs text-[#9E9280] hover:bg-white/10 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {showArthurTourCard && (
        <div
          className={`fixed left-1/2 -translate-x-1/2 z-20 w-[min(560px,calc(100vw-24px))] rounded-xl border border-[#D4A656]/55 bg-[#161411]/95 px-3.5 py-2.5 sm:px-4 sm:py-3 text-[#F4EFE6] shadow-2xl ${
            !minimapTelemetry.engineRunning ? 'top-[7.25rem] sm:top-17' : 'top-15 sm:top-5'
          }`}
        >
          <div className="flex items-center justify-between gap-3 text-[11px] text-[#B7AB98]">
            <span>
              Ford Model T Driving Lesson <span aria-hidden="true">·</span>{' '}
              <span className="font-mono-tabular text-[#E8C073]">
                Step {tourStepIdx + 1} / {ARTHUR_LESSON_STEPS.length}
              </span>
            </span>
            <span className="font-mono-tabular text-[#CFC5B4]">{currentTourStep.controlHint}</span>
          </div>
          <h3 className="mt-1 font-display text-base font-semibold text-[#F6F1E7]">
            {currentTourStep.title}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-[#DFD5C5]">
            “{currentTourStep.instruction}”
          </p>
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={tourStepIdx === 0}
                onClick={() => setTourStepIdx((i) => Math.max(0, i - 1))}
                className="rounded-md border border-white/15 bg-white/8 px-3 py-1 text-xs font-medium text-[#EAE2D3] hover:bg-white/15 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Prev
              </button>
              {tourStepIdx < ARTHUR_LESSON_STEPS.length - 1 ? (
                <button
                  type="button"
                  onClick={() =>
                    setTourStepIdx((i) => Math.min(ARTHUR_LESSON_STEPS.length - 1, i + 1))
                  }
                  className="rounded-md bg-[#D4A656] px-3 py-1 text-xs font-semibold text-[#17130E] hover:bg-[#e1b76a] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Next Control
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setTourActive(false)}
                  className="rounded-md bg-[#73c991] px-3 py-1 text-xs font-semibold text-[#0e1f14] hover:bg-[#90dca9] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Finish Lesson
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onPassengerAction}
                className="rounded-md border border-white/15 bg-white/6 px-2.5 py-1 text-xs font-medium text-[#CFC5B4] hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Unload (P)
              </button>
              <button
                type="button"
                onClick={() => setTourActive(false)}
                className="rounded-md px-2.5 py-1 text-xs font-medium text-[#9E9280] hover:bg-white/10 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Skip Tour
              </button>
            </div>
          </div>
        </div>
      )}

      {showPassengerBanner && (
        <div
          className={`fixed left-1/2 -translate-x-1/2 z-20 flex w-[calc(100vw-24px)] sm:w-auto max-w-lg flex-col gap-1.5 rounded-xl border px-3.5 py-2 sm:px-4 shadow-xl transition-all ${
            !minimapTelemetry.engineRunning ? 'top-[7.25rem] sm:top-17' : 'top-15 sm:top-5'
          } ${
            passengerHud.onboardId !== null
              ? 'border-[#5ec2e6]/50 bg-[#14191e]/95 text-[#eef6fa]'
              : 'border-[#73c991]/55 bg-[#141b16]/95 text-[#eef8f0]'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            {passengerHud.onboardId !== null ? (
              <>
                <div className="text-xs leading-tight">
                  <span className="font-semibold text-[#7bd3f4]">{passengerHud.onboardName}</span>
                  <span className="text-[#a4b6c2]"> · {passengerHud.onboardRole}</span>
                  {passengerHud.dropoffLabel && (
                    <span className="block text-[11px] text-[#cfdbe3]">
                      Dropoff: {passengerHud.dropoffLabel}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {passengerHud.onboardId === 'mechanic' && (
                    <button
                      type="button"
                      onClick={() => {
                        setTourStepIdx(0);
                        setTourActive(true);
                      }}
                      className="rounded-md border border-[#D4A656]/55 bg-[#D4A656]/20 px-2.5 py-1 text-xs font-semibold text-[#E8C073] hover:bg-[#D4A656]/30 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Lesson Tour
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onPassengerAction}
                    className="rounded-md bg-[#5ec2e6] px-2.5 py-1 text-xs font-semibold text-[#0d1921] hover:bg-[#82d3f0] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Unload (P)
                  </button>
                </div>
              </>
            ) : passengerHud.nearbyWaitingId !== null ? (
              <>
                <div className="text-xs leading-tight">
                  <span className="font-semibold text-[#8fe2aa]">
                    {passengerHud.nearbyWaitingName} is waving!
                  </span>
                  <span className="block text-[11px] text-[#bfd6c5]">
                    {passengerHud.nearbyWaitingRole} ({passengerHud.nearbyWaitingDist}m away)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onPassengerAction}
                  className="rounded-md bg-[#73c991] px-2.5 py-1 text-xs font-semibold text-[#0e1f14] hover:bg-[#90dca9] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Accept Passenger (P)
                </button>
              </>
            ) : (
              <span className="text-xs font-medium text-[#E8C073]">{passengerHud.noticeText}</span>
            )}
          </div>

          {passengerHud.coachTip && (
            <div className="border-t border-white/12 pt-1 text-[11px] leading-snug text-[#f5dba0]">
              <span className="font-semibold text-[#E8C073]">Mechanic Tip: </span>
              {passengerHud.coachTip}
              {focusedInstrumentTitle && (
                <span className="ml-1.5 text-[#8fe2aa]">· Showing {focusedInstrumentTitle}</span>
              )}
            </div>
          )}

          {passengerHud.noticeText && passengerHud.onboardId !== null && (
            <div className="text-[11px] text-[#a5e6ba]">{passengerHud.noticeText}</div>
          )}
        </div>
      )}

      <MinimapOverlay
        telemetry={minimapTelemetry}
        rivals={minimapMeta.rivals}
        trainPos={minimapMeta.trainPos}
        piperPos={minimapMeta.piperPos}
        waitingPassengers={minimapMeta.waitingPassengers}
        passengerTarget={minimapMeta.passengerTarget}
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
