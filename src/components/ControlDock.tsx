import React, { useEffect, useRef, useState } from 'react';
import {
  Briefcase,
  Calendar,
  ChevronDown,
  ChevronUp,
  Cloud,
  CloudRain,
  CloudSnow,
  Code2,
  Copy,
  Download,
  GripHorizontal,
  Landmark as LandmarkIcon,
  Lightbulb,
  MapPin,
  Moon,
  Power,
  RotateCcw,
  Sun,
  Sunset,
  Volume2,
  VolumeX,
  Wind,
  X,
} from 'lucide-react';
import { ActiveErrandState, OAMARU_ERRANDS } from '../sim/errands';
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
  wiperOn: boolean;
  errandState: ActiveErrandState;
  onCameraChange: (mode: CameraMode) => void;
  onControlModeChange: (mode: ControlMode) => void;
  onWeatherChange: (weather: WeatherType) => void;
  onAutoWeatherToggle: () => void;
  onDayOfYearChange: (dayOfYear: number) => void;
  onTimeHourChange: (hour: number) => void;
  onTimePresetChange: (preset: TimeOfDayPreset) => void;
  onToggleMute: () => void;
  onToggleHeadlights: () => void;
  onToggleWiper: () => void;
  onStartOrAdvanceErrand: () => void;
  onCancelErrand: () => void;
  onToggleIgnition: () => void;
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

const WEATHER_LABELS: Record<WeatherType, string> = {
  sunny: 'Sunny',
  cloudy: 'Overcast',
  rainy: 'Coastal Rain',
  snowy: 'Winter Snow',
  windy: 'Nor’wester Wind',
};

function formatClock(hourFloat: number): string {
  const totalMins = Math.floor((((hourFloat % 24) + 24) % 24) * 60);
  const hh = Math.floor(totalMins / 60)
    .toString()
    .padStart(2, '0');
  const mm = (totalMins % 60).toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

function formatLapTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1).padStart(4, '0');
  return `${m}:${s}`;
}

export const ControlDock: React.FC<ControlDockProps> = ({
  telemetry,
  env,
  cameraMode,
  controlMode,
  muted,
  headlightsOn,
  wiperOn,
  errandState,
  onCameraChange,
  onControlModeChange,
  onWeatherChange,
  onAutoWeatherToggle,
  onDayOfYearChange,
  onTimeHourChange,
  onTimePresetChange,
  onToggleMute,
  onToggleHeadlights,
  onToggleWiper,
  onStartOrAdvanceErrand,
  onCancelErrand,
  onToggleIgnition,
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

  // Draggable Control Dock position (null = centered at bottom)
  const dockRef = useRef<HTMLDivElement | null>(null);
  const [dockPos, setDockPos] = useState<{ left: number; top: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef<{
    startX: number;
    startY: number;
    origLeft: number;
    origTop: number;
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const ds = dragStateRef.current;
      if (!ds) return;
      const dx = e.clientX - ds.startX;
      const dy = e.clientY - ds.startY;
      const maxLeft = Math.max(8, window.innerWidth - ds.width - 8);
      const maxTop = Math.max(8, window.innerHeight - ds.height - 8);
      setDockPos({
        left: Math.max(8, Math.min(maxLeft, ds.origLeft + dx)),
        top: Math.max(8, Math.min(maxTop, ds.origTop + dy)),
      });
    };

    const onPointerUp = () => {
      if (dragStateRef.current) {
        dragStateRef.current = null;
        setIsDragging(false);
      }
    };

    const onResize = () => {
      setDockPos((prev) => {
        if (!prev || !dockRef.current) return prev;
        const rect = dockRef.current.getBoundingClientRect();
        const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
        const maxTop = Math.max(8, window.innerHeight - rect.height - 8);
        return {
          left: Math.max(8, Math.min(maxLeft, prev.left)),
          top: Math.max(8, Math.min(maxTop, prev.top)),
        };
      });
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  useEffect(() => {
    if (collapsed || !dockPos || !dockRef.current) return;
    const raf = requestAnimationFrame(() => {
      if (!dockRef.current) return;
      const rect = dockRef.current.getBoundingClientRect();
      const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
      const maxTop = Math.max(8, window.innerHeight - rect.height - 8);
      const clampedLeft = Math.max(8, Math.min(maxLeft, dockPos.left));
      const clampedTop = Math.max(8, Math.min(maxTop, dockPos.top));
      if (clampedLeft !== dockPos.left || clampedTop !== dockPos.top) {
        setDockPos({ left: clampedLeft, top: clampedTop });
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [collapsed, dockPos]);

  const handleStartDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !dockRef.current) return;
    e.preventDefault();
    const rect = dockRef.current.getBoundingClientRect();
    dragStateRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origLeft: rect.left,
      origTop: rect.top,
      width: rect.width,
      height: rect.height,
    };
    setIsDragging(true);
    setDockPos({ left: rect.left, top: rect.top });
  };

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
      {/* Top-Left Minimal Heritage Title & Dynamic Season/Weather Context */}
      <header className="pointer-events-none fixed top-5 left-6 z-10 max-w-xl">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-[#F6F1E7] drop-shadow-[0_2px_6px_rgba(0,0,0,0.65)]">
          Oamaru, 1914
        </h1>
        <p className="mt-0.5 text-xs text-[#E4DAC7] drop-shadow-[0_1px_4px_rgba(0,0,0,0.75)]">
          Ford Model T Touring <span aria-hidden="true">·</span>{' '}
          <span className="font-mono-tabular">
            {env.dateLabel} ({env.seasonName})
          </span>{' '}
          <span aria-hidden="true">·</span>{' '}
          <span className="font-mono-tabular">{formatClock(env.timeHour)}</span>{' '}
          <span aria-hidden="true">·</span>{' '}
          <span className="font-mono-tabular">{env.temperatureC.toFixed(1)}°C</span>{' '}
          <span aria-hidden="true">·</span> {WEATHER_LABELS[env.weather]}
          {telemetry.nearestLandmark ? (
            <>
              {' '}
              <span aria-hidden="true">·</span>{' '}
              <span className="text-[#E8C073] font-medium">{telemetry.nearestLandmark.name}</span>
            </>
          ) : null}
        </p>
      </header>

      {/* Engine Off / Stalled / Kickback Action */}
      {!telemetry.engineRunning && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 rounded-lg border border-[#D4A656]/40 bg-[#1B1814]/95 px-4 py-2 shadow-lg">
          <span className="text-xs font-medium text-[#F4EFE6]">
            {telemetry.crankKickbackWarning
              ? 'Spark lever advanced — Retard Spark (Q) before cranking'
              : !telemetry.ignitionOn
                ? 'Ignition Off'
                : telemetry.crankingProgress > 0
                  ? 'Cranking magneto...'
                  : 'Engine stalled'}
          </span>
          {!telemetry.ignitionOn ? (
            <button
              type="button"
              onClick={onToggleIgnition}
              className="rounded-md bg-[#D4A656] px-3 py-1.5 text-xs font-semibold text-[#18140F] transition-colors hover:bg-[#e1b76a] whitespace-nowrap shrink-0 cursor-pointer"
            >
              Start Engine (I)
            </button>
          ) : (
            <button
              type="button"
              onClick={onCrankEngine}
              disabled={telemetry.crankingProgress > 0}
              className="rounded-md bg-[#D4A656] px-3 py-1.5 text-xs font-semibold text-[#18140F] transition-colors hover:bg-[#e1b76a] disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {telemetry.crankingProgress > 0 ? 'Cranking...' : 'Hand-Crank (C)'}
            </button>
          )}
        </div>
      )}

      {/* Movable & Collapsible Control Dock */}
      <div
        ref={dockRef}
        className={`fixed z-20 ${collapsed ? 'w-auto' : 'w-[min(1040px,97vw)]'} ${
          dockPos === null ? 'bottom-4 left-1/2 -translate-x-1/2' : ''
        }`}
        style={
          dockPos !== null
            ? {
                left: `${dockPos.left}px`,
                top: `${dockPos.top}px`,
              }
            : undefined
        }
      >
        {/* Top Dock Handle Bar: Drag Controls + Collapse + Snap Reset */}
        <div className="flex justify-center">
          <div className="flex items-center gap-1 rounded-t-lg border border-b-0 border-white/15 bg-[#161411]/94 px-2.5 py-1 text-xs font-medium text-[#D8CEBE] shadow-lg">
            <div
              onPointerDown={handleStartDrag}
              title="Drag to move controls anywhere"
              className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 select-none touch-none ${
                isDragging ? 'cursor-grabbing text-[#E8C073]' : 'cursor-grab hover:text-white'
              }`}
            >
              <GripHorizontal className="h-3.5 w-3.5 text-[#E8C073]" />
              <span className="whitespace-nowrap">Move</span>
            </div>

            <span className="h-3 w-px bg-white/15" aria-hidden="true" />

            <button
              type="button"
              onClick={() => setCollapsed((prev) => !prev)}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
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

            {dockPos !== null && (
              <>
                <span className="h-3 w-px bg-white/15" aria-hidden="true" />
                <button
                  type="button"
                  onClick={() => setDockPos(null)}
                  title="Snap controls back to bottom center"
                  className="rounded px-1.5 py-0.5 text-[11px] text-[#B7AB98] hover:text-white transition-colors cursor-pointer whitespace-nowrap"
                >
                  Center
                </button>
              </>
            )}
          </div>
        </div>

        {!collapsed && (
          <div className="rounded-xl border border-white/15 bg-[#161411]/95 px-4 py-2.5 shadow-2xl">
            {/* Row 1: Speed, RPM, Gear, Surface, Temp, Courtesy, Race Pos & Lap */}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-b border-white/10 pb-2">
              <div className="flex flex-wrap items-baseline gap-3.5">
                <div>
                  <span className="font-mono-tabular text-2xl font-semibold text-[#F6F1E7]">
                    {telemetry.speedMph.toFixed(1)}
                  </span>
                  <span className="ml-1 text-[11px] text-[#B7AB98]">mph</span>
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
                  <span className="font-medium text-[#F6F1E7]">{SURFACE_LABELS[telemetry.currentSurface]}</span>
                </div>

                <div className="text-xs text-[#D8CEBE]">
                  <span className="text-[#9E9280]">Rad </span>
                  <span
                    className={`font-mono-tabular font-medium ${
                      telemetry.isOverheating ? 'text-[#E06C5A]' : 'text-[#F6F1E7]'
                    }`}
                  >
                    {Math.round(telemetry.engineTempC)}°C
                  </span>
                </div>

                <div className="text-xs text-[#D8CEBE]">
                  <span className="text-[#9E9280]">Courtesy </span>
                  <span
                    className={`font-mono-tabular font-medium ${
                      telemetry.courtesyScore < 65 ? 'text-[#E59D4D]' : 'text-[#9ee0af]'
                    }`}
                  >
                    {Math.round(telemetry.courtesyScore)}%
                  </span>
                </div>

                <div className="text-xs text-[#D8CEBE]">
                  <span className="font-mono-tabular font-semibold text-[#E8C073]">
                    {telemetry.racePosition === 1 ? '1st' : telemetry.racePosition === 2 ? '2nd' : '3rd'}/3
                  </span>
                  <span className="ml-2 text-[#9E9280]">Lap {telemetry.lapCount} </span>
                  <span className="font-mono-tabular font-medium text-[#F6F1E7]">
                    {formatLapTime(telemetry.currentLapSec)}
                  </span>
                  {telemetry.bestLapSec !== null && (
                    <span className="ml-2 font-mono-tabular text-[#E8C073]">
                      Best {formatLapTime(telemetry.bestLapSec)}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 text-xs">
                {telemetry.crankKickbackWarning ? (
                  <span className="font-medium text-[#E06C5A]">Spark Kickback — Retard Lever (Q)</span>
                ) : telemetry.isOverheating ? (
                  <span className="font-medium text-[#E06C5A]">Radiator Boiling — Shift to LOW</span>
                ) : telemetry.knocking ? (
                  <span className="font-medium text-[#E59D4D]">Spark Knock — Retard Lever</span>
                ) : telemetry.stallWarning && telemetry.engineRunning ? (
                  <span className="font-medium text-[#E06C5A]">Low RPM — Press Clutch or Throttle</span>
                ) : (
                  <span className="text-[#9E9280]">
                    {controlMode === 'standard'
                      ? 'W/S Drive · A/D Steer · Space Brake'
                      : 'Shift: Low · X: Rev · S: Brake · Space: Lever'}
                  </span>
                )}
              </div>
            </div>

            {/* Row 2: Seasonal Day-of-Year, Time-of-Day & 5 Weather States */}
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2.5 border-b border-white/10 pb-2">
              {/* Day of Year + Time Sliders */}
              <div className="flex flex-wrap items-center gap-3.5">
                <label className="flex items-center gap-2 text-xs text-[#CFC5B4]">
                  <Calendar className="h-3.5 w-3.5 text-[#E8C073]" />
                  <span className="font-mono-tabular whitespace-nowrap text-[#F4EFE6] w-[88px]">
                    {env.dateLabel} · {env.seasonName}
                  </span>
                  <input
                    type="range"
                    min={1}
                    max={365}
                    step={1}
                    value={env.dayOfYear}
                    onChange={(e) => onDayOfYearChange(parseInt(e.target.value, 10))}
                    className="brass-slider w-24"
                    aria-label="Day of the year"
                  />
                </label>

                <label className="flex items-center gap-2 text-xs text-[#CFC5B4]">
                  <span className="font-mono-tabular whitespace-nowrap text-[#F4EFE6] w-[42px]">
                    {formatClock(env.timeHour)}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={23.75}
                    step={0.25}
                    value={env.timeHour}
                    onChange={(e) => onTimeHourChange(parseFloat(e.target.value))}
                    className="brass-slider w-24"
                    aria-label="Time of day"
                  />
                </label>

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
                      className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        env.timePreset === t
                          ? 'bg-[#EAE2D3] text-[#17130E]'
                          : 'text-[#CFC5B4] hover:text-white'
                      }`}
                    >
                      {Icon ? <Icon className="h-3 w-3" /> : null}
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 5 Seasonal Weather Switcher + Auto Weather */}
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={onAutoWeatherToggle}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    env.autoWeather
                      ? 'border-[#D4A656]/60 bg-[#D4A656]/22 text-[#F2CD82]'
                      : 'border-white/12 bg-white/6 text-[#CFC5B4] hover:text-white'
                  }`}
                  title="Automatically select seasonal weather for day and time"
                >
                  Auto
                </button>

                <div className="flex items-center rounded-lg bg-white/6 p-0.5">
                  {(
                    [
                      ['sunny', 'Sun', Sun],
                      ['cloudy', 'Cloud', Cloud],
                      ['rainy', 'Rain', CloudRain],
                      ['snowy', 'Snow', CloudSnow],
                      ['windy', 'Wind', Wind],
                    ] as const
                  ).map(([w, label, Icon]) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => onWeatherChange(w)}
                      className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
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
              </div>
            </div>

            {/* Row 3: Camera, Driving Mode, Levers & Heritage/Unity Drawers */}
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-3">
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

                <div className="flex items-center rounded-lg bg-white/6 p-0.5">
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

                <label className="flex items-center gap-2 text-xs text-[#CFC5B4]">
                  <span className="whitespace-nowrap">Throttle</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.02}
                    value={telemetry.handThrottle}
                    onChange={(e) => onHandThrottleChange(parseFloat(e.target.value))}
                    className="brass-slider w-16"
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
                    className="brass-slider w-16"
                    aria-label="Spark advance lever"
                  />
                </label>

                {controlMode === 'authentic' && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onMouseDown={() => onPedalPress('low', true)}
                      onMouseUp={() => onPedalPress('low', false)}
                      onMouseLeave={() => onPedalPress('low', false)}
                      onTouchStart={() => onPedalPress('low', true)}
                      onTouchEnd={() => onPedalPress('low', false)}
                      className={`rounded-md border px-2 py-1 text-xs font-medium cursor-pointer whitespace-nowrap ${
                        telemetry.gear === 'LOW'
                          ? 'border-[#D4A656] bg-[#D4A656] text-[#17130E]'
                          : 'border-white/15 bg-white/8 text-[#EAE2D3]'
                      }`}
                    >
                      Low
                    </button>
                    <button
                      type="button"
                      onMouseDown={() => onPedalPress('reverse', true)}
                      onMouseUp={() => onPedalPress('reverse', false)}
                      onMouseLeave={() => onPedalPress('reverse', false)}
                      onTouchStart={() => onPedalPress('reverse', true)}
                      onTouchEnd={() => onPedalPress('reverse', false)}
                      className={`rounded-md border px-2 py-1 text-xs font-medium cursor-pointer whitespace-nowrap ${
                        telemetry.gear === 'REV'
                          ? 'border-[#D4A656] bg-[#D4A656] text-[#17130E]'
                          : 'border-white/15 bg-white/8 text-[#EAE2D3]'
                      }`}
                    >
                      Rev
                    </button>
                    <button
                      type="button"
                      onMouseDown={() => onPedalPress('brake', true)}
                      onMouseUp={() => onPedalPress('brake', false)}
                      onMouseLeave={() => onPedalPress('brake', false)}
                      onTouchStart={() => onPedalPress('brake', true)}
                      onTouchEnd={() => onPedalPress('brake', false)}
                      className="rounded-md border border-white/15 bg-white/8 px-2 py-1 text-xs font-medium text-[#EAE2D3] active:bg-[#D4A656] active:text-[#17130E] cursor-pointer whitespace-nowrap"
                    >
                      Brake
                    </button>
                    <div className="flex items-center gap-1">
                      {(
                        [
                          [0, 'High'],
                          [0.5, 'N'],
                          [1.0, 'Park'],
                        ] as [number, string][]
                      ).map(([pos, label]) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => onHandbrakeLeverChange(pos)}
                          className={`rounded-md px-2 py-1 text-xs font-medium cursor-pointer whitespace-nowrap ${
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
                )}
              </div>

              {/* Utility & Drawers */}
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={onToggleIgnition}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1 ${
                    telemetry.ignitionOn
                      ? 'border-[#6fb984]/55 bg-[#407a51]/25 text-[#9ee0af]'
                      : 'border-white/12 bg-white/6 text-[#CFC5B4] hover:text-white'
                  }`}
                  title="Turn Engine Ignition On / Off (I)"
                >
                  <Power className="h-3.5 w-3.5" />
                  <span>{telemetry.ignitionOn ? 'Engine On' : 'Engine Off'}</span>
                </button>

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
                  onClick={onToggleWiper}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    wiperOn
                      ? 'border-[#73c991]/55 bg-[#407a51]/25 text-[#9ee0af]'
                      : 'border-white/12 bg-white/6 text-[#CFC5B4] hover:text-white'
                  }`}
                  title="Toggle Brass Windscreen Wiper (V)"
                >
                  Wiper
                </button>

                <button
                  type="button"
                  onClick={onStartOrAdvanceErrand}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1 ${
                    errandState.phase !== 'idle'
                      ? 'border-[#73c991]/55 bg-[#407a51]/25 text-[#9ee0af]'
                      : 'border-white/12 bg-white/6 text-[#CFC5B4] hover:text-white'
                  }`}
                  title="Take on 1914 Oamaru Chauffeur Errands"
                >
                  <Briefcase className="h-3.5 w-3.5" />
                  <span>
                    {errandState.phase === 'idle'
                      ? 'Errands'
                      : errandState.phase === 'completed'
                        ? 'Next Errand'
                        : 'Next Job'}
                  </span>
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
                  title="Reset to Start Line (R)"
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

            {/* Active 1914 Chauffeur Errand Strip */}
            {errandState.phase !== 'idle' && (
              <div className="mt-2 flex items-center justify-between gap-3 border-t border-white/10 pt-1.5 text-xs">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 font-semibold text-[#E8C073]">
                    {OAMARU_ERRANDS[errandState.errandIndex].title}
                  </span>
                  <span className="truncate text-[#DCD2C2]">
                    {errandState.statusMessage ??
                      (errandState.phase === 'to-pickup'
                        ? OAMARU_ERRANDS[errandState.errandIndex].pickup.prompt
                        : OAMARU_ERRANDS[errandState.errandIndex].dropoff.prompt)}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-mono-tabular text-[#9E9280]">
                    Done {errandState.completedCount}
                  </span>
                  <button
                    type="button"
                    onClick={onCancelErrand}
                    className="rounded px-1.5 py-0.5 text-[#9E9280] hover:bg-white/10 hover:text-white cursor-pointer"
                    title="Dismiss active errand"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Historical Oamaru Victorian Precinct Buildings Drawer */}
      {heritageDrawerOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-end bg-black/55">
          <div className="flex h-full w-[min(560px,95vw)] flex-col border-l border-white/15 bg-[#181613] text-[#F4EFE6] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <div>
                <h2 className="font-display text-xl font-semibold">Oamaru Victorian Precinct</h2>
                <p className="text-xs text-[#B7AB98]">
                  Historical Whitestone buildings modeled along the 1914 circuit
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
                  Drop-in Seasonal Weather, Solar Arc, WheelCollider & Planetary Transmission scripts
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
