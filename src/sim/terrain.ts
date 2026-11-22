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

export const WORLD_COLLIDERS: ColliderBox[] = [
  // Building blocks enclosing the urban circuit cleanly
  { minX: -94, maxX: -36, minZ: -58, maxZ: -11, label: 'North-West Whitestone Block' },
  { minX: -12, maxX: 84, minZ: -58, maxZ: -11, label: 'Harbour St North Arcade' },
  { minX: -94, maxX: -36, minZ: 11, maxZ: 106, label: 'Criterion & South-West Block' },
  { minX: -12, maxX: 84, minZ: 11, maxZ: 106, label: 'Harbour St South Block' },
  { minX: -142, maxX: -114, minZ: -58, maxZ: 106, label: 'Thames–Severn Civic Block' },

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

/**
 * Computes terrain elevation y(x, z) and surface classification for the extended 1914 Oamaru circuit.
 */
export function getTerrainHeightAndSurface(x: number, z: number): {
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
    return {
      height: baseHeight + crown + settRipple,
      surface: 'cobbles',
      bumpAmplitude: 0.024,
      rutPull: 0,
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
    return {
      height: baseHeight + 0.05 + gravelMicro,
      surface: 'macadam',
      bumpAmplitude: 0.012,
      rutPull: 0,
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
