import React, { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Briefcase,
  Calendar,
  Camera,
  ChevronDown,
  ChevronUp,
  Circle,
  Cloud,
  CloudRain,
  CloudSnow,
  Code2,
  Compass,
  Copy,
  Download,
  Gauge,
  GripHorizontal,
  Landmark as LandmarkIcon,
  Lightbulb,
  MapPin,
  Moon,
  Power,
  RotateCcw,
  Square,
  Sun,
  Sunset,
  UserPlus,
  UserMinus,
  Users,
  Video,
  Volume2,
  VolumeX,
  Wind,
  X,
} from 'lucide-react';
import { ActiveErrandState, OAMARU_ERRANDS } from '../sim/errands';
import { OAMARU_HISTORICAL_BUILDINGS } from '../sim/historicalBuildings';
import { PASSENGERS, PassengerHudState, PassengerSpec } from '../sim/passengers';
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
import type { RecordingStatusState } from './OamaruViewport';

interface ControlDockProps {
  telemetry: VehicleState;
  env: EnvironmentState;
  cameraMode: CameraMode;
  recordCameraMode: CameraMode;
  recordingStatus: RecordingStatusState;
  startShieldOpen: boolean;
  controlMode: ControlMode;
  muted: boolean;
  headlightsOn: boolean;
  wiperOn: boolean;
  errandState: ActiveErrandState;
  passengerHud: PassengerHudState;
  onPassengerAction: () => void;
  onCameraChange: (mode: CameraMode) => void;
  onRecordCameraChange: (mode: CameraMode) => void;
  onToggleRecording: () => void;
  onOpenGuide: () => void;
  touchControlsEnabled: boolean;
  onToggleTouchControls: () => void;
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
  onJumpToPassenger: (spec: PassengerSpec) => void;
  onCrankEngine: () => void;
  onHorn: () => void;
  onHandThrottleChange: (val: number) => void;
  onSparkAdvanceChange: (val: number) => void;
  onHandbrakeLeverChange: (val: number) => void;
  onPedalPress: (pedal: 'low' | 'reverse' | 'brake', pressed: boolean) => void;
  qualityMode: 'fun' | 'realistic',
  onQualityChange: () => void,
  showHUD: boolean,
  onToggleHUD: () => void,
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

const CAMERA_LABELS: Record<CameraMode, string> = {
  cockpit: 'Driver',
  chase: 'Chase',
  bonnet: 'Bonnet',
  orbit: 'Orbit',
};

function formatRecDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export const ControlDock: React.FC<ControlDockProps> = ({
  telemetry,
  env,
  cameraMode,
  recordCameraMode,
  recordingStatus,
  startShieldOpen,
  controlMode,
  muted,
  headlightsOn,
  wiperOn,
  errandState,
  passengerHud,
  onPassengerAction,
  onCameraChange,
  onRecordCameraChange,
  onToggleRecording,
  onOpenGuide,
  touchControlsEnabled,
  onToggleTouchControls,
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
  onJumpToPassenger,
  onCrankEngine,
  onHorn,
  onHandThrottleChange,
  onSparkAdvanceChange,
  onHandbrakeLeverChange,
  onPedalPress,
}) => {
  const [collapsed, setCollapsed] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );
  const [openThemes, setOpenThemes] = useState({
    driving: true,
    climate: false,
    view: false,
    town: false,
  });
  const [qualityMode, setQualityMode] = useState<'fun' | 'realistic'>('fun');
  const [showHUD, setShowHUD] = useState(true);
  const [brakeHeld, setBrakeHeld] = useState(false);
  const [unityDrawerOpen, setUnityDrawerOpen] = useState(false);
  const [heritageDrawerOpen, setHeritageDrawerOpen] = useState(false);
  const [passengersDrawerOpen, setPassengersDrawerOpen] = useState(false);
  const [selectedScriptIdx, setSelectedScriptIdx] = useState(0);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const toggleTheme = (key: keyof typeof openThemes) => {
    setOpenThemes((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const setBrakeState = (pressed: boolean) => {
    setBrakeHeld(pressed);
    onPedalPress('brake', pressed);
  };

  // Movable & Resizable Control Dock (default narrower 620px; resizable 320px..1140px)
  const getDefaultWidth = () =>
    typeof window !== 'undefined' ? Math.min(620, Math.max(320, window.innerWidth - 32)) : 620;

  const dockRef = useRef<HTMLDivElement | null>(null);
  const [dockPos, setDockPos] = useState<{ left: number; top: number } | null>(null);
  const [dockWidth, setDockWidth] = useState<number>(getDefaultWidth);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  const dragStateRef = useRef<{
    startX: number;
    startY: number;
    origLeft: number;
    origTop: number;
    width: number;
    height: number;
  } | null>(null);

  const resizeStateRef = useRef<{
    edge: 'left' | 'right';
    startX: number;
    origWidth: number;
    origLeft: number;
    wasCentered: boolean;
  } | null>(null);

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const rs = resizeStateRef.current;
      if (rs) {
        const dx = e.clientX - rs.startX;
        const maxW = Math.min(1140, Math.max(320, window.innerWidth - 16));
        const minW = Math.min(320, maxW);
        if (rs.wasCentered) {
          const delta = rs.edge === 'right' ? dx * 2 : -dx * 2;
          const nextW = Math.max(minW, Math.min(maxW, Math.round(rs.origWidth + delta)));
          setDockWidth(nextW);
        } else if (rs.edge === 'right') {
          const maxAllow = Math.max(minW, window.innerWidth - rs.origLeft - 8);
          const nextW = Math.max(minW, Math.min(Math.min(maxW, maxAllow), Math.round(rs.origWidth + dx)));
          setDockWidth(nextW);
        } else {
          const rightEdge = rs.origLeft + rs.origWidth;
          const nextLeft = Math.max(8, Math.min(rightEdge - minW, Math.round(rs.origLeft + dx)));
          const nextW = Math.max(minW, Math.min(maxW, rightEdge - nextLeft));
          setDockWidth(nextW);
          setDockPos((prev) => (prev ? { ...prev, left: rightEdge - nextW } : prev));
        }
        return;
      }

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
      if (resizeStateRef.current) {
        resizeStateRef.current = null;
        setIsResizing(false);
      }
    };

    const onResize = () => {
      const maxW = Math.max(320, window.innerWidth - 16);
      setDockWidth((w) => Math.min(w, maxW));
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
  }, [collapsed, dockPos, dockWidth, openThemes]);

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

  const handleStartResize = (e: React.PointerEvent<HTMLDivElement>, edge: 'left' | 'right') => {
    if (e.button !== 0 || !dockRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = dockRef.current.getBoundingClientRect();
    resizeStateRef.current = {
      edge,
      startX: e.clientX,
      origWidth: rect.width,
      origLeft: rect.left,
      wasCentered: dockPos === null,
    };
    setIsResizing(true);
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
      <header className="pointer-events-none fixed top-3 left-3 sm:top-5 sm:left-6 z-10 max-w-[calc(100vw-180px)] sm:max-w-xl">
        <h1 className="font-display text-lg sm:text-2xl font-semibold tracking-tight text-[#F6F1E7] drop-shadow-[0_2px_6px_rgba(0,0,0,0.65)] truncate">
          Oamaru, 1914
        </h1>
        <p className="mt-0.5 text-[11px] sm:text-xs text-[#E4DAC7] drop-shadow-[0_1px_4px_rgba(0,0,0,0.75)] truncate">
          <span className="hidden sm:inline">Ford Model T Touring · </span>
          <span className="hidden md:inline font-mono-tabular">
            {env.dateLabel} ({env.seasonName}) ·{' '}
          </span>
          <span className="font-mono-tabular">{formatClock(env.timeHour)}</span>{' '}
          <span className="hidden sm:inline font-mono-tabular">
            · {env.temperatureC.toFixed(1)}°C
          </span>{' '}
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
      {!startShieldOpen && !telemetry.engineRunning && (
        <div className="fixed top-15 sm:top-5 left-1/2 -translate-x-1/2 z-20 flex max-w-[calc(100vw-24px)] items-center gap-2.5 sm:gap-3 rounded-lg border border-[#D4A656]/40 bg-[#1B1814]/95 px-3 py-1.5 sm:px-4 sm:py-2 shadow-lg">
          <span className="text-xs font-medium text-[#F4EFE6] truncate">
            {telemetry.crankKickbackWarning
              ? 'Spark advanced — Retard Spark (Q)'
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
              className="min-h-[38px] sm:min-h-0 rounded-md bg-[#D4A656] px-3 py-1.5 text-xs font-semibold text-[#18140F] transition-colors hover:bg-[#e1b76a] whitespace-nowrap shrink-0 cursor-pointer"
            >
              Start Engine (I)
            </button>
          ) : (
            <button
              type="button"
              onClick={onCrankEngine}
              disabled={telemetry.crankingProgress > 0}
              className="min-h-[38px] sm:min-h-0 rounded-md bg-[#D4A656] px-3 py-1.5 text-xs font-semibold text-[#18140F] transition-colors hover:bg-[#e1b76a] disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {telemetry.crankingProgress > 0 ? 'Cranking...' : 'Hand-Crank (C)'}
            </button>
          )}
        </div>
      )}

      {/* Movable, Resizable & Collapsible Control Dock */}
      <div
        ref={dockRef}
        className={`fixed ${collapsed ? 'z-20' : 'z-30'} ${
          dockPos === null
            ? collapsed
              ? 'top-3 right-[82px] md:top-auto md:right-auto md:bottom-4 md:left-1/2 md:-translate-x-1/2'
              : 'bottom-3 left-1/2 -translate-x-1/2 md:bottom-4'
            : ''
        }`}
        style={{
          width: collapsed ? 'auto' : `${dockWidth}px`,
          maxWidth: 'calc(100vw - 16px)',
          ...(dockPos !== null
            ? {
                left: `${dockPos.left}px`,
                top: `${dockPos.top}px`,
              }
            : {}),
        }}
      >
        {/* Top Dock Handle Bar: Move + Collapse + Guide + Rec Badge + Center */}
        <div className="flex justify-center">
          <div
            className={`flex items-center gap-1 border border-white/15 bg-[#161411]/94 px-2 py-1 text-xs font-medium text-[#D8CEBE] shadow-lg ${
              collapsed ? 'rounded-lg md:rounded-b-none md:border-b-0 min-h-[44px] md:min-h-0' : 'rounded-t-lg border-b-0'
            }`}
          >
            <div
              onPointerDown={handleStartDrag}
              title="Drag to move controls anywhere"
              className={`hidden md:flex items-center gap-1.5 rounded px-1.5 py-0.5 select-none touch-none ${
                isDragging ? 'cursor-grabbing text-[#E8C073]' : 'cursor-grab hover:text-white'
              }`}
            >
              <GripHorizontal className="h-3.5 w-3.5 text-[#E8C073]" />
              <span className="whitespace-nowrap">Move</span>
            </div>

            <span className="hidden md:inline h-3 w-px bg-white/15" aria-hidden="true" />

            <button
              type="button"
              onClick={() => setCollapsed((prev) => !prev)}
              className="flex min-h-[36px] md:min-h-0 items-center gap-1 rounded px-1.5 py-0.5 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
            >
              {collapsed ? (
                <>
                  <ChevronUp className="hidden md:block h-3.5 w-3.5" />
                  <ChevronDown className="md:hidden h-3.5 w-3.5" />
                  <span className="hidden md:inline">Show Controls</span>
                  <span className="md:hidden">Controls</span>
                </>
              ) : (
                <>
                  <ChevronDown className="h-3.5 w-3.5" />
                  <span>Hide Controls</span>
                </>
              )}
            </button>

            <span className="h-3 w-px bg-white/15" aria-hidden="true" />

            <button
              type="button"
              onClick={onOpenGuide}
              title="Open Quick Instructions, Controls & Credits"
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[#E8C073] hover:text-white transition-colors cursor-pointer whitespace-nowrap"
            >
              <BookOpen className="h-3.5 w-3.5" />
              <span>Guide</span>
            </button>

            {recordingStatus.isRecording && (
              <>
                <span className="h-3 w-px bg-white/15" aria-hidden="true" />
                <button
                  type="button"
                  onClick={onToggleRecording}
                  title="Stop & save video recording"
                  className="flex items-center gap-1 rounded bg-[#a83226]/85 px-1.5 py-0.5 text-[11px] font-semibold text-white hover:bg-[#c43d30] transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Square className="h-2.5 w-2.5 fill-current" />
                  <span className="font-mono-tabular">
                    {formatRecDuration(recordingStatus.elapsedSec)}
                  </span>
                </button>
              </>
            )}

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
          <div
            className={`relative rounded-xl border bg-[#161411]/95 px-3.5 py-2.5 shadow-2xl ${
              isResizing ? 'border-[#D4A656]/70' : 'border-white/15'
            }`}
          >
            {/* Left & Right Resize Edge Handles (double-click to reset default 620px width) */}
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize control panel width from left edge"
              title="Drag to resize width · Double-click to reset"
              onPointerDown={(e) => handleStartResize(e, 'left')}
              onDoubleClick={() => setDockWidth(getDefaultWidth())}
              className="group absolute top-2 bottom-2 -left-1.5 z-10 flex w-3 cursor-ew-resize items-center justify-center touch-none select-none"
            >
              <span className="h-8 w-1 rounded-full bg-white/15 transition-colors group-hover:bg-[#E8C073]" />
            </div>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize control panel width from right edge"
              title="Drag to resize width · Double-click to reset"
              onPointerDown={(e) => handleStartResize(e, 'right')}
              onDoubleClick={() => setDockWidth(getDefaultWidth())}
              className="group absolute top-2 bottom-2 -right-1.5 z-10 flex w-3 cursor-ew-resize items-center justify-center touch-none select-none"
            >
              <span className="h-8 w-1 rounded-full bg-white/15 transition-colors group-hover:bg-[#E8C073]" />
            </div>

            <div className="max-h-[68vh] overflow-y-auto pr-0.5">
              {/* Persistent Top Telemetry & Immediate Driving Quick-Actions (includes Brake in ALL modes) */}
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-white/10 pb-2">
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

              {/* Essential Immediate Actions: Brake (always available!), Horn, Ignition, Passenger Pickup/Dropoff */}
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onPointerDown={() => setBrakeState(true)}
                  onPointerUp={() => setBrakeState(false)}
                  onPointerLeave={() => setBrakeState(false)}
                  onPointerCancel={() => setBrakeState(false)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer select-none ${
                    brakeHeld
                      ? 'border-[#E06C5A] bg-[#E06C5A] text-[#17130E]'
                      : 'border-[#E06C5A]/55 bg-[#7a2e25]/35 text-[#f7b9af] hover:bg-[#99382d]/50'
                  }`}
                  title="Hold to apply rear transmission brake"
                >
                  Brake
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

                {(passengerHud.onboardId !== null || passengerHud.nearbyWaitingId !== null) && (
                  <button
                    type="button"
                    onClick={onPassengerAction}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1 ${
                      passengerHud.onboardId !== null
                        ? 'border-[#5ec2e6]/60 bg-[#255063]/40 text-[#b7ebff] hover:bg-[#2f667e]/50'
                        : 'border-[#73c991]/60 bg-[#407a51]/35 text-[#b5f2c4] hover:bg-[#4e9362]/45'
                    }`}
                    title={
                      passengerHud.onboardId !== null
                        ? `Unload ${passengerHud.onboardName ?? 'passenger'} (P)`
                        : `Accept ${passengerHud.nearbyWaitingName ?? 'passenger'} (P)`
                    }
                  >
                    {passengerHud.onboardId !== null ? (
                      <>
                        <UserMinus className="h-3.5 w-3.5" />
                        <span>Unload (P)</span>
                      </>
                    ) : (
                      <>
                        <UserPlus className="h-3.5 w-3.5" />
                        <span>Accept (P)</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Thematic Collapsible Accordion Sections */}
            <div className="mt-2 divide-y divide-white/10">
              {/* Theme 1: Driving & Pedals */}
              <section className="py-1.5">
                <button
                  type="button"
                  aria-expanded={openThemes.driving}
                  onClick={() => toggleTheme('driving')}
                  className="flex w-full items-center justify-between gap-3 py-0.5 text-left text-xs font-medium text-[#EAE2D3] hover:text-white cursor-pointer"
                >
                  <span className="flex items-center gap-2 whitespace-nowrap">
                    <Gauge className="h-3.5 w-3.5 text-[#E8C073]" />
                    <span>Driving &amp; Pedals</span>
                    <span className="text-[11px] font-normal text-[#9E9280]">
                      · {controlMode === 'standard' ? 'WASD' : '3-Pedal'}
                      {telemetry.crankKickbackWarning
                        ? ' · Spark Kickback — Retard (Q)'
                        : telemetry.isOverheating
                          ? ' · Boiling — Shift Low'
                          : telemetry.knocking
                            ? ' · Knocking — Retard Spark'
                            : telemetry.stallWarning && telemetry.engineRunning
                              ? ' · Low RPM'
                              : ''}
                    </span>
                  </span>
                  {openThemes.driving ? (
                    <ChevronUp className="h-3.5 w-3.5 text-[#B7AB98] shrink-0" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-[#B7AB98] shrink-0" />
                  )}
                </button>

                {openThemes.driving && (
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2.5 pb-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center rounded-lg bg-white/6 p-0.5">
                        <button
                          type="button"
                          onClick={() => onControlModeChange('standard')}
                          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
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
                          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
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

                      {controlMode === 'authentic' ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onPointerDown={() => onPedalPress('low', true)}
                            onPointerUp={() => onPedalPress('low', false)}
                            onPointerLeave={() => onPedalPress('low', false)}
                            onPointerCancel={() => onPedalPress('low', false)}
                            className={`rounded-md border px-2.5 py-1 text-xs font-medium cursor-pointer whitespace-nowrap shrink-0 ${
                              telemetry.gear === 'LOW'
                                ? 'border-[#D4A656] bg-[#D4A656] text-[#17130E]'
                                : 'border-white/15 bg-white/8 text-[#EAE2D3]'
                            }`}
                          >
                            Low
                          </button>
                          <button
                            type="button"
                            onPointerDown={() => onPedalPress('reverse', true)}
                            onPointerUp={() => onPedalPress('reverse', false)}
                            onPointerLeave={() => onPedalPress('reverse', false)}
                            onPointerCancel={() => onPedalPress('reverse', false)}
                            className={`rounded-md border px-2.5 py-1 text-xs font-medium cursor-pointer whitespace-nowrap shrink-0 ${
                              telemetry.gear === 'REV'
                                ? 'border-[#D4A656] bg-[#D4A656] text-[#17130E]'
                                : 'border-white/15 bg-white/8 text-[#EAE2D3]'
                            }`}
                          >
                            Rev
                          </button>
                          <button
                            type="button"
                            onPointerDown={() => setBrakeState(true)}
                            onPointerUp={() => setBrakeState(false)}
                            onPointerLeave={() => setBrakeState(false)}
                            onPointerCancel={() => setBrakeState(false)}
                            className={`rounded-md border px-2.5 py-1 text-xs font-medium cursor-pointer whitespace-nowrap shrink-0 ${
                              brakeHeld
                                ? 'border-[#E06C5A] bg-[#E06C5A] text-[#17130E]'
                                : 'border-white/15 bg-white/8 text-[#EAE2D3]'
                            }`}
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
                                className={`rounded-md px-2.5 py-1 text-xs font-medium cursor-pointer whitespace-nowrap shrink-0 ${
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
                        <span className="text-[11px] text-[#9E9280] whitespace-nowrap">
                          W/S Drive · A/D Steer · X Reverse · Space Park
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {telemetry.ignitionOn && !telemetry.engineRunning && (
                        <button
                          type="button"
                          onClick={onCrankEngine}
                          disabled={telemetry.crankingProgress > 0}
                          className="rounded-lg border border-[#D4A656]/60 bg-[#D4A656] px-2.5 py-1 text-xs font-semibold text-[#17130E] hover:bg-[#e1b76a] disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          {telemetry.crankingProgress > 0 ? 'Cranking...' : 'Hand-Crank (C)'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={onResetVehicle}
                        className="flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/6 px-2.5 py-1 text-xs font-medium text-[#CFC5B4] hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        title="Reset to Start Line (R)"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>Reset</span>
                      </button>
                    </div>
                  </div>
                )}
              </section>

              {/* Theme 2: Weather & Time of Day */}
              <section className="py-1.5">
                <button
                  type="button"
                  aria-expanded={openThemes.climate}
                  onClick={() => toggleTheme('climate')}
                  className="flex w-full items-center justify-between gap-3 py-0.5 text-left text-xs font-medium text-[#EAE2D3] hover:text-white cursor-pointer"
                >
                  <span className="flex items-center gap-2 whitespace-nowrap">
                    <Calendar className="h-3.5 w-3.5 text-[#E8C073]" />
                    <span>Weather &amp; Time of Day</span>
                    <span className="font-mono-tabular text-[11px] font-normal text-[#9E9280]">
                      · {env.dateLabel} · {formatClock(env.timeHour)} · {WEATHER_LABELS[env.weather]}
                    </span>
                  </span>
                  {openThemes.climate ? (
                    <ChevronUp className="h-3.5 w-3.5 text-[#B7AB98] shrink-0" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-[#B7AB98] shrink-0" />
                  )}
                </button>

                {openThemes.climate && (
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2.5 pb-1">
                    <div className="flex flex-wrap items-center gap-3.5">
                      <label className="flex items-center gap-2 text-xs text-[#CFC5B4]">
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
                )}
              </section>

              {/* Theme 3: View, Recording, Lamps & Audio */}
              <section className="py-1.5">
                <button
                  type="button"
                  aria-expanded={openThemes.view}
                  onClick={() => toggleTheme('view')}
                  className="flex w-full items-center justify-between gap-3 py-0.5 text-left text-xs font-medium text-[#EAE2D3] hover:text-white cursor-pointer"
                >
                  <span className="flex min-w-0 items-center gap-2 truncate">
                    <Camera className="h-3.5 w-3.5 text-[#E8C073] shrink-0" />
                    <span className="whitespace-nowrap">Camera, Recording &amp; Audio</span>
                    <span className="truncate text-[11px] font-normal text-[#9E9280]">
                      · {CAMERA_LABELS[cameraMode]} ·{' '}
                      {recordingStatus.isRecording
                        ? `Rec ${CAMERA_LABELS[recordingStatus.recordedMode]} ${formatRecDuration(recordingStatus.elapsedSec)}`
                        : `Rec: ${CAMERA_LABELS[recordCameraMode]}`}{' '}
                      · {headlightsOn ? 'Lamps On' : 'Lamps Off'} · {muted ? 'Muted' : 'Sound On'}
                    </span>
                  </span>
                  {openThemes.view ? (
                    <ChevronUp className="h-3.5 w-3.5 text-[#B7AB98] shrink-0" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-[#B7AB98] shrink-0" />
                  )}
                </button>

                {openThemes.view && (
                  <div className="mt-2 space-y-2 pb-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-[#9E9280] whitespace-nowrap">View</span>
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

                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={onToggleHeadlights}
                          className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1 ${
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
                          onClick={() => setQualityMode((prev) => prev === "fun" ? "realistic" : "fun")}
                          className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1 {
                            qualityMode === "fun"
                              ? "border-[#D4A656]/60 bg-[#D4A656]/20 text-[#D4A656]"
                              : "border-white/12 bg-white/6 text-[#CFC5B4] hover:text-white"
                          }`}
                          title="Toggle Quality Mode (F)"
                        >
                          <span className="text-[10px] font-semibold">F</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setShowHUD((prev) => !prev)}
                          className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1 {
                            showHUD
                              ? "border-[#D4A656]/60 bg-[#D4A656]/20 text-[#D4A656]"
                              : "border-white/12 bg-white/6 text-[#CFC5B4] hover:text-white"
                          }`}
                          title="Toggle HUD (H)"
                        >
                          <span className="text-[10px] font-semibold">HUD</span>
                        </button>


                        <button
                          type="button"
                          onClick={onToggleWiper}
                          className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
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
                          onClick={onToggleMute}
                          className="flex items-center gap-1 rounded-lg border border-white/12 bg-white/6 px-2.5 py-1 text-xs font-medium text-[#CFC5B4] hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                          aria-label={muted ? 'Unmute audio' : 'Mute audio'}
                        >
                          {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                          <span>{muted ? 'Muted' : 'Audio'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={onToggleTouchControls}
                          className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            touchControlsEnabled
                              ? 'border-[#D4A656]/60 bg-[#D4A656]/20 text-[#F2CD82]'
                              : 'border-white/12 bg-white/6 text-[#CFC5B4] hover:text-white'
                          }`}
                          title="Show or hide on-screen steering and pedal touch buttons"
                        >
                          Touch Pad
                        </button>
                      </div>
                    </div>

                    {/* Independent Multi-Angle Video Recording Row */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/8 pt-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="flex items-center gap-1 text-[11px] text-[#9E9280] whitespace-nowrap">
                          <Video className="h-3 w-3 text-[#E8C073]" />
                          <span>Record Angle</span>
                        </span>
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
                              onClick={() => onRecordCameraChange(mode)}
                              className={`rounded-md px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                                recordCameraMode === mode
                                  ? 'bg-[#EAE2D3] text-[#17130E]'
                                  : 'text-[#CFC5B4] hover:text-white'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={onToggleRecording}
                          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            recordingStatus.isRecording
                              ? 'border-[#e06c5a] bg-[#a83226] text-white hover:bg-[#c43d30]'
                              : 'border-[#E06C5A]/55 bg-[#7a2e25]/35 text-[#f7b9af] hover:bg-[#99382d]/55'
                          }`}
                          title="Record video from the selected Record Angle independently of the active View camera"
                        >
                          {recordingStatus.isRecording ? (
                            <>
                              <Square className="h-3 w-3 fill-current" />
                              <span className="font-mono-tabular">
                                Stop &amp; Save ({formatRecDuration(recordingStatus.elapsedSec)})
                              </span>
                            </>
                          ) : (
                            <>
                              <Circle className="h-3 w-3 fill-current text-[#e06c5a]" />
                              <span>Record {CAMERA_LABELS[recordCameraMode]}</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {(recordingStatus.error || recordingStatus.lastSavedFilename || recordingStatus.isRecording) && (
                      <p className="text-[11px] text-[#B7AB98]">
                        {recordingStatus.error ? (
                          <span className="text-[#f2917b]">{recordingStatus.error}</span>
                        ) : recordingStatus.isRecording ? (
                          <span>
                            Capturing <span className="text-[#E8C073]">{CAMERA_LABELS[recordCameraMode]}</span>{' '}
                            camera independently while viewing{' '}
                            <span className="text-[#F4EFE6]">{CAMERA_LABELS[cameraMode]}</span>.
                          </span>
                        ) : (
                          <span>
                            Saved recording:{' '}
                            <span className="font-mono-tabular text-[#9ee0af]">
                              {recordingStatus.lastSavedFilename}
                            </span>
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                )}
              </section>

              {/* Theme 4: Town, Passengers & Code */}
              <section className="py-1.5">
                <button
                  type="button"
                  aria-expanded={openThemes.town}
                  onClick={() => toggleTheme('town')}
                  className="flex w-full items-center justify-between gap-3 py-0.5 text-left text-xs font-medium text-[#EAE2D3] hover:text-white cursor-pointer"
                >
                  <span className="flex items-center gap-2 whitespace-nowrap">
                    <Compass className="h-3.5 w-3.5 text-[#E8C073]" />
                    <span>Town, Passengers &amp; Export</span>
                    <span className="text-[11px] font-normal text-[#9E9280]">
                      · {passengerHud.waitingPoints.length} Waiting · {OAMARU_HISTORICAL_BUILDINGS.length} Landmarks
                    </span>
                  </span>
                  {openThemes.town ? (
                    <ChevronUp className="h-3.5 w-3.5 text-[#B7AB98] shrink-0" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-[#B7AB98] shrink-0" />
                  )}
                </button>

                {openThemes.town && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 pb-1">
                    <button
                      type="button"
                      onClick={onStartOrAdvanceErrand}
                      className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
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
                      onClick={() => {
                        setUnityDrawerOpen(false);
                        setHeritageDrawerOpen(false);
                        setPassengersDrawerOpen(true);
                      }}
                      className="flex items-center gap-1.5 rounded-lg border border-[#73c991]/45 bg-[#407a51]/20 px-2.5 py-1.5 text-xs font-medium text-[#b5f2c4] hover:bg-[#407a51]/35 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      title="View all roadside passengers, their locations, and the Ford T Driving Tutor"
                    >
                      <Users className="h-3.5 w-3.5 text-[#73c991]" />
                      <span>Passengers ({passengerHud.waitingPoints.length})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setUnityDrawerOpen(false);
                        setPassengersDrawerOpen(false);
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
                        setPassengersDrawerOpen(false);
                        setUnityDrawerOpen(true);
                      }}
                      className="flex items-center gap-1.5 rounded-lg border border-[#D4A656]/40 bg-[#D4A656]/15 px-2.5 py-1.5 text-xs font-medium text-[#E8C073] hover:bg-[#D4A656]/25 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Code2 className="h-3.5 w-3.5" />
                      <span>Unity C#</span>
                    </button>
                  </div>
                )}
              </section>
            </div>

            {/* Active 1914 Chauffeur Errand Strip */}
            {errandState.phase !== 'idle' && (
              <div className="mt-1.5 flex items-center justify-between gap-3 border-t border-white/10 pt-1.5 text-xs">
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
          </div>
        )}
      </div>

      {/* Oamaru Circuit Roadside Passengers Directory */}
      {passengersDrawerOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-end bg-black/55">
          <div className="flex h-full w-[min(540px,95vw)] flex-col border-l border-white/15 bg-[#181613] text-[#F4EFE6] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <div>
                <h2 className="font-display text-xl font-semibold">1914 Roadside Passengers</h2>
                <p className="text-xs text-[#B7AB98]">
                  Look for tall green/gold roadside beacons, waving handkerchiefs &amp; map initials (max 1 aboard)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPassengersDrawerOpen(false)}
                className="rounded-lg p-1.5 text-[#CFC5B4] hover:bg-white/10 hover:text-white cursor-pointer"
                aria-label="Close passengers drawer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-white/10 px-6">
              {PASSENGERS.map((p) => {
                const isOnboard = passengerHud.onboardId === p.id;
                const isWaiting = passengerHud.waitingPoints.some((wp) => wp.id === p.id);
                const dx = p.pickupX - telemetry.x;
                const dz = p.pickupZ - telemetry.z;
                const distM = Math.round(Math.hypot(dx, dz));
                const bearingAng = Math.atan2(dx, -dz);
                const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
                const bearing = dirs[((Math.round(bearingAng / (Math.PI / 4)) % 8) + 8) % 8];

                return (
                  <article key={p.id} className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <span
                          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-black/40 text-xs font-extrabold text-[#161411]"
                          style={{ backgroundColor: p.mapColor }}
                        >
                          {p.mapInitial}
                        </span>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-display text-base font-semibold text-[#F6F1E7]">{p.name}</h3>
                            {p.id === 'mechanic' && (
                              <span className="rounded bg-[#D4A656]/20 px-1.5 py-0.5 text-[10px] font-semibold text-[#E8C073]">
                                Driving Tutor
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[#C7BBA7]">{p.roleLabel}</p>
                          <p className="mt-1 text-xs text-[#9E9280]">
                            <span className="text-[#CFC5B4]">Waits at:</span> {p.pickupLabel} ·{' '}
                            <span className="font-mono-tabular text-[#E8C073]">
                              {isOnboard ? 'Riding with you' : isWaiting ? `${distM}m ${bearing}` : 'Stepping out'}
                            </span>
                          </p>
                          <p className="mt-0.5 text-xs text-[#9E9280]">
                            <span className="text-[#CFC5B4]">Wants lift to:</span> {p.dropoffLabel}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={isOnboard || !isWaiting}
                        onClick={() => {
                          onJumpToPassenger(p);
                          setPassengersDrawerOpen(false);
                        }}
                        className="flex items-center gap-1.5 rounded-lg border border-[#73c991]/45 bg-[#407a51]/25 px-3 py-1.5 text-xs font-medium text-[#b5f2c4] hover:bg-[#407a51]/40 disabled:opacity-45 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <MapPin className="h-3.5 w-3.5" />
                        <span>{isOnboard ? 'Aboard' : 'Pull Up Nearby'}</span>
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      )}

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
