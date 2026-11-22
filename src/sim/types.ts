export type SurfaceType =
  | 'macadam'
  | 'cobbles'
  | 'mud'
  | 'wharf'
  | 'grass'
  | 'water';

export type WeatherType = 'sun' | 'rain' | 'fog';

export type TimeOfDayPreset = 'day' | 'dusk' | 'night' | 'auto';

export type CameraMode = 'chase' | 'cockpit' | 'bonnet' | 'orbit';

export type ControlMode = 'standard' | 'authentic';

export type GearSelection = 'N' | 'LOW' | 'HIGH' | 'REV';

export interface EnvironmentState {
  weather: WeatherType;
  timePreset: TimeOfDayPreset;
  timeHour: number; // 0..24 continuous clock
  windMps: number;
  wetness: number; // 0..1 surface dampness
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
  // Shared
  steer: number; // -1 (left) to +1 (right)
  horn: boolean;

  // Standard mode inputs
  throttleInput: number; // 0..1
  brakeInput: number; // 0..1
  reverseInput: boolean;

  // Authentic Model T controls
  handThrottle: number; // 0..1 (steering column lever)
  sparkAdvance: number; // 0..1 (0 = retarded for cranking/hills, 1 = advanced for cruise)
  lowPedal: boolean; // Left pedal down -> Low gear
  reversePedal: boolean; // Middle pedal down -> Reverse
  brakePedal: boolean; // Right pedal down -> Transmission brake
  handbrakePos: number; // 0 = forward (High gear ready), 0.5 = neutral, 1 = pulled back (Park brake + Neutral)
}

export interface WheelTelemetry {
  compression: number; // 0..1
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
  yaw: number; // radians, 0 = +Z, PI/2 = +X
  pitch: number; // radians
  roll: number; // radians
  yawRate: number;
  speedMps: number;
  speedMph: number;
  forwardSpeedMps: number;

  // Engine & transmission
  engineRunning: boolean;
  crankingProgress: number; // 0..1 during hand-crank
  rpm: number;
  stallWarning: boolean;
  knocking: boolean;
  gear: GearSelection;
  clutchEngagement: number; // 0..1
  handThrottle: number;
  sparkAdvance: number;
  handbrakePos: number;
  steerAngle: number;

  // Environment & surface context
  currentSurface: SurfaceType;
  effectiveGrip: number;
  slopePercent: number;
  nearestLandmark: Landmark | null;
  distanceDrivenMiles: number;

  // 4-wheel visual & physics state: [FL, FR, RL, RR]
  wheels: [WheelTelemetry, WheelTelemetry, WheelTelemetry, WheelTelemetry];
}
