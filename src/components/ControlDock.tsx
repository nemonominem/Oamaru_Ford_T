import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  CloudFog,
  CloudRain,
  Code2,
  Copy,
  Download,
  Landmark as LandmarkIcon,
  Lightbulb,
  MapPin,
  Moon,
  RotateCcw,
  Sun,
  Sunset,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { OAMARU_HISTORICAL_BUILDINGS } from '../sim/historicalBuildings';
import { UNITY_CSHARP_SCRIPTS } from '../sim/unityScripts';
import {
  CameraMode,
  ControlMode,
  EnvironmentState,
  HistoricalBuilding,
  SurfaceType,
  TimeOfDayPreset,
  VehicleState,
  WeatherType,
} from '../sim/types';

interface ControlDockProps {
  telemetry: VehicleState;
  env: EnvironmentState;
  cameraMode: CameraMode;
  controlMode: ControlMode;
  muted: boolean;
  headlightsOn: boolean;
  onCameraChange: (mode: CameraMode) => void;
  onControlModeChange: (mode: ControlMode) => void;
  onWeatherChange: (weather: WeatherType) => void;
  onTimePresetChange: (preset: TimeOfDayPreset) => void;
  onToggleMute: () => void;
  onToggleHeadlights: () => void;
  onResetVehicle: () => void;
  onJumpToBuilding: (building: HistoricalBuilding) => void;
  onCrankEngine: () => void;
  onHorn: () => void;
  onHandThrottleChange: (val: number) => void;
  onSparkAdvanceChange: (val: number) => void;
  onHandbrakeLeverChange: (val: number) => void;
  onPedalPress: (pedal: 'low' | 'reverse' | 'brake', pressed: boolean) => void;
}

const SURFACE_LABELS: Record<SurfaceType, string> = {
  macadam: 'Limestone Macadam',
  cobbles: 'Bluestone Cobbles',
  mud: 'Muddy Rail Ruts',
  wharf: 'Timber Wharf Deck',
  grass: 'Otago Tussock',
  water: 'Harbour Water',
};

function formatClock(hourFloat: number): string {
  const totalMins = Math.floor(((hourFloat % 24) + 24) % 24 * 60);
  const hh = Math.floor(totalMins / 60)
    .toString()
    .padStart(2, '0');
  const mm = (totalMins % 60).toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

export const ControlDock: React.FC<ControlDockProps> = ({
  telemetry,
  env,
  cameraMode,
  controlMode,
  muted,
  headlightsOn,
  onCameraChange,
  onControlModeChange,
  onWeatherChange,
  onTimePresetChange,
  onToggleMute,
  onToggleHeadlights,
  onResetVehicle,
  onJumpToBuilding,
  onCrankEngine,
  onHorn,
  onHandThrottleChange,
  onSparkAdvanceChange,
  onHandbrakeLeverChange,
  onPedalPress,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [unityDrawerOpen, setUnityDrawerOpen] = useState(false);
  const [heritageDrawerOpen, setHeritageDrawerOpen] = useState(false);
  const [selectedScriptIdx, setSelectedScriptIdx] = useState(0);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const handleCopyScript = async (idx: number, code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedIdx(idx);
      window.setTimeout(() => setCopiedIdx(null), 1800);
    } catch {
      // clipboard blocked
    }
  };

  const handleDownloadScript = (filename: string, code: string) => {
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const activeScript = UNITY_CSHARP_SCRIPTS[selectedScriptIdx];

  return (
    <>
      {/* Top-Left Minimal Heritage Title & Dynamic Environment Context */}
      <header className="pointer-events-none fixed top-5 left-6 z-10 max-w-lg">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-[#F6F1E7] drop-shadow-[0_2px_6px_rgba(0,0,0,0.65)]">
          Oamaru, 1914
        </h1>
        <p className="mt-0.5 text-xs text-[#E4DAC7] drop-shadow-[0_1px_4px_rgba(0,0,0,0.75)]">
          Ford Model T Touring <span aria-hidden="true">·</span>{' '}
          <span className="font-mono-tabular">{formatClock(env.timeHour)}</span>{' '}
          <span aria-hidden="true">·</span>{' '}
          {env.weather === 'sun' ? 'Clear Sun' : env.weather === 'rain' ? 'Coastal Rain' : 'Sea Haar Fog'}
          {telemetry.nearestLandmark ? (
            <>
              {' '}
              <span aria-hidden="true">·</span>{' '}
              <span className="text-[#E8C073] font-medium">{telemetry.nearestLandmark.name}</span>
            </>
          ) : null}
        </p>
      </header>

      {/* Engine Stalled / Hand-Crank Action (top-center to stay clear of minimap) */}
      {!telemetry.engineRunning && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 rounded-lg border border-[#D4A656]/40 bg-[#1B1814]/95 px-4 py-2 shadow-lg">
          <span className="text-xs font-medium text-[#F4EFE6]">
            {telemetry.crankingProgress > 0 ? 'Cranking magneto...' : 'Engine stalled'}
          </span>
          <button
            type="button"
            onClick={onCrankEngine}
            disabled={telemetry.crankingProgress > 0}
            className="rounded-md bg-[#D4A656] px-3 py-1.5 text-xs font-semibold text-[#18140F] transition-colors hover:bg-[#e1b76a] disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
          >
            {telemetry.crankingProgress > 0 ? 'Cranking...' : 'Hand-Crank (C)'}
          </button>
        </div>
      )}

      {/* Collapsible Unified Bottom Control Dock */}
      <div
        className="fixed bottom-4 left-1/2 z-20 w-[min(980px,96vw)] -translate-x-1/2 transition-transform duration-200 ease-out"
        style={{
          transform: collapsed ? 'translate(-50%, calc(100% - 36px))' : 'translate(-50%, 0)',
        }}
      >
        {/* Collapse / Expand Tab */}
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setCollapsed((prev) => !prev)}
            className="flex items-center gap-1.5 rounded-t-lg border border-b-0 border-white/15 bg-[#161411]/94 px-3.5 py-1 text-xs font-medium text-[#D8CEBE] hover:text-white transition-colors cursor-pointer whitespace-nowrap"
          >
            {collapsed ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" />
                <span>Show Controls</span>
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" />
                <span>Hide Controls</span>
              </>
            )}
          </button>
        </div>

        {/* Main Dock Panel */}
        <div className="rounded-xl border border-white/15 bg-[#161411]/95 px-4 py-3 shadow-2xl">
          {/* Row 1: Telemetry & Road/Weather Grip Readout */}
          <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-b border-white/10 pb-2.5">
            <div className="flex flex-wrap items-baseline gap-4 sm:gap-5">
              <div>
                <span className="font-mono-tabular text-2xl font-semibold text-[#F6F1E7]">
                  {telemetry.speedMph.toFixed(1)}
                </span>
                <span className="ml-1.5 text-[11px] text-[#B7AB98]">mph</span>
              </div>

              <div>
                <span className="font-mono-tabular text-lg font-medium text-[#E8C073]">
                  {Math.round(telemetry.rpm)}
                </span>
                <span className="ml-1 text-[11px] text-[#B7AB98]">rpm</span>
              </div>

              <div className="text-xs text-[#D8CEBE]">
                <span className="text-[#9E9280]">Gear </span>
                <span className="font-mono-tabular font-semibold text-[#F6F1E7]">{telemetry.gear}</span>
              </div>

              <div className="text-xs text-[#D8CEBE]">
                <span className="text-[#9E9280]">Surface </span>
                <span className="font-medium text-[#F6F1E7]">
                  {SURFACE_LABELS[telemetry.currentSurface]}
                </span>
              </div>

              <div className="text-xs text-[#D8CEBE]">
                <span className="text-[#9E9280]">Traction </span>
                <span className="font-mono-tabular font-medium text-[#F6F1E7]">
                  {Math.round(telemetry.effectiveGrip * 100)}%
                </span>
              </div>

              <div className="hidden md:block text-xs text-[#D8CEBE]">
                <span className="text-[#9E9280]">Grade </span>
                <span className="font-mono-tabular font-medium text-[#F6F1E7]">
                  {telemetry.slopePercent > 0 ? `+${telemetry.slopePercent}%` : `${telemetry.slopePercent}%`}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 text-xs">
              {telemetry.knocking && (
                <span className="font-medium text-[#E59D4D]">Spark Knock — Retard Lever</span>
              )}
              {telemetry.stallWarning && telemetry.engineRunning && (
                <span className="font-medium text-[#E06C5A]">Low RPM — Press Clutch or Throttle</span>
              )}
              {!telemetry.knocking && !telemetry.stallWarning && (
                <span className="text-[#9E9280]">
                  {controlMode === 'standard'
                    ? 'W/S Drive · A/D Steer · Space Brake'
                    : 'Shift: Low · X: Rev · S: Brake · Space: Lever'}
                </span>
              )}
            </div>
          </div>

          {/* Row 2: Weather & Time-of-Day + Camera & Driving Mode */}
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              {/* Weather Switcher */}
              <div className="flex items-center rounded-lg bg-white/6 p-0.5">
                {(
                  [
                    ['sun', 'Sun', Sun],
                    ['rain', 'Rain', CloudRain],
                    ['fog', 'Fog', CloudFog],
                  ] as const
                ).map(([w, label, Icon]) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => onWeatherChange(w)}
                    className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      env.weather === w
                        ? 'bg-[#D4A656] text-[#17130E]'
                        : 'text-[#CFC5B4] hover:text-white'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>

              {/* Time of Day Switcher */}
              <div className="flex items-center rounded-lg bg-white/6 p-0.5">
                {(
                  [
                    ['day', 'Day', Sun],
                    ['dusk', 'Dusk', Sunset],
                    ['night', 'Night', Moon],
                    ['auto', 'Cycle', null],
                  ] as const
                ).map(([t, label, Icon]) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => onTimePresetChange(t)}
                    className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      env.timePreset === t
                        ? 'bg-[#EAE2D3] text-[#17130E]'
                        : 'text-[#CFC5B4] hover:text-white'
                    }`}
                  >
                    {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
                    <span>{label}</span>
                  </button>
                ))}
              </div>

              {/* Camera Presets */}
              <div className="flex items-center rounded-lg bg-white/6 p-0.5">
                {(
                  [
                    ['cockpit', 'Driver'],
                    ['chase', 'Chase'],
                    ['bonnet', 'Bonnet'],
                    ['orbit', 'Orbit'],
                  ] as [CameraMode, string][]
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => onCameraChange(mode)}
                    className={`rounded-md px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      cameraMode === mode
                        ? 'bg-[#D4A656] text-[#17130E]'
                        : 'text-[#CFC5B4] hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Utility & Drawers */}
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="flex items-center rounded-lg bg-white/6 p-0.5 mr-1">
                <button
                  type="button"
                  onClick={() => onControlModeChange('standard')}
                  className={`rounded-md px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    controlMode === 'standard'
                      ? 'bg-[#EAE2D3] text-[#17130E]'
                      : 'text-[#CFC5B4] hover:text-white'
                  }`}
                >
                  WASD
                </button>
                <button
                  type="button"
                  onClick={() => onControlModeChange('authentic')}
                  className={`rounded-md px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    controlMode === 'authentic'
                      ? 'bg-[#EAE2D3] text-[#17130E]'
                      : 'text-[#CFC5B4] hover:text-white'
                  }`}
                >
                  3-Pedal
                </button>
              </div>

              <button
                type="button"
                onClick={onHorn}
                className="rounded-lg border border-white/12 bg-white/6 px-2.5 py-1.5 text-xs font-medium text-[#EAE2D3] hover:bg-white/12 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                title="Sound Brass Horn (H)"
              >
                Horn
              </button>

              <button
                type="button"
                onClick={onToggleHeadlights}
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1 ${
                  headlightsOn
                    ? 'border-[#D4A656]/60 bg-[#D4A656]/20 text-[#F2CD82]'
                    : 'border-white/12 bg-white/6 text-[#CFC5B4] hover:text-white'
                }`}
                title="Toggle Brass Headlamps (L)"
              >
                <Lightbulb className="h-3.5 w-3.5" />
                <span>Lamps</span>
              </button>

              <button
                type="button"
                onClick={onToggleMute}
                className="rounded-lg border border-white/12 bg-white/6 p-1.5 text-[#CFC5B4] hover:text-white transition-colors cursor-pointer"
                aria-label={muted ? 'Unmute audio' : 'Mute audio'}
              >
                {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>

              <button
                type="button"
                onClick={onResetVehicle}
                className="rounded-lg border border-white/12 bg-white/6 p-1.5 text-[#CFC5B4] hover:text-white transition-colors cursor-pointer"
                aria-label="Reset Model T to Harbour Street"
                title="Reset to Harbour Street (R)"
              >
                <RotateCcw className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setUnityDrawerOpen(false);
                  setHeritageDrawerOpen(true);
                }}
                className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/8 px-2.5 py-1.5 text-xs font-medium text-[#F4EFE6] hover:bg-white/14 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LandmarkIcon className="h-3.5 w-3.5 text-[#E8C073]" />
                <span>Buildings</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setHeritageDrawerOpen(false);
                  setUnityDrawerOpen(true);
                }}
                className="flex items-center gap-1.5 rounded-lg border border-[#D4A656]/40 bg-[#D4A656]/15 px-2.5 py-1.5 text-xs font-medium text-[#E8C073] hover:bg-[#D4A656]/25 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Code2 className="h-3.5 w-3.5" />
                <span>Unity C#</span>
              </button>
            </div>
          </div>

          {/* Row 3: Authentic Levers & Pedals */}
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-2">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-xs text-[#CFC5B4]">
                <span className="whitespace-nowrap">Throttle</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={telemetry.handThrottle}
                  onChange={(e) => onHandThrottleChange(parseFloat(e.target.value))}
                  className="brass-slider w-20"
                  aria-label="Hand throttle lever"
                />
              </label>

              <label className="flex items-center gap-2 text-xs text-[#CFC5B4]">
                <span className="whitespace-nowrap">Spark</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={telemetry.sparkAdvance}
                  onChange={(e) => onSparkAdvanceChange(parseFloat(e.target.value))}
                  className="brass-slider w-20"
                  aria-label="Spark advance lever"
                />
              </label>
            </div>

            {controlMode === 'authentic' ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onMouseDown={() => onPedalPress('low', true)}
                  onMouseUp={() => onPedalPress('low', false)}
                  onMouseLeave={() => onPedalPress('low', false)}
                  onTouchStart={() => onPedalPress('low', true)}
                  onTouchEnd={() => onPedalPress('low', false)}
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    telemetry.gear === 'LOW'
                      ? 'border-[#D4A656] bg-[#D4A656] text-[#17130E]'
                      : 'border-white/15 bg-white/8 text-[#EAE2D3]'
                  }`}
                >
                  Low (Shift)
                </button>
                <button
                  type="button"
                  onMouseDown={() => onPedalPress('reverse', true)}
                  onMouseUp={() => onPedalPress('reverse', false)}
                  onMouseLeave={() => onPedalPress('reverse', false)}
                  onTouchStart={() => onPedalPress('reverse', true)}
                  onTouchEnd={() => onPedalPress('reverse', false)}
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    telemetry.gear === 'REV'
                      ? 'border-[#D4A656] bg-[#D4A656] text-[#17130E]'
                      : 'border-white/15 bg-white/8 text-[#EAE2D3]'
                  }`}
                >
                  Rev (X)
                </button>
                <button
                  type="button"
                  onMouseDown={() => onPedalPress('brake', true)}
                  onMouseUp={() => onPedalPress('brake', false)}
                  onMouseLeave={() => onPedalPress('brake', false)}
                  onTouchStart={() => onPedalPress('brake', true)}
                  onTouchEnd={() => onPedalPress('brake', false)}
                  className="rounded-md border border-white/15 bg-white/8 px-2.5 py-1 text-xs font-medium text-[#EAE2D3] active:bg-[#D4A656] active:text-[#17130E] cursor-pointer whitespace-nowrap"
                >
                  Brake (S)
                </button>
                <div className="flex items-center gap-1 ml-1">
                  {(
                    [
                      [0, 'High'],
                      [0.5, 'Neutral'],
                      [1.0, 'Park'],
                    ] as [number, string][]
                  ).map(([pos, label]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => onHandbrakeLeverChange(pos)}
                      className={`rounded-md px-2 py-1 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                        Math.abs(telemetry.handbrakePos - pos) < 0.2
                          ? 'bg-[#D4A656] text-[#17130E]'
                          : 'bg-white/8 text-[#CFC5B4] hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <span className="text-xs text-[#9E9280]">
                Keys: 1–4 Camera · L Lamps · H Horn · C Crank · R Reset
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Historical Oamaru Victorian Precinct Buildings Drawer */}
      {heritageDrawerOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-end bg-black/55">
          <div className="flex h-full w-[min(560px,95vw)] flex-col border-l border-white/15 bg-[#181613] text-[#F4EFE6] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <div>
                <h2 className="font-display text-xl font-semibold">Oamaru Victorian Precinct</h2>
                <p className="text-xs text-[#B7AB98]">
                  Historical Whitestone buildings modeled in the 1914 simulation
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHeritageDrawerOpen(false)}
                className="rounded-lg p-1.5 text-[#CFC5B4] hover:bg-white/10 hover:text-white cursor-pointer"
                aria-label="Close historical buildings drawer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-white/10 px-6">
              {OAMARU_HISTORICAL_BUILDINGS.map((b) => (
                <article key={b.id} className="py-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-display text-lg font-semibold text-[#F6F1E7]">{b.name}</h3>
                      <p className="mt-0.5 text-xs text-[#C7BBA7]">
                        {b.yearBuilt} <span aria-hidden="true">·</span> {b.style}{' '}
                        <span aria-hidden="true">·</span> {b.architect}
                      </p>
                      <p className="mt-0.5 text-xs text-[#9E9280]">{b.streetLocation}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onJumpToBuilding(b);
                        setHeritageDrawerOpen(false);
                      }}
                      className="flex items-center gap-1.5 rounded-lg border border-[#D4A656]/45 bg-[#D4A656]/15 px-3 py-1.5 text-xs font-medium text-[#E8C073] hover:bg-[#D4A656]/25 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <MapPin className="h-3.5 w-3.5" />
                      <span>Drive Here</span>
                    </button>
                  </div>

                  <p className="mt-2.5 text-xs leading-relaxed text-[#DCD2C2]">{b.description}</p>

                  <ul className="mt-2.5 space-y-1 text-xs text-[#B7AB98]">
                    {b.uniqueFeatures.map((feat) => (
                      <li key={feat} className="leading-relaxed">
                        — {feat}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Unity C# Physics Export Drawer */}
      {unityDrawerOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-end bg-black/55">
          <div className="flex h-full w-[min(640px,95vw)] flex-col border-l border-white/15 bg-[#181613] text-[#F4EFE6] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <h2 className="font-display text-lg font-semibold">Unity C# Physics Package</h2>
                <p className="text-xs text-[#B7AB98]">
                  Drop-in Weather, Atmosphere, WheelCollider & Planetary Transmission scripts
                </p>
              </div>
              <button
                type="button"
                onClick={() => setUnityDrawerOpen(false)}
                className="rounded-lg p-1.5 text-[#CFC5B4] hover:bg-white/10 hover:text-white cursor-pointer"
                aria-label="Close Unity C# drawer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex gap-1.5 border-b border-white/10 px-5 py-2.5 overflow-x-auto">
              {UNITY_CSHARP_SCRIPTS.map((script, idx) => (
                <button
                  key={script.filename}
                  type="button"
                  onClick={() => setSelectedScriptIdx(idx)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    selectedScriptIdx === idx
                      ? 'bg-[#D4A656] text-[#17130E]'
                      : 'bg-white/6 text-[#CFC5B4] hover:text-white'
                  }`}
                >
                  {script.filename}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between border-b border-white/10 bg-[#13110e] px-5 py-3">
              <p className="text-xs text-[#CFC5B4] pr-4">{activeScript.summary}</p>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleCopyScript(selectedScriptIdx, activeScript.code)}
                  className="flex items-center gap-1.5 rounded-md border border-white/15 bg-white/8 px-3 py-1.5 text-xs font-medium text-[#F4EFE6] hover:bg-white/15 cursor-pointer"
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span>{copiedIdx === selectedScriptIdx ? 'Copied' : 'Copy'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadScript(activeScript.filename, activeScript.code)}
                  className="flex items-center gap-1.5 rounded-md bg-[#D4A656] px-3 py-1.5 text-xs font-semibold text-[#17130E] hover:bg-[#e1b76a] cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download .cs</span>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-5">
              <pre className="font-mono-tabular text-xs leading-relaxed text-[#E4DAC7] whitespace-pre">
                {activeScript.code}
              </pre>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
