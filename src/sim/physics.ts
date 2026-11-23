import { loadTrialRecords, saveTrialRecords } from './errands';
import {
  CIRCUIT_CHECKPOINTS,
  OAMARU_LANDMARKS,
  ROAD_OBSTRUCTIONS,
  WORLD_COLLIDERS,
  getTerrainSample,
} from './terrain';
import {
  ControlMode,
  EnvironmentState,
  GearSelection,
  SurfaceType,
  VehicleControls,
  VehicleState,
} from './types';

const MASS_KG = 580;
const GRAVITY = 9.81;
const WHEEL_RADIUS = 0.38;
const WHEELBASE = 2.54;
const HALF_TRACK = 0.71;
const DIFF_RATIO = 3.63;

const WHEEL_OFFSETS: readonly [number, number][] = [
  [HALF_TRACK, 1.27],
  [-HALF_TRACK, 1.27],
  [HALF_TRACK, -1.27],
  [-HALF_TRACK, -1.27],
];

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function approach(current: number, target: number, rate: number, dt: number): number {
  const diff = target - current;
  const step = rate * dt;
  if (Math.abs(diff) <= step) return target;
  return current + Math.sign(diff) * step;
}

export function getWeatherGripMultiplier(
  surface: SurfaceType,
  env: EnvironmentState
): { gripMult: number; rollMult: number } {
  const isColdNight =
    env.temperatureC <= 2.5 || env.timeHour >= env.sunsetHour + 1.5 || env.timeHour <= env.sunriseHour;
  const frostDewFactor = env.temperatureC <= 1.5 ? 0.88 : isColdNight ? 0.94 : 1.0;

  let baseMoodMult = 1.0;
  if (env.weather === 'cloudy') baseMoodMult = 0.97;
  else if (env.weather === 'windy') baseMoodMult = 0.99;

  let wetGripDrop = 0.17;
  let wetRollAdd = 0.15;
  let snowGripDrop = 0.38;
  let snowRollAdd = 0.28;

  switch (surface) {
    case 'cobbles':
      wetGripDrop = 0.30;
      wetRollAdd = 0.12;
      snowGripDrop = 0.44;
      snowRollAdd = 0.24;
      break;
    case 'wharf':
      wetGripDrop = 0.26;
      wetRollAdd = 0.10;
      snowGripDrop = 0.40;
      snowRollAdd = 0.22;
      break;
    case 'mud':
      wetGripDrop = 0.34;
      wetRollAdd = 0.38;
      snowGripDrop = 0.36;
      snowRollAdd = 0.36;
      break;
    case 'grass':
      wetGripDrop = 0.28;
      wetRollAdd = 0.25;
      snowGripDrop = 0.35;
      snowRollAdd = 0.35;
      break;
    default:
      wetGripDrop = 0.17;
      wetRollAdd = 0.15;
      snowGripDrop = 0.36;
      snowRollAdd = 0.26;
      break;
  }

  const wetFactor = 1.0 - wetGripDrop * clamp(env.wetness, 0, 1);
  const snowFactor = 1.0 - snowGripDrop * clamp(env.snowCover, 0, 1);

  const gripMult = Math.max(0.36, baseMoodMult * wetFactor * snowFactor * frostDewFactor);
  const rollMult = 1.0 + wetRollAdd * clamp(env.wetness, 0, 1) + snowRollAdd * clamp(env.snowCover, 0, 1);

  return { gripMult, rollMult };
}

function engineTorqueNm(rpm: number, throttle: number, sparkAdvance: number): {
  torque: number;
  knocking: boolean;
} {
  if (rpm < 150) return { torque: 0, knocking: false };

  const normRpm = clamp((rpm - 350) / 1450, 0, 1);
  const basePeak = 112 * (0.68 + 0.56 * Math.sin(normRpm * Math.PI * 0.88)) * (1 - 0.32 * normRpm * normRpm);

  const optimalSpark = clamp((rpm - 450) / 1100, 0.12, 0.92);
  const sparkDiff = sparkAdvance - optimalSpark;

  let sparkEfficiency = 1.0 - Math.min(0.45, Math.abs(sparkDiff) * 0.55);
  let knocking = false;
  if (sparkDiff > 0.34 && throttle > 0.35 && rpm < 1100) {
    knocking = true;
    sparkEfficiency *= 0.72;
  }

  const effectiveThrottle = 0.08 + 0.92 * throttle;
  return {
    torque: basePeak * effectiveThrottle * sparkEfficiency,
    knocking,
  };
}

export function createInitialVehicleState(): VehicleState {
  const startX = -56;
  const startZ = 0;
  const startTerrain = getTerrainSample(startX, startZ);
  const records = loadTrialRecords();

  return {
    x: startX,
    y: startTerrain.height,
    z: startZ,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: Math.PI / 2,
    pitch: 0,
    roll: 0,
    yawRate: 0,
    speedMps: 0,
    speedMph: 0,
    forwardSpeedMps: 0,
    ignitionOn: true,
    engineRunning: true,
    crankingProgress: 0,
    crankKickbackWarning: false,
    rpm: 520,
    engineTempC: 76,
    isOverheating: false,
    backfireTrigger: 0,
    stallWarning: false,
    knocking: false,
    impactStrength: 0,
    mudAccumulation: 0,
    gear: 'N',
    clutchEngagement: 0,
    handThrottle: 0.14,
    sparkAdvance: 0.38,
    handbrakePos: 0.5,
    steerAngle: 0,
    currentSurface: startTerrain.surface,
    effectiveGrip: startTerrain.grip,
    slopePercent: 0,
    nearestLandmark: OAMARU_LANDMARKS[1],
    distanceDrivenMiles: 0,
    lapCount: 1,
    nextSector: 1,
    currentLapSec: 0,
    lastLapSec: null,
    bestLapSec: records.bestLapSec,
    courtesyScore: 100,
    racePosition: 1,
    wheels: [
      { compression: 0.4, slipRatio: 0, grounded: true, surface: 'macadam', steerAngle: 0, spinAngle: 0 },
      { compression: 0.4, slipRatio: 0, grounded: true, surface: 'macadam', steerAngle: 0, spinAngle: 0 },
      { compression: 0.4, slipRatio: 0, grounded: true, surface: 'macadam', steerAngle: 0, spinAngle: 0 },
      { compression: 0.4, slipRatio: 0, grounded: true, surface: 'macadam', steerAngle: 0, spinAngle: 0 },
    ],
  };
}

export function stepVehiclePhysics(
  state: VehicleState,
  controls: VehicleControls,
  mode: ControlMode,
  env: EnvironmentState,
  dt: number
): void {
  const sinYaw = Math.sin(state.yaw);
  const cosYaw = Math.cos(state.yaw);
  const fwdX = sinYaw;
  const fwdZ = cosYaw;
  const leftX = cosYaw;
  const leftZ = -sinYaw;

  const forwardVel = state.vx * fwdX + state.vz * fwdZ;
  const lateralVel = state.vx * leftX + state.vz * leftZ;
  state.forwardSpeedMps = forwardVel;
  state.speedMps = Math.hypot(state.vx, state.vz);
  state.speedMph = state.speedMps * 2.23694;

  // 1. Ignition & Hand-cranking sequence
  state.impactStrength = Math.max(0, state.impactStrength - dt * 2.5);

  if (!state.ignitionOn) {
    state.engineRunning = false;
    state.crankingProgress = 0;
    state.crankKickbackWarning = false;
  } else if (!state.engineRunning && state.crankingProgress > 0) {
    const coldRate = env.temperatureC < 4 || env.timeHour >= 20 || env.timeHour <= 6 ? 1.05 : 1.35;
    state.crankingProgress += dt * coldRate;
    if (state.crankingProgress >= 1) {
      state.crankingProgress = 0;
      state.crankKickbackWarning = false;
      state.engineRunning = true;
      state.rpm = 540;
      state.stallWarning = false;
    }
  }

  // 2. Transmission & Throttle inputs
  let activeThrottle = controls.handThrottle;
  let activeSpark = controls.sparkAdvance;
  let desiredGear: GearSelection = 'N';
  let serviceBrake = 0;
  let parkBrake = 0;

  if (mode === 'standard') {
    if (controls.throttleInput > 0.05) {
      activeThrottle = Math.max(0.18, controls.throttleInput);
      activeSpark = clamp(0.25 + (state.rpm - 450) / 1400, 0.25, 0.92);
      desiredGear = state.speedMph < 11.5 ? 'LOW' : 'HIGH';
      state.handbrakePos = 0;
    } else if (controls.brakeInput > 0.05) {
      if (forwardVel > 0.8) {
        serviceBrake = controls.brakeInput;
        desiredGear = 'N';
        activeThrottle = 0.1;
      } else {
        desiredGear = 'REV';
        activeThrottle = Math.max(0.22, controls.brakeInput * 0.72);
        state.handbrakePos = 0.5;
      }
    } else {
      activeThrottle = 0.12;
      desiredGear = 'N';
      state.handbrakePos = 0.5;
    }

    if (controls.reverseInput) {
      desiredGear = 'REV';
      activeThrottle = Math.max(activeThrottle, 0.35);
    }

    if (controls.handbrakePos > 0.65) {
      parkBrake = 1.0;
      desiredGear = 'N';
      state.handbrakePos = 1.0;
    }
  } else {
    activeThrottle = controls.handThrottle;
    activeSpark = controls.sparkAdvance;
    state.handbrakePos = controls.handbrakePos;

    if (controls.brakePedal) serviceBrake = 1.0;
    if (controls.handbrakePos > 0.75) parkBrake = (controls.handbrakePos - 0.75) * 4;

    if (controls.reversePedal) desiredGear = 'REV';
    else if (controls.lowPedal) desiredGear = 'LOW';
    else if (controls.handbrakePos < 0.25) desiredGear = 'HIGH';
    else desiredGear = 'N';
  }

  const prevThrottle = state.handThrottle;
  if (state.engineRunning && prevThrottle >= 0.56 && activeThrottle < 0.25 && state.rpm > 1220) {
    state.backfireTrigger += 1;
  }

  state.handThrottle = activeThrottle;
  state.sparkAdvance = activeSpark;
  state.gear = desiredGear;

  const targetClutch = desiredGear === 'N' ? 0 : 1;
  state.clutchEngagement = approach(state.clutchEngagement, targetClutch, 5.5, dt);

  // 3. Engine RPM, Thermosyphon Cooling & Drive Force
  let gearRatio = 0;
  if (desiredGear === 'LOW') gearRatio = 2.75 * DIFF_RATIO;
  else if (desiredGear === 'HIGH') gearRatio = 1.0 * DIFF_RATIO;
  else if (desiredGear === 'REV') gearRatio = -4.0 * DIFF_RATIO;

  const wheelAngVel = forwardVel / WHEEL_RADIUS;
  let driveForce = 0;

  if (state.engineRunning) {
    const targetIdleRpm = 420 + activeThrottle * 1450;
    const { torque, knocking } = engineTorqueNm(state.rpm, activeThrottle, activeSpark);
    state.knocking = knocking;

    const overheatDerate = state.isOverheating ? 0.82 : 1.0;

    if (desiredGear === 'N' || state.clutchEngagement < 0.15) {
      state.rpm = approach(state.rpm, targetIdleRpm, 1800, dt);
    } else {
      const coupledRpm = (wheelAngVel * gearRatio * 60) / (2 * Math.PI);
      const slipRpm = Math.max(320, coupledRpm);
      const blendedRpm = targetIdleRpm * (1 - 0.72 * state.clutchEngagement) + slipRpm * (0.72 * state.clutchEngagement);
      state.rpm = approach(state.rpm, clamp(blendedRpm, 180, 2100), 1400, dt);

      const clutchSlipFactor = clamp(1.0 + (targetIdleRpm - coupledRpm) * 0.0004, 0.35, 1.35);
      const wheelTorque =
        torque * overheatDerate * gearRatio * 0.86 * state.clutchEngagement * clutchSlipFactor;
      driveForce = wheelTorque / WHEEL_RADIUS;
    }

    if (desiredGear === 'HIGH' && state.speedMph < 3.5 && activeThrottle < 0.25 && state.clutchEngagement > 0.8) {
      state.rpm -= 380 * dt;
      state.stallWarning = state.rpm < 340;
      if (state.rpm < 220) {
        state.engineRunning = false;
        state.rpm = 0;
        state.stallWarning = true;
      }
    } else {
      state.stallWarning = state.rpm > 0 && state.rpm < 320;
    }

    // Thermosyphon cooling: lugging in HIGH uphill or holding heavy throttle heats coolant
    const climbLoad = Math.max(0, state.slopePercent) * 0.85;
    const luggingHeat = desiredGear === 'HIGH' && state.speedMph < 13 && activeThrottle > 0.4 ? 11.5 : 0;
    const rpmLoad = (state.rpm / 2000) * 14 + activeThrottle * 9;
    const airflowCool = state.speedMps * 1.1 + (desiredGear === 'LOW' ? 2.5 : 0) + (env.weather === 'rainy' ? 3.5 : 0);
    const targetTemp = clamp(env.temperatureC + 64 + rpmLoad + climbLoad + luggingHeat - airflowCool, 58, 108);
    state.engineTempC = approach(state.engineTempC, targetTemp, targetTemp > state.engineTempC ? 1.45 : 0.85, dt);
    state.isOverheating = state.engineTempC >= 100.5;
  } else {
    state.rpm = approach(state.rpm, 0, 1400, dt);
    state.knocking = false;
    state.stallWarning = false;
    state.engineTempC = approach(state.engineTempC, Math.max(env.temperatureC + 10, 24), 0.55, dt);
    state.isOverheating = state.engineTempC >= 100.5;
  }

  // 4. Sample Terrain at 4 Wheel Corners with Seasonal Weather & Temperature Traction
  let avgTerrainH = 0;
  let avgGrip = 0;
  let avgRollRes = 0;
  let avgRutPull = 0;
  const cornerHeights: [number, number, number, number] = [0, 0, 0, 0];

  for (let i = 0; i < 4; i++) {
    const [lx, lz] = WHEEL_OFFSETS[i];
    const wx = state.x + lx * leftX + lz * fwdX;
    const wz = state.z + lx * leftZ + lz * fwdZ;
    const sample = getTerrainSample(wx, wz);
    const { gripMult, rollMult } = getWeatherGripMultiplier(sample.surface, env);

    const wheelWave =
      Math.sin(state.wheels[i].spinAngle * 2.2 + i * 1.4) *
      sample.bumpAmplitude *
      clamp(state.speedMps / 4, 0, 1);
    const h = sample.height + wheelWave;

    cornerHeights[i] = h;
    avgTerrainH += h;
    avgGrip += sample.grip * gripMult;
    avgRollRes += sample.rollingResistance * rollMult;
    avgRutPull += sample.rutPull * (1.0 + env.wetness * 0.35 + env.snowCover * 0.28);

    const compression = clamp(0.45 + (h - state.y) * 2.4, 0.08, 0.92);
    state.wheels[i].compression = compression;
    state.wheels[i].surface = sample.surface;
    state.wheels[i].grounded = state.y - h < 0.35;
    state.wheels[i].spinAngle += (forwardVel / WHEEL_RADIUS) * dt;
  }

  avgTerrainH *= 0.25;
  avgGrip *= 0.25;
  avgRollRes *= 0.25;
  avgRutPull *= 0.25;

  const centerSample = getTerrainSample(state.x, state.z);
  state.currentSurface = centerSample.surface;
  state.effectiveGrip = avgGrip;

  const slopeCos = centerSample.normalX * fwdX + centerSample.normalZ * fwdZ;
  const gravitySlopeForce = MASS_KG * GRAVITY * slopeCos;
  state.slopePercent = Math.round(-slopeCos * 100);

  // 5. Steering Dynamics
  const maxSteerRad = 0.56;
  const targetSteer = -controls.steer * maxSteerRad + avgRutPull * clamp(state.speedMps / 6, 0, 0.45);
  state.steerAngle = approach(state.steerAngle, clamp(targetSteer, -maxSteerRad, maxSteerRad), 2.8, dt);

  state.wheels[0].steerAngle = state.steerAngle;
  state.wheels[1].steerAngle = state.steerAngle * 0.94;

  // 6. Longitudinal Forces & Seasonal Coastal Wind Gusts
  const maxTractionForce = MASS_KG * GRAVITY * 0.54 * avgGrip;
  const clampedDrive = clamp(driveForce, -maxTractionForce, maxTractionForce);

  const brakeDecelForce = (serviceBrake * 3200 + parkBrake * 4200) * avgGrip;
  let totalBrakeForce = 0;
  if (Math.abs(forwardVel) > 0.08) {
    totalBrakeForce = -Math.sign(forwardVel) * brakeDecelForce;
  }

  const airDensity = clamp(1.293 - env.temperatureC * 0.004, 1.18, 1.32);
  const aeroDrag = -0.5 * airDensity * 1.95 * 0.85 * forwardVel * Math.abs(forwardVel);
  const rollingDrag = Math.abs(forwardVel) > 0.03 ? -Math.sign(forwardVel) * MASS_KG * GRAVITY * avgRollRes : 0;

  // Sea wind force blowing inland (-X), stronger during 'windy' & 'rainy'
  const activeWind = env.windMps > 2.5 ? env.windMps : 0;
  const windX = -activeWind * 14.5;
  const windZ = Math.sin(state.x * 0.05 + state.z * 0.04) * activeWind * 3.5;
  const windFwd = windX * fwdX + windZ * fwdZ;
  const windLat = windX * leftX + windZ * leftZ;

  const netLongitudinal = clampedDrive + totalBrakeForce + aeroDrag + rollingDrag + gravitySlopeForce + windFwd;
  let newForwardVel = forwardVel + (netLongitudinal / MASS_KG) * dt;

  if ((parkBrake > 0.4 || serviceBrake > 0.4) && Math.abs(newForwardVel) < 0.25 && Math.abs(gravitySlopeForce) < 650) {
    newForwardVel = 0;
  }
  if (desiredGear === 'N' && Math.abs(newForwardVel) < 0.08 && Math.abs(gravitySlopeForce) < 180) {
    newForwardVel = 0;
  }

  // 7. Lateral Cornering & Wet/Snow Drift Dynamics
  const corneringStiffness = 5.4 * avgGrip;
  const desiredYawRate =
    Math.abs(newForwardVel) > 0.15
      ? (newForwardVel / WHEELBASE) * Math.tan(state.steerAngle) * clamp(1 - Math.abs(newForwardVel) * 0.014, 0.48, 1.0)
      : 0;
  state.yawRate = approach(state.yawRate, desiredYawRate, 8.5, dt);
  state.yaw += state.yawRate * dt;

  const lateralForce = -lateralVel * MASS_KG * corneringStiffness + windLat;
  const maxLat = MASS_KG * GRAVITY * avgGrip;
  const clampedLat = clamp(lateralForce, -maxLat, maxLat);
  const newLateralVel = lateralVel + (clampedLat / MASS_KG) * dt;

  const newSin = Math.sin(state.yaw);
  const newCos = Math.cos(state.yaw);
  state.vx = newForwardVel * newSin + newLateralVel * newCos;
  state.vz = newForwardVel * newCos - newLateralVel * newSin;

  const slipEstimate = clamp(
    Math.abs(lateralVel) * 0.18 + (Math.abs(driveForce) > maxTractionForce * 0.85 ? 0.35 : 0),
    0,
    1
  );
  state.wheels[2].slipRatio = slipEstimate;
  state.wheels[3].slipRatio = slipEstimate;

  // 8. Integrate Position & Colliders
  const prevX = state.x;
  const prevZ = state.z;
  state.x += state.vx * dt;
  state.z += state.vz * dt;

  const nextSample = getTerrainSample(state.x, state.z);
  if (nextSample.surface === 'water') {
    state.x = prevX;
    state.z = prevZ;
    state.vx *= -0.25;
    state.vz *= -0.25;
  }

  state.x = clamp(state.x, -185, 166);
  state.z = clamp(state.z, -165, 175);

  const carRadius = 1.25;
  for (const box of WORLD_COLLIDERS) {
    const closestX = clamp(state.x, box.minX, box.maxX);
    const closestZ = clamp(state.z, box.minZ, box.maxZ);
    const dx = state.x - closestX;
    const dz = state.z - closestZ;
    const distSq = dx * dx + dz * dz;
    if (distSq < carRadius * carRadius) {
      const dist = Math.sqrt(distSq) || 0.001;
      const nx = dx / dist;
      const nz = dz / dist;
      const pen = carRadius - dist;
      state.x += nx * pen;
      state.z += nz * pen;
      const vn = state.vx * nx + state.vz * nz;
      if (vn < 0) {
        if (vn < -1.1) {
          state.impactStrength = Math.max(state.impactStrength, clamp(Math.abs(vn) / 6, 0.2, 1.0));
        }
        state.vx -= 1.3 * vn * nx;
        state.vz -= 1.3 * vn * nz;
      }
    }
  }

  // Soft collision resolution against small road obstructions (crates, wool bales, sawhorses, barrows)
  for (let i = 0; i < ROAD_OBSTRUCTIONS.length; i++) {
    const obs = ROAD_OBSTRUCTIONS[i];
    const dx = state.x - obs.x;
    const dz = state.z - obs.z;
    const minDist = obs.radius + 1.15;
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
        if (vn < -0.9) {
          state.impactStrength = Math.max(state.impactStrength, clamp(Math.abs(vn) / 4.8, 0.22, 0.95));
        }
        state.vx -= 1.25 * vn * nx;
        state.vz -= 1.25 * vn * nz;
      }
    }
  }

  state.distanceDrivenMiles += Math.hypot(state.x - prevX, state.z - prevZ) * 0.000621371;

  // Mud & dust accumulation on fenders/running boards
  if (state.speedMps > 1.0 && (state.currentSurface === 'mud' || state.currentSurface === 'grass')) {
    state.mudAccumulation = clamp(
      state.mudAccumulation + dt * (state.currentSurface === 'mud' ? 0.15 : 0.05) * clamp(state.speedMps / 4, 0.3, 1.4),
      0,
      1
    );
  } else if (env.weather === 'rainy') {
    state.mudAccumulation = clamp(state.mudAccumulation - dt * 0.08, 0, 1);
  }

  // Courtesy recovers very gradually during calm, safe street driving
  if (state.speedMph > 1 && state.speedMph < 19 && state.currentSurface !== 'grass' && state.impactStrength < 0.05) {
    state.courtesyScore = clamp(state.courtesyScore + dt * 0.35, 0, 100);
  }

  // 9. Suspension Heave, Pitch & Roll
  const targetY = avgTerrainH;
  const ySpring = (targetY - state.y) * 95 - state.vy * 14;
  state.vy += ySpring * dt;
  state.y += state.vy * dt;
  if (state.y < targetY - 0.14) {
    state.y = targetY - 0.14;
    state.vy = Math.max(0, state.vy);
  }

  const frontH = 0.5 * (cornerHeights[0] + cornerHeights[1]);
  const rearH = 0.5 * (cornerHeights[2] + cornerHeights[3]);
  const leftH = 0.5 * (cornerHeights[0] + cornerHeights[2]);
  const rightH = 0.5 * (cornerHeights[1] + cornerHeights[3]);

  const terrainPitch = Math.atan2(rearH - frontH, WHEELBASE);
  const terrainRoll = Math.atan2(rightH - leftH, HALF_TRACK * 2);

  const accelPitch = clamp(-(netLongitudinal / MASS_KG) * 0.012, -0.06, 0.06);
  const cornerRoll = clamp(state.yawRate * forwardVel * 0.016, -0.09, 0.09);
  const idleVibration = state.engineRunning
    ? Math.sin(performance.now() * 0.045) * 0.0025 * (1 - clamp(state.speedMps / 5, 0, 1))
    : 0;

  state.pitch = approach(state.pitch, terrainPitch + accelPitch, 1.2, dt);
  state.roll = approach(state.roll, terrainRoll + cornerRoll + idleVibration, 1.4, dt);

  // 10. Nearest Landmark
  let closest = OAMARU_LANDMARKS[0];
  let bestDist = Infinity;
  for (const lm of OAMARU_LANDMARKS) {
    const d = Math.hypot(state.x - lm.x, state.z - lm.z);
    if (d < bestDist) {
      bestDist = d;
      closest = lm;
    }
  }
  state.nearestLandmark = bestDist <= closest.radius + 14 ? closest : null;

  // 11. Circuit Lap & Sector Timing
  if (state.speedMps > 0.25 || state.currentLapSec > 0) {
    state.currentLapSec += dt;
  }
  const cp = CIRCUIT_CHECKPOINTS[state.nextSector];
  if (cp && Math.hypot(state.x - cp.x, state.z - cp.z) <= cp.radius) {
    if (state.nextSector === 0) {
      state.lastLapSec = state.currentLapSec;
      state.bestLapSec =
        state.bestLapSec === null ? state.currentLapSec : Math.min(state.bestLapSec, state.currentLapSec);
      const prevRec = loadTrialRecords();
      saveTrialRecords({
        bestLapSec: state.bestLapSec,
        bestCourtesy: Math.max(prevRec.bestCourtesy, Math.round(state.courtesyScore)),
        errandsCompleted: prevRec.errandsCompleted,
      });
      state.lapCount += 1;
      state.currentLapSec = 0;
      state.nextSector = 1;
    } else {
      state.nextSector = (state.nextSector + 1) % CIRCUIT_CHECKPOINTS.length;
    }
  }

  for (let i = 0; i < 4; i++) {
    if (state.wheels[i].spinAngle > Math.PI * 200) {
      state.wheels[i].spinAngle -= Math.PI * 200;
    }
  }
}

export function triggerHandCrank(
  state: VehicleState,
  mode: ControlMode = 'standard',
  sparkAdvance = 0.38
): void {
  state.ignitionOn = true;
  if (mode === 'authentic' && sparkAdvance > 0.68) {
    state.crankKickbackWarning = true;
    state.crankingProgress = 0;
    return;
  }
  state.crankKickbackWarning = false;
  if (!state.engineRunning && state.crankingProgress === 0) {
    state.crankingProgress = 0.01;
  }
}

export function toggleIgnition(
  state: VehicleState,
  mode: ControlMode = 'standard',
  sparkAdvance = 0.38
): boolean {
  if (state.ignitionOn) {
    state.ignitionOn = false;
    state.engineRunning = false;
    state.crankingProgress = 0;
    state.crankKickbackWarning = false;
    state.stallWarning = false;
    state.knocking = false;
    return false;
  } else {
    state.ignitionOn = true;
    if (mode === 'authentic' && sparkAdvance > 0.68) {
      state.crankKickbackWarning = true;
      return true;
    }
    state.crankKickbackWarning = false;
    if (!state.engineRunning && state.crankingProgress === 0) {
      state.crankingProgress = 0.01;
    }
    return true;
  }
}
