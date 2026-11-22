import { ColliderBox, Landmark, SurfaceType, TerrainSample } from './types';

export const OAMARU_LANDMARKS: Landmark[] = [
  {
    id: 'harbour-st',
    name: 'Harbour Street',
    subtitle: 'Whitestone Mercantile Row · Est. 1876',
    x: 24,
    z: 0,
    radius: 26,
  },
  {
    id: 'criterion',
    name: 'Criterion Hotel',
    subtitle: 'Tyne & Harbour Corner · Licensed Victualler',
    x: -36,
    z: 14,
    radius: 20,
  },
  {
    id: 'meeks-grain',
    name: "Meek's Grain & Flour Store",
    subtitle: 'Oamaru Limestone Storehouses',
    x: 42,
    z: -8,
    radius: 18,
  },
  {
    id: 'sumpter-wharf',
    name: 'Sumpter Wharf',
    subtitle: 'Oamaru Breakwater & Steamship Berth',
    x: 136,
    z: 0,
    radius: 28,
  },
  {
    id: 'rail-siding',
    name: 'Harbour Rail Siding',
    subtitle: 'Muddy Freight Apron & Timber Yards',
    x: 52,
    z: -56,
    radius: 22,
  },
  {
    id: 'forrester-gallery',
    name: 'Forrester Gallery (Bank of NSW)',
    subtitle: 'Corinthian Portico · Thames & Itchen',
    x: -88,
    z: -52,
    radius: 20,
  },
  {
    id: 'wanbrow-grade',
    name: 'Cape Wanbrow Track',
    subtitle: 'Coastal Limestone Hill Climb · 9% Grade',
    x: 96,
    z: 130,
    radius: 34,
  },
];

export const WORLD_COLLIDERS: ColliderBox[] = [
  // North-West block buildings (Union Bank, Oamaru Mail, Forrester Gallery)
  { minX: -94, maxX: -36, minZ: -58, maxZ: -11, label: 'North-West Whitestone Block' },
  // North-East block buildings (Loan & Mercantile, Meek's Grain Store, Harbour Board)
  { minX: -12, maxX: 84, minZ: -44, maxZ: -11, label: 'Harbour St North Arcade' },
  // South-West block (Criterion Hotel & Stables)
  { minX: -94, maxX: -36, minZ: 11, maxZ: 58, label: 'Criterion Hotel Block' },
  // South-East block (Woollen Store, Exchange, Imperial)
  { minX: -12, maxX: 84, minZ: 11, maxZ: 58, label: 'Harbour St South Arcade' },
  // Wharf edge bollards / sea guard at end of wharf
  { minX: 166, maxX: 174, minZ: -12, maxZ: 12, label: 'Sumpter Wharf End' },
];

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Computes raw terrain elevation y(x, z) and surface classification for early 20th-century Oamaru.
 */
export function getTerrainHeightAndSurface(x: number, z: number): {
  height: number;
  surface: SurfaceType;
  bumpAmplitude: number;
  rutPull: number;
} {
  // Check Sumpter Wharf deck first (jutting East from x=104..168, z=-7..+7)
  if (x >= 103 && x <= 168 && Math.abs(z) <= 7.2) {
    // Subtle plank seam micro-bump
    const plankBump = Math.sin(x * 11.5) * 0.008;
    return {
      height: 1.05 + plankBump,
      surface: 'wharf',
      bumpAmplitude: 0.012,
      rutPull: 0,
    };
  }

  // Harbour water East of Quay seawall (x > 107)
  if (x > 107) {
    return {
      height: -1.35,
      surface: 'water',
      bumpAmplitude: 0,
      rutPull: 0,
    };
  }

  // Base town elevation is ~1.0m above sea level, sloping gently up inland (-X) and up Cape Wanbrow (+Z south)
  let baseHeight = 1.0;

  // Gentle inland rise west of Thames St
  if (x < -105) {
    baseHeight += smoothstep(-105, -210, x) * 9.0 + Math.sin(z * 0.04) * 0.8;
  }

  // Cape Wanbrow headland climb south of z = 68
  if (z > 68) {
    const hillT = smoothstep(68, 175, z);
    const eastRidge = smoothstep(45, 107, x);
    baseHeight += hillT * (4.5 + eastRidge * 5.2);
  }

  // Northern Waitaki hillside backdrop north of z = -100
  if (z < -100) {
    baseHeight += smoothstep(-100, -200, z) * 6.5;
  }

  // Road network classification & period road surface shaping
  const onHarbourSt = Math.abs(z) <= 7.2 && x >= -112 && x <= 104;
  const onTyneSt = Math.abs(x - -24) <= 6.8 && z >= -95 && z <= 95;
  const onItchenSt = Math.abs(z - -68) <= 6.8 && x >= -112 && x <= 102;
  const onQuayRoad = Math.abs(x - 95) <= 6.8 && z >= -95 && z <= 172;
  const onThamesSt = Math.abs(x - -104) <= 7.5 && z >= -105 && z <= 95;
  const onRailMudSiding = z >= -61.5 && z <= -45 && x >= 12 && x <= 86;

  // 1. Muddy Rutted Rail Siding (between Harbour St North block and Itchen St)
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

  // 2. Bluestone Cobblestones on East Harbour Street (mercantile precinct & port apron) & Quay junction
  if ((onHarbourSt && x >= 12) || (onQuayRoad && z >= -22 && z <= 22)) {
    // Crowned center + stone sett vibration
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

  // 3. Cape Wanbrow Coastal Climb (rutted wet limestone track on upper hill)
  if (onQuayRoad && z > 88) {
    const rut = Math.sin(z * 0.55) * 0.035 + Math.cos(x * 1.4) * 0.03;
    const isMuddyPatch = Math.sin(z * 0.14) > 0.45;
    return {
      height: baseHeight + rut,
      surface: isMuddyPatch ? 'mud' : 'macadam',
      bumpAmplitude: isMuddyPatch ? 0.04 : 0.018,
      rutPull: isMuddyPatch ? Math.sin(z * 0.4) * 0.22 : 0,
    };
  }

  // 4. Compacted Oamaru Limestone Macadam (West Harbour St, Tyne St, Itchen St, Thames St, Quay)
  if (onHarbourSt || onTyneSt || onItchenSt || onQuayRoad || onThamesSt) {
    let crown = 0.05;
    if (onHarbourSt) {
      const d = Math.abs(z) / 7.2;
      crown = (1 - d * d) * 0.08;
    } else if (onTyneSt) {
      const d = Math.abs(x + 24) / 6.8;
      crown = (1 - d * d) * 0.07;
    }
    const gravelMicro = Math.sin(x * 2.1 + z * 1.7) * 0.008;
    return {
      height: baseHeight + crown + gravelMicro,
      surface: 'macadam',
      bumpAmplitude: 0.012,
      rutPull: 0,
    };
  }

  // 5. Surrounding Otago grass / coastal verge
  const undulation = Math.sin(x * 0.08) * Math.cos(z * 0.08) * 0.25;
  return {
    height: baseHeight + undulation,
    surface: 'grass',
    bumpAmplitude: 0.03,
    rutPull: Math.sin(x * 0.2 + z * 0.2) * 0.08,
  };
}

/**
 * Samples full terrain info including central-difference surface normal and physics properties.
 */
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
