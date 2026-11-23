import { ColliderBox, Landmark, SurfaceType, TerrainSample } from './types';

export interface CircuitCheckpoint {
  index: number;
  label: string;
  x: number;
  z: number;
  radius: number;
}

export const CIRCUIT_LOOP_POINTS: readonly [number, number][] = [
  [-104, 0], // Turn 6 exit onto Harbour St
  [95, 0], // Turn 1 onto Quay Esplanade
  [95, 118], // Turn 2 onto Wanbrow Ridge
  [-152, 118], // Turn 3 onto Severn St
  [-152, -68], // Turn 4 onto Itchen St
  [-104, -68], // Turn 5 onto Thames St
];

export const CIRCUIT_CHECKPOINTS: CircuitCheckpoint[] = [
  { index: 0, label: 'Start / Finish (Harbour St)', x: -56, z: 0, radius: 11 },
  { index: 1, label: 'Sector 1 (Quay & Wanbrow)', x: 95, z: 58, radius: 13 },
  { index: 2, label: 'Sector 2 (Wanbrow Ridge)', x: -24, z: 118, radius: 13 },
  { index: 3, label: 'Sector 3 (Severn & Thames)', x: -128, z: -68, radius: 14 },
];

export interface SideStreetBlockade {
  id: string;
  x: number;
  z: number;
  yaw: number;
  width: number;
  hasCart: boolean;
  spectatorCount: number;
}

export const SIDE_STREET_BLOCKADES: SideStreetBlockade[] = [
  { id: 'wharf-gate', x: 105, z: 0, yaw: Math.PI / 2, width: 12, hasCart: true, spectatorCount: 4 },
  { id: 'quay-north', x: 95, z: -11.5, yaw: 0, width: 12, hasCart: true, spectatorCount: 3 },
  { id: 'tyne-north', x: -24, z: -11.5, yaw: 0, width: 12, hasCart: true, spectatorCount: 4 },
  { id: 'tyne-south', x: -24, z: 11.5, yaw: Math.PI, width: 12, hasCart: true, spectatorCount: 3 },
  { id: 'tyne-wansbeck', x: -24, z: 107, yaw: 0, width: 12, hasCart: true, spectatorCount: 2 },
  { id: 'thames-wansbeck', x: -104, z: 107, yaw: 0, width: 13, hasCart: true, spectatorCount: 3 },
  { id: 'thames-south', x: -104, z: 11.5, yaw: Math.PI, width: 13, hasCart: true, spectatorCount: 4 },
  { id: 'thames-north', x: -104, z: -78, yaw: 0, width: 13, hasCart: true, spectatorCount: 3 },
  { id: 'itchen-east', x: -91.5, z: -68, yaw: Math.PI / 2, width: 12, hasCart: true, spectatorCount: 3 },
  { id: 'harbour-west', x: -114, z: 0, yaw: -Math.PI / 2, width: 12, hasCart: true, spectatorCount: 3 },
  { id: 'wanbrow-upper', x: 95, z: 128, yaw: Math.PI, width: 12, hasCart: true, spectatorCount: 2 },
  { id: 'severn-north', x: -152, z: -78, yaw: 0, width: 13, hasCart: true, spectatorCount: 2 },
  { id: 'wansbeck-west', x: -162, z: 118, yaw: -Math.PI / 2, width: 12, hasCart: true, spectatorCount: 2 },
];

export const OAMARU_LANDMARKS: Landmark[] = [
  {
    id: 'harbour-st',
    name: 'Harbour Street',
    subtitle: 'Start / Finish · Whitestone Mercantile Row',
    x: 24,
    z: 0,
    radius: 26,
  },
  {
    id: 'criterion',
    name: 'Criterion Hotel',
    subtitle: 'Tyne & Harbour Corner · Licensed Victualler',
    x: -48,
    z: 14,
    radius: 20,
  },
  {
    id: 'meeks-grain',
    name: "Meek's Grain & Flour Store",
    subtitle: 'Oamaru Limestone Storehouses',
    x: 22,
    z: -8,
    radius: 18,
  },
  {
    id: 'harbour-board',
    name: 'Oamaru Harbour Board',
    subtitle: 'East Quay Cobblestone Hairpin',
    x: 82,
    z: -4,
    radius: 20,
  },
  {
    id: 'wanbrow-grade',
    name: 'Cape Wanbrow Climb',
    subtitle: 'Coastal Ridge Straight · 8% Grade',
    x: 95,
    z: 88,
    radius: 30,
  },
  {
    id: 'wansbeck-ridge',
    name: 'Wanbrow Coastal Terrace',
    subtitle: 'Panoramic Otago Ridge Straight',
    x: -24,
    z: 118,
    radius: 34,
  },
  {
    id: 'severn-courthouse',
    name: 'Severn St & Courthouse',
    subtitle: 'Western Victorian Terrace',
    x: -152,
    z: 20,
    radius: 34,
  },
  {
    id: 'forrester-gallery',
    name: 'Forrester Gallery (Bank of NSW)',
    subtitle: 'Corinthian Portico · Thames & Itchen',
    x: -104,
    z: -48,
    radius: 22,
  },
];

export interface RoadPothole {
  id: string;
  x: number;
  z: number;
  radius: number;
  depth: number;
}

export type ObstructionKind =
  | 'crate'
  | 'wool-bales'
  | 'wheelbarrow'
  | 'sawhorse'
  | 'milk-churns'
  | 'branch';

export interface RoadObstruction {
  id: string;
  x: number;
  z: number;
  radius: number;
  yaw: number;
  kind: ObstructionKind;
}

export const ROAD_POTHOLES: RoadPothole[] = [
  { id: 'ph-harbour-1', x: -34, z: 1.8, radius: 1.05, depth: 0.14 },
  { id: 'ph-harbour-2', x: 4, z: -2.4, radius: 1.15, depth: 0.15 },
  { id: 'ph-harbour-3', x: 38, z: 1.5, radius: 0.95, depth: 0.13 },
  { id: 'ph-harbour-4', x: 68, z: -1.9, radius: 1.1, depth: 0.14 },
  { id: 'ph-harbour-w', x: -84, z: -1.8, radius: 1.1, depth: 0.14 },
  { id: 'ph-quay-1', x: 96.8, z: 36, radius: 1.15, depth: 0.15 },
  { id: 'ph-quay-2', x: 93.4, z: 78, radius: 1.2, depth: 0.16 },
  { id: 'ph-wanbrow-1', x: 42, z: 119.6, radius: 1.25, depth: 0.16 },
  { id: 'ph-wanbrow-2', x: -12, z: 116.2, radius: 1.1, depth: 0.15 },
  { id: 'ph-wanbrow-3', x: -82, z: 119.2, radius: 1.25, depth: 0.16 },
  { id: 'ph-severn-1', x: -150.2, z: 74, radius: 1.15, depth: 0.15 },
  { id: 'ph-severn-2', x: -153.6, z: 10, radius: 1.2, depth: 0.16 },
  { id: 'ph-itchen-1', x: -128, z: -69.4, radius: 1.05, depth: 0.14 },
  { id: 'ph-thames-1', x: -105.8, z: -34, radius: 1.1, depth: 0.15 },
];

export const ROAD_OBSTRUCTIONS: RoadObstruction[] = [
  { id: 'obs-crate-harbour', x: -29, z: 4.9, radius: 0.68, yaw: 0.35, kind: 'crate' },
  { id: 'obs-sawhorse-harbour', x: 18, z: -4.8, radius: 0.85, yaw: 0.12, kind: 'sawhorse' },
  { id: 'obs-wool-harbour-e', x: 76, z: 0.0, radius: 0.78, yaw: 0.28, kind: 'wool-bales' },
  { id: 'obs-churns-quay', x: 99.2, z: 48, radius: 0.65, yaw: 0.6, kind: 'milk-churns' },
  { id: 'obs-wool-wanbrow', x: 56, z: 122.4, radius: 0.82, yaw: -0.22, kind: 'wool-bales' },
  { id: 'obs-barrow-wanbrow', x: -46, z: 118.0, radius: 0.72, yaw: 0.48, kind: 'wheelbarrow' },
  { id: 'obs-branch-severn', x: -156.5, z: 46, radius: 0.88, yaw: 0.32, kind: 'branch' },
  { id: 'obs-crate-itchen', x: -134, z: -63.8, radius: 0.68, yaw: -0.4, kind: 'crate' },
  { id: 'obs-sawhorse-thames', x: -104.0, z: -16, radius: 0.85, yaw: 0.15, kind: 'sawhorse' },
];

export const WORLD_COLLIDERS: ColliderBox[] = [
  // Building blocks enclosing the urban circuit cleanly
  { minX: -94, maxX: -36, minZ: -58, maxZ: -11, label: 'North-West Whitestone Block' },
  { minX: -12, maxX: 84, minZ: -58, maxZ: -11, label: 'Harbour St North Arcade' },
  { minX: -94, maxX: -36, minZ: 11, maxZ: 106, label: 'Criterion & South-West Block' },
  { minX: -12, maxX: 84, minZ: 11, maxZ: 106, label: 'Harbour St South Block' },
  { minX: -142, maxX: -114, minZ: -58, maxZ: 106, label: 'Thames–Severn Civic Block' },

  // Outer perimeter Victorian building terraces
  { minX: -94, maxX: -36, minZ: -102, maxZ: -77, label: 'Itchen North-West Terrace' },
  { minX: -12, maxX: 84, minZ: -102, maxZ: -77, label: 'Itchen North-East Terrace' },
  { minX: -186, maxX: -161, minZ: -58, maxZ: 96, label: 'Severn St West Terrace' },

  // Natural Side-Street Blockade Colliders (carts, barrels, barriers & spectators)
  { minX: 103, maxX: 111, minZ: -9, maxZ: 9, label: 'Sumpter Wharf Barricade' },
  { minX: 87, maxX: 103, minZ: -17, maxZ: -9, label: 'Quay North Carts' },
  { minX: -32, maxX: -16, minZ: -16, maxZ: -9, label: 'Tyne North Carts' },
  { minX: -32, maxX: -16, minZ: 9, maxZ: 16, label: 'Tyne South Carts' },
  { minX: -32, maxX: -16, minZ: 104, maxZ: 111, label: 'Tyne Wansbeck Barrier' },
  { minX: -112, maxX: -96, minZ: 104, maxZ: 111, label: 'Thames Wansbeck Barrier' },
  { minX: -112, maxX: -96, minZ: 9, maxZ: 16, label: 'Thames South Barrier' },
  { minX: -112, maxX: -96, minZ: -83, maxZ: -75, label: 'Thames North Barrier' },
  { minX: -96, maxX: -88, minZ: -76, maxZ: -60, label: 'Itchen East Carts' },
  { minX: -119, maxX: -112, minZ: -9, maxZ: 9, label: 'Harbour West Carts' },
  { minX: 87, maxX: 103, minZ: 126, maxZ: 135, label: 'Cape Wanbrow Upper Barrier' },
  { minX: -161, maxX: -143, minZ: -83, maxZ: -75, label: 'Severn North Barrier' },
  { minX: -168, maxX: -159, minZ: 110, maxZ: 126, label: 'Wansbeck West Barrier' },
];

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function samplePotholeAt(x: number, z: number): { dip: number; bumpBoost: number; rutBias: number } {
  for (let i = 0; i < ROAD_POTHOLES.length; i++) {
    const p = ROAD_POTHOLES[i];
    const dx = x - p.x;
    const dz = z - p.z;
    if (Math.abs(dx) >= p.radius || Math.abs(dz) >= p.radius) continue;
    const distSq = dx * dx + dz * dz;
    const rSq = p.radius * p.radius;
    if (distSq < rSq) {
      const t = 1 - distSq / rSq;
      return {
        dip: p.depth * t * t,
        bumpBoost: 0.036 * t,
        rutBias: (dx / p.radius) * 0.24 * t,
      };
    }
  }
  return { dip: 0, bumpBoost: 0, rutBias: 0 };
}

/**
 * Computes terrain elevation y(x, z) and surface classification for the extended 1914 Oamaru circuit.
 */
export function getTerrainHeightAndSurface(
  x: number,
  z: number,
  skipPotholes = false
): {
  height: number;
  surface: SurfaceType;
  bumpAmplitude: number;
  rutPull: number;
} {
  if (x >= 103 && x <= 168 && Math.abs(z) <= 7.2) {
    const plankBump = Math.sin(x * 11.5) * 0.008;
    return {
      height: 1.05 + plankBump,
      surface: 'wharf',
      bumpAmplitude: 0.012,
      rutPull: 0,
    };
  }

  if (x > 107) {
    return {
      height: -1.35,
      surface: 'water',
      bumpAmplitude: 0,
      rutPull: 0,
    };
  }

  let baseHeight = 1.0;

  // Gentle western terrace rise across Severn Street (-140..-200)
  if (x < -128) {
    baseHeight += smoothstep(-128, -195, x) * 2.2;
  }

  // Cape Wanbrow headland climb south of z = 60 along Quay & Wanbrow Ridge (z = 118)
  if (z > 60) {
    const hillT = smoothstep(60, 125, z);
    const eastRidge = smoothstep(-140, 102, x);
    baseHeight += hillT * (1.8 + eastRidge * 3.8);
  }

  if (z < -100) {
    baseHeight += smoothstep(-100, -200, z) * 6.5;
  }

  const onHarbourSt = Math.abs(z) <= 7.2 && x >= -112 && x <= 104;
  const onTyneSt = Math.abs(x - -24) <= 6.8 && z >= -95 && z <= 122;
  const onItchenSt = Math.abs(z - -68) <= 6.8 && x >= -159 && x <= 102;
  const onQuayRoad = Math.abs(x - 95) <= 6.8 && z >= -95 && z <= 135;
  const onThamesSt = Math.abs(x - -104) <= 7.5 && z >= -105 && z <= 125;
  const onSevernSt = Math.abs(x - -152) <= 7.2 && z >= -80 && z <= 125;
  const onWansbeckRidge = Math.abs(z - 118) <= 7.2 && x >= -160 && x <= 102;
  const onRailMudSiding = z >= -61.5 && z <= -45 && x >= 12 && x <= 86;

  if (onRailMudSiding) {
    const rutWave = Math.sin(x * 0.65) * 0.045 + Math.cos(z * 2.4) * 0.055;
    const rutPull = Math.sin(x * 0.35 + z * 0.8) * 0.28;
    return {
      height: baseHeight - 0.06 + rutWave,
      surface: 'mud',
      bumpAmplitude: 0.045,
      rutPull,
    };
  }

  // Bluestone Cobblestones on East Harbour Street & Quay corner
  if ((onHarbourSt && x >= 12) || (onQuayRoad && z >= -22 && z <= 22)) {
    const distFromCenter = onHarbourSt ? Math.abs(z) / 7.2 : Math.abs(x - 95) / 6.8;
    const crown = (1 - distFromCenter * distFromCenter) * 0.07;
    const settRipple = Math.sin(x * 7.5) * Math.sin(z * 7.5) * 0.011;
    const hole = skipPotholes ? { dip: 0, bumpBoost: 0, rutBias: 0 } : samplePotholeAt(x, z);
    return {
      height: baseHeight + crown + settRipple - hole.dip,
      surface: 'cobbles',
      bumpAmplitude: 0.024 + hole.bumpBoost,
      rutPull: hole.rutBias,
    };
  }

  // Compacted Oamaru Limestone Macadam across the circuit
  if (
    onHarbourSt ||
    onTyneSt ||
    onItchenSt ||
    onQuayRoad ||
    onThamesSt ||
    onSevernSt ||
    onWansbeckRidge
  ) {
    const gravelMicro = Math.sin(x * 2.1 + z * 1.7) * 0.008;
    const hole = skipPotholes ? { dip: 0, bumpBoost: 0, rutBias: 0 } : samplePotholeAt(x, z);
    return {
      height: baseHeight + 0.05 + gravelMicro - hole.dip,
      surface: 'macadam',
      bumpAmplitude: 0.012 + hole.bumpBoost,
      rutPull: hole.rutBias,
    };
  }

  const undulation = Math.sin(x * 0.08) * Math.cos(z * 0.08) * 0.25;
  return {
    height: baseHeight + undulation,
    surface: 'grass',
    bumpAmplitude: 0.03,
    rutPull: Math.sin(x * 0.2 + z * 0.2) * 0.08,
  };
}

export function getTerrainSample(x: number, z: number): TerrainSample {
  const center = getTerrainHeightAndSurface(x, z);
  const eps = 0.25;
  const hL = getTerrainHeightAndSurface(x - eps, z).height;
  const hR = getTerrainHeightAndSurface(x + eps, z).height;
  const hD = getTerrainHeightAndSurface(x, z - eps).height;
  const hU = getTerrainHeightAndSurface(x, z + eps).height;

  const dx = (hR - hL) / (2 * eps);
  const dz = (hU - hD) / (2 * eps);
  const len = Math.sqrt(dx * dx + 1 + dz * dz);

  let grip = 0.78;
  let rollingResistance = 0.02;

  switch (center.surface) {
    case 'macadam':
      grip = 0.80;
      rollingResistance = 0.022;
      break;
    case 'cobbles':
      grip = 0.74;
      rollingResistance = 0.026;
      break;
    case 'wharf':
      grip = 0.76;
      rollingResistance = 0.018;
      break;
    case 'mud':
      grip = 0.44;
      rollingResistance = 0.085;
      break;
    case 'grass':
      grip = 0.58;
      rollingResistance = 0.055;
      break;
    case 'water':
      grip = 0.15;
      rollingResistance = 0.45;
      break;
  }

  return {
    height: center.height,
    normalX: -dx / len,
    normalY: 1 / len,
    normalZ: -dz / len,
    surface: center.surface,
    grip,
    rollingResistance,
    bumpAmplitude: center.bumpAmplitude,
    rutPull: center.rutPull,
  };
}
