import { OAMARU_LANDMARKS, WORLD_COLLIDERS, getTerrainSample } from './terrain';
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
  // Night dew/dampness factor between 20:00 and 06:30
  const isNightDew = env.timeHour >= 20 || env.timeHour <= 6.5;
  const dewFactor = isNightDew ? 0.93 : 1.0;

  if (env.weather === 'rain') {
    switch (surface) {
      case 'cobbles':
        return { gripMult: 0.70 * dewFactor, rollMult: 1.12 };
      case 'wharf':
        return { gripMult: 0.74 * dewFactor, rollMult: 1.1 };
      case 'mud':
        return { gripMult: 0.66 * dewFactor, rollMult: 1.38 };
      case 'grass':
        return { gripMult: 0.72 * dewFactor, rollMult: 1.25 };
      default:
        return { gripMult: 0.83 * dewFactor, rollMult: 1.15 };
    }
  }

  if (env.weather === 'fog') {
    switch (surface) {
      case 'cobbles':
        return { gripMult: 0.86 * dewFactor, rollMult: 1.05 };
      case 'wharf':
        return { gripMult: 0.88 * dewFactor, rollMult: 1.04 };
      default:
        return { gripMult: 0.92 * dewFactor, rollMult: 1.04 };
    }
  }

  return { gripMult: dewFactor, rollMult: 1.0 };
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
    engineRunning: true,
    crankingProgress: 0,
    rpm: 520,
    stallWarning: false,
    knocking: false,
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

  // 1. Hand-cranking sequence if stalled
  if (!state.engineRunning && state.crankingProgress > 0) {
    // Slightly slower cranking catch on cold night air
    const coldRate = env.timeHour >= 20 || env.timeHour <= 6 ? 1.1 : 1.35;
    state.crankingProgress += dt * coldRate;
    if (state.crankingProgress >= 1) {
      state.crankingProgress = 0;
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

  state.handThrottle = activeThrottle;
  state.sparkAdvance = activeSpark;
  state.gear = desiredGear;

  const targetClutch = desiredGear === 'N' ? 0 : 1;
  state.clutchEngagement = approach(state.clutchEngagement, targetClutch, 5.5, dt);

  // 3. Engine RPM & Drive Force
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

    if (desiredGear === 'N' || state.clutchEngagement < 0.15) {
      state.rpm = approach(state.rpm, targetIdleRpm, 1800, dt);
    } else {
      const coupledRpm = (wheelAngVel * gearRatio * 60) / (2 * Math.PI);
      const slipRpm = Math.max(320, coupledRpm);
      const blendedRpm = targetIdleRpm * (1 - 0.72 * state.clutchEngagement) + slipRpm * (0.72 * state.clutchEngagement);
      state.rpm = approach(state.rpm, clamp(blendedRpm, 180, 2100), 1400, dt);

      const clutchSlipFactor = clamp(1.0 + (targetIdleRpm - coupledRpm) * 0.0004, 0.35, 1.35);
      const wheelTorque = torque * gearRatio * 0.86 * state.clutchEngagement * clutchSlipFactor;
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
  } else {
    state.rpm = 0;
    state.knocking = false;
  }

  // 4. Sample Terrain at 4 Wheel Corners with Weather & Night Dew Impact
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
    avgRutPull += sample.rutPull * (env.weather === 'rain' ? 1.35 : 1.0);

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

  // 6. Longitudinal Forces & Coastal Wind Drag
  const maxTractionForce = MASS_KG * GRAVITY * 0.54 * avgGrip;
  const clampedDrive = clamp(driveForce, -maxTractionForce, maxTractionForce);

  const brakeDecelForce = (serviceBrake * 3200 + parkBrake * 4200) * avgGrip;
  let totalBrakeForce = 0;
  if (Math.abs(forwardVel) > 0.08) {
    totalBrakeForce = -Math.sign(forwardVel) * brakeDecelForce;
  }

  const airDensity = env.weather === 'fog' || env.timeHour >= 20 ? 1.27 : 1.225;
  const aeroDrag = -0.5 * airDensity * 1.95 * 0.85 * forwardVel * Math.abs(forwardVel);
  const rollingDrag = Math.abs(forwardVel) > 0.03 ? -Math.sign(forwardVel) * MASS_KG * GRAVITY * avgRollRes : 0;

  // Sea wind force in rain blowing inland (-X)
  const windX = env.weather === 'rain' ? -env.windMps * 14 : 0;
  const windFwd = windX * fwdX;
  const windLat = windX * leftX;

  const netLongitudinal = clampedDrive + totalBrakeForce + aeroDrag + rollingDrag + gravitySlopeForce + windFwd;
  let newForwardVel = forwardVel + (netLongitudinal / MASS_KG) * dt;

  if ((parkBrake > 0.4 || serviceBrake > 0.4) && Math.abs(newForwardVel) < 0.25 && Math.abs(gravitySlopeForce) < 650) {
    newForwardVel = 0;
  }
  if (desiredGear === 'N' && Math.abs(newForwardVel) < 0.08 && Math.abs(gravitySlopeForce) < 180) {
    newForwardVel = 0;
  }

  // 7. Lateral Cornering & Wet/Mud Drift Dynamics
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
        state.vx -= 1.3 * vn * nx;
        state.vz -= 1.3 * vn * nz;
      }
    }
  }

  state.distanceDrivenMiles += Math.hypot(state.x - prevX, state.z - prevZ) * 0.000621371;

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

  for (let i = 0; i < 4; i++) {
    if (state.wheels[i].spinAngle > Math.PI * 200) {
      state.wheels[i].spinAngle -= Math.PI * 200;
    }
  }
}

export function triggerHandCrank(state: VehicleState): void {
  if (!state.engineRunning && state.crankingProgress === 0) {
    state.crankingProgress = 0.01;
  }
}
