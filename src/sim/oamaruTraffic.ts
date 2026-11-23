import * as THREE from 'three';
import {
  CIRCUIT_LOOP_POINTS,
  ROAD_OBSTRUCTIONS,
  SIDE_STREET_BLOCKADES,
  WORLD_COLLIDERS,
  getTerrainHeightAndSurface,
} from './terrain';
import { SurfaceType } from './types';

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
  phase: number;
  mode: 'cheering' | 'discussing' | 'watching';
}

interface WalkingPedestrian {
  group: THREE.Group;
  leftLeg: THREE.Object3D;
  rightLeg: THREE.Object3D;
  leftArm: THREE.Object3D;
  rightArm: THREE.Object3D;
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  speed: number;
  phase: number;
  progress: number;
  dir: 1 | -1;
  evadeTimer: number;
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
}

interface MovingHorseDray {
  group: THREE.Group;
  horseLegs: THREE.Object3D[];
  cartWheels: THREE.Object3D[];
  head: THREE.Object3D;
  tail: THREE.Object3D;
  progress: number;
  speedMps: number;
  laneOffset: number;
  x: number;
  z: number;
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

  // Rich Period Fabric & Material Palette
  const darkWoolMat = track(new THREE.MeshStandardMaterial({ color: 0x242321, roughness: 0.85 }));
  const charcoalMat = track(new THREE.MeshStandardMaterial({ color: 0x363638, roughness: 0.86 }));
  const brownTweedMat = track(new THREE.MeshStandardMaterial({ color: 0x5c4b39, roughness: 0.88 }));
  const oliveTweedMat = track(new THREE.MeshStandardMaterial({ color: 0x4b533c, roughness: 0.88 }));
  const navyCoatMat = track(new THREE.MeshStandardMaterial({ color: 0x202d3d, roughness: 0.85 }));
  const creamBlouseMat = track(new THREE.MeshStandardMaterial({ color: 0xebe3d0, roughness: 0.82 }));
  const mustardShawlMat = track(new THREE.MeshStandardMaterial({ color: 0xb68b43, roughness: 0.84 }));
  const burgundySkirtMat = track(new THREE.MeshStandardMaterial({ color: 0x5e2429, roughness: 0.86 }));
  const slateSkirtMat = track(new THREE.MeshStandardMaterial({ color: 0x364452, roughness: 0.86 }));
  const tealDressMat = track(new THREE.MeshStandardMaterial({ color: 0x2d4e4f, roughness: 0.85 }));
  const leatherBootMat = track(new THREE.MeshStandardMaterial({ color: 0x1a1411, roughness: 0.65 }));
  const skinMat = track(new THREE.MeshStandardMaterial({ color: 0xdcb89a, roughness: 0.72 }));
  const hairBrownMat = track(new THREE.MeshStandardMaterial({ color: 0x3d281c, roughness: 0.88 }));
  const strawHatMat = track(new THREE.MeshStandardMaterial({ color: 0xd7c18a, roughness: 0.82 }));

  const bayHorseMat = track(new THREE.MeshStandardMaterial({ color: 0x5b341f, roughness: 0.76 }));
  const chestnutHorseMat = track(new THREE.MeshStandardMaterial({ color: 0x804728, roughness: 0.76 }));
  const dappleGreyMat = track(new THREE.MeshStandardMaterial({ color: 0x9b9a95, roughness: 0.78 }));
  const maneMat = track(new THREE.MeshStandardMaterial({ color: 0x1d1713, roughness: 0.9 }));
  const harnessLeatherMat = track(new THREE.MeshStandardMaterial({ color: 0x2b1d14, roughness: 0.6 }));
  const brassMat = track(new THREE.MeshStandardMaterial({ color: 0xd4aa4f, roughness: 0.28, metalness: 0.88 }));
  const timberCartMat = track(new THREE.MeshStandardMaterial({ color: 0x6c4c2f, roughness: 0.82 }));
  const burlapMat = track(new THREE.MeshStandardMaterial({ color: 0xa68f68, roughness: 0.95 }));
  const ironWheelMat = track(new THREE.MeshStandardMaterial({ color: 0x222325, roughness: 0.55, metalness: 0.6 }));
  const rubberTyreMat = track(new THREE.MeshStandardMaterial({ color: 0x45433f, roughness: 0.86 }));
  const barrierRedMat = track(new THREE.MeshStandardMaterial({ color: 0x8f2924, roughness: 0.75 }));
  const barrierWhiteMat = track(new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.78 }));
  const glassMat = track(new THREE.MeshStandardMaterial({ color: 0xa8c2cf, roughness: 0.15, metalness: 0.25, transparent: true, opacity: 0.55 }));
  const leatherSeatMat = track(new THREE.MeshStandardMaterial({ color: 0x3d2318, roughness: 0.68 }));

  const collieMat = track(new THREE.MeshStandardMaterial({ color: 0x8f5d32, roughness: 0.85 }));
  const collieWhiteMat = track(new THREE.MeshStandardMaterial({ color: 0xf1ebe0, roughness: 0.85 }));
  const sheepWoolMat = track(new THREE.MeshStandardMaterial({ color: 0xe7dfd0, roughness: 0.96 }));
  const sheepFaceMat = track(new THREE.MeshStandardMaterial({ color: 0x2d2825, roughness: 0.85 }));
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
  const obstacles: DynamicObstacle[] = [];
  let latestDogBarkIntensity = 0;
  let latestDogX = 0;
  let latestDogZ = 0;
  let latestChasingDogCount = 0;
  let latestSheepPanicIntensity = 0;
  let latestSheepX = 18;
  let latestSheepZ = 100;
  let latestHorseStartle = 0;

  // Shared high-definition geometries
  const headGeo = track(new THREE.SphereGeometry(0.115, 12, 10));
  const neckGeo = track(new THREE.CylinderGeometry(0.055, 0.065, 0.1, 8));
  const noseGeo = track(new THREE.BoxGeometry(0.032, 0.04, 0.045));
  const handGeo = track(new THREE.SphereGeometry(0.038, 8, 6));
  const bootGeo = track(new THREE.BoxGeometry(0.085, 0.07, 0.17));

  // ---------------------------------------------------------------------------
  // High-Definition Edwardian Citizen Builder
  // ---------------------------------------------------------------------------
  type CitizenStyle = 'gentleman' | 'lady' | 'worker' | 'constable' | 'newsboy';

  const createPedestrian = (style: CitizenStyle, variantIdx: number) => {
    const pGroup = new THREE.Group();
    const scale = style === 'newsboy' ? 0.82 : 0.96 + (variantIdx % 3) * 0.035;
    pGroup.scale.setScalar(scale);

    // Head + Neck + Facial definition
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 1.54, 0);

    const neck = new THREE.Mesh(neckGeo, skinMat);
    neck.position.set(0, -0.06, 0);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.set(0, 0.05, 0);
    head.castShadow = true;
    const nose = new THREE.Mesh(noseGeo, skinMat);
    nose.position.set(0, 0.04, 0.11);
    headGroup.add(neck, head, nose);

    // Period hats & hair
    if (style === 'gentleman') {
      const coatChoices = [darkWoolMat, charcoalMat, brownTweedMat];
      const coatMat = coatChoices[variantIdx % coatChoices.length];
      const hatMat = variantIdx % 2 === 0 ? darkWoolMat : brownTweedMat;

      if (variantIdx % 3 === 0) {
        // Tall Edwardian Top Hat
        const crown = new THREE.Mesh(track(new THREE.CylinderGeometry(0.105, 0.11, 0.17, 12)), hatMat);
        crown.position.set(0, 0.19, 0);
        const brim = new THREE.Mesh(track(new THREE.CylinderGeometry(0.16, 0.16, 0.018, 14)), hatMat);
        brim.position.set(0, 0.12, 0);
        headGroup.add(crown, brim);
      } else {
        // Bowler / Boater Hat
        const crown = new THREE.Mesh(track(new THREE.SphereGeometry(0.118, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.58)), hatMat);
        crown.position.set(0, 0.11, 0);
        const brim = new THREE.Mesh(track(new THREE.CylinderGeometry(0.165, 0.165, 0.018, 14)), hatMat);
        brim.position.set(0, 0.115, 0);
        headGroup.add(crown, brim);
      }
      // Mustache
      const stache = new THREE.Mesh(track(new THREE.BoxGeometry(0.08, 0.022, 0.025)), hairBrownMat);
      stache.position.set(0, 0.015, 0.11);
      headGroup.add(stache);

      // Tailored Waistcoat + Jacket + Lapels + Coat-tails
      const jacket = new THREE.Mesh(track(new THREE.BoxGeometry(0.36, 0.48, 0.21)), coatMat);
      jacket.position.set(0, 1.24, 0);
      jacket.castShadow = true;
      const vest = new THREE.Mesh(track(new THREE.BoxGeometry(0.16, 0.34, 0.225)), creamBlouseMat);
      vest.position.set(0, 1.26, 0.01);
      const tie = new THREE.Mesh(track(new THREE.BoxGeometry(0.04, 0.24, 0.23)), burgundySkirtMat);
      tie.position.set(0, 1.29, 0.01);
      const coattail = new THREE.Mesh(track(new THREE.BoxGeometry(0.35, 0.26, 0.18)), coatMat);
      coattail.position.set(0, 0.91, -0.02);
      pGroup.add(jacket, vest, tie, coattail);

      // Jointed Legs + Boots
      const legMat = variantIdx % 2 === 0 ? charcoalMat : brownTweedMat;
      const legPivots: THREE.Group[] = [];
      [-0.095, 0.095].forEach((lx) => {
        const lPivot = new THREE.Group();
        lPivot.position.set(lx, 0.94, 0);
        const thigh = new THREE.Mesh(track(new THREE.CylinderGeometry(0.072, 0.056, 0.84, 8)), legMat);
        thigh.position.set(0, -0.44, 0);
        thigh.castShadow = true;
        const boot = new THREE.Mesh(bootGeo, leatherBootMat);
        boot.position.set(0, -0.88, 0.035);
        lPivot.add(thigh, boot);
        pGroup.add(lPivot);
        legPivots.push(lPivot);
      });

      const armPivots: THREE.Group[] = [];
      [-0.225, 0.225].forEach((ax, ai) => {
        const aPivot = new THREE.Group();
        aPivot.position.set(ax, 1.43, 0);
        const sleeve = new THREE.Mesh(track(new THREE.CylinderGeometry(0.054, 0.042, 0.52, 8)), coatMat);
        sleeve.position.set(0, -0.25, 0);
        sleeve.castShadow = true;
        const hand = new THREE.Mesh(handGeo, skinMat);
        hand.position.set(0, -0.52, 0);
        aPivot.add(sleeve, hand);
        if (ai === 1 && variantIdx % 2 === 0) {
          // Walking cane
          const cane = new THREE.Mesh(track(new THREE.CylinderGeometry(0.014, 0.011, 0.88, 6)), timberCartMat);
          cane.position.set(0, -0.88, 0.1);
          cane.rotation.x = 0.14;
          aPivot.add(cane);
        }
        pGroup.add(aPivot);
        armPivots.push(aPivot);
      });

      pGroup.add(headGroup);
      return { pGroup, head: headGroup, arms: armPivots, legs: legPivots };
    }

    if (style === 'lady') {
      const dressChoices = [burgundySkirtMat, slateSkirtMat, tealDressMat, navyCoatMat];
      const skirtMat = dressChoices[variantIdx % dressChoices.length];
      const topMat = variantIdx % 2 === 0 ? creamBlouseMat : skirtMat;
      const hatMat = variantIdx % 2 === 0 ? strawHatMat : burgundySkirtMat;

      // Hair bun + Wide Edwardian floral hat
      const hairBun = new THREE.Mesh(track(new THREE.SphereGeometry(0.065, 8, 6)), hairBrownMat);
      hairBun.position.set(0, 0.04, -0.11);
      const hatBrim = new THREE.Mesh(track(new THREE.CylinderGeometry(0.24, 0.25, 0.024, 14)), hatMat);
      hatBrim.position.set(0, 0.13, 0);
      hatBrim.rotation.x = -0.08;
      const hatCrown = new THREE.Mesh(track(new THREE.CylinderGeometry(0.11, 0.13, 0.08, 12)), creamBlouseMat);
      hatCrown.position.set(0, 0.175, 0);
      const hatRibbon = new THREE.Mesh(track(new THREE.CylinderGeometry(0.125, 0.125, 0.025, 12)), skirtMat);
      hatRibbon.position.set(0, 0.15, 0);
      headGroup.add(hairBun, hatBrim, hatCrown, hatRibbon);

      // Fitted Bodice + Shawl Collar + A-Line Edwardian Skirt + Hem Flounce
      const bodice = new THREE.Mesh(track(new THREE.BoxGeometry(0.31, 0.44, 0.19)), topMat);
      bodice.position.set(0, 1.24, 0);
      bodice.castShadow = true;
      const waistBelt = new THREE.Mesh(track(new THREE.CylinderGeometry(0.145, 0.155, 0.07, 10)), darkWoolMat);
      waistBelt.position.set(0, 1.02, 0);
      const skirtUpper = new THREE.Mesh(track(new THREE.CylinderGeometry(0.155, 0.28, 0.56, 12)), skirtMat);
      skirtUpper.position.set(0, 0.72, 0);
      skirtUpper.castShadow = true;
      const skirtFlounce = new THREE.Mesh(track(new THREE.CylinderGeometry(0.275, 0.34, 0.36, 12)), skirtMat);
      skirtFlounce.position.set(0, 0.26, 0);
      skirtFlounce.castShadow = true;
      pGroup.add(bodice, waistBelt, skirtUpper, skirtFlounce);

      if (variantIdx % 3 === 1) {
        const shawl = new THREE.Mesh(track(new THREE.BoxGeometry(0.34, 0.16, 0.22)), mustardShawlMat);
        shawl.position.set(0, 1.38, 0);
        pGroup.add(shawl);
      }

      const legPivots: THREE.Group[] = [];
      [-0.08, 0.08].forEach((lx) => {
        const lPivot = new THREE.Group();
        lPivot.position.set(lx, 0.2, 0);
        const shoe = new THREE.Mesh(bootGeo, leatherBootMat);
        shoe.position.set(0, -0.15, 0.04);
        lPivot.add(shoe);
        pGroup.add(lPivot);
        legPivots.push(lPivot);
      });

      const armPivots: THREE.Group[] = [];
      [-0.20, 0.20].forEach((ax, ai) => {
        const aPivot = new THREE.Group();
        aPivot.position.set(ax, 1.41, 0);
        const sleeve = new THREE.Mesh(track(new THREE.CylinderGeometry(0.046, 0.036, 0.48, 8)), topMat);
        sleeve.position.set(0, -0.23, 0);
        const hand = new THREE.Mesh(handGeo, skinMat);
        hand.position.set(0, -0.49, 0);
        aPivot.add(sleeve, hand);
        if (ai === 0 && variantIdx % 3 === 0) {
          // Handbag
          const bag = new THREE.Mesh(track(new THREE.BoxGeometry(0.08, 0.16, 0.18)), leatherBootMat);
          bag.position.set(0, -0.58, 0.03);
          aPivot.add(bag);
        }
        pGroup.add(aPivot);
        armPivots.push(aPivot);
      });

      pGroup.add(headGroup);
      return { pGroup, head: headGroup, arms: armPivots, legs: legPivots };
    }

    // Worker / Constable / Newsboy
    const coatChoices = style === 'constable' ? [navyCoatMat] : [oliveTweedMat, brownTweedMat, navyCoatMat, charcoalMat];
    const torsoMat = coatChoices[variantIdx % coatChoices.length];

    if (style === 'constable') {
      // Edwardian NZ Police Helmet
      const helmet = new THREE.Mesh(track(new THREE.CylinderGeometry(0.095, 0.135, 0.18, 12)), navyCoatMat);
      helmet.position.set(0, 0.16, 0);
      const badge = new THREE.Mesh(track(new THREE.BoxGeometry(0.04, 0.05, 0.02)), brassMat);
      badge.position.set(0, 0.16, 0.12);
      headGroup.add(helmet, badge);
    } else {
      // Tweed Flat Cap with Visor Peak
      const cap = new THREE.Mesh(track(new THREE.CylinderGeometry(0.125, 0.12, 0.06, 10)), brownTweedMat);
      cap.position.set(0, 0.12, 0.01);
      const peak = new THREE.Mesh(track(new THREE.BoxGeometry(0.15, 0.018, 0.1)), leatherBootMat);
      peak.position.set(0, 0.10, 0.12);
      headGroup.add(cap, peak);
    }

    const torso = new THREE.Mesh(track(new THREE.BoxGeometry(0.36, 0.50, 0.21)), torsoMat);
    torso.position.set(0, 1.23, 0);
    torso.castShadow = true;
    const belt = new THREE.Mesh(track(new THREE.BoxGeometry(0.37, 0.06, 0.22)), harnessLeatherMat);
    belt.position.set(0, 1.0, 0);
    pGroup.add(torso, belt);

    if (style === 'worker' && variantIdx % 2 === 1) {
      // Canvas merchant/dock apron
      const apron = new THREE.Mesh(track(new THREE.BoxGeometry(0.30, 0.58, 0.04)), creamBlouseMat);
      apron.position.set(0, 0.92, 0.11);
      pGroup.add(apron);
    }

    const legPivots: THREE.Group[] = [];
    [-0.095, 0.095].forEach((lx) => {
      const lPivot = new THREE.Group();
      lPivot.position.set(lx, 0.94, 0);
      const legMesh = new THREE.Mesh(track(new THREE.CylinderGeometry(0.072, 0.058, 0.84, 8)), brownTweedMat);
      legMesh.position.set(0, -0.44, 0);
      legMesh.castShadow = true;
      const boot = new THREE.Mesh(bootGeo, leatherBootMat);
      boot.position.set(0, -0.88, 0.035);
      lPivot.add(legMesh, boot);
      pGroup.add(lPivot);
      legPivots.push(lPivot);
    });

    const armPivots: THREE.Group[] = [];
    [-0.225, 0.225].forEach((ax) => {
      const aPivot = new THREE.Group();
      aPivot.position.set(ax, 1.42, 0);
      const sleeve = new THREE.Mesh(track(new THREE.CylinderGeometry(0.052, 0.042, 0.50, 8)), torsoMat);
      sleeve.position.set(0, -0.24, 0);
      sleeve.castShadow = true;
      const hand = new THREE.Mesh(handGeo, skinMat);
      hand.position.set(0, -0.5, 0);
      aPivot.add(sleeve, hand);
      pGroup.add(aPivot);
      armPivots.push(aPivot);
    });

    pGroup.add(headGroup);
    return { pGroup, head: headGroup, arms: armPivots, legs: legPivots };
  };

  // ---------------------------------------------------------------------------
  // High-Definition Draft Horse + Harness Builder
  // ---------------------------------------------------------------------------
  const createHorseMesh = (coatMat: THREE.Material) => {
    const hGroup = new THREE.Group();

    // Sculpted chest, barrel & haunches
    const barrel = new THREE.Mesh(track(new THREE.CylinderGeometry(0.32, 0.34, 1.25, 12)), coatMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 1.18, 0);
    barrel.castShadow = true;
    const chest = new THREE.Mesh(track(new THREE.SphereGeometry(0.33, 10, 8)), coatMat);
    chest.position.set(0, 1.2, 0.58);
    const rump = new THREE.Mesh(track(new THREE.SphereGeometry(0.34, 10, 8)), coatMat);
    rump.position.set(0, 1.21, -0.56);
    hGroup.add(barrel, chest, rump);

    // Leather saddle / harness collar & brass hames
    const collar = new THREE.Mesh(track(new THREE.TorusGeometry(0.28, 0.055, 8, 14)), harnessLeatherMat);
    collar.position.set(0, 1.32, 0.65);
    collar.rotation.x = 0.42;
    const hameRing = new THREE.Mesh(track(new THREE.TorusGeometry(0.285, 0.02, 6, 14)), brassMat);
    hameRing.position.set(0, 1.33, 0.67);
    hameRing.rotation.x = 0.42;
    const girthStrap = new THREE.Mesh(track(new THREE.CylinderGeometry(0.35, 0.35, 0.14, 12)), harnessLeatherMat);
    girthStrap.rotation.x = Math.PI / 2;
    girthStrap.position.set(0, 1.18, 0.12);
    hGroup.add(collar, hameRing, girthStrap);

    // Muscular neck & flowing mane
    const neck = new THREE.Mesh(track(new THREE.CylinderGeometry(0.15, 0.24, 0.66, 10)), coatMat);
    neck.position.set(0, 1.54, 0.72);
    neck.rotation.x = 0.55;
    neck.castShadow = true;
    const mane = new THREE.Mesh(track(new THREE.BoxGeometry(0.07, 0.54, 0.12)), maneMat);
    mane.position.set(0, 1.60, 0.62);
    mane.rotation.x = 0.55;
    hGroup.add(neck, mane);

    // Sculpted Head + Muzzle + Ears + Bridle
    const headPivot = new THREE.Group();
    headPivot.position.set(0, 1.80, 0.94);

    const skull = new THREE.Mesh(track(new THREE.BoxGeometry(0.22, 0.24, 0.28)), coatMat);
    skull.position.set(0, -0.02, 0.1);
    skull.rotation.x = 0.52;
    const muzzle = new THREE.Mesh(track(new THREE.CylinderGeometry(0.085, 0.11, 0.26, 8)), coatMat);
    muzzle.position.set(0, -0.16, 0.24);
    muzzle.rotation.x = Math.PI / 2 + 0.52;
    const bridle = new THREE.Mesh(track(new THREE.TorusGeometry(0.11, 0.015, 6, 12)), harnessLeatherMat);
    bridle.position.set(0, -0.14, 0.22);
    bridle.rotation.y = Math.PI / 2;

    [-0.07, 0.07].forEach((ex) => {
      const ear = new THREE.Mesh(track(new THREE.ConeGeometry(0.032, 0.11, 5)), coatMat);
      ear.position.set(ex, 0.12, 0.02);
      headPivot.add(ear);
    });
    headPivot.add(skull, muzzle, bridle);
    hGroup.add(headPivot);

    // Flowing Tail
    const tailPivot = new THREE.Group();
    tailPivot.position.set(0, 1.34, -0.82);
    const tail = new THREE.Mesh(track(new THREE.CylinderGeometry(0.045, 0.095, 0.74, 8)), maneMat);
    tail.position.set(0, -0.35, -0.08);
    tail.rotation.x = -0.22;
    tailPivot.add(tail);
    hGroup.add(tailPivot);

    // Jointed Upper/Lower Legs + Hooves (with hip/shoulder pivots for trotting animation)
    const legPivots: THREE.Group[] = [];
    const upperGeo = track(new THREE.CylinderGeometry(0.085, 0.062, 0.48, 8));
    const lowerGeo = track(new THREE.CylinderGeometry(0.056, 0.048, 0.46, 8));
    const hoofGeo = track(new THREE.CylinderGeometry(0.06, 0.068, 0.08, 8));
    [
      [0.19, 0.56],
      [-0.19, 0.56],
      [0.19, -0.56],
      [-0.19, -0.56],
    ].forEach(([lx, lz]) => {
      const lPivot = new THREE.Group();
      lPivot.position.set(lx, 0.96, lz);
      const upper = new THREE.Mesh(upperGeo, coatMat);
      upper.position.set(0, -0.24, 0);
      upper.castShadow = true;
      const lower = new THREE.Mesh(lowerGeo, coatMat);
      lower.position.set(0, -0.69, 0);
      lower.castShadow = true;
      const hoof = new THREE.Mesh(hoofGeo, maneMat);
      hoof.position.set(0, -0.92, 0);
      lPivot.add(upper, lower, hoof);
      hGroup.add(lPivot);
      legPivots.push(lPivot);
    });

    return { hGroup, headPivot, tailPivot, legPivots };
  };

  // ---------------------------------------------------------------------------
  // High-Definition Parked / Moving Dray
  // ---------------------------------------------------------------------------
  const createParkedDray = (coatMat: THREE.Material) => {
    const root = new THREE.Group();
    const { hGroup, headPivot, tailPivot, legPivots } = createHorseMesh(coatMat);
    hGroup.position.set(0, 0, 1.72);
    root.add(hGroup);

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

    for (let s = 0; s < 5; s++) {
      const sack = new THREE.Mesh(track(new THREE.BoxGeometry(0.62, 0.36, 0.85)), burlapMat);
      sack.position.set(s % 2 === 0 ? -0.34 : 0.34, s === 4 ? 1.62 : 1.32, s < 2 ? -0.45 : s < 4 ? -1.32 : -0.9);
      sack.rotation.y = (s - 1.5) * 0.09;
      sack.castShadow = true;
      root.add(sack);
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

    return { root, headPivot, tailPivot, legPivots, cartWheels };
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

    // Driver inside cockpit
    if (withDriver) {
      const driverBody = new THREE.Mesh(track(new THREE.BoxGeometry(0.38, 0.46, 0.24)), brownTweedMat);
      driverBody.position.set(-0.24, 1.08, -0.18);
      const driverHead = new THREE.Mesh(headGeo, skinMat);
      driverHead.position.set(-0.24, 1.44, -0.18);
      const flatCap = new THREE.Mesh(track(new THREE.CylinderGeometry(0.125, 0.12, 0.055, 10)), charcoalMat);
      flatCap.position.set(-0.24, 1.53, -0.16);
      const goggles = new THREE.Mesh(track(new THREE.BoxGeometry(0.16, 0.045, 0.06)), brassMat);
      goggles.position.set(-0.24, 1.46, -0.07);
      const steerCol = new THREE.Mesh(track(new THREE.CylinderGeometry(0.02, 0.02, 0.65, 6)), brassMat);
      steerCol.position.set(-0.24, 1.04, 0.1);
      steerCol.rotation.x = -0.75;
      cGroup.add(driverBody, driverHead, flatCap, goggles, steerCol);
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
      const horseMat = idx % 3 === 0 ? bayHorseMat : idx % 3 === 1 ? chestnutHorseMat : dappleGreyMat;
      const dray = createParkedDray(horseMat);
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
      const { pGroup, head, arms } = createPedestrian(style, idx * 3 + s);
      const px = -4.3 + (s / Math.max(1, totalSpecs - 1)) * 8.6;
      const pz = s % 2 === 0 ? -0.65 : -1.25;
      pGroup.position.set(px, 0, pz);
      if (s % 3 === 1) {
        pGroup.rotation.y = 0.45; // conversing slightly sideways with neighbor
      }
      bGroup.add(pGroup);
      spectators.push({
        group: pGroup,
        head,
        arms,
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
  ];

  conversationClusters.forEach((cl, ci) => {
    cl.members.forEach((m, mi) => {
      const wx = cl.cx + m.dx;
      const wz = cl.cz + m.dz;
      const wy = getTerrainHeightAndSurface(wx, wz).height;
      const { pGroup, head, arms } = createPedestrian(m.style, ci * 7 + mi);
      pGroup.position.set(wx, wy, wz);
      pGroup.rotation.y = m.yaw;
      group.add(pGroup);
      spectators.push({
        group: pGroup,
        head,
        arms,
        phase: ci * 1.4 + mi * 0.75,
        mode: m.mode,
      });
    });
    crowdClusters.push({ x: cl.cx, z: cl.cz, density: cl.members.length, label: cl.label });
  });

  // Walking Pedestrians strolling along safe stone footpaths (clear of road carriageway)
  const sidewalkWalkRoutes: { x1: number; z1: number; x2: number; z2: number; style: CitizenStyle; speed: number }[] = [
    { x1: -72, z1: -9.4, x2: -12, z2: -9.4, style: 'gentleman', speed: 1.35 },
    { x1: -8, z1: 9.4, x2: 65, z2: 9.4, style: 'lady', speed: 1.15 },
    { x1: 12, z1: -9.5, x2: 68, z2: -9.5, style: 'worker', speed: 1.4 },
    { x1: -95.2, z1: -56, x2: -95.2, z2: -16, style: 'lady', speed: 1.2 },
    { x1: -112.8, z1: -58, x2: -112.8, z2: -18, style: 'gentleman', speed: 1.3 },
    { x1: -143.2, z1: -48, x2: -143.2, z2: 96, style: 'worker', speed: 1.38 },
    { x1: 86.2, z1: 14, x2: 86.2, z2: 98, style: 'gentleman', speed: 1.25 },
    { x1: -82, z1: 109.2, x2: 74, z2: 109.2, style: 'lady', speed: 1.18 },
  ];

  sidewalkWalkRoutes.forEach((rt, wi) => {
    const { pGroup, arms, legs } = createPedestrian(rt.style, wi + 2);
    group.add(pGroup);
    walkers.push({
      group: pGroup,
      leftLeg: legs[0],
      rightLeg: legs[1],
      leftArm: arms[0],
      rightArm: arms[1],
      x1: rt.x1,
      z1: rt.z1,
      x2: rt.x2,
      z2: rt.z2,
      speed: rt.speed,
      phase: wi * 1.8,
      progress: (wi * 0.23) % 1,
      dir: wi % 2 === 0 ? 1 : -1,
      evadeTimer: 0,
    });
  });

  // ---------------------------------------------------------------------------
  // 3. High-Definition Animals: Farm Collies (Bark & Chase), Merino Sheep & Horses
  // ---------------------------------------------------------------------------
  const dogSpots: { x: number; z: number; yaw: number; canChase: boolean }[] = [
    { x: -46, z: 9.5, yaw: Math.PI, canChase: true }, // Criterion Hotel start/finish collie
    { x: 32, z: -9.2, yaw: 0.2, canChase: true }, // Meek's Grain Store collie
    { x: -112.4, z: -10, yaw: Math.PI / 2, canChase: false }, // Oamaru Opera House footpath barker
    { x: -143.5, z: 56, yaw: Math.PI / 2, canChase: true }, // Waitaki Courthouse collie
    { x: 86.5, z: 46, yaw: -Math.PI / 2, canChase: false }, // Quay Esplanade barker
    { x: 10, z: 108.5, yaw: 0, canChase: true }, // Wanbrow Ridge sheepdog
  ];
  const dogLegGeo = track(new THREE.CylinderGeometry(0.032, 0.025, 0.30, 6));

  dogSpots.forEach((spot, idx) => {
    const dGroup = new THREE.Group();
    const body = new THREE.Mesh(track(new THREE.CylinderGeometry(0.13, 0.14, 0.56, 10)), collieMat);
    body.rotation.x = Math.PI / 2;
    body.position.set(0, 0.40, 0);
    body.castShadow = true;
    const chest = new THREE.Mesh(track(new THREE.SphereGeometry(0.15, 8, 8)), collieWhiteMat);
    chest.position.set(0, 0.42, 0.24);

    const headPivot = new THREE.Group();
    headPivot.position.set(0, 0.54, 0.30);
    const skull = new THREE.Mesh(track(new THREE.BoxGeometry(0.15, 0.15, 0.18)), collieMat);
    skull.position.set(0, 0.02, 0.05);
    const snout = new THREE.Mesh(track(new THREE.CylinderGeometry(0.035, 0.055, 0.14, 7)), collieWhiteMat);
    snout.rotation.x = Math.PI / 2;
    snout.position.set(0, 0.0, 0.17);
    const earL = new THREE.Mesh(track(new THREE.ConeGeometry(0.03, 0.08, 4)), collieMat);
    earL.position.set(0.055, 0.11, 0.02);
    const earR = new THREE.Mesh(track(new THREE.ConeGeometry(0.03, 0.08, 4)), collieMat);
    earR.position.set(-0.055, 0.11, 0.02);
    headPivot.add(skull, snout, earL, earR);

    const tailPivot = new THREE.Group();
    tailPivot.position.set(0, 0.46, -0.28);
    const tail = new THREE.Mesh(track(new THREE.CylinderGeometry(0.024, 0.042, 0.32, 6)), collieMat);
    tail.position.set(0, 0.09, -0.11);
    tail.rotation.x = -0.92;
    tailPivot.add(tail);

    const legPivots: THREE.Object3D[] = [];
    [
      [0.09, 0.20],
      [-0.09, 0.20],
      [0.09, -0.20],
      [-0.09, -0.20],
    ].forEach(([lx, lz]) => {
      const lPivot = new THREE.Group();
      lPivot.position.set(lx, 0.30, lz);
      const leg = new THREE.Mesh(dogLegGeo, collieWhiteMat);
      leg.position.set(0, -0.15, 0);
      leg.castShadow = true;
      lPivot.add(leg);
      dGroup.add(lPivot);
      legPivots.push(lPivot);
    });
    dGroup.add(body, chest, headPivot, tailPivot);

    const dy = getTerrainHeightAndSurface(spot.x, spot.z).height;
    dGroup.position.set(spot.x, dy, spot.z);
    dGroup.rotation.y = spot.yaw;
    group.add(dGroup);

    dogs.push({
      group: dGroup,
      head: headPivot,
      tail: tailPivot,
      legs: legPivots,
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
  ];
  const sLegGeo = track(new THREE.CylinderGeometry(0.04, 0.035, 0.32, 6));

  sheepSpecs.forEach((sp, idx) => {
    const sGroup = new THREE.Group();
    const fleece = new THREE.Mesh(track(new THREE.SphereGeometry(0.36, 10, 8)), sheepWoolMat);
    fleece.scale.set(0.85, 0.85, 1.35);
    fleece.position.set(0, 0.52, 0);
    fleece.castShadow = true;
    const headPivot = new THREE.Group();
    headPivot.position.set(0, 0.62, 0.42);
    const sHead = new THREE.Mesh(track(new THREE.BoxGeometry(0.18, 0.18, 0.28)), sheepFaceMat);
    sHead.position.set(0, -0.02, 0.08);
    headPivot.add(sHead);
    const tailPivot = new THREE.Group();
    tailPivot.position.set(0, 0.50, -0.44);
    const sTail = new THREE.Mesh(track(new THREE.SphereGeometry(0.08, 6, 6)), sheepWoolMat);
    tailPivot.add(sTail);

    const legPivots: THREE.Object3D[] = [];
    [
      [0.14, 0.24],
      [-0.14, 0.24],
      [0.14, -0.24],
      [-0.14, -0.24],
    ].forEach(([lx, lz]) => {
      const lPivot = new THREE.Group();
      lPivot.position.set(lx, 0.32, lz);
      const leg = new THREE.Mesh(sLegGeo, sheepFaceMat);
      leg.position.set(0, -0.16, 0);
      leg.castShadow = true;
      lPivot.add(leg);
      sGroup.add(lPivot);
      legPivots.push(lPivot);
    });
    sGroup.add(fleece, headPivot, tailPivot);
    sGroup.position.set(sp.x, getTerrainHeightAndSurface(sp.x, sp.z).height, sp.z);
    sGroup.rotation.y = sp.yaw;
    group.add(sGroup);

    sheepList.push({
      group: sGroup,
      head: headPivot,
      tail: tailPivot,
      legs: legPivots,
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
  const looseHorses: [number, number, number, THREE.Material][] = [
    [-72, 10, Math.PI * 0.8, dappleGreyMat],
    [34, -42, -0.6, chestnutHorseMat],
  ];
  looseHorses.forEach(([hx, hz, hyaw, mat], idx) => {
    const { hGroup, headPivot, tailPivot } = createHorseMesh(mat);
    hGroup.position.set(hx, getTerrainHeightAndSurface(hx, hz).height, hz);
    hGroup.rotation.y = hyaw;
    group.add(hGroup);
    idleAnimals.push({ kind: 'horse', x: hx, z: hz, head: headPivot, tail: tailPivot, startleTimer: 0, phase: idx * 2.4 });
  });

  // Moving Horse-Drawn Grain Dray trotting calmly along outer kerbside of circuit
  {
    const dray = createParkedDray(bayHorseMat);
    const { pGroup: drayDriver } = createPedestrian('worker', 9);
    drayDriver.scale.setScalar(0.86);
    drayDriver.position.set(0, 0.72, -0.2);
    dray.root.add(drayDriver);
    const startProg = 680;
    const pos = sampleCircuitLoop(startProg, -2.9);
    dray.root.position.set(pos.x, getTerrainHeightAndSurface(pos.x, pos.z).height, pos.z);
    dray.root.rotation.y = pos.yaw;
    group.add(dray.root);
    movingDrays.push({
      group: dray.root,
      horseLegs: dray.legPivots,
      cartWheels: dray.cartWheels,
      head: dray.headPivot,
      tail: dray.tailPivot,
      progress: startProg,
      speedMps: 3.1,
      laneOffset: -2.9,
      x: pos.x,
      z: pos.z,
    });
    obstacles.push({ x: pos.x, z: pos.z, radius: 1.75 });
  }

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
    { startProgress: 340, speedMps: 6.5, laneOffset: -2.2, color: 0x263529 }, // 1912 Deep Green Tourer
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
    });
    obstacles.push({ x: pos.x, z: pos.z, radius: 1.55 });
  });

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

  for (let g = 0; g < 9; g++) {
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

    seagulls.push({
      group: gGroup,
      leftWing,
      rightWing,
      centerX: 118 + (g % 3) * 14,
      centerZ: -18 + (g - 4) * 14,
      baseY: 11 + (g % 4) * 2.8,
      orbitR: 12 + (g % 3) * 5,
      speed: 0.42 + (g % 3) * 0.11,
      phase: g * 0.85,
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
  const kiltJacketMat = track(new THREE.MeshStandardMaterial({ color: 0x1d2b24, roughness: 0.82 }));
  const hoseCreamMat = track(new THREE.MeshStandardMaterial({ color: 0xebe4d2, roughness: 0.86 }));
  const droneWoodMat = track(new THREE.MeshStandardMaterial({ color: 0x1d1410, roughness: 0.45 }));

  const piperGroup = new THREE.Group();
  const piperBodyPivot = new THREE.Group();
  piperGroup.add(piperBodyPivot);

  // Legs with bare knees, Highland cream hose, red flashes & dark brogues
  const piperLegs: THREE.Group[] = [];
  [-0.095, 0.095].forEach((lx) => {
    const lPivot = new THREE.Group();
    lPivot.position.set(lx, 0.72, 0);
    const knee = new THREE.Mesh(track(new THREE.CylinderGeometry(0.068, 0.062, 0.24, 8)), skinMat);
    knee.position.set(0, -0.14, 0);
    const hose = new THREE.Mesh(track(new THREE.CylinderGeometry(0.064, 0.052, 0.36, 8)), hoseCreamMat);
    hose.position.set(0, -0.44, 0);
    hose.castShadow = true;
    const flash = new THREE.Mesh(track(new THREE.BoxGeometry(0.03, 0.09, 0.025)), barrierRedMat);
    flash.position.set(lx > 0 ? 0.06 : -0.06, -0.32, 0.02);
    const brogue = new THREE.Mesh(bootGeo, leatherBootMat);
    brogue.position.set(0, -0.66, 0.035);
    lPivot.add(knee, hose, flash, brogue);
    piperBodyPivot.add(lPivot);
    piperLegs.push(lPivot);
  });

  // Tartan Kilt + Leather & Fur Sporran
  const kilt = new THREE.Mesh(track(new THREE.CylinderGeometry(0.165, 0.275, 0.48, 14)), tartanMat);
  kilt.position.set(0, 0.78, 0);
  kilt.castShadow = true;
  const sporran = new THREE.Mesh(track(new THREE.BoxGeometry(0.13, 0.17, 0.06)), hoseCreamMat);
  sporran.position.set(0, 0.78, 0.22);
  const sporranTop = new THREE.Mesh(track(new THREE.BoxGeometry(0.135, 0.045, 0.065)), leatherBootMat);
  sporranTop.position.set(0, 0.87, 0.22);
  piperBodyPivot.add(kilt, sporran, sporranTop);

  // Argyll Jacket + Tartan Shoulder Plaid + Waist Belt
  const piperTorso = new THREE.Mesh(track(new THREE.BoxGeometry(0.36, 0.48, 0.21)), kiltJacketMat);
  piperTorso.position.set(0, 1.24, 0);
  piperTorso.castShadow = true;
  const piperBelt = new THREE.Mesh(track(new THREE.BoxGeometry(0.37, 0.06, 0.225)), leatherBootMat);
  piperBelt.position.set(0, 1.01, 0);
  const buckle = new THREE.Mesh(track(new THREE.BoxGeometry(0.08, 0.07, 0.03)), brassMat);
  buckle.position.set(0, 1.01, 0.12);
  const plaidSash = new THREE.Mesh(track(new THREE.BoxGeometry(0.14, 0.56, 0.23)), tartanMat);
  plaidSash.position.set(-0.04, 1.24, 0);
  plaidSash.rotation.z = 0.52;
  piperBodyPivot.add(piperTorso, piperBelt, buckle, plaidSash);

  // Head + Ginger Beard + Scottish Glengarry Bonnet
  const piperHead = new THREE.Group();
  piperHead.position.set(0, 1.54, 0);
  const pNeck = new THREE.Mesh(neckGeo, skinMat);
  pNeck.position.set(0, -0.06, 0);
  const pSkull = new THREE.Mesh(headGeo, skinMat);
  pSkull.position.set(0, 0.05, 0);
  pSkull.castShadow = true;
  const pNose = new THREE.Mesh(noseGeo, skinMat);
  pNose.position.set(0, 0.04, 0.11);
  const beardMat = track(new THREE.MeshStandardMaterial({ color: 0xa44b24, roughness: 0.88 }));
  const pBeard = new THREE.Mesh(track(new THREE.BoxGeometry(0.13, 0.11, 0.09)), beardMat);
  pBeard.position.set(0, -0.02, 0.085);
  const bonnet = new THREE.Mesh(track(new THREE.BoxGeometry(0.13, 0.11, 0.27)), kiltJacketMat);
  bonnet.position.set(0, 0.15, -0.01);
  bonnet.rotation.z = -0.14;
  const bonnetBand = new THREE.Mesh(track(new THREE.BoxGeometry(0.138, 0.035, 0.275)), tartanMat);
  bonnetBand.position.set(0, 0.11, -0.01);
  bonnetBand.rotation.z = -0.14;
  const toorie = new THREE.Mesh(track(new THREE.SphereGeometry(0.028, 6, 6)), barrierRedMat);
  toorie.position.set(0.02, 0.21, 0.02);
  piperHead.add(pNeck, pSkull, pNose, pBeard, bonnet, bonnetBand, toorie);
  piperBodyPivot.add(piperHead);

  // Arms + Great Highland Bagpipes (tartan bag, blowpipe, chanter, 3 brass-ferruled drones)
  const piperArms: THREE.Group[] = [];
  [-0.22, 0.22].forEach((ax) => {
    const aPivot = new THREE.Group();
    aPivot.position.set(ax, 1.42, 0);
    const sleeve = new THREE.Mesh(track(new THREE.CylinderGeometry(0.052, 0.042, 0.48, 8)), kiltJacketMat);
    sleeve.position.set(0, -0.22, 0);
    sleeve.castShadow = true;
    const hand = new THREE.Mesh(handGeo, skinMat);
    hand.position.set(0, -0.47, 0);
    aPivot.add(sleeve, hand);
    piperBodyPivot.add(aPivot);
    piperArms.push(aPivot);
  });
  piperArms[0].rotation.set(-0.78, 0, 0.25);
  piperArms[1].rotation.set(-0.85, 0, -0.35);

  const pipesGroup = new THREE.Group();
  pipesGroup.position.set(-0.14, 1.26, 0.18);
  const airbag = new THREE.Mesh(track(new THREE.SphereGeometry(0.16, 10, 8)), tartanMat);
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
    [0.04, 0.30, -0.09, 0.52],  // Tenor drone 2
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
  piperBodyPivot.add(pipesGroup);

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
          sp.arms[0].rotation.x = -2.1 + Math.sin(elapsed * 4.8 + sp.phase) * 0.42;
          sp.arms[1].rotation.x = -0.35 + Math.cos(elapsed * 3.2 + sp.phase) * 0.18;
          sp.head.rotation.y = Math.sin(elapsed * 1.8 + sp.phase) * 0.16;
        } else if (sp.mode === 'discussing') {
          sp.arms[0].rotation.x = -0.85 + Math.sin(elapsed * 3.8 + sp.phase) * 0.28;
          sp.arms[0].rotation.z = -0.18 + Math.cos(elapsed * 2.6 + sp.phase) * 0.12;
          sp.arms[1].rotation.x = -0.45 + Math.cos(elapsed * 2.9 + sp.phase) * 0.22;
          sp.head.rotation.x = Math.sin(elapsed * 2.4 + sp.phase) * 0.14;
          sp.head.rotation.y = Math.sin(elapsed * 1.5 + sp.phase * 1.3) * 0.28;
        } else {
          sp.arms[0].rotation.x = Math.sin(elapsed * 1.4 + sp.phase) * 0.08;
          sp.arms[1].rotation.x = -Math.sin(elapsed * 1.4 + sp.phase) * 0.08;
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
          w.leftLeg.rotation.x = THREE.MathUtils.damp(w.leftLeg.rotation.x, 0, 12, dt);
          w.rightLeg.rotation.x = THREE.MathUtils.damp(w.rightLeg.rotation.x, 0, 12, dt);
          w.leftArm.rotation.x = -2.1 + Math.sin(elapsed * 8 + w.phase) * 0.35;
          w.rightArm.rotation.x = -1.9 + Math.cos(elapsed * 8 + w.phase) * 0.35;
        } else {
          w.progress += (w.speed / segLen) * dt * w.dir;
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
          w.group.position.set(wx, wy, wz);
          const dirX = (w.x2 - w.x1) * w.dir;
          const dirZ = (w.z2 - w.z1) * w.dir;
          w.group.rotation.y = Math.atan2(dirX, dirZ);

          const stride = Math.sin(elapsed * w.speed * 4.5 + w.phase) * 0.48;
          w.leftLeg.rotation.x = stride;
          w.rightLeg.rotation.x = -stride;
          w.leftArm.rotation.x = -stride * 0.7;
          w.rightArm.rotation.x = stride * 0.7;
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

        // Stride / gallop animation
        if (dg.speed > 0.4) {
          const gallop = Math.sin(elapsed * 14 + dg.phase) * 0.68;
          dg.legs[0].rotation.x = gallop;
          dg.legs[1].rotation.x = gallop * 0.85;
          dg.legs[2].rotation.x = -gallop;
          dg.legs[3].rotation.x = -gallop * 0.85;
        } else {
          for (let l = 0; l < 4; l++) {
            dg.legs[l].rotation.x = THREE.MathUtils.damp(dg.legs[l].rotation.x, 0, 10, dt);
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
          sh.head.rotation.x = -0.14 + Math.sin(elapsed * 10 + sh.phase) * 0.12;
          sh.tail.rotation.x = Math.sin(elapsed * 14 + sh.phase) * 0.28;
        } else {
          for (let l = 0; l < 4; l++) {
            sh.legs[l].rotation.x = THREE.MathUtils.damp(sh.legs[l].rotation.x, 0, 8, dt);
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

        // Check collision / run-over hit
        if (distPiperCar < 1.58 && pSpeed > 1.8) {
          piper.state = 'down';
          piper.downTimer = 6.5;
          piper.panicTimer = 0;
          piper.panicLevel = 0;
          piper.vx = 0;
          piper.vz = 0;
          piper.justHit = true;

          const pushA = Math.atan2(piper.x - pX, piper.z - pZ);
          piper.x = pX + Math.sin(pushA) * 1.75;
          piper.z = pZ + Math.cos(pushA) * 1.75;
          piper.yaw = pushA;
        } else {
          // Determine whether the Model T is trying to run him over or rushing near him
          const toPiperX = (piper.x - pX) / (distPiperCar || 1);
          const toPiperZ = (piper.z - pZ) / (distPiperCar || 1);
          const carDirX = Math.sin(pYaw);
          const carDirZ = Math.cos(pYaw);
          const aimedAtPiper = toPiperX * carDirX + toPiperZ * carDirZ > 0.25;
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
            // Dodge sideways slightly as car closes in while sprinting fast away
            const dodgeWeight = distPiperCar < 10 ? 0.52 * piper.dodgeSeed : 0.18 * piper.dodgeSeed;
            let desX = awayX / awayLen + perpX * dodgeWeight;
            let desZ = awayZ / awayLen + perpZ * dodgeWeight;
            const desLen = Math.hypot(desX, desZ) || 1;
            desX /= desLen;
            desZ /= desLen;

            const fleeSpeed = distPiperCar < 11 ? 7.3 : 6.2;
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
          let nextPz = THREE.MathUtils.clamp(piper.z + piper.vz * dt, -74, 124);

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
          const stride = pSpeedMag > 0.2 ? Math.sin(elapsed * strideRate) * strideAmp : 0;
          piperLegs[0].rotation.x = stride;
          piperLegs[1].rotation.x = -stride;

          if (piper.state === 'fleeing') {
            pipesGroup.rotation.z = Math.sin(elapsed * 22) * 0.16;
            pipesGroup.rotation.x = Math.cos(elapsed * 18) * 0.12;
            piperHead.rotation.y = Math.sin(elapsed * 12) * 0.42;
            piperArms[0].rotation.x = -0.82 + Math.sin(elapsed * 18) * 0.25;
            piperArms[1].rotation.x = -0.85 + Math.cos(elapsed * 18) * 0.25;
          } else {
            pipesGroup.rotation.z = Math.sin(elapsed * 2.4) * 0.04;
            pipesGroup.rotation.x = 0;
            piperHead.rotation.y = Math.sin(elapsed * 1.4) * 0.15;
            piperArms[0].rotation.x = -0.78 + Math.sin(elapsed * 4.5) * 0.05;
            piperArms[1].rotation.x = -0.85 + Math.cos(elapsed * 4.5) * 0.06;
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
      const piperProximity = Math.max(0, Math.min(1, 1 - (piperDist - 3) / 45));

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
