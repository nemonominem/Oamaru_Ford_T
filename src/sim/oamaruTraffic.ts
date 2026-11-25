import * as THREE from 'three';
import {
  CIRCUIT_LOOP_POINTS,
  ROAD_OBSTRUCTIONS,
  SIDE_STREET_BLOCKADES,
  SPEED_TRAP_ZONE,
  WORLD_COLLIDERS,
  getTerrainHeightAndSurface,
} from './terrain';
import {
  ArticulatedHumanRig,
  HumanPreset,
  createCharacterPool,
} from './characterModels';
import { SurfaceType } from './types';

/**
 * Two-bone limb in the YZ plane. rotation.x = 0 hangs the bone on local −Y.
 * A negative rotation.x swings that bone toward +Z (the bicycle's forward).
 * poleUp holds the mid joint above the root-to-target line, which is a knee;
 * false holds it below, which is an elbow.
 */
export function poseSagittalLimb(
  root: THREE.Object3D,
  mid: THREE.Object3D,
  originY: number,
  originZ: number,
  targetY: number,
  targetZ: number,
  len1: number,
  len2: number,
  poleUp: boolean,
): void {
  const dy = targetY - originY;
  const dz = targetZ - originZ;
  const raw = Math.hypot(dy, dz);
  const maxReach = len1 + len2 - 0.012;
  const minReach = Math.abs(len1 - len2) + 0.012;
  const dist = Math.min(maxReach, Math.max(minReach, raw || minReach));
  const inv = raw > 1e-5 ? 1 / raw : 1;
  const dirY = raw > 1e-5 ? dy * inv : -1;
  const dirZ = raw > 1e-5 ? dz * inv : 0;
  const adj = (len1 * len1 + dist * dist - len2 * len2) / (2 * dist);
  const bend = Math.sqrt(Math.max(0, len1 * len1 - adj * adj));
  const pole = poleUp ? 1 : -1;
  const jointY = dirY * adj + pole * dirZ * bend;
  const jointZ = dirZ * adj - pole * dirY * bend;
  root.rotation.set(Math.atan2(-jointZ, -jointY), 0, 0);
  const sy = dirY * dist - jointY;
  const sz = dirZ * dist - jointZ;
  const c = Math.cos(root.rotation.x);
  const s = Math.sin(root.rotation.x);
  const localY = sy * c + sz * s;
  const localZ = -sy * s + sz * c;
  mid.rotation.set(Math.atan2(-localZ, -localY), 0, 0);
}

export interface DynamicObstacle {
  x: number;
  z: number;
  radius: number;
}

export interface CrowdCluster {
  x: number;
  z: number;
  density: number;
  label: string;
}

export interface PlayerTrafficContext {
  x: number;
  z: number;
  yaw: number;
  speedMps: number;
  badDrivingIntensity: number;
  hornJustFired: boolean;
  surface: SurfaceType;
}

export interface SpatialTrafficAudioHints {
  crowdProximity: number;
  crowdDensity: number;
  nearestCrowdDist: number;
  nearestClusterLabel: string;
  crowdPan: number;
  horseProximity: number;
  horsePan: number;
  horseStartleIntensity: number;
  drayProximity: number;
  drayPan: number;
  otherCarProximity: number;
  otherCarPan: number;
  harbourProximity: number;
  harbourPan: number;
  dogBarkIntensity: number;
  dogPan: number;
  chasingDogCount: number;
  sheepPanicIntensity: number;
  sheepPan: number;
  trainProximity: number;
  trainPan: number;
  piperProximity: number;
  piperPan: number;
  piperPanicLevel: number;
  piperDown: boolean;
  piperJustHit: boolean;
}

interface IdleSpectator {
  group: THREE.Group;
  head: THREE.Object3D;
  arms: THREE.Object3D[];
  elbows: THREE.Object3D[];
  phase: number;
  mode: 'cheering' | 'discussing' | 'watching';
}

interface WalkingPedestrian {
  group: THREE.Group;
  leftLeg: THREE.Object3D;
  rightLeg: THREE.Object3D;
  leftKnee: THREE.Object3D;
  rightKnee: THREE.Object3D;
  leftArm: THREE.Object3D;
  rightArm: THREE.Object3D;
  leftElbow: THREE.Object3D;
  rightElbow: THREE.Object3D;
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  speed: number;
  phase: number;
  progress: number;
  dir: 1 | -1;
  evadeTimer: number;
  gait?: 'unsteady';
}

interface IdleAnimal {
  kind: 'horse';
  x: number;
  z: number;
  head: THREE.Object3D;
  tail: THREE.Object3D;
  startleTimer: number;
  phase: number;
}

interface ReactiveDog {
  group: THREE.Group;
  head: THREE.Object3D;
  tail: THREE.Object3D;
  legs: THREE.Object3D[];
  knees: THREE.Object3D[];
  homeX: number;
  homeZ: number;
  homeYaw: number;
  x: number;
  z: number;
  yaw: number;
  speed: number;
  canChase: boolean;
  isChasing: boolean;
  barkLevel: number;
  flankSign: number;
  phase: number;
}

interface ReactiveSheep {
  group: THREE.Group;
  head: THREE.Object3D;
  tail: THREE.Object3D;
  legs: THREE.Object3D[];
  knees: THREE.Object3D[];
  homeX: number;
  homeZ: number;
  x: number;
  z: number;
  yaw: number;
  vx: number;
  vz: number;
  panicTimer: number;
  scatterBias: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  phase: number;
}

interface MovingVintageCar {
  group: THREE.Group;
  wheels: THREE.Object3D[];
  headlightBulbs: THREE.Mesh[];
  progress: number;
  totalDist: number;
  speedMps: number;
  laneOffset: number;
  x: number;
  z: number;
  yaw: number;
}

interface MovingHorseDray {
  group: THREE.Group;
  horseLegs: THREE.Object3D[];
  horseKnees: THREE.Object3D[];
  cartWheels: THREE.Object3D[];
  head: THREE.Object3D;
  tail: THREE.Object3D;
  progress: number;
  speedMps: number;
  laneOffset: number;
  x: number;
  z: number;
}

interface MovingCyclist {
  group: THREE.Group;
  wheels: THREE.Object3D[];
  crank: THREE.Object3D;
  pedals: [THREE.Object3D, THREE.Object3D];
  leftLeg: THREE.Object3D;
  rightLeg: THREE.Object3D;
  leftKnee: THREE.Object3D;
  rightKnee: THREE.Object3D;
  progress: number;
  speedMps: number;
  laneOffset: number;
  phase: number;
}

interface Seagull {
  group: THREE.Group;
  leftWing: THREE.Object3D;
  rightWing: THREE.Object3D;
  centerX: number;
  centerZ: number;
  baseY: number;
  orbitR: number;
  speed: number;
  phase: number;
}

interface StreetCat {
  group: THREE.Group;
  tail: THREE.Object3D;
  homeX: number;
  homeZ: number;
  x: number;
  z: number;
  yaw: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  sit: boolean;
  flee: number;
  phase: number;
}

interface StreetGoose {
  group: THREE.Group;
  leftWing: THREE.Object3D;
  rightWing: THREE.Object3D;
  neck: THREE.Object3D;
  x: number;
  z: number;
  yaw: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  flee: number;
  phase: number;
}

interface BeatConstable {
  group: THREE.Group;
  leftLeg: THREE.Object3D;
  rightLeg: THREE.Object3D;
  leftKnee: THREE.Object3D;
  rightKnee: THREE.Object3D;
  leftArm: THREE.Object3D;
  rightArm: THREE.Object3D;
  leftElbow: THREE.Object3D;
  rightElbow: THREE.Object3D;
  head: THREE.Object3D;
  homeX: number;
  homeZ: number;
  x: number;
  z: number;
  yaw: number;
  speed: number;
  chasing: boolean;
  chaseLeft: number;
  phase: number;
}

export interface OamaruTrafficHandle {
  group: THREE.Group;
  update: (
    dt: number,
    elapsed: number,
    windMps: number,
    lightsOn: boolean,
    player?: PlayerTrafficContext
  ) => void;
  getObstacles: () => DynamicObstacle[];
  getRivalMapPoints: () => { x: number; z: number }[];
  getRivalCarStates: () => { x: number; z: number; yaw: number }[];
  getPiperMapPoint: () => { x: number; z: number; down: boolean };
  getRacePosition: (px: number, pz: number, playerLap: number) => number;
  getSpatialAudioHints: (
    px: number,
    pz: number,
    pYaw?: number,
    trainPos?: { x: number; z: number }
  ) => SpatialTrafficAudioHints;
  dispose: () => void;
}

// Compute cumulative distances along the 6-leg circuit loop for smooth cruising rival cars
const LOOP_SEGMENTS: {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  len: number;
  nx: number;
  nz: number;
  yaw: number;
}[] = [];
let TOTAL_LOOP_LEN = 0;

for (let i = 0; i < CIRCUIT_LOOP_POINTS.length; i++) {
  const [x1, z1] = CIRCUIT_LOOP_POINTS[i];
  const [x2, z2] = CIRCUIT_LOOP_POINTS[(i + 1) % CIRCUIT_LOOP_POINTS.length];
  const dx = x2 - x1;
  const dz = z2 - z1;
  const len = Math.hypot(dx, dz) || 1;
  // Right-hand side normal relative to forward (dx, dz)
  const nx = -dz / len;
  const nz = dx / len;
  const yaw = Math.atan2(dx, dz);
  LOOP_SEGMENTS.push({ x1, z1, x2, z2, len, nx, nz, yaw });
  TOTAL_LOOP_LEN += len;
}

function sampleCircuitLoop(distAlong: number, laneOffset: number): { x: number; z: number; yaw: number } {
  let d = ((distAlong % TOTAL_LOOP_LEN) + TOTAL_LOOP_LEN) % TOTAL_LOOP_LEN;
  for (let i = 0; i < LOOP_SEGMENTS.length; i++) {
    const seg = LOOP_SEGMENTS[i];
    if (d <= seg.len || i === LOOP_SEGMENTS.length - 1) {
      const t = Math.min(1, d / seg.len);
      return {
        x: seg.x1 + (seg.x2 - seg.x1) * t + seg.nx * laneOffset,
        z: seg.z1 + (seg.z2 - seg.z1) * t + seg.nz * laneOffset,
        yaw: seg.yaw,
      };
    }
    d -= seg.len;
  }
  return { x: 0, z: 0, yaw: 0 };
}

export function buildOamaruTraffic(): OamaruTrafficHandle {
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  const group = new THREE.Group();
  const charPool = track(createCharacterPool());

  const footCanvas = document.createElement('canvas');
  footCanvas.width = 64;
  footCanvas.height = 64;
  const footCtx = footCanvas.getContext('2d')!;
  const footGrad = footCtx.createRadialGradient(32, 32, 4, 32, 32, 30);
  footGrad.addColorStop(0, 'rgba(28, 24, 18, 0.55)');
  footGrad.addColorStop(1, 'rgba(28, 24, 18, 0)');
  footCtx.fillStyle = footGrad;
  footCtx.fillRect(0, 0, 64, 64);
  const footTex = track(new THREE.CanvasTexture(footCanvas));
  footTex.colorSpace = THREE.SRGBColorSpace;
  const footMat = track(
    new THREE.MeshBasicMaterial({
      map: footTex,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    })
  );
  const footGeo = track(new THREE.CircleGeometry(0.42, 14));
  footGeo.rotateX(-Math.PI / 2);
  const addFootDisc = (parent: THREE.Object3D) => {
    const disc = new THREE.Mesh(footGeo, footMat);
    disc.position.y = 0.03;
    disc.renderOrder = 2;
    parent.add(disc);
  };

  // Period Vehicle, Cart & Bird Materials
  const brassMat = track(new THREE.MeshStandardMaterial({ color: 0xd4aa4f, roughness: 0.28, metalness: 0.88 }));
  const timberCartMat = track(new THREE.MeshStandardMaterial({ color: 0x6c4c2f, roughness: 0.82 }));
  const burlapMat = track(new THREE.MeshStandardMaterial({ color: 0xa68f68, roughness: 0.95 }));
  const ironWheelMat = track(new THREE.MeshStandardMaterial({ color: 0x222325, roughness: 0.55, metalness: 0.6 }));
  const rubberTyreMat = track(new THREE.MeshStandardMaterial({ color: 0x45433f, roughness: 0.86 }));
  const barrierRedMat = track(new THREE.MeshStandardMaterial({ color: 0x8f2924, roughness: 0.75 }));
  const barrierWhiteMat = track(new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.78 }));
  const glassMat = track(new THREE.MeshStandardMaterial({ color: 0xa8c2cf, roughness: 0.15, metalness: 0.25, transparent: true, opacity: 0.55 }));
  const leatherSeatMat = track(new THREE.MeshStandardMaterial({ color: 0x3d2318, roughness: 0.68 }));

  const bayHorseHex = 0x5b341f;
  const chestnutHorseHex = 0x804728;
  const dappleGreyHex = 0x9b9a95;

  const gullWhiteMat = track(new THREE.MeshStandardMaterial({ color: 0xf2f0eb, roughness: 0.72 }));
  const gullTipMat = track(new THREE.MeshStandardMaterial({ color: 0x454c54, roughness: 0.75 }));
  const beakMat = track(new THREE.MeshStandardMaterial({ color: 0xd98c2b, roughness: 0.6 }));

  const idleAnimals: IdleAnimal[] = [];
  const dogs: ReactiveDog[] = [];
  const sheepList: ReactiveSheep[] = [];
  const spectators: IdleSpectator[] = [];
  const walkers: WalkingPedestrian[] = [];
  const crowdClusters: CrowdCluster[] = [];
  const movingCars: MovingVintageCar[] = [];
  const movingDrays: MovingHorseDray[] = [];
  const movingCyclists: MovingCyclist[] = [];
  const obstacles: DynamicObstacle[] = [];
  const streetCats: StreetCat[] = [];
  const streetGeese: StreetGoose[] = [];
  const beatConstables: BeatConstable[] = [];
  let latestDogBarkIntensity = 0;
  let latestDogX = 0;
  let latestDogZ = 0;
  let latestChasingDogCount = 0;
  let latestSheepPanicIntensity = 0;
  let latestSheepX = 18;
  let latestSheepZ = 100;
  let latestHorseStartle = 0;

  // ---------------------------------------------------------------------------
  // Articulated Edwardian Citizen Wrapper
  // ---------------------------------------------------------------------------
  type CitizenStyle = Extract<
    HumanPreset,
    'gentleman' | 'lady' | 'worker' | 'constable' | 'newsboy' | 'farmer' | 'schoolboy' | 'mechanic' | 'captain'
  >;

  const createPedestrian = (style: CitizenStyle, variantIdx: number): ArticulatedHumanRig => {
    return charPool.buildHuman(style, variantIdx);
  };

  // ---------------------------------------------------------------------------
  // Articulated Parked / Moving Dray
  // ---------------------------------------------------------------------------
  const createParkedDray = (coatHex: number, cargo: 'grain' | 'milk' | 'bread' = 'grain') => {
    const root = new THREE.Group();
    const horseRig = charPool.buildHorse(coatHex, true);
    horseRig.group.position.set(0, 0, 1.72);
    root.add(horseRig.group);

    const shaftGeo = track(new THREE.BoxGeometry(0.06, 0.06, 2.0));
    [-0.39, 0.39].forEach((sx) => {
      const shaft = new THREE.Mesh(shaftGeo, timberCartMat);
      shaft.position.set(sx, 0.96, 1.1);
      root.add(shaft);
    });

    const bed = new THREE.Mesh(track(new THREE.BoxGeometry(1.56, 0.48, 2.45)), timberCartMat);
    bed.position.set(0, 0.94, -0.88);
    bed.castShadow = true;
    root.add(bed);

    if (cargo === 'milk') {
      const churnMat = track(new THREE.MeshStandardMaterial({ color: 0xc5ccd1, roughness: 0.32, metalness: 0.62 }));
      const churnGeo = track(new THREE.CylinderGeometry(0.2, 0.22, 0.58, 10));
      const lidGeo = track(new THREE.CylinderGeometry(0.1, 0.16, 0.1, 8));
      const spots: [number, number][] = [[-0.38, -0.4], [0.38, -0.4], [-0.38, -1.25], [0.38, -1.25], [0, -0.82]];
      spots.forEach(([sx, sz]) => {
        const churn = new THREE.Mesh(churnGeo, churnMat);
        churn.position.set(sx, 1.48, sz);
        churn.castShadow = true;
        const lid = new THREE.Mesh(lidGeo, churnMat);
        lid.position.set(sx, 1.82, sz);
        root.add(churn, lid);
      });
    } else if (cargo === 'bread') {
      const crateMat = track(new THREE.MeshStandardMaterial({ color: 0x8a6840, roughness: 0.86 }));
      const loafMat = track(new THREE.MeshStandardMaterial({ color: 0xc4a36a, roughness: 0.9 }));
      for (let s = 0; s < 4; s++) {
        const crate = new THREE.Mesh(track(new THREE.BoxGeometry(0.62, 0.28, 0.48)), crateMat);
        crate.position.set(s % 2 === 0 ? -0.34 : 0.34, 1.32, s < 2 ? -0.5 : -1.25);
        crate.castShadow = true;
        root.add(crate);
        for (let loaf = 0; loaf < 2; loaf++) {
          const roll = new THREE.Mesh(track(new THREE.SphereGeometry(0.09, 8, 6)), loafMat);
          roll.scale.set(1.3, 0.7, 0.9);
          roll.position.set((s % 2 === 0 ? -0.34 : 0.34) + (loaf === 0 ? -0.12 : 0.12), 1.52, s < 2 ? -0.5 : -1.25);
          root.add(roll);
        }
      }
    } else {
      for (let s = 0; s < 5; s++) {
        const sack = new THREE.Mesh(track(new THREE.BoxGeometry(0.62, 0.36, 0.85)), burlapMat);
        sack.position.set(s % 2 === 0 ? -0.34 : 0.34, s === 4 ? 1.62 : 1.32, s < 2 ? -0.45 : s < 4 ? -1.32 : -0.9);
        sack.rotation.y = (s - 1.5) * 0.09;
        sack.castShadow = true;
        root.add(sack);
      }
    }

    const rimGeo = track(new THREE.TorusGeometry(0.56, 0.05, 8, 22));
    rimGeo.rotateY(Math.PI / 2);
    const spokeGeo = track(new THREE.CylinderGeometry(0.022, 0.022, 1.08, 6));
    const cartWheels: THREE.Group[] = [];

    [-0.88, 0.88].forEach((wx) => {
      const wGroup = new THREE.Group();
      wGroup.position.set(wx, 0.58, -0.88);
      wGroup.add(new THREE.Mesh(rimGeo, ironWheelMat));
      for (let sp = 0; sp < 6; sp++) {
        const spoke = new THREE.Mesh(spokeGeo, timberCartMat);
        spoke.rotation.x = (sp * Math.PI) / 6;
        wGroup.add(spoke);
      }
      root.add(wGroup);
      cartWheels.push(wGroup);
    });

    return {
      root,
      headPivot: horseRig.headPivot,
      tailPivot: horseRig.tailPivot,
      legPivots: horseRig.legPivots,
      kneePivots: horseRig.kneePivots,
      cartWheels,
    };
  };

  // ---------------------------------------------------------------------------
  // High-Definition 1910s Vintage Automobile Builder (Moving & Parked)
  // ---------------------------------------------------------------------------
  const createVintageCar = (bodyColorHex: number, withDriver: boolean) => {
    const cGroup = new THREE.Group();
    const paintMat = track(
      new THREE.MeshStandardMaterial({
        color: bodyColorHex,
        roughness: 0.28,
        metalness: 0.22,
      })
    );

    // Steel ladder chassis + running boards
    const chassis = new THREE.Mesh(track(new THREE.BoxGeometry(1.18, 0.14, 3.15)), ironWheelMat);
    chassis.position.set(0, 0.44, 0);
    cGroup.add(chassis);

    [-0.74, 0.74].forEach((rx) => {
      const board = new THREE.Mesh(track(new THREE.BoxGeometry(0.24, 0.05, 1.55)), timberCartMat);
      board.position.set(rx, 0.36, -0.05);
      cGroup.add(board);
    });

    // Louvred Engine Bonnet & Brass Honeycomb Radiator Grille
    const bonnet = new THREE.Mesh(track(new THREE.BoxGeometry(0.84, 0.56, 1.02)), paintMat);
    bonnet.position.set(0, 0.78, 0.88);
    bonnet.castShadow = true;
    const radShell = new THREE.Mesh(track(new THREE.BoxGeometry(0.86, 0.62, 0.14)), brassMat);
    radShell.position.set(0, 0.79, 1.42);
    const radCore = new THREE.Mesh(track(new THREE.BoxGeometry(0.72, 0.50, 0.16)), ironWheelMat);
    radCore.position.set(0, 0.79, 1.43);
    const radCap = new THREE.Mesh(track(new THREE.CylinderGeometry(0.04, 0.04, 0.09, 8)), brassMat);
    radCap.position.set(0, 1.14, 1.42);
    cGroup.add(bonnet, radShell, radCore, radCap);

    // Open Touring Coachwork Tub + Tufted Leather Seats
    const tub = new THREE.Mesh(track(new THREE.BoxGeometry(1.36, 0.62, 1.55)), paintMat);
    tub.position.set(0, 0.80, -0.45);
    tub.castShadow = true;
    const seatBack = new THREE.Mesh(track(new THREE.BoxGeometry(1.22, 0.46, 0.18)), leatherSeatMat);
    seatBack.position.set(0, 1.08, -1.06);
    const frontSeat = new THREE.Mesh(track(new THREE.BoxGeometry(1.20, 0.22, 0.50)), leatherSeatMat);
    frontSeat.position.set(0, 0.82, -0.15);
    cGroup.add(tub, seatBack, frontSeat);

    // Brass-framed Glass Windscreen
    const wsFrame = new THREE.Mesh(track(new THREE.BoxGeometry(1.18, 0.05, 0.05)), brassMat);
    wsFrame.position.set(0, 1.48, 0.28);
    const wsGlass = new THREE.Mesh(track(new THREE.BoxGeometry(1.14, 0.42, 0.02)), glassMat);
    wsGlass.position.set(0, 1.28, 0.28);
    cGroup.add(wsFrame, wsGlass);

    // Swept Steel Mudguards (4 corners)
    const fenderGeo = track(new THREE.CylinderGeometry(0.42, 0.42, 0.26, 12, 1, true, -Math.PI * 0.45, Math.PI * 0.9));
    fenderGeo.rotateZ(Math.PI / 2);
    [
      [0.73, 0.48, 1.18],
      [-0.73, 0.48, 1.18],
      [0.73, 0.48, -1.12],
      [-0.73, 0.48, -1.12],
    ].forEach(([fx, fy, fz]) => {
      const fender = new THREE.Mesh(fenderGeo, ironWheelMat);
      fender.position.set(fx, fy, fz);
      cGroup.add(fender);
    });

    // Brass Headlamps with glowing lenses
    const headlightBulbs: THREE.Mesh[] = [];
    const lensMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xfff3c8,
        emissive: 0xffd578,
        emissiveIntensity: 0.3,
        roughness: 0.2,
      })
    );
    [-0.44, 0.44].forEach((hx) => {
      const lampBody = new THREE.Mesh(track(new THREE.CylinderGeometry(0.11, 0.08, 0.16, 10)), brassMat);
      lampBody.rotation.x = Math.PI / 2;
      lampBody.position.set(hx, 0.84, 1.50);
      const lens = new THREE.Mesh(track(new THREE.CircleGeometry(0.095, 10)), lensMat);
      lens.position.set(hx, 0.84, 1.585);
      cGroup.add(lampBody, lens);
      headlightBulbs.push(lens);
    });

    // Spare Tyre mounted on side
    const spareTyre = new THREE.Mesh(track(new THREE.TorusGeometry(0.32, 0.075, 8, 16)), rubberTyreMat);
    spareTyre.rotation.y = Math.PI / 2;
    spareTyre.position.set(0.76, 0.82, -0.35);
    cGroup.add(spareTyre);

    // 4 Artillery Spoked Wheels
    const wheels: THREE.Object3D[] = [];
    const tyreGeo = track(new THREE.TorusGeometry(0.34, 0.075, 8, 18));
    tyreGeo.rotateY(Math.PI / 2);
    const woodRimGeo = track(new THREE.TorusGeometry(0.27, 0.032, 6, 16));
    woodRimGeo.rotateY(Math.PI / 2);
    const carSpokeGeo = track(new THREE.CylinderGeometry(0.018, 0.018, 0.54, 6));

    [
      [0.72, 1.18],
      [-0.72, 1.18],
      [0.72, -1.12],
      [-0.72, -1.12],
    ].forEach(([wx, wz]) => {
      const wGroup = new THREE.Group();
      wGroup.position.set(wx, 0.39, wz);
      wGroup.add(new THREE.Mesh(tyreGeo, rubberTyreMat));
      wGroup.add(new THREE.Mesh(woodRimGeo, timberCartMat));
      for (let sp = 0; sp < 6; sp++) {
        const spoke = new THREE.Mesh(carSpokeGeo, timberCartMat);
        spoke.rotation.x = (sp * Math.PI) / 6;
        wGroup.add(spoke);
      }
      cGroup.add(wGroup);
      wheels.push(wGroup);
    });

    // Articulated Driver inside cockpit
    if (withDriver) {
      const driverRig = charPool.buildHuman('gentleman', 2, { seated: true });
      driverRig.group.scale.setScalar(0.86);
      driverRig.group.position.set(-0.24, 0.85, -0.18);
      driverRig.leftArm.rotation.x = -0.68;
      driverRig.rightArm.rotation.x = -0.68;
      driverRig.leftElbow.rotation.x = -0.52;
      driverRig.rightElbow.rotation.x = -0.52;
      const goggles = new THREE.Mesh(track(new THREE.BoxGeometry(0.15, 0.04, 0.05)), brassMat);
      goggles.position.set(0, 0.065, 0.095);
      driverRig.headPivot.add(goggles);
      const steerCol = new THREE.Mesh(track(new THREE.CylinderGeometry(0.02, 0.02, 0.65, 6)), brassMat);
      steerCol.position.set(-0.24, 1.04, 0.1);
      steerCol.rotation.x = -0.75;
      cGroup.add(driverRig.group, steerCol);
    }

    return { cGroup, wheels, headlightBulbs };
  };

  // ---------------------------------------------------------------------------
  // 1. Natural 1914 Side-Street Blockades (Carts, Sawhorses, Barrels & Crowds)
  // ---------------------------------------------------------------------------
  const sawhorseRailGeo = track(new THREE.BoxGeometry(4.4, 0.24, 0.12));
  const sawhorseLegGeo = track(new THREE.CylinderGeometry(0.04, 0.05, 1.05, 6));
  const barrelGeo = track(new THREE.CylinderGeometry(0.36, 0.38, 0.92, 10));
  const crateGeo = track(new THREE.BoxGeometry(1.05, 0.88, 1.05));
  const citizenStyles: CitizenStyle[] = ['gentleman', 'lady', 'worker', 'constable', 'newsboy'];

  SIDE_STREET_BLOCKADES.forEach((blk, idx) => {
    const bGroup = new THREE.Group();
    const baseH = getTerrainHeightAndSurface(blk.x, blk.z).height;
    bGroup.position.set(blk.x, baseH, blk.z);
    bGroup.rotation.y = blk.yaw;

    [-3.1, 3.1].forEach((sx, si) => {
      const rail = new THREE.Mesh(sawhorseRailGeo, si % 2 === 0 ? barrierRedMat : barrierWhiteMat);
      rail.position.set(sx, 0.82, 0);
      rail.castShadow = true;
      bGroup.add(rail);

      [-1.7, 1.7].forEach((lx) => {
        const leg = new THREE.Mesh(sawhorseLegGeo, timberCartMat);
        leg.position.set(sx + lx, 0.48, 0);
        bGroup.add(leg);
      });
    });

    if (blk.hasCart) {
      const horseHex = idx % 3 === 0 ? bayHorseHex : idx % 3 === 1 ? chestnutHorseHex : dappleGreyHex;
      const dray = createParkedDray(horseHex);
      dray.root.position.set(idx % 2 === 0 ? -0.4 : 0.4, 0, -1.6);
      dray.root.rotation.y = Math.PI * 0.44 * (idx % 2 === 0 ? 1 : -1);
      bGroup.add(dray.root);
      idleAnimals.push({
        kind: 'horse',
        x: blk.x,
        z: blk.z,
        head: dray.headPivot,
        tail: dray.tailPivot,
        startleTimer: 0,
        phase: idx * 1.4,
      });
    }

    const barrel = new THREE.Mesh(barrelGeo, timberCartMat);
    barrel.position.set(-4.6, 0.46, 0.6);
    barrel.castShadow = true;
    const crate = new THREE.Mesh(crateGeo, burlapMat);
    crate.position.set(4.5, 0.44, 0.5);
    crate.castShadow = true;
    bGroup.add(barrel, crate);

    // Dense cheering & conversing crowd behind every blockade
    const totalSpecs = blk.spectatorCount + 3;
    for (let s = 0; s < totalSpecs; s++) {
      const style = s === 0 && idx % 3 === 0 ? 'constable' : citizenStyles[(idx + s) % citizenStyles.length];
      const ped = createPedestrian(style, idx * 3 + s);
      const px = -4.3 + (s / Math.max(1, totalSpecs - 1)) * 8.6;
      const pz = s % 2 === 0 ? -0.65 : -1.25;
      ped.group.position.set(px, 0, pz);
      addFootDisc(ped.group);
      if (s % 3 === 1) {
        ped.group.rotation.y = 0.45; // conversing slightly sideways with neighbor
      }
      bGroup.add(ped.group);
      spectators.push({
        group: ped.group,
        head: ped.headPivot,
        arms: [ped.leftArm, ped.rightArm],
        elbows: [ped.leftElbow, ped.rightElbow],
        phase: idx * 1.1 + s * 0.85,
        mode: s % 3 === 0 ? 'cheering' : s % 3 === 1 ? 'discussing' : 'watching',
      });
    }

    const prettyLabel = blk.id
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    crowdClusters.push({ x: blk.x, z: blk.z, density: totalSpecs, label: `${prettyLabel} Barrier` });
    group.add(bGroup);
  });

  // ---------------------------------------------------------------------------
  // 2. Bustling Sidewalk Spectator & Conversation Clusters Around the Circuit
  // ---------------------------------------------------------------------------
  const conversationClusters: {
    cx: number;
    cz: number;
    label: string;
    members: { dx: number; dz: number; yaw: number; style: CitizenStyle; mode: IdleSpectator['mode'] }[];
  }[] = [
    // Start / Finish Grandstand Crowd near Criterion Hotel & Harbour St West
    {
      cx: -54,
      cz: 9.2,
      label: 'Criterion Hotel',
      members: [
        { dx: -4.2, dz: 0, yaw: Math.PI, style: 'constable', mode: 'watching' },
        { dx: -2.8, dz: 0.3, yaw: Math.PI + 0.3, style: 'gentleman', mode: 'cheering' },
        { dx: -2.0, dz: 0.1, yaw: Math.PI - 0.3, style: 'lady', mode: 'discussing' },
        { dx: -0.9, dz: 0.4, yaw: Math.PI, style: 'newsboy', mode: 'cheering' },
        { dx: 0.2, dz: 0.2, yaw: Math.PI + 0.4, style: 'gentleman', mode: 'discussing' },
        { dx: 1.0, dz: 0.1, yaw: Math.PI - 0.5, style: 'gentleman', mode: 'discussing' },
        { dx: 2.2, dz: 0.3, yaw: Math.PI, style: 'lady', mode: 'cheering' },
        { dx: 3.1, dz: 0.2, yaw: Math.PI, style: 'worker', mode: 'cheering' },
        { dx: 4.3, dz: 0.4, yaw: Math.PI - 0.2, style: 'lady', mode: 'watching' },
      ],
    },
    // North Side opposite Start/Finish (Union Bank steps)
    {
      cx: -54,
      cz: -9.1,
      label: 'Union Bank Steps',
      members: [
        { dx: -3.2, dz: 0, yaw: 0, style: 'gentleman', mode: 'cheering' },
        { dx: -2.2, dz: -0.2, yaw: 0.5, style: 'lady', mode: 'discussing' },
        { dx: -1.4, dz: -0.3, yaw: -0.5, style: 'gentleman', mode: 'discussing' },
        { dx: 0.0, dz: 0, yaw: 0, style: 'worker', mode: 'cheering' },
        { dx: 1.3, dz: -0.2, yaw: 0.4, style: 'lady', mode: 'discussing' },
        { dx: 2.2, dz: -0.1, yaw: -0.4, style: 'newsboy', mode: 'cheering' },
      ],
    },
    // NZ Loan & Mercantile Arcade
    {
      cx: -2,
      cz: -9.1,
      label: 'Loan & Mercantile Arcade',
      members: [
        { dx: -2.2, dz: 0, yaw: 0.6, style: 'gentleman', mode: 'discussing' },
        { dx: -1.3, dz: -0.1, yaw: -0.6, style: 'gentleman', mode: 'discussing' },
        { dx: 0.4, dz: 0.1, yaw: 0, style: 'lady', mode: 'watching' },
        { dx: 1.5, dz: 0, yaw: 0, style: 'worker', mode: 'cheering' },
        { dx: 2.8, dz: -0.2, yaw: 0.3, style: 'lady', mode: 'discussing' },
        { dx: 3.6, dz: -0.1, yaw: -0.4, style: 'gentleman', mode: 'discussing' },
      ],
    },
    // Meek's Grain Store & Craig Timber Yard
    {
      cx: 24,
      cz: 9.2,
      label: "Meek's Store Pavement",
      members: [
        { dx: -2.5, dz: 0, yaw: Math.PI + 0.4, style: 'worker', mode: 'discussing' },
        { dx: -1.6, dz: 0.2, yaw: Math.PI - 0.5, style: 'worker', mode: 'discussing' },
        { dx: 0.2, dz: 0.1, yaw: Math.PI, style: 'gentleman', mode: 'cheering' },
        { dx: 1.4, dz: 0.3, yaw: Math.PI, style: 'lady', mode: 'cheering' },
        { dx: 2.5, dz: 0.1, yaw: Math.PI, style: 'newsboy', mode: 'cheering' },
      ],
    },
    // Harbour Board Cobble Corner
    {
      cx: 76,
      cz: -9.1,
      label: 'Harbour Board Corner',
      members: [
        { dx: -2.4, dz: 0, yaw: 0, style: 'constable', mode: 'watching' },
        { dx: -1.0, dz: -0.2, yaw: 0.4, style: 'worker', mode: 'discussing' },
        { dx: -0.1, dz: -0.1, yaw: -0.5, style: 'gentleman', mode: 'discussing' },
        { dx: 1.4, dz: 0.1, yaw: 0, style: 'lady', mode: 'cheering' },
        { dx: 2.4, dz: -0.2, yaw: 0, style: 'worker', mode: 'cheering' },
      ],
    },
    // Quay Esplanade Spectators watching climb
    {
      cx: 86.2,
      cz: 42,
      label: 'Quay Esplanade',
      members: [
        { dx: 0, dz: -2.2, yaw: Math.PI / 2, style: 'gentleman', mode: 'cheering' },
        { dx: -0.2, dz: -1.2, yaw: Math.PI / 2 + 0.4, style: 'lady', mode: 'discussing' },
        { dx: -0.1, dz: -0.3, yaw: Math.PI / 2 - 0.5, style: 'gentleman', mode: 'discussing' },
        { dx: 0.1, dz: 1.4, yaw: Math.PI / 2, style: 'worker', mode: 'cheering' },
        { dx: 0, dz: 2.5, yaw: Math.PI / 2, style: 'newsboy', mode: 'cheering' },
      ],
    },
    // Wanbrow Ridge Coastal Lookouts
    {
      cx: 12,
      cz: 109.2,
      label: 'Wanbrow Ridge',
      members: [
        { dx: -2.0, dz: 0, yaw: 0.5, style: 'lady', mode: 'discussing' },
        { dx: -1.1, dz: -0.1, yaw: -0.5, style: 'gentleman', mode: 'discussing' },
        { dx: 0.6, dz: 0.1, yaw: 0, style: 'worker', mode: 'cheering' },
        { dx: 1.8, dz: 0, yaw: 0, style: 'lady', mode: 'cheering' },
      ],
    },
    // Severn St & Waitaki Courthouse Terrace
    {
      cx: -143.2,
      cz: 52,
      label: 'Waitaki Courthouse',
      members: [
        { dx: 0, dz: -2.5, yaw: -Math.PI / 2, style: 'gentleman', mode: 'cheering' },
        { dx: 0.2, dz: -1.4, yaw: -Math.PI / 2 + 0.4, style: 'gentleman', mode: 'discussing' },
        { dx: 0.1, dz: -0.5, yaw: -Math.PI / 2 - 0.5, style: 'lady', mode: 'discussing' },
        { dx: 0, dz: 1.1, yaw: -Math.PI / 2, style: 'constable', mode: 'watching' },
        { dx: 0.2, dz: 2.2, yaw: -Math.PI / 2, style: 'newsboy', mode: 'cheering' },
      ],
    },
    // Forrester Gallery & Chief Post Office Corner (Thames & Itchen)
    {
      cx: -95.2,
      cz: -36,
      label: 'Forrester Gallery Steps',
      members: [
        { dx: 0, dz: -2.8, yaw: -Math.PI / 2, style: 'lady', mode: 'cheering' },
        { dx: 0.2, dz: -1.6, yaw: -Math.PI / 2 + 0.5, style: 'gentleman', mode: 'discussing' },
        { dx: 0.1, dz: -0.7, yaw: -Math.PI / 2 - 0.4, style: 'lady', mode: 'discussing' },
        { dx: 0, dz: 0.9, yaw: -Math.PI / 2, style: 'gentleman', mode: 'cheering' },
        { dx: 0.2, dz: 2.0, yaw: -Math.PI / 2, style: 'worker', mode: 'watching' },
        { dx: 0.1, dz: 3.1, yaw: -Math.PI / 2, style: 'newsboy', mode: 'cheering' },
      ],
    },
    // Oamaru Opera House Steps (Thames St)
    {
      cx: -112.8,
      cz: -14,
      label: 'Oamaru Opera House',
      members: [
        { dx: 0, dz: -2.6, yaw: Math.PI / 2, style: 'lady', mode: 'cheering' },
        { dx: -0.2, dz: -1.5, yaw: Math.PI / 2 + 0.4, style: 'gentleman', mode: 'discussing' },
        { dx: -0.1, dz: -0.6, yaw: Math.PI / 2 - 0.5, style: 'lady', mode: 'discussing' },
        { dx: 0, dz: 1.0, yaw: Math.PI / 2, style: 'gentleman', mode: 'cheering' },
        { dx: -0.1, dz: 2.1, yaw: Math.PI / 2, style: 'worker', mode: 'cheering' },
      ],
    },
    // Whitestone Exchange Saturday Market Stall Shoppers (Harbour St South)
    {
      cx: -4,
      cz: 10.6,
      label: 'Harbour Market Verandah',
      members: [
        { dx: -3.4, dz: 0.2, yaw: 0.1, style: 'lady', mode: 'watching' },
        { dx: -2.2, dz: -0.1, yaw: Math.PI + 0.4, style: 'worker', mode: 'discussing' },
        { dx: -1.3, dz: 0.1, yaw: Math.PI - 0.5, style: 'lady', mode: 'discussing' },
        { dx: 0.4, dz: 0.3, yaw: 0.0, style: 'lady', mode: 'watching' },
        { dx: 1.8, dz: -0.2, yaw: Math.PI + 0.3, style: 'gentleman', mode: 'discussing' },
        { dx: 2.7, dz: 0.0, yaw: Math.PI - 0.4, style: 'lady', mode: 'discussing' },
        { dx: 4.1, dz: -0.1, yaw: Math.PI, style: 'newsboy', mode: 'cheering' },
      ],
    },
    // Imperial Hotel & Sumpter Produce Arcade
    {
      cx: 66,
      cz: 10.5,
      label: 'Imperial Hotel Arcade',
      members: [
        { dx: -3.2, dz: 0.0, yaw: Math.PI + 0.5, style: 'gentleman', mode: 'discussing' },
        { dx: -2.3, dz: 0.2, yaw: Math.PI - 0.5, style: 'gentleman', mode: 'discussing' },
        { dx: -0.8, dz: 0.1, yaw: Math.PI, style: 'lady', mode: 'watching' },
        { dx: 0.8, dz: 0.2, yaw: Math.PI + 0.3, style: 'worker', mode: 'cheering' },
        { dx: 2.1, dz: -0.1, yaw: Math.PI - 0.3, style: 'lady', mode: 'discussing' },
        { dx: 3.1, dz: 0.1, yaw: Math.PI, style: 'constable', mode: 'watching' },
      ],
    },
    // Sumpter Wharf Cargo Hands & Bystanders
    {
      cx: 92,
      cz: -8.6,
      label: 'Sumpter Wharf Sheds',
      members: [
        { dx: -2.8, dz: 0.2, yaw: 0.4, style: 'worker', mode: 'discussing' },
        { dx: -1.9, dz: -0.1, yaw: -0.5, style: 'worker', mode: 'discussing' },
        { dx: -0.2, dz: 0.0, yaw: 0.0, style: 'worker', mode: 'watching' },
        { dx: 1.4, dz: 0.3, yaw: -0.2, style: 'gentleman', mode: 'cheering' },
        { dx: 2.7, dz: 0.1, yaw: 0.1, style: 'newsboy', mode: 'cheering' },
      ],
    },
    // Chief Post Office & Star & Garter Corner Crowd (Thames & Itchen)
    {
      cx: -112.8,
      cz: -38,
      label: 'Post Office Arcade',
      members: [
        { dx: 0.0, dz: -3.0, yaw: Math.PI / 2, style: 'gentleman', mode: 'watching' },
        { dx: -0.2, dz: -1.8, yaw: Math.PI / 2 + 0.4, style: 'lady', mode: 'discussing' },
        { dx: -0.1, dz: -0.9, yaw: Math.PI / 2 - 0.4, style: 'lady', mode: 'discussing' },
        { dx: 0.1, dz: 0.8, yaw: Math.PI / 2, style: 'newsboy', mode: 'cheering' },
        { dx: 0.0, dz: 2.1, yaw: Math.PI / 2, style: 'constable', mode: 'watching' },
      ],
    },
    // Queen's Chambers & Oamaru Mail Press Window Shoppers (Thames St East)
    {
      cx: -95.2,
      cz: 58,
      label: "Queen's Chambers",
      members: [
        { dx: 0.1, dz: -2.4, yaw: -Math.PI / 2, style: 'lady', mode: 'watching' },
        { dx: -0.1, dz: -1.3, yaw: -Math.PI / 2 + 0.5, style: 'lady', mode: 'discussing' },
        { dx: 0.0, dz: -0.4, yaw: -Math.PI / 2 - 0.4, style: 'gentleman', mode: 'discussing' },
        { dx: 0.1, dz: 1.2, yaw: -Math.PI / 2, style: 'worker', mode: 'watching' },
        { dx: 0.0, dz: 2.3, yaw: -Math.PI / 2, style: 'gentleman', mode: 'cheering' },
      ],
    },
    // Meek's Flour Mill & National Mortgage Footpath Market (Harbour St North)
    {
      cx: 36,
      cz: -10.5,
      label: "Meek's Granary Arcade",
      members: [
        { dx: -3.0, dz: 0.1, yaw: 0.4, style: 'worker', mode: 'discussing' },
        { dx: -2.1, dz: -0.2, yaw: -0.5, style: 'gentleman', mode: 'discussing' },
        { dx: -0.3, dz: 0.0, yaw: 0.0, style: 'lady', mode: 'watching' },
        { dx: 1.1, dz: -0.1, yaw: 0.3, style: 'lady', mode: 'cheering' },
        { dx: 2.4, dz: 0.0, yaw: -0.2, style: 'worker', mode: 'watching' },
      ],
    },
    // Tyne St & Waitaki Farmers Market Corner
    {
      cx: -14.5,
      cz: 56,
      label: 'Tyne St Wool Market',
      members: [
        { dx: 0.0, dz: -2.2, yaw: Math.PI / 2, style: 'worker', mode: 'discussing' },
        { dx: -0.2, dz: -1.3, yaw: Math.PI / 2 - 0.5, style: 'gentleman', mode: 'discussing' },
        { dx: 0.1, dz: 0.4, yaw: Math.PI / 2, style: 'lady', mode: 'watching' },
        { dx: 0.0, dz: 1.7, yaw: Math.PI / 2, style: 'newsboy', mode: 'cheering' },
      ],
    },
    // Cape Wanbrow Summit Lighthouse Viewpoint
    {
      cx: 42,
      cz: 187.5,
      label: 'Cape Wanbrow Lighthouse',
      members: [
        { dx: -2.4, dz: 0.0, yaw: 0.3, style: 'lady', mode: 'watching' },
        { dx: -1.2, dz: 0.2, yaw: -0.4, style: 'gentleman', mode: 'discussing' },
        { dx: 0.6, dz: -0.1, yaw: 0.1, style: 'newsboy', mode: 'cheering' },
      ],
    },
    // Waitaki Flour Mill & Overbridge Spectators
    {
      cx: -95.2,
      cz: -124,
      label: 'Waitaki Flour Mill',
      members: [
        { dx: 0.1, dz: -2.2, yaw: -Math.PI / 2 + 0.3, style: 'worker', mode: 'discussing' },
        { dx: -0.1, dz: -1.1, yaw: -Math.PI / 2 - 0.4, style: 'worker', mode: 'discussing' },
        { dx: 0.0, dz: 1.4, yaw: -Math.PI / 2, style: 'gentleman', mode: 'watching' },
      ],
    },
  ];

  conversationClusters.forEach((cl, ci) => {
    cl.members.forEach((m, mi) => {
      const wx = cl.cx + m.dx;
      const wz = cl.cz + m.dz;
      const wy = getTerrainHeightAndSurface(wx, wz).height;
      const ped = createPedestrian(m.style, ci * 7 + mi);
      ped.group.position.set(wx, wy, wz);
      ped.group.rotation.y = m.yaw;
      addFootDisc(ped.group);
      group.add(ped.group);
      spectators.push({
        group: ped.group,
        head: ped.headPivot,
        arms: [ped.leftArm, ped.rightArm],
        elbows: [ped.leftElbow, ped.rightElbow],
        phase: ci * 1.4 + mi * 0.75,
        mode: m.mode,
      });
    });
    crowdClusters.push({ x: cl.cx, z: cl.cz, density: cl.members.length, label: cl.label });
  });

  // Walking Pedestrians strolling along safe stone footpaths (bustling Saturday market traffic)
  const sidewalkWalkRoutes: {
    x1: number;
    z1: number;
    x2: number;
    z2: number;
    style: CitizenStyle;
    speed: number;
    gait?: 'unsteady';
  }[] = [
    { x1: -72, z1: -9.4, x2: -12, z2: -9.4, style: 'gentleman', speed: 1.35 },
    { x1: -64, z1: -10.4, x2: 18, z2: -10.4, style: 'lady', speed: 1.12 },
    { x1: -8, z1: 9.4, x2: 65, z2: 9.4, style: 'lady', speed: 1.15 },
    { x1: -78, z1: 10.3, x2: 24, z2: 10.3, style: 'gentleman', speed: 1.32 },
    { x1: 12, z1: -9.5, x2: 78, z2: -9.5, style: 'worker', speed: 1.4 },
    { x1: 28, z1: 10.4, x2: 78, z2: 10.4, style: 'newsboy', speed: 1.55 },
    { x1: -95.2, z1: -56, x2: -95.2, z2: -16, style: 'lady', speed: 1.2 },
    { x1: -95.2, z1: 18, x2: -95.2, z2: 94, style: 'gentleman', speed: 1.28 },
    { x1: -112.8, z1: -58, x2: -112.8, z2: -18, style: 'gentleman', speed: 1.3 },
    { x1: -112.8, z1: 18, x2: -112.8, z2: 96, style: 'lady', speed: 1.16 },
    { x1: -112.8, z1: -44, x2: -112.8, z2: 36, style: 'constable', speed: 1.08 },
    { x1: -143.2, z1: -48, x2: -143.2, z2: 96, style: 'worker', speed: 1.38 },
    { x1: -160.2, z1: -42, x2: -160.2, z2: 88, style: 'lady', speed: 1.14 },
    { x1: 86.2, z1: 14, x2: 86.2, z2: 98, style: 'gentleman', speed: 1.25 },
    { x1: 86.2, z1: -62, x2: 86.2, z2: -14, style: 'worker', speed: 1.44 },
    { x1: -82, z1: 109.2, x2: 74, z2: 109.2, style: 'lady', speed: 1.18 },
    { x1: -34, z1: 109.6, x2: 52, z2: 109.6, style: 'gentleman', speed: 1.34 },
    { x1: -88, z1: -75.5, x2: 52, z2: -75.5, style: 'worker', speed: 1.36 },
    { x1: -14, z1: 28, x2: -14, z2: 92, style: 'lady', speed: 1.22 },
    { x1: -34, z1: -9.8, x2: 46, z2: -9.8, style: 'newsboy', speed: 1.6 },
    { x1: -112.8, z1: -136, x2: -112.8, z2: -82, style: 'worker', speed: 1.32 },
    { x1: -10, z1: 187.5, x2: 76, z2: 187.5, style: 'gentleman', speed: 1.26 },
    // Criterion Hotel front. Unsteady patrons, not a caricature: the gait is the whole joke.
    { x1: -78, z1: 10.48, x2: -42, z2: 10.48, style: 'gentleman', speed: 0.42, gait: 'unsteady' },
    { x1: -66, z1: 10.02, x2: -46, z2: 10.02, style: 'worker', speed: 0.36, gait: 'unsteady' },
    { x1: -86, z1: 9.55, x2: -40, z2: 9.55, style: 'schoolboy', speed: 1.7 },
    { x1: 18, z1: 9.62, x2: 74, z2: 9.62, style: 'farmer', speed: 1.1 },
    { x1: -90, z1: -9.62, x2: -40, z2: -9.62, style: 'mechanic', speed: 1.24 },
    { x1: 46, z1: -10.15, x2: 76, z2: -10.15, style: 'lady', speed: 1.06 },
    { x1: 86.35, z1: 18, x2: 86.35, z2: 90, style: 'captain', speed: 1.02 },
    { x1: -143.45, z1: 14, x2: -143.45, z2: 78, style: 'schoolboy', speed: 1.55 },
    { x1: -95.55, z1: 22, x2: -95.55, z2: 88, style: 'mechanic', speed: 1.16 },
  ];

  sidewalkWalkRoutes.forEach((rt, wi) => {
    const ped = createPedestrian(rt.style, wi + 2);
    addFootDisc(ped.group);
    group.add(ped.group);
    walkers.push({
      group: ped.group,
      leftLeg: ped.leftLeg,
      rightLeg: ped.rightLeg,
      leftKnee: ped.leftKnee,
      rightKnee: ped.rightKnee,
      leftArm: ped.leftArm,
      rightArm: ped.rightArm,
      leftElbow: ped.leftElbow,
      rightElbow: ped.rightElbow,
      x1: rt.x1,
      z1: rt.z1,
      x2: rt.x2,
      z2: rt.z2,
      speed: rt.speed,
      phase: wi * 1.8,
      progress: (wi * 0.23) % 1,
      dir: wi % 2 === 0 ? 1 : -1,
      evadeTimer: 0,
      gait: rt.gait,
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Articulated Animals: Farm Collies (Bark & Chase), Merino Sheep & Horses
  // ---------------------------------------------------------------------------
  const dogSpots: { x: number; z: number; yaw: number; canChase: boolean }[] = [
    { x: -46, z: 9.5, yaw: Math.PI, canChase: true }, // Criterion Hotel start/finish collie
    { x: 32, z: -9.2, yaw: 0.2, canChase: true }, // Meek's Grain Store collie
    { x: -112.4, z: -10, yaw: Math.PI / 2, canChase: false }, // Oamaru Opera House footpath barker
    { x: -143.5, z: 56, yaw: Math.PI / 2, canChase: true }, // Waitaki Courthouse collie
    { x: 86.5, z: 46, yaw: -Math.PI / 2, canChase: false }, // Quay Esplanade barker
    { x: 10, z: 108.5, yaw: 0, canChase: true }, // Wanbrow Ridge sheepdog
  ];

  dogSpots.forEach((spot, idx) => {
    const dogRig = charPool.buildCollie(idx);
    const dy = getTerrainHeightAndSurface(spot.x, spot.z).height;
    dogRig.group.position.set(spot.x, dy, spot.z);
    dogRig.group.rotation.y = spot.yaw;
    group.add(dogRig.group);

    dogs.push({
      group: dogRig.group,
      head: dogRig.headPivot,
      tail: dogRig.tailPivot,
      legs: dogRig.legPivots,
      knees: dogRig.kneePivots,
      homeX: spot.x,
      homeZ: spot.z,
      homeYaw: spot.yaw,
      x: spot.x,
      z: spot.z,
      yaw: spot.yaw,
      speed: 0,
      canChase: spot.canChase,
      isChasing: false,
      barkLevel: 0,
      flankSign: idx % 2 === 0 ? 1 : -1,
      phase: idx * 2.1,
    });
  });

  // North Otago Merino Sheep grazing in Wanbrow inner paddock & coastal grass verge
  const sheepSpecs: {
    x: number;
    z: number;
    yaw: number;
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  }[] = [
    // Inner Wanbrow Ridge green paddock (clear of Marine Villa & Tyne St)
    { x: 16, z: 98, yaw: 0.6, minX: -8, maxX: 34, minZ: 74, maxZ: 106 },
    { x: 20, z: 100, yaw: -0.9, minX: -8, maxX: 34, minZ: 74, maxZ: 106 },
    { x: 24, z: 96, yaw: 2.1, minX: -8, maxX: 34, minZ: 74, maxZ: 106 },
    { x: 13, z: 102, yaw: 1.4, minX: -8, maxX: 34, minZ: 74, maxZ: 106 },
    // Open coastal headland pasture south of Wanbrow Ridge road
    { x: 2, z: 129, yaw: -0.4, minX: -46, maxX: 55, minZ: 126.8, maxZ: 150 },
    { x: 7, z: 131, yaw: 0.9, minX: -46, maxX: 55, minZ: 126.8, maxZ: 150 },
    { x: 12, z: 128, yaw: 2.3, minX: -46, maxX: 55, minZ: 126.8, maxZ: 150 },
    // Cape Wanbrow Lighthouse Summit Pasture (west of compound)
    { x: -16, z: 174, yaw: 0.5, minX: -48, maxX: 20, minZ: 162, maxZ: 184 },
    { x: -10, z: 178, yaw: -1.1, minX: -48, maxX: 20, minZ: 162, maxZ: 184 },
    { x: -4, z: 170, yaw: 1.7, minX: -48, maxX: 20, minZ: 162, maxZ: 184 },
    { x: 3, z: 176, yaw: -0.3, minX: -48, maxX: 20, minZ: 162, maxZ: 184 },
  ];

  sheepSpecs.forEach((sp, idx) => {
    const sheepRig = charPool.buildSheep({ withHorns: idx % 3 === 0 });
    sheepRig.group.position.set(sp.x, getTerrainHeightAndSurface(sp.x, sp.z).height, sp.z);
    sheepRig.group.rotation.y = sp.yaw;
    group.add(sheepRig.group);

    sheepList.push({
      group: sheepRig.group,
      head: sheepRig.headPivot,
      tail: sheepRig.tailPivot,
      legs: sheepRig.legPivots,
      knees: sheepRig.kneePivots,
      homeX: sp.x,
      homeZ: sp.z,
      x: sp.x,
      z: sp.z,
      yaw: sp.yaw,
      vx: 0,
      vz: 0,
      panicTimer: 0,
      scatterBias: ((idx % 3) - 1) * 0.38,
      minX: sp.minX,
      maxX: sp.maxX,
      minZ: sp.minZ,
      maxZ: sp.maxZ,
      phase: idx * 1.7,
    });
  });

  // Grazing Saddle Horses beside Northern Stables & Rail Siding
  const looseHorses: [number, number, number, number][] = [
    [-72, 10, Math.PI * 0.8, dappleGreyHex],
    [34, -42, -0.6, chestnutHorseHex],
  ];
  looseHorses.forEach(([hx, hz, hyaw, coatHex], idx) => {
    const horseRig = charPool.buildHorse(coatHex, false);
    horseRig.group.position.set(hx, getTerrainHeightAndSurface(hx, hz).height, hz);
    horseRig.group.rotation.y = hyaw;
    group.add(horseRig.group);
    idleAnimals.push({
      kind: 'horse',
      x: hx,
      z: hz,
      head: horseRig.headPivot,
      tail: horseRig.tailPivot,
      startleTimer: 0,
      phase: idx * 2.4,
    });
  });

  // Moving horse drays: grain, the morning milk, and the bakery round.
  const movingDraySpecs: {
    coat: number;
    cargo: 'grain' | 'milk' | 'bread';
    progress: number;
    speedMps: number;
    laneOffset: number;
    driver: HumanPreset;
    driverVariant: number;
  }[] = [
    { coat: bayHorseHex, cargo: 'grain', progress: 680, speedMps: 3.1, laneOffset: -2.9, driver: 'worker', driverVariant: 9 },
    { coat: chestnutHorseHex, cargo: 'milk', progress: 90, speedMps: 2.45, laneOffset: 5.35, driver: 'worker', driverVariant: 4 },
    { coat: dappleGreyHex, cargo: 'bread', progress: 128, speedMps: 2.7, laneOffset: -5.4, driver: 'farmer', driverVariant: 2 },
  ];
  movingDraySpecs.forEach((spec) => {
    const dray = createParkedDray(spec.coat, spec.cargo);
    const drayDriver = charPool.buildHuman(spec.driver, spec.driverVariant, { seated: true });
    drayDriver.group.scale.setScalar(0.86);
    drayDriver.group.position.set(0, 1.18, -0.15);
    drayDriver.leftArm.rotation.x = -0.52;
    drayDriver.rightArm.rotation.x = -0.52;
    drayDriver.leftElbow.rotation.x = -0.68;
    drayDriver.rightElbow.rotation.x = -0.68;
    dray.root.add(drayDriver.group);
    const pos = sampleCircuitLoop(spec.progress, spec.laneOffset);
    dray.root.position.set(pos.x, getTerrainHeightAndSurface(pos.x, pos.z).height, pos.z);
    dray.root.rotation.y = pos.yaw;
    group.add(dray.root);
    movingDrays.push({
      group: dray.root,
      horseLegs: dray.legPivots,
      horseKnees: dray.kneePivots,
      cartWheels: dray.cartWheels,
      head: dray.headPivot,
      tail: dray.tailPivot,
      progress: spec.progress,
      speedMps: spec.speedMps,
      laneOffset: spec.laneOffset,
      x: pos.x,
      z: pos.z,
    });
    obstacles.push({ x: pos.x, z: pos.z, radius: 1.75 });
  });

  // ---------------------------------------------------------------------------
  // 4. Period Automobiles: Parked Kerbside & Cruising Circuit Rivals
  // ---------------------------------------------------------------------------
  // Kerbside parked vintage motorcars safely clear of the driving line
  const parkedCarSpecs: { x: number; z: number; yaw: number; color: number }[] = [
    { x: -16, z: -5.2, yaw: Math.PI / 2, color: 0x1d2c24 }, // British Racing Green Sunbeam
    { x: 56, z: 5.2, yaw: -Math.PI / 2, color: 0x3b1f22 }, // Claret Wolseley
    { x: -108.5, z: -34, yaw: 0, color: 0x1c2432 }, // Midnight Blue Vauxhall
  ];
  parkedCarSpecs.forEach((spec) => {
    const { cGroup } = createVintageCar(spec.color, false);
    cGroup.position.set(spec.x, getTerrainHeightAndSurface(spec.x, spec.z).height, spec.z);
    cGroup.rotation.y = spec.yaw;
    group.add(cGroup);
  });

  // Moving Period Touring Cars pacing on the circuit (competitive trial rivals)
  const movingCarSpecs = [
    { startProgress: 82, speedMps: 7.4, laneOffset: 2.3, color: 0x5c2224 }, // 1913 Burgundy Roadster
    { startProgress: 520, speedMps: 6.5, laneOffset: -2.2, color: 0x263529 }, // 1912 Deep Green Tourer
  ];
  movingCarSpecs.forEach((ms) => {
    const { cGroup, wheels, headlightBulbs } = createVintageCar(ms.color, true);
    const pos = sampleCircuitLoop(ms.startProgress, ms.laneOffset);
    cGroup.position.set(pos.x, getTerrainHeightAndSurface(pos.x, pos.z).height, pos.z);
    cGroup.rotation.y = pos.yaw;
    group.add(cGroup);

    movingCars.push({
      group: cGroup,
      wheels,
      headlightBulbs,
      progress: ms.startProgress,
      totalDist: ms.startProgress,
      speedMps: ms.speedMps,
      laneOffset: ms.laneOffset,
      x: pos.x,
      z: pos.z,
      yaw: pos.yaw,
    });
    obstacles.push({ x: pos.x, z: pos.z, radius: 1.55 });
  });

  // Animated 1914 Edwardian safety bicycles. The frame is +z forward,
  // the same yaw sampleCircuitLoop gives the cars (atan2(dx, dz)).
  const cyclistSpecs: { startProgress: number; speedMps: number; laneOffset: number; style: CitizenStyle }[] = [
    { startProgress: 210, speedMps: 4.3, laneOffset: 4.1, style: 'gentleman' },
    { startProgress: 840, speedMps: 3.9, laneOffset: -4.1, style: 'worker' },
  ];
  const BIKE_WHEEL_Y = 0.34;
  const BIKE_REAR_Z = -0.52;
  const BIKE_FRONT_Z = 0.64;
  const BIKE_BB_Y = 0.42;
  const BIKE_BB_Z = 0.02;
  const BIKE_SADDLE_Y = 0.9;
  const BIKE_SADDLE_Z = -0.24;
  const BIKE_BAR_Y = 1.06;
  const BIKE_BAR_Z = 0.1;
  const BIKE_PEDAL_R = 0.15;
  const RIDER_SCALE = 0.92;
  // Seated rig: hip joint is local (x, 0.09, 0.04), shoulders local y 0.49.
  const RIDER_HIP_Y = 0.09;
  const RIDER_HIP_Z = 0.04;
  const RIDER_Y = BIKE_SADDLE_Y - RIDER_HIP_Y * RIDER_SCALE;
  const RIDER_Z = BIKE_SADDLE_Z - RIDER_HIP_Z * RIDER_SCALE;
  const riderLocalY = (y: number) => (y - RIDER_Y) / RIDER_SCALE;
  const riderLocalZ = (z: number) => (z - RIDER_Z) / RIDER_SCALE;
  const bikeTireGeo = track(new THREE.TorusGeometry(0.32, 0.024, 6, 16));
  bikeTireGeo.rotateY(Math.PI / 2);
  const bikeSpokeGeo = track(new THREE.CylinderGeometry(0.008, 0.008, 0.62, 5));
  const chainringGeo = track(new THREE.TorusGeometry(0.09, 0.008, 6, 14));
  chainringGeo.rotateY(Math.PI / 2);
  const cogGeo = track(new THREE.TorusGeometry(0.04, 0.007, 5, 10));
  cogGeo.rotateY(Math.PI / 2);
  const pedalGeo = track(new THREE.BoxGeometry(0.09, 0.018, 0.042));
  const saddleGeo = track(new THREE.BoxGeometry(0.14, 0.05, 0.22));
  const barGeo = track(new THREE.BoxGeometry(0.46, 0.025, 0.025));
  cyclistSpecs.forEach((cs, idx) => {
    const cRoot = new THREE.Group();
    cRoot.name = 'edwardian-bicycle';
    const wheels: THREE.Object3D[] = [];
    [BIKE_FRONT_Z, BIKE_REAR_Z].forEach((wz) => {
      const wg = new THREE.Group();
      wg.position.set(0, BIKE_WHEEL_Y, wz);
      const tire = new THREE.Mesh(bikeTireGeo, rubberTyreMat);
      wg.add(tire);
      for (let s = 0; s < 3; s++) {
        const sp = new THREE.Mesh(bikeSpokeGeo, ironWheelMat);
        sp.rotation.x = (s * Math.PI) / 3;
        wg.add(sp);
      }
      cRoot.add(wg);
      wheels.push(wg);
    });
    const addTube = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, radius = 0.015) => {
      const dx = bx - ax;
      const dy = by - ay;
      const dz = bz - az;
      const len = Math.hypot(dx, dy, dz) || 0.001;
      const mesh = new THREE.Mesh(track(new THREE.CylinderGeometry(radius, radius, len, 6)), ironWheelMat);
      mesh.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
      mesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(dx / len, dy / len, dz / len),
      );
      cRoot.add(mesh);
    };
    addTube(0, 0.86, -0.18, 0, 0.98, 0.2);
    addTube(0, 0.96, 0.18, 0, BIKE_BB_Y, BIKE_BB_Z);
    addTube(0, BIKE_BB_Y, BIKE_BB_Z, 0, BIKE_SADDLE_Y - 0.02, BIKE_SADDLE_Z);
    addTube(0, BIKE_BB_Y, BIKE_BB_Z, 0, BIKE_WHEEL_Y, BIKE_REAR_Z);
    addTube(0, 0.78, -0.2, 0, BIKE_WHEEL_Y, BIKE_REAR_Z);
    addTube(0, 0.94, 0.2, 0, BIKE_WHEEL_Y, BIKE_FRONT_Z, 0.013);
    addTube(0.04, 0.9, 0.2, 0.04, BIKE_WHEEL_Y, BIKE_FRONT_Z, 0.012);
    addTube(-0.04, 0.9, 0.2, -0.04, BIKE_WHEEL_Y, BIKE_FRONT_Z, 0.012);
    addTube(0, 0.98, 0.2, 0, BIKE_BAR_Y, BIKE_BAR_Z, 0.014);

    const saddle = new THREE.Mesh(saddleGeo, leatherSeatMat);
    saddle.position.set(0, BIKE_SADDLE_Y, BIKE_SADDLE_Z);
    const handleBar = new THREE.Mesh(barGeo, brassMat);
    handleBar.position.set(0, BIKE_BAR_Y, BIKE_BAR_Z);
    const chainring = new THREE.Mesh(chainringGeo, ironWheelMat);
    chainring.position.set(0.02, BIKE_BB_Y, BIKE_BB_Z);
    const cog = new THREE.Mesh(cogGeo, ironWheelMat);
    cog.position.set(0.02, BIKE_WHEEL_Y, BIKE_REAR_Z);
    cRoot.add(saddle, handleBar, chainring, cog);

    const crank = new THREE.Group();
    crank.position.set(0, BIKE_BB_Y, BIKE_BB_Z);
    const crankArm = new THREE.Mesh(track(new THREE.BoxGeometry(0.016, 0.016, BIKE_PEDAL_R * 2)), ironWheelMat);
    const leftPedal = new THREE.Mesh(pedalGeo, leatherSeatMat);
    leftPedal.position.set(-0.11, 0, BIKE_PEDAL_R);
    const rightPedal = new THREE.Mesh(pedalGeo, leatherSeatMat);
    rightPedal.position.set(0.11, 0, -BIKE_PEDAL_R);
    crank.add(crankArm, leftPedal, rightPedal);
    cRoot.add(crank);

    const rider = charPool.buildHuman(cs.style, idx + 4, { seated: true });
    rider.group.scale.setScalar(RIDER_SCALE);
    rider.group.position.set(0, RIDER_Y, RIDER_Z);
    rider.headPivot.rotation.x = 0.22;
    const gripY = riderLocalY(BIKE_BAR_Y);
    const gripZ = riderLocalZ(BIKE_BAR_Z);
    poseSagittalLimb(rider.leftArm, rider.leftElbow, 0.49, 0, gripY, gripZ, 0.25, 0.24, false);
    poseSagittalLimb(rider.rightArm, rider.rightElbow, 0.49, 0, gripY, gripZ, 0.25, 0.24, false);
    cRoot.add(rider.group);

    const pos = sampleCircuitLoop(cs.startProgress, cs.laneOffset);
    cRoot.position.set(pos.x, getTerrainHeightAndSurface(pos.x, pos.z).height, pos.z);
    cRoot.rotation.y = pos.yaw;
    group.add(cRoot);
    movingCyclists.push({
      group: cRoot,
      wheels,
      crank,
      pedals: [leftPedal, rightPedal],
      leftLeg: rider.leftLeg,
      rightLeg: rider.rightLeg,
      leftKnee: rider.leftKnee,
      rightKnee: rider.rightKnee,
      progress: cs.startProgress,
      speedMps: cs.speedMps,
      laneOffset: cs.laneOffset,
      phase: idx * 1.9,
    });
    obstacles.push({ x: pos.x, z: pos.z, radius: 0.68 });
  });

  // Constable Finch manning the Thames North Speed Trap
  const constableFinch = createPedestrian('constable', 1);
  constellationSetup: {
    constableFinch.group.position.set(
      SPEED_TRAP_ZONE.constableX,
      getTerrainHeightAndSurface(SPEED_TRAP_ZONE.constableX, SPEED_TRAP_ZONE.constableZ, true).height,
      SPEED_TRAP_ZONE.constableZ
    );
    constableFinch.group.rotation.y = -Math.PI / 2;
    addFootDisc(constableFinch.group);
    group.add(constableFinch.group);
  }

  // ---------------------------------------------------------------------------
  // 5. Higher-Definition Coastal Seagulls Wheeling Over Harbour & Sumpter Wharf
  // ---------------------------------------------------------------------------
  const seagulls: Seagull[] = [];
  const innerWingGeo = track(new THREE.BoxGeometry(0.28, 0.03, 0.16));
  const outerWingGeo = track(new THREE.BoxGeometry(0.26, 0.025, 0.11));
  const gullBodyGeo = track(new THREE.CylinderGeometry(0.055, 0.04, 0.42, 7));
  gullBodyGeo.rotateX(Math.PI / 2);
  const gullBeakGeo = track(new THREE.ConeGeometry(0.022, 0.1, 5));
  gullBeakGeo.rotateX(Math.PI / 2);

  for (let g = 0; g < 15; g++) {
    const gGroup = new THREE.Group();
    const body = new THREE.Mesh(gullBodyGeo, gullWhiteMat);
    const beak = new THREE.Mesh(gullBeakGeo, beakMat);
    beak.position.set(0, 0, 0.25);

    const leftWing = new THREE.Group();
    const lwInner = new THREE.Mesh(innerWingGeo, gullWhiteMat);
    lwInner.position.set(0.15, 0, 0);
    const lwOuter = new THREE.Mesh(outerWingGeo, gullTipMat);
    lwOuter.position.set(0.39, -0.02, -0.04);
    lwOuter.rotation.y = -0.25;
    leftWing.add(lwInner, lwOuter);

    const rightWing = new THREE.Group();
    const rwInner = new THREE.Mesh(innerWingGeo, gullWhiteMat);
    rwInner.position.set(-0.15, 0, 0);
    const rwOuter = new THREE.Mesh(outerWingGeo, gullTipMat);
    rwOuter.position.set(-0.39, -0.02, -0.04);
    rwOuter.rotation.y = 0.25;
    rightWing.add(rwInner, rwOuter);

    gGroup.add(body, beak, leftWing, rightWing);
    group.add(gGroup);

    const overStreet =
      g >= 9
        ? [
            { x: -48, z: 4 },
            { x: -10, z: -6 },
            { x: 36, z: 8 },
            { x: 78, z: -4 },
            { x: 95, z: 42 },
            { x: 95, z: 110 },
          ][g - 9]
        : null;
    seagulls.push({
      group: gGroup,
      leftWing,
      rightWing,
      centerX: overStreet ? overStreet.x : 118 + (g % 3) * 14,
      centerZ: overStreet ? overStreet.z : -18 + (g - 4) * 14,
      baseY: overStreet ? 9 + (g % 3) * 2.2 : 11 + (g % 4) * 2.8,
      orbitR: overStreet ? 10 + (g % 3) * 4 : 12 + (g % 3) * 5,
      speed: 0.42 + (g % 3) * 0.11,
      phase: g * 0.85,
    });
  }

  // ---------------------------------------------------------------------------
  // Street animals, a market barrow, flowers, rubbish, a bandstand, the beat
  // ---------------------------------------------------------------------------
  const leafMat = track(new THREE.MeshStandardMaterial({ color: 0x2f6b34, roughness: 0.8 }));
  const petalMat = track(new THREE.MeshStandardMaterial({ color: 0xc4485a, roughness: 0.7 }));
  const petalCreamMat = track(new THREE.MeshStandardMaterial({ color: 0xf0e2a8, roughness: 0.7 }));
  const cabbageMat = track(new THREE.MeshStandardMaterial({ color: 0x3d7a3a, roughness: 0.78 }));
  const paperMat = track(new THREE.MeshStandardMaterial({ color: 0xd9d3c4, roughness: 0.9 }));
  const bottleMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x1f6b45,
      roughness: 0.22,
      metalness: 0.15,
      transparent: true,
      opacity: 0.78,
    })
  );
  const catMats = [
    track(new THREE.MeshStandardMaterial({ color: 0xc47a32, roughness: 0.78 })),
    track(new THREE.MeshStandardMaterial({ color: 0x2a2422, roughness: 0.8 })),
    track(new THREE.MeshStandardMaterial({ color: 0x8d8a86, roughness: 0.8 })),
    track(new THREE.MeshStandardMaterial({ color: 0xe7e2d8, roughness: 0.78 })),
  ];
  const gooseBodyMat = track(new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.72 }));
  const gooseFeetMat = track(new THREE.MeshStandardMaterial({ color: 0xe07a22, roughness: 0.6 }));

  const buildCat = (mat: THREE.Material): { group: THREE.Group; tail: THREE.Object3D } => {
    const cat = new THREE.Group();
    const body = new THREE.Mesh(track(new THREE.BoxGeometry(0.2, 0.16, 0.4, 2, 2, 2)), mat);
    body.position.set(0, 0.22, 0);
    const head = new THREE.Mesh(track(new THREE.BoxGeometry(0.16, 0.14, 0.15, 2, 2, 2)), mat);
    head.position.set(0, 0.32, 0.24);
    const earGeo = track(new THREE.ConeGeometry(0.035, 0.07, 8));
    const earL = new THREE.Mesh(earGeo, mat);
    earL.position.set(-0.045, 0.42, 0.24);
    const earR = new THREE.Mesh(earGeo, mat);
    earR.position.set(0.045, 0.42, 0.24);
    const tailPivot = new THREE.Group();
    tailPivot.position.set(0, 0.28, -0.2);
    const tail = new THREE.Mesh(track(new THREE.CylinderGeometry(0.018, 0.028, 0.28, 10)), mat);
    tail.position.set(0, 0.1, -0.06);
    tail.rotation.x = 0.7;
    tailPivot.add(tail);
    cat.add(body, head, earL, earR, tailPivot);
    return { group: cat, tail: tailPivot };
  };

  const catSpots: { x: number; z: number; sit: boolean; minX: number; maxX: number; minZ: number; maxZ: number }[] = [
    { x: -52, z: 10.15, sit: true, minX: -60, maxX: -44, minZ: 9.55, maxZ: 10.55 },
    { x: 26, z: -10.05, sit: false, minX: 16, maxX: 42, minZ: -10.45, maxZ: -9.35 },
    { x: 86.45, z: 34, sit: true, minX: 85.8, maxX: 87.3, minZ: 26, maxZ: 46 },
    { x: -111.2, z: -6, sit: false, minX: -111.6, maxX: -109.4, minZ: -12, maxZ: 2 },
  ];
  catSpots.forEach((spot, idx) => {
    const cat = buildCat(catMats[idx % catMats.length]);
    const y = getTerrainHeightAndSurface(spot.x, spot.z).height;
    cat.group.position.set(spot.x, y, spot.z);
    group.add(cat.group);
    streetCats.push({
      group: cat.group,
      tail: cat.tail,
      homeX: spot.x,
      homeZ: spot.z,
      x: spot.x,
      z: spot.z,
      yaw: idx % 2 === 0 ? 0 : Math.PI,
      minX: spot.minX,
      maxX: spot.maxX,
      minZ: spot.minZ,
      maxZ: spot.maxZ,
      sit: spot.sit,
      flee: 0,
      phase: idx * 1.7,
    });
  });

  const buildGoose = (): { group: THREE.Group; leftWing: THREE.Object3D; rightWing: THREE.Object3D; neck: THREE.Object3D } => {
    const goose = new THREE.Group();
    const body = new THREE.Mesh(track(new THREE.SphereGeometry(0.16, 16, 12)), gooseBodyMat);
    body.scale.set(1, 0.72, 1.45);
    body.position.set(0, 0.36, 0);
    const neck = new THREE.Group();
    neck.position.set(0, 0.42, 0.16);
    const neckMesh = new THREE.Mesh(track(new THREE.CylinderGeometry(0.03, 0.04, 0.22, 12)), gooseBodyMat);
    neckMesh.position.set(0, 0.1, 0.04);
    neckMesh.rotation.x = -0.5;
    const head = new THREE.Mesh(track(new THREE.SphereGeometry(0.055, 12, 10)), gooseBodyMat);
    head.position.set(0, 0.22, 0.1);
    const beak = new THREE.Mesh(track(new THREE.ConeGeometry(0.02, 0.09, 8)), gooseFeetMat);
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.21, 0.16);
    neck.add(neckMesh, head, beak);
    const wingGeo = track(new THREE.BoxGeometry(0.05, 0.1, 0.22, 1, 2, 4));
    const leftWing = new THREE.Mesh(wingGeo, gooseBodyMat);
    leftWing.position.set(0.14, 0.38, 0);
    const rightWing = new THREE.Mesh(wingGeo, gooseBodyMat);
    rightWing.position.set(-0.14, 0.38, 0);
    const legGeo = track(new THREE.CylinderGeometry(0.012, 0.012, 0.18, 8));
    [-0.05, 0.05].forEach((lx) => {
      const leg = new THREE.Mesh(legGeo, gooseFeetMat);
      leg.position.set(lx, 0.1, 0.02);
      goose.add(leg);
    });
    goose.add(body, neck, leftWing, rightWing);
    return { group: goose, leftWing, rightWing, neck };
  };

  // Geese keep to the south kerb of Harbour Street and a short stretch of the quay.
  const gooseSpots: { x: number; z: number; minX: number; maxX: number; minZ: number; maxZ: number }[] = [
    { x: 42, z: 9.7, minX: 34, maxX: 58, minZ: 9.35, maxZ: 10.45 },
    { x: 46, z: 10.05, minX: 34, maxX: 58, minZ: 9.35, maxZ: 10.45 },
    { x: 50, z: 9.55, minX: 34, maxX: 58, minZ: 9.35, maxZ: 10.45 },
    { x: 54, z: 10.15, minX: 34, maxX: 58, minZ: 9.35, maxZ: 10.45 },
    { x: 86.5, z: 28, minX: 85.9, maxX: 87.2, minZ: 20, maxZ: 40 },
    { x: 86.2, z: 32, minX: 85.9, maxX: 87.2, minZ: 20, maxZ: 40 },
  ];
  gooseSpots.forEach((spot, idx) => {
    const goose = buildGoose();
    const y = getTerrainHeightAndSurface(spot.x, spot.z).height;
    goose.group.position.set(spot.x, y, spot.z);
    group.add(goose.group);
    streetGeese.push({
      group: goose.group,
      leftWing: goose.leftWing,
      rightWing: goose.rightWing,
      neck: goose.neck,
      x: spot.x,
      z: spot.z,
      yaw: 0.4,
      minX: spot.minX,
      maxX: spot.maxX,
      minZ: spot.minZ,
      maxZ: spot.maxZ,
      flee: 0,
      phase: idx * 1.3,
    });
  });

  // Market-garden barrow on the north kerb. The seller uses the farmer rig.
  {
    const barrow = new THREE.Group();
    const bx = 30;
    const bz = -8.7;
    barrow.position.set(bx, getTerrainHeightAndSurface(bx, bz).height, bz);
    const bed = new THREE.Mesh(track(new THREE.BoxGeometry(0.85, 0.16, 1.25)), timberCartMat);
    bed.position.set(0, 0.48, 0);
    const wheel = new THREE.Mesh(track(new THREE.CylinderGeometry(0.18, 0.18, 0.08, 10)), ironWheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(0, 0.2, 0.48);
    [-0.36, 0.36].forEach((hx) => {
      const handle = new THREE.Mesh(track(new THREE.BoxGeometry(0.04, 0.04, 0.7)), timberCartMat);
      handle.position.set(hx, 0.7, -0.7);
      handle.rotation.x = -0.45;
      barrow.add(handle);
    });
    const cabbageGeo = track(new THREE.SphereGeometry(0.11, 8, 6));
    [[-0.2, 0.12], [0.18, 0.08], [0, 0.22], [-0.12, -0.16], [0.2, -0.18]].forEach(([cx, cz], i) => {
      const cabbage = new THREE.Mesh(cabbageGeo, cabbageMat);
      cabbage.scale.set(1, 0.75, 1);
      cabbage.position.set(cx, 0.64 + (i % 2) * 0.06, cz);
      barrow.add(cabbage);
    });
    const signCanvas = document.createElement('canvas');
    signCanvas.width = 256;
    signCanvas.height = 64;
    const sctx = signCanvas.getContext('2d')!;
    sctx.fillStyle = '#f4efe4';
    sctx.fillRect(0, 0, 256, 64);
    sctx.strokeStyle = '#241c14';
    sctx.lineWidth = 8;
    sctx.strokeRect(6, 6, 244, 52);
    sctx.fillStyle = '#1d3a24';
    sctx.font = 'bold 34px Georgia, serif';
    sctx.textAlign = 'center';
    sctx.textBaseline = 'middle';
    sctx.fillText('VEGETABLES', 128, 34);
    const signTex = track(new THREE.CanvasTexture(signCanvas));
    signTex.colorSpace = THREE.SRGBColorSpace;
    const signMat = track(new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.8 }));
    const sign = new THREE.Mesh(track(new THREE.BoxGeometry(0.72, 0.2, 0.03)), signMat);
    sign.position.set(0, 0.95, 0.2);
    barrow.add(bed, wheel, sign);
    group.add(barrow);
    obstacles.push({ x: bx, z: bz, radius: 0.95 });

    const seller = createPedestrian('farmer', 1);
    seller.group.position.set(bx, getTerrainHeightAndSurface(bx, bz - 1.15).height, bz - 1.15);
    seller.group.rotation.y = 0;
    seller.leftArm.rotation.x = -0.7;
    seller.rightArm.rotation.x = -0.7;
    seller.leftElbow.rotation.x = -0.4;
    seller.rightElbow.rotation.x = -0.4;
    addFootDisc(seller.group);
    group.add(seller.group);
    const customer = createPedestrian('lady', 5);
    customer.group.position.set(bx + 1.15, getTerrainHeightAndSurface(bx + 1.15, bz + 0.2).height, bz + 0.35);
    customer.group.rotation.y = -1.4;
    addFootDisc(customer.group);
    group.add(customer.group);
    spectators.push({
      group: customer.group,
      head: customer.headPivot,
      arms: [customer.leftArm, customer.rightArm],
      elbows: [customer.leftElbow, customer.rightElbow],
      phase: 2.2,
      mode: 'discussing',
    });
  }

  // Timber bandstand in Tyne Street, south of the cart barrier and off Harbour Street.
  {
    const stand = new THREE.Group();
    const sx = -24;
    const sz = 22;
    stand.position.set(sx, getTerrainHeightAndSurface(sx, sz).height, sz);
    const deck = new THREE.Mesh(track(new THREE.CylinderGeometry(2.15, 2.15, 0.16, 8)), timberCartMat);
    deck.position.y = 0.28;
    const roof = new THREE.Mesh(track(new THREE.ConeGeometry(2.7, 1.15, 8)), barrierRedMat);
    roof.position.y = 3.15;
    const finial = new THREE.Mesh(track(new THREE.SphereGeometry(0.1, 8, 6)), brassMat);
    finial.position.y = 3.78;
    for (let p = 0; p < 8; p++) {
      const ang = (p / 8) * Math.PI * 2;
      const post = new THREE.Mesh(track(new THREE.CylinderGeometry(0.06, 0.07, 2.55, 6)), timberCartMat);
      post.position.set(Math.cos(ang) * 1.95, 1.55, Math.sin(ang) * 1.95);
      const rail = new THREE.Mesh(track(new THREE.BoxGeometry(1.45, 0.06, 0.06)), timberCartMat);
      rail.position.set(Math.cos(ang + Math.PI / 8) * 1.95, 0.85, Math.sin(ang + Math.PI / 8) * 1.95);
      rail.rotation.y = -ang - Math.PI / 8;
      stand.add(post, rail);
    }
    stand.add(deck, roof, finial);
    group.add(stand);
    obstacles.push({ x: sx, z: sz, radius: 2.2 });

    const band: { dx: number; dz: number; style: CitizenStyle; mode: IdleSpectator['mode'] }[] = [
      { dx: 0, dz: 0.2, style: 'gentleman', mode: 'cheering' },
      { dx: -0.85, dz: -0.35, style: 'worker', mode: 'cheering' },
      { dx: 0.85, dz: -0.25, style: 'schoolboy', mode: 'watching' },
    ];
    band.forEach((m, mi) => {
      const ped = createPedestrian(m.style, 11 + mi);
      ped.group.position.set(m.dx, 0.38, m.dz);
      ped.group.rotation.y = Math.atan2(-m.dx, -m.dz);
      if (mi < 2) {
        const horn = new THREE.Mesh(track(new THREE.CylinderGeometry(0.03, 0.055, 0.42, 8)), brassMat);
        horn.rotation.x = Math.PI / 2;
        horn.position.set(0.12, 1.25, 0.28);
        ped.group.add(horn);
      } else {
        const drum = new THREE.Mesh(track(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 10)), barrierWhiteMat);
        drum.position.set(0, 0.95, 0.22);
        ped.group.add(drum);
      }
      addFootDisc(ped.group);
      stand.add(ped.group);
      spectators.push({
        group: ped.group,
        head: ped.headPivot,
        arms: [ped.leftArm, ped.rightArm],
        elbows: [ped.leftElbow, ped.rightElbow],
        phase: mi * 0.8,
        mode: m.mode,
      });
    });

    const stemGeo = track(new THREE.CylinderGeometry(0.012, 0.012, 0.28, 4));
    const bloomGeo = track(new THREE.SphereGeometry(0.06, 6, 5));
    for (let f = 0; f < 10; f++) {
      const ang = (f / 10) * Math.PI * 2;
      const fx = sx + Math.cos(ang) * 2.7;
      const fz = sz + Math.sin(ang) * 2.7;
      const stem = new THREE.Mesh(stemGeo, leafMat);
      const bloom = new THREE.Mesh(bloomGeo, f % 2 === 0 ? petalMat : petalCreamMat);
      const y = getTerrainHeightAndSurface(fx, fz).height;
      stem.position.set(fx, y + 0.14, fz);
      bloom.position.set(fx, y + 0.32, fz);
      group.add(stem, bloom);
    }
  }

  // A short flower row on the Criterion front, and a little street rubbish. Not a tip.
  {
    const stemGeo = track(new THREE.CylinderGeometry(0.012, 0.012, 0.26, 4));
    const bloomGeo = track(new THREE.SphereGeometry(0.055, 6, 5));
    for (let f = 0; f < 7; f++) {
      const fx = -62 + f * 0.55;
      const fz = 10.62;
      const y = getTerrainHeightAndSurface(fx, fz).height;
      const stem = new THREE.Mesh(stemGeo, leafMat);
      const bloom = new THREE.Mesh(bloomGeo, f % 2 === 0 ? petalCreamMat : petalMat);
      stem.position.set(fx, y + 0.13, fz);
      bloom.position.set(fx, y + 0.28, fz);
      group.add(stem, bloom);
    }
    const scraps: { x: number; z: number; kind: 'paper' | 'bottle' | 'crate' }[] = [
      { x: -44.5, z: 10.35, kind: 'bottle' },
      { x: -43.6, z: 10.15, kind: 'paper' },
      { x: 38, z: -10.2, kind: 'paper' },
      { x: 39.1, z: -9.85, kind: 'bottle' },
      { x: 86.4, z: 52, kind: 'crate' },
      { x: 86.1, z: 52.6, kind: 'paper' },
    ];
    scraps.forEach((sc) => {
      const y = getTerrainHeightAndSurface(sc.x, sc.z).height;
      let mesh: THREE.Mesh;
      if (sc.kind === 'bottle') {
        mesh = new THREE.Mesh(track(new THREE.CylinderGeometry(0.035, 0.04, 0.18, 6)), bottleMat);
        mesh.position.set(sc.x, y + 0.09, sc.z);
        mesh.rotation.z = 0.9;
      } else if (sc.kind === 'paper') {
        mesh = new THREE.Mesh(track(new THREE.BoxGeometry(0.22, 0.012, 0.16)), paperMat);
        mesh.position.set(sc.x, y + 0.02, sc.z);
        mesh.rotation.y = 0.6;
      } else {
        mesh = new THREE.Mesh(track(new THREE.BoxGeometry(0.38, 0.28, 0.32)), burlapMat);
        mesh.position.set(sc.x, y + 0.14, sc.z);
        mesh.rotation.y = 0.3;
      }
      group.add(mesh);
    });
  }

  // Harbour Street beat. He walks the north kerb until the driving gets reckless.
  {
    const cop = createPedestrian('constable', 4);
    const hx = -48;
    const hz = -9.62;
    cop.group.position.set(hx, getTerrainHeightAndSurface(hx, hz).height, hz);
    cop.group.rotation.y = 0;
    addFootDisc(cop.group);
    group.add(cop.group);
    beatConstables.push({
      group: cop.group,
      leftLeg: cop.leftLeg,
      rightLeg: cop.rightLeg,
      leftKnee: cop.leftKnee,
      rightKnee: cop.rightKnee,
      leftArm: cop.leftArm,
      rightArm: cop.rightArm,
      leftElbow: cop.leftElbow,
      rightElbow: cop.rightElbow,
      head: cop.headPivot,
      homeX: hx,
      homeZ: hz,
      x: hx,
      z: hz,
      yaw: 0,
      speed: 0,
      chasing: false,
      chaseLeft: 0,
      phase: 0.6,
    });
  }

  // ---------------------------------------------------------------------------
  // 6. Scottish Bagpiper ("Angus MacLeod") — Strolls, Flees Fast, Still Hittable
  // ---------------------------------------------------------------------------
  const tartanCanvas = document.createElement('canvas');
  tartanCanvas.width = 64;
  tartanCanvas.height = 64;
  const tCtx = tartanCanvas.getContext('2d')!;
  tCtx.fillStyle = '#8b1e24';
  tCtx.fillRect(0, 0, 64, 64);
  tCtx.fillStyle = '#194a30';
  tCtx.fillRect(0, 12, 64, 18);
  tCtx.fillRect(12, 0, 18, 64);
  tCtx.fillStyle = '#182442';
  tCtx.fillRect(0, 42, 64, 10);
  tCtx.fillRect(42, 0, 10, 64);
  tCtx.fillStyle = '#e5be4b';
  tCtx.fillRect(0, 20, 64, 2);
  tCtx.fillRect(20, 0, 2, 64);
  tCtx.fillStyle = '#f2ede2';
  tCtx.fillRect(0, 56, 64, 2);
  tCtx.fillRect(56, 0, 2, 64);
  const tartanTex = track(new THREE.CanvasTexture(tartanCanvas));
  tartanTex.colorSpace = THREE.SRGBColorSpace;
  tartanTex.wrapS = THREE.RepeatWrapping;
  tartanTex.wrapT = THREE.RepeatWrapping;
  tartanTex.repeat.set(2, 2);

  const tartanMat = track(new THREE.MeshStandardMaterial({ map: tartanTex, roughness: 0.85 }));
  const droneWoodMat = track(new THREE.MeshStandardMaterial({ color: 0x1d1410, roughness: 0.45 }));

  const piperGroup = new THREE.Group();
  const piperBodyPivot = new THREE.Group();
  piperGroup.add(piperBodyPivot);

  const piperRig = charPool.buildHuman('piper', 0);
  piperBodyPivot.add(piperRig.group);
  addFootDisc(piperRig.group);

  const piperLegs = [piperRig.leftLeg, piperRig.rightLeg];
  const piperKnees = [piperRig.leftKnee, piperRig.rightKnee];
  const piperHead = piperRig.headPivot;
  const piperArms = [piperRig.leftArm, piperRig.rightArm];
  const piperElbows = [piperRig.leftElbow, piperRig.rightElbow];
  piperArms[0].rotation.set(-0.34, 0, 0.25);
  piperArms[1].rotation.set(-0.38, 0, -0.35);
  piperElbows[0].rotation.x = -0.68;
  piperElbows[1].rotation.x = -0.76;

  // Great Highland Bagpipes (tartan bag, blowpipe, chanter, 3 brass-ferruled drones)
  const pipesGroup = new THREE.Group();
  pipesGroup.position.set(-0.14, 1.24, 0.18);
  const airbag = new THREE.Mesh(track(new THREE.SphereGeometry(0.16, 12, 10)), tartanMat);
  airbag.scale.set(0.85, 0.92, 1.38);
  airbag.castShadow = true;
  const chanter = new THREE.Mesh(track(new THREE.CylinderGeometry(0.016, 0.028, 0.42, 8)), droneWoodMat);
  chanter.position.set(0.14, -0.12, 0.18);
  chanter.rotation.x = 0.55;
  const chanterRing = new THREE.Mesh(track(new THREE.CylinderGeometry(0.032, 0.032, 0.03, 8)), brassMat);
  chanterRing.position.set(0.14, -0.27, 0.28);
  chanterRing.rotation.x = 0.55;
  const blowpipe = new THREE.Mesh(track(new THREE.CylinderGeometry(0.014, 0.014, 0.28, 6)), droneWoodMat);
  blowpipe.position.set(0.09, 0.18, 0.05);
  blowpipe.rotation.set(0.35, 0, -0.35);
  pipesGroup.add(airbag, chanter, chanterRing, blowpipe);

  const droneSpecs: [number, number, number, number][] = [
    [-0.08, 0.38, -0.24, 0.72], // Bass drone
    [-0.02, 0.30, -0.16, 0.52], // Tenor drone 1
    [0.04, 0.30, -0.09, 0.52], // Tenor drone 2
  ];
  droneSpecs.forEach(([dx, dy, dz, len]) => {
    const drone = new THREE.Mesh(track(new THREE.CylinderGeometry(0.018, 0.015, len, 8)), droneWoodMat);
    drone.position.set(dx, dy, dz);
    drone.rotation.x = -0.58;
    drone.rotation.z = 0.18;
    const bell = new THREE.Mesh(track(new THREE.CylinderGeometry(0.034, 0.02, 0.08, 8)), brassMat);
    bell.position.set(dx - 0.05, dy + Math.cos(0.58) * (len * 0.46), dz - Math.sin(0.58) * (len * 0.46));
    bell.rotation.x = -0.58;
    bell.rotation.z = 0.18;
    pipesGroup.add(drone, bell);
  });
  piperRig.group.add(pipesGroup);

  const piper = {
    x: -10,
    z: 4.2,
    yaw: Math.PI / 2,
    vx: 0,
    vz: 0,
    patrolDir: 1 as 1 | -1,
    state: 'playing' as 'playing' | 'fleeing' | 'down',
    panicTimer: 0,
    downTimer: 0,
    panicLevel: 0,
    dodgeSeed: 1,
    justHit: false,
  };
  piperGroup.position.set(piper.x, getTerrainHeightAndSurface(piper.x, piper.z).height, piper.z);
  group.add(piperGroup);

  const shortestAngleDiff = (from: number, to: number): number => {
    let diff = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (diff < -Math.PI) diff += Math.PI * 2;
    return diff;
  };

  return {
    group,
    update: (
      dt: number,
      elapsed: number,
      windMps: number,
      lightsOn: boolean,
      player?: PlayerTrafficContext
    ) => {
      // Animate cheering, conversing & watching citizens
      for (let i = 0; i < spectators.length; i++) {
        const sp = spectators[i];
        if (sp.mode === 'cheering') {
          sp.arms[0].rotation.x = -2.0 + Math.sin(elapsed * 4.8 + sp.phase) * 0.42;
          sp.elbows[0].rotation.x = -0.35 + Math.cos(elapsed * 4.8 + sp.phase) * 0.18;
          sp.arms[1].rotation.x = -0.35 + Math.cos(elapsed * 3.2 + sp.phase) * 0.18;
          sp.elbows[1].rotation.x = -0.25;
          sp.head.rotation.y = Math.sin(elapsed * 1.8 + sp.phase) * 0.16;
        } else if (sp.mode === 'discussing') {
          sp.arms[0].rotation.x = -0.65 + Math.sin(elapsed * 3.8 + sp.phase) * 0.25;
          sp.arms[0].rotation.z = -0.18 + Math.cos(elapsed * 2.6 + sp.phase) * 0.12;
          sp.elbows[0].rotation.x = -0.68 + Math.sin(elapsed * 3.8 + sp.phase) * 0.15;
          sp.arms[1].rotation.x = -0.35 + Math.cos(elapsed * 2.9 + sp.phase) * 0.2;
          sp.elbows[1].rotation.x = -0.45;
          sp.head.rotation.x = Math.sin(elapsed * 2.4 + sp.phase) * 0.14;
          sp.head.rotation.y = Math.sin(elapsed * 1.5 + sp.phase * 1.3) * 0.28;
        } else {
          sp.arms[0].rotation.x = Math.sin(elapsed * 1.4 + sp.phase) * 0.08;
          sp.elbows[0].rotation.x = -0.15;
          sp.arms[1].rotation.x = -Math.sin(elapsed * 1.4 + sp.phase) * 0.08;
          sp.elbows[1].rotation.x = -0.15;
          sp.head.rotation.y = Math.sin(elapsed * 0.9 + sp.phase) * 0.24;
        }
      }

      const pX = player?.x ?? -9999;
      const pZ = player?.z ?? -9999;
      const pYaw = player?.yaw ?? 0;
      const pSpeed = player?.speedMps ?? 0;
      const badDrive = player?.badDrivingIntensity ?? 0;
      const hornFired = player?.hornJustFired ?? false;

      // Animate strolling footpath pedestrians (with startle / step-back evasion when car drives recklessly close)
      for (let i = 0; i < walkers.length; i++) {
        const w = walkers[i];
        const segLen = Math.hypot(w.x2 - w.x1, w.z2 - w.z1) || 1;
        const curX = w.x1 + (w.x2 - w.x1) * w.progress;
        const curZ = w.z1 + (w.z2 - w.z1) * w.progress;
        const distCar = Math.hypot(pX - curX, pZ - curZ);

        if (distCar < 11.5 && (pSpeed > 5.0 || badDrive > 0.25 || hornFired)) {
          w.evadeTimer = Math.max(w.evadeTimer, 1.8);
        } else {
          w.evadeTimer = Math.max(0, w.evadeTimer - dt);
        }

        if (w.evadeTimer > 0) {
          // Pause, face the reckless car, and raise arms in alarm
          const wy = getTerrainHeightAndSurface(curX, curZ).height;
          w.group.position.set(curX, wy + Math.abs(Math.sin(elapsed * 9 + w.phase)) * 0.04, curZ);
          w.group.rotation.y = Math.atan2(pX - curX, pZ - curZ);
          w.group.rotation.z = 0;
          w.leftLeg.rotation.x = THREE.MathUtils.damp(w.leftLeg.rotation.x, 0, 12, dt);
          w.rightLeg.rotation.x = THREE.MathUtils.damp(w.rightLeg.rotation.x, 0, 12, dt);
          w.leftKnee.rotation.x = THREE.MathUtils.damp(w.leftKnee.rotation.x, 0, 12, dt);
          w.rightKnee.rotation.x = THREE.MathUtils.damp(w.rightKnee.rotation.x, 0, 12, dt);
          w.leftArm.rotation.x = -1.9 + Math.sin(elapsed * 8 + w.phase) * 0.35;
          w.rightArm.rotation.x = -1.7 + Math.cos(elapsed * 8 + w.phase) * 0.35;
          w.leftElbow.rotation.x = -0.45;
          w.rightElbow.rotation.x = -0.45;
        } else {
          const unsteady = w.gait === 'unsteady';
          const paused = unsteady && Math.sin(elapsed * 0.55 + w.phase) > 0.62;
          if (!paused) {
            w.progress += (w.speed / segLen) * dt * w.dir;
          }
          if (w.progress >= 1) {
            w.progress = 1;
            w.dir = -1;
          } else if (w.progress <= 0) {
            w.progress = 0;
            w.dir = 1;
          }
          const wx = w.x1 + (w.x2 - w.x1) * w.progress;
          const wz = w.z1 + (w.z2 - w.z1) * w.progress;
          const wy = getTerrainHeightAndSurface(wx, wz).height;
          const sway = unsteady ? Math.sin(elapsed * 1.7 + w.phase) : 0;
          w.group.position.set(wx, wy + Math.abs(sway) * 0.045, wz);
          const dirX = (w.x2 - w.x1) * w.dir;
          const dirZ = (w.z2 - w.z1) * w.dir;
          w.group.rotation.y = Math.atan2(dirX, dirZ);
          w.group.rotation.z = sway * 0.16;

          const phase = elapsed * w.speed * (unsteady ? 3.1 : 4.5) + w.phase;
          const stride = Math.sin(phase) * (unsteady ? 0.26 : 0.48);
          w.leftLeg.rotation.x = stride;
          w.rightLeg.rotation.x = -stride;
          w.leftKnee.rotation.x = Math.max(0, -Math.cos(phase)) * (unsteady ? 0.3 : 0.48);
          w.rightKnee.rotation.x = Math.max(0, Math.cos(phase)) * (unsteady ? 0.3 : 0.48);
          w.leftArm.rotation.x = -stride * 0.65;
          w.rightArm.rotation.x = stride * 0.65;
          w.leftElbow.rotation.x = -0.25 - Math.max(0, -stride) * 0.25;
          w.rightElbow.rotation.x = -0.25 - Math.max(0, stride) * 0.25;
        }
      }

      // Animate horses (toss head & snort if startled by crash or horn)
      let peakHorseStartle = 0;
      for (let i = 0; i < idleAnimals.length; i++) {
        const an = idleAnimals[i];
        const hd = Math.hypot(pX - an.x, pZ - an.z);
        if (hd < 17 && (badDrive > 0.35 || hornFired)) {
          an.startleTimer = Math.max(an.startleTimer, 2.2);
        } else {
          an.startleTimer = Math.max(0, an.startleTimer - dt);
        }
        if (an.startleTimer > 0) {
          an.head.rotation.x = -0.32 + Math.sin(elapsed * 11 + an.phase) * 0.22;
          an.tail.rotation.z = Math.sin(elapsed * 12 + an.phase) * 0.45;
          if (hd < 24) {
            peakHorseStartle = Math.max(peakHorseStartle, Math.min(1, an.startleTimer / 1.5) * (1 - hd / 24));
          }
        } else {
          an.head.rotation.x = 0.22 + Math.sin(elapsed * 1.3 + an.phase) * 0.14;
          an.tail.rotation.z = Math.sin(elapsed * 3.8 + an.phase) * 0.24;
        }
      }
      latestHorseStartle = peakHorseStartle;

      // Animate farm collies: bark at the car, and chasers dash after/alongside it
      let peakBark = 0;
      let peakDogX = 0;
      let peakDogZ = 0;
      let chasingCount = 0;

      for (let i = 0; i < dogs.length; i++) {
        const dg = dogs[i];
        const distToCar = Math.hypot(pX - dg.x, pZ - dg.z);
        const distHomeToCar = Math.hypot(pX - dg.homeX, pZ - dg.homeZ);

        const provokedByMotion = distToCar < 25 && pSpeed > 1.3;
        const provokedByBadDriving = distToCar < 36 && badDrive > 0.12;
        const provokedByHorn = distToCar < 32 && hornFired;
        const wantsBark = provokedByMotion || provokedByBadDriving || provokedByHorn;

        const targetBark = wantsBark
          ? Math.min(1, 0.45 + (1 - Math.min(1, distToCar / 30)) * 0.55 + badDrive * 0.45)
          : 0;
        dg.barkLevel = THREE.MathUtils.damp(dg.barkLevel, targetBark, targetBark > dg.barkLevel ? 10 : 3.2, dt);

        // Decide whether this collie chases the car
        const withinTerritory = distHomeToCar < 46 && Math.hypot(dg.x - dg.homeX, dg.z - dg.homeZ) < 48;
        const startChaseTrigger =
          dg.canChase &&
          distHomeToCar < 28 &&
          (pSpeed > 2.2 || badDrive > 0.15 || hornFired);

        if (startChaseTrigger) {
          dg.isChasing = true;
        } else if (!withinTerritory || (!wantsBark && distToCar > 26)) {
          dg.isChasing = false;
        }

        let targetX = dg.homeX;
        let targetZ = dg.homeZ;
        let desiredSpeed = 0;

        if (dg.isChasing) {
          chasingCount += 1;
          // Target alongside & slightly behind the Model T so the dog runs visibly near the flanks
          const fwdX = Math.sin(pYaw);
          const fwdZ = Math.cos(pYaw);
          const rightX = Math.cos(pYaw);
          const rightZ = -Math.sin(pYaw);
          targetX = pX - fwdX * 2.1 + rightX * dg.flankSign * 2.1;
          targetZ = pZ - fwdZ * 2.1 + rightZ * dg.flankSign * 2.1;
          const distTarget = Math.hypot(targetX - dg.x, targetZ - dg.z);
          desiredSpeed = distTarget > 0.9 ? Math.min(9.4, Math.max(4.8, pSpeed + 1.8)) : pSpeed * 0.85;
        } else {
          const distHome = Math.hypot(dg.homeX - dg.x, dg.homeZ - dg.z);
          if (distHome > 0.35) {
            desiredSpeed = 3.8;
          }
        }

        dg.speed = THREE.MathUtils.damp(dg.speed, desiredSpeed, 7.5, dt);

        if (dg.speed > 0.2) {
          const toX = targetX - dg.x;
          const toZ = targetZ - dg.z;
          const distT = Math.hypot(toX, toZ) || 1;
          let stepX = (toX / distT) * dg.speed * dt;
          let stepZ = (toZ / distT) * dg.speed * dt;

          let nextX = dg.x + stepX;
          let nextZ = dg.z + stepZ;

          // Keep chasing dog outside building footprints & clear of clipping inside car center
          const carDx = nextX - pX;
          const carDz = nextZ - pZ;
          const carD = Math.hypot(carDx, carDz);
          if (carD < 1.85 && carD > 0.001) {
            nextX = pX + (carDx / carD) * 1.85;
            nextZ = pZ + (carDz / carD) * 1.85;
          }
          for (let c = 0; c < WORLD_COLLIDERS.length; c++) {
            const box = WORLD_COLLIDERS[c];
            if (
              nextX > box.minX - 0.5 &&
              nextX < box.maxX + 0.5 &&
              nextZ > box.minZ - 0.5 &&
              nextZ < box.maxZ + 0.5
            ) {
              // Slide along outside of collider
              const dxMin = Math.abs(nextX - (box.minX - 0.5));
              const dxMax = Math.abs(box.maxX + 0.5 - nextX);
              const dzMin = Math.abs(nextZ - (box.minZ - 0.5));
              const dzMax = Math.abs(box.maxZ + 0.5 - nextZ);
              const m = Math.min(dxMin, dxMax, dzMin, dzMax);
              if (m === dxMin) nextX = box.minX - 0.5;
              else if (m === dxMax) nextX = box.maxX + 0.5;
              else if (m === dzMin) nextZ = box.minZ - 0.5;
              else nextZ = box.maxZ + 0.5;
            }
          }

          const moveYaw = Math.atan2(nextX - dg.x, nextZ - dg.z);
          if (Math.hypot(nextX - dg.x, nextZ - dg.z) > 0.005) {
            dg.yaw += shortestAngleDiff(dg.yaw, moveYaw) * Math.min(1, dt * 11);
          }
          dg.x = nextX;
          dg.z = nextZ;
          stepX = 0;
          stepZ = 0;
          void stepX;
          void stepZ;
        } else if (dg.barkLevel > 0.15) {
          // Turn toward the car to bark at the driver
          const faceYaw = Math.atan2(pX - dg.x, pZ - dg.z);
          dg.yaw += shortestAngleDiff(dg.yaw, faceYaw) * Math.min(1, dt * 9);
        } else {
          dg.yaw += shortestAngleDiff(dg.yaw, dg.homeYaw) * Math.min(1, dt * 4);
        }

        const groundY = getTerrainHeightAndSurface(dg.x, dg.z).height;
        const hopY =
          dg.speed > 0.5
            ? Math.abs(Math.sin(elapsed * 14 + dg.phase)) * 0.08
            : dg.barkLevel > 0.25
              ? Math.max(0, Math.sin(elapsed * 11 + dg.phase)) * 0.07 * dg.barkLevel
              : 0;
        dg.group.position.set(dg.x, groundY + hopY, dg.z);
        dg.group.rotation.y = dg.yaw;

        // Stride / gallop animation with knee flexion
        if (dg.speed > 0.4) {
          const gallop = Math.sin(elapsed * 14 + dg.phase) * 0.68;
          dg.legs[0].rotation.x = gallop;
          dg.legs[1].rotation.x = gallop * 0.85;
          dg.legs[2].rotation.x = -gallop;
          dg.legs[3].rotation.x = -gallop * 0.85;
          dg.knees[0].rotation.x = Math.max(0, -gallop) * 0.55;
          dg.knees[1].rotation.x = Math.max(0, -gallop) * 0.5;
          dg.knees[2].rotation.x = Math.max(0, gallop) * 0.55;
          dg.knees[3].rotation.x = Math.max(0, gallop) * 0.5;
        } else {
          for (let l = 0; l < 4; l++) {
            dg.legs[l].rotation.x = THREE.MathUtils.damp(dg.legs[l].rotation.x, 0, 10, dt);
            dg.knees[l].rotation.x = THREE.MathUtils.damp(dg.knees[l].rotation.x, 0, 10, dt);
          }
        }

        // Snappy bark head-toss & furious tail wag
        if (dg.barkLevel > 0.12) {
          const barkPulse = Math.max(0, Math.sin(elapsed * 13 + dg.phase));
          dg.head.rotation.x = -0.22 - barkPulse * 0.28 * dg.barkLevel;
          dg.head.rotation.y = Math.sin(elapsed * 3.5 + dg.phase) * 0.12;
          dg.tail.rotation.z = Math.sin(elapsed * 18 + dg.phase) * 0.55;
        } else {
          dg.head.rotation.x = THREE.MathUtils.damp(dg.head.rotation.x, 0, 8, dt);
          dg.head.rotation.y = Math.sin(elapsed * 2.2 + dg.phase) * 0.26;
          dg.tail.rotation.z = Math.sin(elapsed * 9.5 + dg.phase) * 0.35;
        }

        if (dg.barkLevel > 0.08 && distToCar < 38) {
          const prox = Math.max(0, 1 - Math.max(0, distToCar - 4) / 34);
          const contrib = dg.barkLevel * prox;
          if (contrib > peakBark) {
            peakBark = contrib;
            peakDogX = dg.x;
            peakDogZ = dg.z;
          }
        }
      }

      // Trigger sheep panic & herd contagion when driving badly, fast, on grass, or honking nearby
      for (let i = 0; i < sheepList.length; i++) {
        const sh = sheepList[i];
        const distToCar = Math.hypot(pX - sh.x, pZ - sh.z);
        const badNear = distToCar < 34 && badDrive > 0.08;
        const hornNear = distToCar < 35 && hornFired;
        const fastNear = distToCar < 28 && pSpeed > 6.0;
        const grassNear = distToCar < 28 && player?.surface === 'grass' && pSpeed > 1.8;
        const tooClose = distToCar < 13.5;

        if (badNear || hornNear || fastNear || grassNear || tooClose) {
          sh.panicTimer = Math.max(sh.panicTimer, 4.4);
        }
      }
      // Herd contagion: if one sheep panics, nearby flockmates also bolt
      for (let i = 0; i < sheepList.length; i++) {
        if (sheepList[i].panicTimer > 3.2) {
          for (let j = 0; j < sheepList.length; j++) {
            if (i === j) continue;
            const herdDist = Math.hypot(sheepList[i].x - sheepList[j].x, sheepList[i].z - sheepList[j].z);
            if (herdDist < 12) {
              sheepList[j].panicTimer = Math.max(sheepList[j].panicTimer, 3.8);
            }
          }
        }
      }

      let peakSheepPanic = 0;
      let peakSheepX = 18;
      let peakSheepZ = 100;
      for (let i = 0; i < sheepList.length; i++) {
        const sh = sheepList[i];
        if (sh.panicTimer > 0) {
          sh.panicTimer = Math.max(0, sh.panicTimer - dt);
        }

        const distToCar = Math.hypot(pX - sh.x, pZ - sh.z);
        if (sh.panicTimer > 0) {
          const awayX = sh.x - pX;
          const awayZ = sh.z - pZ;
          const awayAngle = Math.atan2(awayX, awayZ) + sh.scatterBias;
          let dirX = Math.sin(awayAngle);
          let dirZ = Math.cos(awayAngle);

          if (sh.x < sh.minX + 2.5) dirX += 0.9;
          if (sh.x > sh.maxX - 2.5) dirX -= 0.9;
          if (sh.z < sh.minZ + 2.5) dirZ += 0.9;
          if (sh.z > sh.maxZ - 2.5) dirZ -= 0.9;
          const dLen = Math.hypot(dirX, dirZ) || 1;
          dirX /= dLen;
          dirZ /= dLen;

          const fleeSpeed = sh.panicTimer > 1.2 ? 5.3 : 3.2;
          sh.vx = THREE.MathUtils.damp(sh.vx, dirX * fleeSpeed, 6, dt);
          sh.vz = THREE.MathUtils.damp(sh.vz, dirZ * fleeSpeed, 6, dt);
        } else {
          const homeDx = sh.homeX - sh.x;
          const homeDz = sh.homeZ - sh.z;
          const homeDist = Math.hypot(homeDx, homeDz);
          if (homeDist > 5.0) {
            sh.vx = THREE.MathUtils.damp(sh.vx, (homeDx / homeDist) * 1.1, 3, dt);
            sh.vz = THREE.MathUtils.damp(sh.vz, (homeDz / homeDist) * 1.1, 3, dt);
          } else {
            sh.vx = THREE.MathUtils.damp(sh.vx, 0, 5, dt);
            sh.vz = THREE.MathUtils.damp(sh.vz, 0, 5, dt);
          }
        }

        sh.x = THREE.MathUtils.clamp(sh.x + sh.vx * dt, sh.minX, sh.maxX);
        sh.z = THREE.MathUtils.clamp(sh.z + sh.vz * dt, sh.minZ, sh.maxZ);
        const speedMag = Math.hypot(sh.vx, sh.vz);
        if (speedMag > 0.25) {
          const moveYaw = Math.atan2(sh.vx, sh.vz);
          sh.yaw += shortestAngleDiff(sh.yaw, moveYaw) * Math.min(1, dt * 8);
        }

        const sy = getTerrainHeightAndSurface(sh.x, sh.z).height;
        const hopY = sh.panicTimer > 0 && speedMag > 1.0 ? Math.abs(Math.sin(elapsed * 12 + sh.phase)) * 0.13 : 0;
        sh.group.position.set(sh.x, sy + hopY, sh.z);
        sh.group.rotation.y = sh.yaw;

        if (speedMag > 0.35) {
          const boundStride = Math.sin(elapsed * (7 + speedMag * 1.6) + sh.phase) * 0.62;
          sh.legs[0].rotation.x = boundStride;
          sh.legs[1].rotation.x = boundStride * 0.9;
          sh.legs[2].rotation.x = -boundStride;
          sh.legs[3].rotation.x = -boundStride * 0.9;
          sh.knees[0].rotation.x = Math.max(0, -boundStride) * 0.45;
          sh.knees[1].rotation.x = Math.max(0, -boundStride) * 0.42;
          sh.knees[2].rotation.x = Math.max(0, boundStride) * 0.45;
          sh.knees[3].rotation.x = Math.max(0, boundStride) * 0.42;
          sh.head.rotation.x = -0.14 + Math.sin(elapsed * 10 + sh.phase) * 0.12;
          sh.tail.rotation.x = Math.sin(elapsed * 14 + sh.phase) * 0.28;
        } else {
          for (let l = 0; l < 4; l++) {
            sh.legs[l].rotation.x = THREE.MathUtils.damp(sh.legs[l].rotation.x, 0, 8, dt);
            sh.knees[l].rotation.x = THREE.MathUtils.damp(sh.knees[l].rotation.x, 0, 8, dt);
          }
          sh.head.rotation.x = 0.45 + Math.sin(elapsed * 1.9 + sh.phase) * 0.18;
        }

        if (sh.panicTimer > 0 && distToCar < 46) {
          const prox = Math.max(0, 1 - Math.max(0, distToCar - 6) / 40);
          const panicNorm = Math.min(1, sh.panicTimer / 2.2) * prox;
          if (panicNorm > peakSheepPanic) {
            peakSheepPanic = panicNorm;
            peakSheepX = sh.x;
            peakSheepZ = sh.z;
          }
        }
      }

      latestDogBarkIntensity = peakBark;
      latestDogX = peakDogX;
      latestDogZ = peakDogZ;
      latestChasingDogCount = chasingCount;
      latestSheepPanicIntensity = peakSheepPanic;
      latestSheepX = peakSheepX;
      latestSheepZ = peakSheepZ;

      // Animate moving horse-drawn grain dray
      for (let i = 0; i < movingDrays.length; i++) {
        const md = movingDrays[i];
        md.progress = (md.progress + md.speedMps * dt) % TOTAL_LOOP_LEN;
        const pos = sampleCircuitLoop(md.progress, md.laneOffset);
        md.x = pos.x;
        md.z = pos.z;
        const dy = getTerrainHeightAndSurface(pos.x, pos.z).height;
        md.group.position.set(pos.x, dy, pos.z);
        md.group.rotation.y = pos.yaw;
        const trot = Math.sin(elapsed * 6.5 + i) * 0.42;
        md.horseLegs[0].rotation.x = trot;
        md.horseLegs[1].rotation.x = -trot;
        md.horseLegs[2].rotation.x = -trot;
        md.horseLegs[3].rotation.x = trot;
        md.horseKnees[0].rotation.x = Math.max(0, -trot) * 0.42;
        md.horseKnees[1].rotation.x = Math.max(0, trot) * 0.42;
        md.horseKnees[2].rotation.x = Math.max(0, trot) * 0.42;
        md.horseKnees[3].rotation.x = Math.max(0, -trot) * 0.42;
        md.head.rotation.x = 0.1 + Math.sin(elapsed * 3.2) * 0.12;
        md.tail.rotation.z = Math.sin(elapsed * 4.5) * 0.22;
        for (let w = 0; w < md.cartWheels.length; w++) {
          md.cartWheels[w].rotation.x += (md.speedMps / 0.56) * dt;
        }
        obstacles[i].x = pos.x;
        obstacles[i].z = pos.z;
      }

      // Animate moving vintage cars around the 6-leg circuit
      const obsOffset = movingDrays.length;
      for (let i = 0; i < movingCars.length; i++) {
        const mc = movingCars[i];
        mc.progress = (mc.progress + mc.speedMps * dt) % TOTAL_LOOP_LEN;
        mc.totalDist += mc.speedMps * dt;
        const pos = sampleCircuitLoop(mc.progress, mc.laneOffset);
        mc.x = pos.x;
        mc.z = pos.z;
        mc.yaw = pos.yaw;
        const cy = getTerrainHeightAndSurface(pos.x, pos.z).height;
        mc.group.position.set(pos.x, cy, pos.z);
        mc.group.rotation.y = pos.yaw;

        const spinDelta = (mc.speedMps / 0.38) * dt;
        for (let w = 0; w < mc.wheels.length; w++) {
          mc.wheels[w].rotation.x += spinDelta;
        }
        for (let b = 0; b < mc.headlightBulbs.length; b++) {
          const mat = mc.headlightBulbs[b].material as THREE.MeshStandardMaterial;
          mat.emissiveIntensity = lightsOn ? 2.2 : 0.25;
        }
        obstacles[obsOffset + i].x = pos.x;
        obstacles[obsOffset + i].z = pos.z;
      }

      // Animate 1914 Edwardian cyclists along outer kerbside loop
      const cycOffset = obsOffset + movingCars.length;
      for (let i = 0; i < movingCyclists.length; i++) {
        const cyc = movingCyclists[i];
        cyc.progress = (cyc.progress + cyc.speedMps * dt) % TOTAL_LOOP_LEN;
        const pos = sampleCircuitLoop(cyc.progress, cyc.laneOffset);
        const cy = getTerrainHeightAndSurface(pos.x, pos.z).height;
        cyc.group.position.set(pos.x, cy, pos.z);
        cyc.group.rotation.y = pos.yaw;
        for (let w = 0; w < cyc.wheels.length; w++) {
          cyc.wheels[w].rotation.x += (cyc.speedMps / 0.32) * dt;
        }
        const pedalPhase = elapsed * cyc.speedMps * 1.7 + cyc.phase;
        cyc.crank.rotation.x = pedalPhase;
        cyc.pedals[0].rotation.x = -pedalPhase;
        cyc.pedals[1].rotation.x = -pedalPhase;
        const leftPedalY = BIKE_BB_Y - BIKE_PEDAL_R * Math.sin(pedalPhase);
        const leftPedalZ = BIKE_BB_Z + BIKE_PEDAL_R * Math.cos(pedalPhase);
        const rightPedalY = BIKE_BB_Y + BIKE_PEDAL_R * Math.sin(pedalPhase);
        const rightPedalZ = BIKE_BB_Z - BIKE_PEDAL_R * Math.cos(pedalPhase);
        poseSagittalLimb(
          cyc.leftLeg, cyc.leftKnee,
          RIDER_HIP_Y, RIDER_HIP_Z,
          riderLocalY(leftPedalY), riderLocalZ(leftPedalZ),
          0.42, 0.46, true,
        );
        poseSagittalLimb(
          cyc.rightLeg, cyc.rightKnee,
          RIDER_HIP_Y, RIDER_HIP_Z,
          riderLocalY(rightPedalY), riderLocalZ(rightPedalZ),
          0.42, 0.46, true,
        );
        obstacles[cycOffset + i].x = pos.x;
        obstacles[cycOffset + i].z = pos.z;
      }

      // Cats bolt along the kerb. Geese waddle the same way, then run from the car.
      for (let i = 0; i < streetCats.length; i++) {
        const cat = streetCats[i];
        const distCar = Math.hypot(pX - cat.x, pZ - cat.z);
        if (distCar < 8 && pSpeed > 0.7) cat.flee = Math.max(cat.flee, 1.5);
        else cat.flee = Math.max(0, cat.flee - dt);
        let dirX = 0;
        let dirZ = 0;
        let spd = 0;
        if (cat.flee > 0) {
          dirX = cat.x - pX;
          dirZ = cat.z - pZ;
          spd = 3.3;
        } else if (!cat.sit) {
          const tx = (cat.minX + cat.maxX) * 0.5 + Math.sin(elapsed * 0.45 + cat.phase) * (cat.maxX - cat.minX) * 0.35;
          const tz = (cat.minZ + cat.maxZ) * 0.5 + Math.cos(elapsed * 0.38 + cat.phase) * (cat.maxZ - cat.minZ) * 0.35;
          dirX = tx - cat.x;
          dirZ = tz - cat.z;
          spd = 0.38;
        }
        const len = Math.hypot(dirX, dirZ);
        if (spd > 0.05 && len > 0.05) {
          cat.x = Math.min(cat.maxX, Math.max(cat.minX, cat.x + (dirX / len) * spd * dt));
          cat.z = Math.min(cat.maxZ, Math.max(cat.minZ, cat.z + (dirZ / len) * spd * dt));
          const face = Math.atan2(dirX, dirZ);
          cat.yaw += shortestAngleDiff(cat.yaw, face) * Math.min(1, dt * 8);
        }
        const cy = getTerrainHeightAndSurface(cat.x, cat.z).height;
        const crouch = cat.flee > 0 ? 0.04 : 0;
        cat.group.position.set(cat.x, cy - crouch, cat.z);
        cat.group.rotation.y = cat.yaw;
        cat.tail.rotation.y = Math.sin(elapsed * (cat.flee > 0 ? 16 : 4) + cat.phase) * (cat.flee > 0 ? 0.8 : 0.35);
      }

      for (let i = 0; i < streetGeese.length; i++) {
        const goose = streetGeese[i];
        const distCar = Math.hypot(pX - goose.x, pZ - goose.z);
        if (distCar < 13 && (pSpeed > 1.4 || badDrive > 0.2 || hornFired)) goose.flee = Math.max(goose.flee, 2.2);
        else goose.flee = Math.max(0, goose.flee - dt);
        const midX = (goose.minX + goose.maxX) * 0.5;
        const midZ = (goose.minZ + goose.maxZ) * 0.5;
        let dirX: number;
        let dirZ: number;
        let spd: number;
        if (goose.flee > 0) {
          dirX = goose.x - pX + (goose.x - midX) * 0.35;
          dirZ = midZ - goose.z;
          spd = 2.6;
        } else {
          dirX = midX + Math.sin(elapsed * 0.33 + goose.phase) * (goose.maxX - goose.minX) * 0.38 - goose.x;
          dirZ = midZ + Math.cos(elapsed * 0.27 + goose.phase) * (goose.maxZ - goose.minZ) * 0.38 - goose.z;
          spd = 0.42;
        }
        const len = Math.hypot(dirX, dirZ) || 1;
        goose.x = Math.min(goose.maxX, Math.max(goose.minX, goose.x + (dirX / len) * spd * dt));
        goose.z = Math.min(goose.maxZ, Math.max(goose.minZ, goose.z + (dirZ / len) * spd * dt));
        const face = Math.atan2(dirX, dirZ);
        goose.yaw += shortestAngleDiff(goose.yaw, face) * Math.min(1, dt * 6);
        const gy = getTerrainHeightAndSurface(goose.x, goose.z).height;
        const step = Math.abs(Math.sin(elapsed * (goose.flee > 0 ? 14 : 6) + goose.phase));
        goose.group.position.set(goose.x, gy + (spd > 0.8 ? step * 0.04 : 0), goose.z);
        goose.group.rotation.y = goose.yaw;
        goose.group.rotation.z = Math.sin(elapsed * 6 + goose.phase) * (spd > 0.8 ? 0.12 : 0.05);
        goose.neck.rotation.x = goose.flee > 0 ? -0.45 : Math.sin(elapsed * 2.2 + goose.phase) * 0.2;
        const flap = goose.flee > 0 ? Math.sin(elapsed * 18 + goose.phase) * 0.5 : 0.05;
        goose.leftWing.rotation.z = flap;
        goose.rightWing.rotation.z = -flap;
      }

      // The beat constable gives chase when the car is driven recklessly nearby.
      for (let i = 0; i < beatConstables.length; i++) {
        const cop = beatConstables[i];
        const distCar = Math.hypot(pX - cop.x, pZ - cop.z);
        const distHome = Math.hypot(pX - cop.homeX, pZ - cop.homeZ);
        const reckless = distHome < 70 && (badDrive > 0.42 || hornFired || (pSpeed > 9 && distCar < 26));
        if (reckless) {
          cop.chasing = true;
          cop.chaseLeft = 3.4;
        } else {
          cop.chaseLeft = Math.max(0, cop.chaseLeft - dt);
          if (cop.chaseLeft <= 0 || distHome > 78) cop.chasing = false;
        }

        let targetX = cop.homeX + Math.sin(elapsed * 0.32 + cop.phase) * 8;
        let targetZ = cop.homeZ;
        let desired = 1.05;
        if (cop.chasing) {
          const fwdX = Math.sin(pYaw);
          const fwdZ = Math.cos(pYaw);
          targetX = pX - fwdX * 2.35;
          targetZ = pZ - fwdZ * 2.35;
          desired = distCar > 2.5 ? 5.6 : 0;
        }
        cop.speed = THREE.MathUtils.damp(cop.speed, desired, 6, dt);
        if (cop.speed > 0.15) {
          const toX = targetX - cop.x;
          const toZ = targetZ - cop.z;
          const distT = Math.hypot(toX, toZ) || 1;
          let nextX = cop.x + (toX / distT) * cop.speed * dt;
          let nextZ = cop.z + (toZ / distT) * cop.speed * dt;
          const carDx = nextX - pX;
          const carDz = nextZ - pZ;
          const carD = Math.hypot(carDx, carDz);
          if (carD < 2.15 && carD > 0.001) {
            nextX = pX + (carDx / carD) * 2.15;
            nextZ = pZ + (carDz / carD) * 2.15;
          }
          for (let c = 0; c < WORLD_COLLIDERS.length; c++) {
            const box = WORLD_COLLIDERS[c];
            const pad = 0.45;
            if (nextX > box.minX - pad && nextX < box.maxX + pad && nextZ > box.minZ - pad && nextZ < box.maxZ + pad) {
              const dxMin = Math.abs(nextX - (box.minX - pad));
              const dxMax = Math.abs(box.maxX + pad - nextX);
              const dzMin = Math.abs(nextZ - (box.minZ - pad));
              const dzMax = Math.abs(box.maxZ + pad - nextZ);
              const m = Math.min(dxMin, dxMax, dzMin, dzMax);
              if (m === dxMin) nextX = box.minX - pad;
              else if (m === dxMax) nextX = box.maxX + pad;
              else if (m === dzMin) nextZ = box.minZ - pad;
              else nextZ = box.maxZ + pad;
            }
          }
          const moveYaw = Math.atan2(nextX - cop.x, nextZ - cop.z);
          if (Math.hypot(nextX - cop.x, nextZ - cop.z) > 0.004) {
            cop.yaw += shortestAngleDiff(cop.yaw, moveYaw) * Math.min(1, dt * 9);
          }
          cop.x = nextX;
          cop.z = nextZ;
        } else if (cop.chasing) {
          const faceYaw = Math.atan2(pX - cop.x, pZ - cop.z);
          cop.yaw += shortestAngleDiff(cop.yaw, faceYaw) * Math.min(1, dt * 8);
        }
        const copY = getTerrainHeightAndSurface(cop.x, cop.z).height;
        cop.group.position.set(cop.x, copY, cop.z);
        cop.group.rotation.y = cop.yaw;
        const running = cop.speed > 2.2;
        const phase = elapsed * (running ? 11 : 4.2) + cop.phase;
        const stride = Math.sin(phase) * (running ? 0.7 : cop.speed > 0.3 ? 0.4 : 0);
        cop.leftLeg.rotation.x = stride;
        cop.rightLeg.rotation.x = -stride;
        cop.leftKnee.rotation.x = Math.max(0, -Math.cos(phase)) * (running ? 0.55 : 0.35);
        cop.rightKnee.rotation.x = Math.max(0, Math.cos(phase)) * (running ? 0.55 : 0.35);
        if (cop.chasing && distCar < 5) {
          cop.rightArm.rotation.x = -2.05 + Math.sin(elapsed * 10) * 0.28;
          cop.rightElbow.rotation.x = -0.3;
          cop.leftArm.rotation.x = -0.4;
          cop.leftElbow.rotation.x = -0.5;
        } else {
          cop.leftArm.rotation.x = -stride * 0.7;
          cop.rightArm.rotation.x = stride * 0.7;
          cop.leftElbow.rotation.x = -0.28;
          cop.rightElbow.rotation.x = -0.28;
        }
        cop.head.rotation.y = cop.chasing ? 0 : Math.sin(elapsed * 1.1) * 0.3;
      }

      // Animate Constable Finch watching Thames North speed trap with pocket watch
      const distTrap = Math.hypot(pX - SPEED_TRAP_ZONE.constableX, pZ - SPEED_TRAP_ZONE.constableZ);
      const fastAlert = distTrap < 24 && pSpeed > 9.6;
      constableFinch.rightArm.rotation.x = fastAlert ? -2.1 + Math.sin(elapsed * 9) * 0.25 : -0.75;
      constableFinch.rightElbow.rotation.x = fastAlert ? -0.35 : -0.65;
      constableFinch.leftArm.rotation.x = -0.65;
      constableFinch.leftElbow.rotation.x = -0.75;
      constableFinch.headPivot.rotation.y = fastAlert ? 0 : Math.sin(elapsed * 1.2) * 0.25;
      if (distTrap < 28) {
        constableFinch.group.rotation.y = Math.atan2(pX - SPEED_TRAP_ZONE.constableX, pZ - SPEED_TRAP_ZONE.constableZ);
      } else {
        constableFinch.group.rotation.y = -Math.PI / 2;
      }

      // Coastal seagulls wheeling above harbour
      const windDrift = windMps * 0.04;
      for (let i = 0; i < seagulls.length; i++) {
        const sg = seagulls[i];
        const angle = elapsed * (sg.speed + windDrift * 0.2) + sg.phase;
        const gx = sg.centerX + Math.cos(angle) * sg.orbitR;
        const gz = sg.centerZ + Math.sin(angle) * sg.orbitR;
        const gy = sg.baseY + Math.sin(elapsed * 1.4 + sg.phase) * 0.9;
        sg.group.position.set(gx, gy, gz);
        sg.group.rotation.y = -angle;
        const flap = Math.sin(elapsed * 7.5 + sg.phase) * 0.45;
        sg.leftWing.rotation.z = flap;
        sg.rightWing.rotation.z = -flap;
      }

      // Animate Scottish Bagpiper ("Angus MacLeod"): plays pipes, bolts fast on approach, still hittable
      piper.justHit = false;
      const distPiperCar = Math.hypot(pX - piper.x, pZ - piper.z);

      if (piper.state === 'down') {
        piper.downTimer -= dt;
        piper.panicLevel = 0;
        piperBodyPivot.rotation.x = THREE.MathUtils.damp(piperBodyPivot.rotation.x, -Math.PI * 0.47, 14, dt);
        piperBodyPivot.rotation.z = THREE.MathUtils.damp(piperBodyPivot.rotation.z, 0.24, 14, dt);
        piperBodyPivot.position.y = THREE.MathUtils.damp(piperBodyPivot.position.y, 0.18, 12, dt);

        if (piper.downTimer <= 0) {
          piper.state = 'fleeing';
          piper.panicTimer = 2.4;
          piper.dodgeSeed = -piper.dodgeSeed;
          if (distPiperCar < 2.8) {
            const awayA = Math.atan2(piper.x - pX, piper.z - pZ);
            piper.x = pX + Math.sin(awayA) * 3.0;
            piper.z = pZ + Math.cos(awayA) * 3.0;
          }
        }
      } else {
        // Recover upright posture cleanly
        piperBodyPivot.rotation.x = THREE.MathUtils.damp(piperBodyPivot.rotation.x, piper.state === 'fleeing' ? 0.22 : 0, 12, dt);
        piperBodyPivot.rotation.z = THREE.MathUtils.damp(piperBodyPivot.rotation.z, 0, 12, dt);
        piperBodyPivot.position.y = THREE.MathUtils.damp(piperBodyPivot.position.y, 0, 12, dt);

        // Check collision / run-over hit across car center and front/rear bumpers
        const fwdCarX = Math.sin(pYaw);
        const fwdCarZ = Math.cos(pYaw);
        const distFrontBumper = Math.hypot(pX + fwdCarX * 1.25 - piper.x, pZ + fwdCarZ * 1.25 - piper.z);
        const distRearBumper = Math.hypot(pX - fwdCarX * 1.25 - piper.x, pZ - fwdCarZ * 1.25 - piper.z);
        const piperHit = pSpeed > 0.75 && (distPiperCar < 1.95 || distFrontBumper < 1.32 || distRearBumper < 1.25);
        if (piperHit) {
          piper.state = 'down';
          piper.downTimer = 6.5;
          piper.panicTimer = 0;
          piper.panicLevel = 0;
          piper.vx = 0;
          piper.vz = 0;
          piper.justHit = true;

          const pushA = Math.atan2(piper.x - pX, piper.z - pZ);
          piper.x = pX + Math.sin(pushA) * 1.95;
          piper.z = pZ + Math.cos(pushA) * 1.95;
          piper.yaw = pushA;
        } else {
          // Determine whether the Model T is trying to run him over or rushing near him
          const toPiperX = (piper.x - pX) / (distPiperCar || 1);
          const toPiperZ = (piper.z - pZ) / (distPiperCar || 1);
          const aimedAtPiper = toPiperX * fwdCarX + toPiperZ * fwdCarZ > 0.25;
          const threatClose =
            distPiperCar < 12.5 ||
            (distPiperCar < 24 && pSpeed > 2.2 && aimedAtPiper) ||
            (distPiperCar < 25 && hornFired);

          if (threatClose) {
            if (piper.state !== 'fleeing') {
              piper.dodgeSeed = Math.random() < 0.5 ? 1 : -1;
            }
            piper.state = 'fleeing';
            piper.panicTimer = Math.max(piper.panicTimer, 2.5);
          } else if (piper.panicTimer > 0) {
            piper.panicTimer = Math.max(0, piper.panicTimer - dt);
            if (piper.panicTimer <= 0 && distPiperCar > 22) {
              piper.state = 'playing';
            }
          }

          if (piper.state === 'fleeing') {
            const awayX = piper.x - pX;
            const awayZ = piper.z - pZ;
            const awayLen = Math.hypot(awayX, awayZ) || 1;
            const perpX = -awayZ / awayLen;
            const perpZ = awayX / awayLen;
            // Dodge sideways slightly while sprinting fast enough to chase down
            const dodgeWeight = distPiperCar < 10 ? 0.30 * piper.dodgeSeed : 0.14 * piper.dodgeSeed;
            let desX = awayX / awayLen + perpX * dodgeWeight;
            let desZ = awayZ / awayLen + perpZ * dodgeWeight;
            const desLen = Math.hypot(desX, desZ) || 1;
            desX /= desLen;
            desZ /= desLen;

            const fleeSpeed = distPiperCar < 10 ? 5.2 : 4.5;
            piper.vx = THREE.MathUtils.damp(piper.vx, desX * fleeSpeed, 9.5, dt);
            piper.vz = THREE.MathUtils.damp(piper.vz, desZ * fleeSpeed, 9.5, dt);
            piper.panicLevel = Math.max(0.35, Math.min(1, 1.15 - distPiperCar / 26));
          } else {
            // Calm Harbour St patrol while playing bagpipes
            if (piper.x > 34) piper.patrolDir = -1;
            else if (piper.x < -34) piper.patrolDir = 1;
            const targetZ = 4.2;
            const dzHome = THREE.MathUtils.clamp((targetZ - piper.z) * 0.8, -0.9, 0.9);
            piper.vx = THREE.MathUtils.damp(piper.vx, piper.patrolDir * 1.25, 4, dt);
            piper.vz = THREE.MathUtils.damp(piper.vz, dzHome, 4, dt);
            piper.panicLevel = THREE.MathUtils.damp(piper.panicLevel, 0, 5, dt);
          }

          let nextPx = THREE.MathUtils.clamp(piper.x + piper.vx * dt, -158, 102);
          let nextPz = THREE.MathUtils.clamp(piper.z + piper.vz * dt, -152, 200);

          // Keep bagpiper out of buildings, blockades & crates
          for (let c = 0; c < WORLD_COLLIDERS.length; c++) {
            const box = WORLD_COLLIDERS[c];
            if (
              nextPx > box.minX - 0.65 &&
              nextPx < box.maxX + 0.65 &&
              nextPz > box.minZ - 0.65 &&
              nextPz < box.maxZ + 0.65
            ) {
              const dxMin = Math.abs(nextPx - (box.minX - 0.65));
              const dxMax = Math.abs(box.maxX + 0.65 - nextPx);
              const dzMin = Math.abs(nextPz - (box.minZ - 0.65));
              const dzMax = Math.abs(box.maxZ + 0.65 - nextPz);
              const m = Math.min(dxMin, dxMax, dzMin, dzMax);
              if (m === dxMin) {
                nextPx = box.minX - 0.65;
                piper.vz += (piper.z >= (box.minZ + box.maxZ) * 0.5 ? 1 : -1) * 1.8;
              } else if (m === dxMax) {
                nextPx = box.maxX + 0.65;
                piper.vz += (piper.z >= (box.minZ + box.maxZ) * 0.5 ? 1 : -1) * 1.8;
              } else if (m === dzMin) {
                nextPz = box.minZ - 0.65;
                piper.vx += (piper.x >= (box.minX + box.maxX) * 0.5 ? 1 : -1) * 1.8;
              } else {
                nextPz = box.maxZ + 0.65;
                piper.vx += (piper.x >= (box.minX + box.maxX) * 0.5 ? 1 : -1) * 1.8;
              }
            }
          }
          for (let o = 0; o < ROAD_OBSTRUCTIONS.length; o++) {
            const obs = ROAD_OBSTRUCTIONS[o];
            const odx = nextPx - obs.x;
            const odz = nextPz - obs.z;
            const minR = obs.radius + 0.45;
            const dSq = odx * odx + odz * odz;
            if (dSq < minR * minR) {
              const d = Math.sqrt(dSq) || 0.01;
              nextPx = obs.x + (odx / d) * minR;
              nextPz = obs.z + (odz / d) * minR;
            }
          }

          const moveMag = Math.hypot(nextPx - piper.x, nextPz - piper.z);
          if (moveMag > 0.004) {
            const moveYaw = Math.atan2(nextPx - piper.x, nextPz - piper.z);
            piper.yaw += shortestAngleDiff(piper.yaw, moveYaw) * Math.min(1, dt * 12);
          }
          piper.x = nextPx;
          piper.z = nextPz;

          const pSpeedMag = Math.hypot(piper.vx, piper.vz);
          const strideRate = piper.state === 'fleeing' ? 17.5 : 5.2;
          const strideAmp = piper.state === 'fleeing' ? 0.88 : 0.36;
          const stridePhase = elapsed * strideRate;
          const stride = pSpeedMag > 0.2 ? Math.sin(stridePhase) * strideAmp : 0;
          piperLegs[0].rotation.x = stride;
          piperLegs[1].rotation.x = -stride;
          piperKnees[0].rotation.x = pSpeedMag > 0.2 ? Math.max(0, -Math.cos(stridePhase)) * (piper.state === 'fleeing' ? 0.95 : 0.42) : 0;
          piperKnees[1].rotation.x = pSpeedMag > 0.2 ? Math.max(0, Math.cos(stridePhase)) * (piper.state === 'fleeing' ? 0.95 : 0.42) : 0;

          if (piper.state === 'fleeing') {
            pipesGroup.rotation.z = Math.sin(elapsed * 22) * 0.16;
            pipesGroup.rotation.x = Math.cos(elapsed * 18) * 0.12;
            piperHead.rotation.y = Math.sin(elapsed * 12) * 0.42;
            piperArms[0].rotation.x = -0.36 + Math.sin(elapsed * 18) * 0.25;
            piperArms[1].rotation.x = -0.4 + Math.cos(elapsed * 18) * 0.25;
            piperElbows[0].rotation.x = -0.68 + Math.sin(elapsed * 18) * 0.15;
            piperElbows[1].rotation.x = -0.76 + Math.cos(elapsed * 18) * 0.15;
          } else {
            pipesGroup.rotation.z = Math.sin(elapsed * 2.4) * 0.04;
            pipesGroup.rotation.x = 0;
            piperHead.rotation.y = Math.sin(elapsed * 1.4) * 0.15;
            piperArms[0].rotation.x = -0.34 + Math.sin(elapsed * 4.5) * 0.05;
            piperArms[1].rotation.x = -0.38 + Math.cos(elapsed * 4.5) * 0.06;
            piperElbows[0].rotation.x = -0.68;
            piperElbows[1].rotation.x = -0.76;
          }
        }
      }

      const py = getTerrainHeightAndSurface(piper.x, piper.z).height;
      const runHop =
        piper.state === 'fleeing'
          ? Math.abs(Math.sin(elapsed * 17.5)) * 0.11
          : piper.state === 'playing'
            ? Math.abs(Math.sin(elapsed * 5.2)) * 0.025
            : 0;
      piperGroup.position.set(piper.x, py + runHop, piper.z);
      piperGroup.rotation.y = piper.yaw;
    },
    getObstacles: () => obstacles,
    getRivalMapPoints: () => movingCars.map((mc) => ({ x: mc.x, z: mc.z })),
    getRivalCarStates: () => movingCars.map((mc) => ({ x: mc.x, z: mc.z, yaw: mc.yaw })),
    getPiperMapPoint: () => ({ x: piper.x, z: piper.z, down: piper.state === 'down' }),
    getRacePosition: (px: number, pz: number, playerLap: number): number => {
      // Project player onto closest circuit segment to measure loop distance from Start Line (-56, 0)
      let bestDistSq = Infinity;
      let playerSegDist = 0;
      let accum = 0;
      for (let i = 0; i < LOOP_SEGMENTS.length; i++) {
        const seg = LOOP_SEGMENTS[i];
        const dx = seg.x2 - seg.x1;
        const dz = seg.z2 - seg.z1;
        const lenSq = seg.len * seg.len || 1;
        const t = Math.max(0, Math.min(1, ((px - seg.x1) * dx + (pz - seg.z1) * dz) / lenSq));
        const projX = seg.x1 + dx * t;
        const projZ = seg.z1 + dz * t;
        const dSq = (px - projX) * (px - projX) + (pz - projZ) * (pz - projZ);
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          playerSegDist = accum + t * seg.len;
        }
        accum += seg.len;
      }
      // Shift origin from (-104, 0) to start line (-56, 0) which is +48m along leg 0
      const playerNormProg = (playerSegDist - 48 + TOTAL_LOOP_LEN) % TOTAL_LOOP_LEN;
      const playerCumulative = (playerLap - 1) * TOTAL_LOOP_LEN + playerNormProg;

      let pos = 1;
      for (let i = 0; i < movingCars.length; i++) {
        const mc = movingCars[i];
        const rivalCum = mc.totalDist - 48;
        if (rivalCum > playerCumulative) pos += 1;
      }
      return pos;
    },
    getSpatialAudioHints: (
      px: number,
      pz: number,
      pYaw = 0,
      trainPos = { x: 50, z: -52 }
    ): SpatialTrafficAudioHints => {
      const rightX = -Math.cos(pYaw);
      const rightZ = Math.sin(pYaw);
      const calcPan = (tx: number, tz: number) => {
        const dx = tx - px;
        const dz = tz - pz;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.5) return 0;
        return Math.max(-0.95, Math.min(0.95, (dx * rightX + dz * rightZ) / Math.max(5, dist)));
      };

      let bestCrowdDist = Infinity;
      let bestDensity = 4;
      let bestLabel = 'Harbour Street';
      let bestCrowdX = px;
      let bestCrowdZ = pz;
      for (let i = 0; i < crowdClusters.length; i++) {
        const cc = crowdClusters[i];
        const d = Math.hypot(px - cc.x, pz - cc.z);
        if (d < bestCrowdDist) {
          bestCrowdDist = d;
          bestDensity = cc.density;
          bestLabel = cc.label;
          bestCrowdX = cc.x;
          bestCrowdZ = cc.z;
        }
      }
      for (let i = 0; i < walkers.length; i++) {
        const wp = walkers[i].group.position;
        const d = Math.hypot(px - wp.x, pz - wp.z);
        if (d < bestCrowdDist) {
          bestCrowdDist = d;
          bestDensity = Math.max(bestDensity, 2);
          bestLabel = 'Footpath';
          bestCrowdX = wp.x;
          bestCrowdZ = wp.z;
        }
      }

      let bestHorseDist = Infinity;
      let bestHorseX = px;
      let bestHorseZ = pz;
      for (let i = 0; i < idleAnimals.length; i++) {
        const an = idleAnimals[i];
        const d = Math.hypot(px - an.x, pz - an.z);
        if (d < bestHorseDist) {
          bestHorseDist = d;
          bestHorseX = an.x;
          bestHorseZ = an.z;
        }
      }
      let bestDrayDist = Infinity;
      let bestDrayX = px;
      let bestDrayZ = pz;
      for (let i = 0; i < movingDrays.length; i++) {
        const md = movingDrays[i];
        const d = Math.hypot(px - md.x, pz - md.z);
        if (d < bestHorseDist) {
          bestHorseDist = d;
          bestHorseX = md.x;
          bestHorseZ = md.z;
        }
        if (d < bestDrayDist) {
          bestDrayDist = d;
          bestDrayX = md.x;
          bestDrayZ = md.z;
        }
      }

      let bestCarDist = Infinity;
      let bestCarX = px;
      let bestCarZ = pz;
      for (let i = 0; i < movingCars.length; i++) {
        const mc = movingCars[i];
        const d = Math.hypot(px - mc.x, pz - mc.z);
        if (d < bestCarDist) {
          bestCarDist = d;
          bestCarX = mc.x;
          bestCarZ = mc.z;
        }
      }

      const trainDist = Math.hypot(px - trainPos.x, pz - trainPos.z);
      const piperDist = Math.hypot(px - piper.x, pz - piper.z);
      const crowdProximity = Math.max(0, Math.min(1, 1 - (bestCrowdDist - 3) / 26));
      const horseProximity = Math.max(0, Math.min(1, 1 - (bestHorseDist - 4) / 22));
      const drayProximity = Math.max(0, Math.min(1, 1 - (bestDrayDist - 3) / 26));
      const otherCarProximity = Math.max(0, Math.min(1, 1 - (bestCarDist - 3) / 15));
      const harbourProximity = Math.max(0, Math.min(1, (px - 35) / 70));
      const trainProximity = Math.max(0, Math.min(1, 1 - (trainDist - 8) / 56));
      const piperProximity = Math.max(0, Math.min(1, 1 - (piperDist - 4) / 78));

      return {
        crowdProximity,
        crowdDensity: bestDensity,
        nearestCrowdDist: bestCrowdDist,
        nearestClusterLabel: bestLabel,
        crowdPan: calcPan(bestCrowdX, bestCrowdZ),
        horseProximity,
        horsePan: calcPan(bestHorseX, bestHorseZ),
        horseStartleIntensity: latestHorseStartle,
        drayProximity,
        drayPan: calcPan(bestDrayX, bestDrayZ),
        otherCarProximity,
        otherCarPan: calcPan(bestCarX, bestCarZ),
        harbourProximity,
        harbourPan: calcPan(120, pz),
        dogBarkIntensity: latestDogBarkIntensity,
        dogPan: calcPan(latestDogX, latestDogZ),
        chasingDogCount: latestChasingDogCount,
        sheepPanicIntensity: latestSheepPanicIntensity,
        sheepPan: calcPan(latestSheepX, latestSheepZ),
        trainProximity,
        trainPan: calcPan(trainPos.x, trainPos.z),
        piperProximity,
        piperPan: calcPan(piper.x, piper.z),
        piperPanicLevel: piper.panicLevel,
        piperDown: piper.state === 'down',
        piperJustHit: piper.justHit,
      };
    },
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
