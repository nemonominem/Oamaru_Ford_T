export type SurfaceType =
  | 'macadam'
  | 'cobbles'
  | 'mud'
  | 'wharf'
  | 'grass'
  | 'water';

export type WeatherType = 'sunny' | 'cloudy' | 'rainy' | 'snowy' | 'windy';

export type TimeOfDayPreset = 'day' | 'dusk' | 'night' | 'auto';

export type CameraMode = 'chase' | 'cockpit' | 'bonnet' | 'orbit';

export type ControlMode = 'standard' | 'authentic';

export type GearSelection = 'N' | 'LOW' | 'HIGH' | 'REV';

export interface EnvironmentState {
  weather: WeatherType;
  autoWeather: boolean;
  dayOfYear: number; // 1..365 (Southern Hemisphere: Oamaru NZ)
  seasonName: string;
  dateLabel: string;
  temperatureC: number;
  sunriseHour: number;
  sunsetHour: number;
  timePreset: TimeOfDayPreset;
  timeHour: number; // 0..24 continuous clock
  windMps: number;
  wetness: number; // 0..1 surface dampness
  snowCover: number; // 0..1 frost/snow accumulation
  visibilityMeters: number;
}

export interface TerrainSample {
  height: number;
  normalX: number;
  normalY: number;
  normalZ: number;
  surface: SurfaceType;
  grip: number;
  rollingResistance: number;
  bumpAmplitude: number;
  rutPull: number;
}

export interface ColliderBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  label?: string;
}

export interface Landmark {
  id: string;
  name: string;
  subtitle: string;
  x: number;
  z: number;
  radius: number;
}

export interface HistoricalBuilding {
  id: string;
  name: string;
  yearBuilt: string;
  architect: string;
  style: string;
  streetLocation: string;
  uniqueFeatures: string[];
  description: string;
  x: number;
  z: number;
  approachX: number;
  approachZ: number;
  approachYaw: number;
}

export interface VehicleControls {
  steer: number; // -1 (left) to +1 (right)
  horn: boolean;

  throttleInput: number; // 0..1
  brakeInput: number; // 0..1
  reverseInput: boolean;

  handThrottle: number; // 0..1
  sparkAdvance: number; // 0..1
  lowPedal: boolean;
  reversePedal: boolean;
  brakePedal: boolean;
  handbrakePos: number; // 0 = High ready, 0.5 = Neutral, 1 = Park brake
}

export interface WheelTelemetry {
  compression: number;
  slipRatio: number;
  grounded: boolean;
  surface: SurfaceType;
  steerAngle: number;
  spinAngle: number;
}

export interface VehicleState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  pitch: number;
  roll: number;
  yawRate: number;
  speedMps: number;
  speedMph: number;
  forwardSpeedMps: number;

  ignitionOn: boolean;
  engineRunning: boolean;
  crankingProgress: number;
  crankKickbackWarning: boolean;
  rpm: number;
  engineTempC: number;
  isOverheating: boolean;
  backfireTrigger: number;
  stallWarning: boolean;
  knocking: boolean;
  impactStrength: number;
  mudAccumulation: number; // 0..1 mud/dust on mudguards
  gear: GearSelection;
  clutchEngagement: number;
  handThrottle: number;
  sparkAdvance: number;
  handbrakePos: number;
  steerAngle: number;

  currentSurface: SurfaceType;
  effectiveGrip: number;
  slopePercent: number;
  nearestLandmark: Landmark | null;
  distanceDrivenMiles: number;

  // Circuit Timing & Courtesy Standings
  lapCount: number;
  nextSector: number; // 1, 2, 3, then 0 (Finish line)
  currentLapSec: number;
  lastLapSec: number | null;
  bestLapSec: number | null;
  courtesyScore: number; // 0..100
  racePosition: number; // 1..3 against rival period tourers

  wheels: [WheelTelemetry, WheelTelemetry, WheelTelemetry, WheelTelemetry];
}
