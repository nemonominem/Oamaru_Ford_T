import React, { useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Power,
  RotateCcw,
  UserMinus,
  UserPlus,
  Volume2,
} from 'lucide-react';
import { PassengerHudState } from '../sim/passengers';
import { ControlMode, VehicleState } from '../sim/types';

export interface TouchDrivingState {
  steerLeft: boolean;
  steerRight: boolean;
  drive: boolean;
  brake: boolean;
  reverse: boolean;
}

interface MobileTouchControlsProps {
  visible: boolean;
  telemetry: VehicleState;
  controlMode: ControlMode;
  passengerHud: PassengerHudState;
  onTouchChange: (key: keyof TouchDrivingState, active: boolean) => void;
  onHorn: () => void;
  onPassengerAction: () => void;
  onToggleIgnition: () => void;
  onCrankEngine: () => void;
  onHandbrakeCycle: () => void;
}

interface HoldButtonProps {
  label: string;
  ariaLabel: string;
  active: boolean;
  onHoldChange: (held: boolean) => void;
  className?: string;
  children: React.ReactNode;
}

const TouchHoldButton: React.FC<HoldButtonProps> = ({
  label,
  ariaLabel,
  active,
  onHoldChange,
  className = '',
  children,
}) => {
  const activePointerId = useRef<number | null>(null);

  const release = (e?: React.PointerEvent<HTMLButtonElement>) => {
    if (e && activePointerId.current !== null && e.pointerId !== activePointerId.current) {
      return;
    }
    if (activePointerId.current !== null) {
      activePointerId.current = null;
      onHoldChange(false);
    }
  };

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={active}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        activePointerId.current = e.pointerId;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // ignore pointer capture issues in unsupported environments
        }
        onHoldChange(true);
      }}
      onPointerUp={(e) => {
        e.preventDefault();
        release(e);
      }}
      onPointerCancel={(e) => release(e)}
      onLostPointerCapture={() => {
        if (activePointerId.current !== null) {
          activePointerId.current = null;
          onHoldChange(false);
        }
      }}
      className={`touch-none select-none flex flex-col items-center justify-center rounded-2xl border transition-transform active:scale-95 ${className}`}
    >
      {children}
      <span className="mt-0.5 text-[10px] font-semibold tracking-tight leading-none whitespace-nowrap">
        {label}
      </span>
    </button>
  );
};

export const MobileTouchControls: React.FC<MobileTouchControlsProps> = ({
  visible,
  telemetry,
  controlMode,
  passengerHud,
  onTouchChange,
  onHorn,
  onPassengerAction,
  onToggleIgnition,
  onCrankEngine,
  onHandbrakeCycle,
}) => {
  const [held, setHeld] = useState<TouchDrivingState>({
    steerLeft: false,
    steerRight: false,
    drive: false,
    brake: false,
    reverse: false,
  });

  if (!visible) return null;

  const setKey = (key: keyof TouchDrivingState, active: boolean) => {
    setHeld((prev) => (prev[key] === active ? prev : { ...prev, [key]: active }));
    onTouchChange(key, active);
  };

  const handbrakeLabel =
    telemetry.handbrakePos > 0.7 ? 'Park' : telemetry.handbrakePos < 0.25 ? 'High' : 'N';

  return (
    <>
      {/* Bottom-Left Thumb Cluster: Steering + Horn + Compact Speed Readout */}
      <div
        className="fixed bottom-[max(12px,env(safe-area-inset-bottom))] left-[max(12px,env(safe-area-inset-left))] z-20 flex flex-col items-start gap-2 touch-none select-none"
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onHorn}
            aria-label="Sound brass horn"
            className="min-h-[44px] min-w-[48px] px-3 rounded-xl border border-[#D4A656]/45 bg-[#161411]/90 text-[#E8C073] active:bg-[#D4A656] active:text-[#17130E] flex items-center justify-center gap-1.5 shadow-lg cursor-pointer touch-none select-none"
          >
            <Volume2 className="h-4 w-4 shrink-0" />
            <span className="text-xs font-semibold">Horn</span>
          </button>

          <div className="rounded-xl border border-white/15 bg-[#161411]/88 px-2.5 py-1.5 text-xs shadow-lg">
            <span className="font-mono-tabular font-semibold text-[#F6F1E7]">
              {telemetry.speedMph.toFixed(0)}
            </span>
            <span className="ml-1 text-[10px] text-[#B7AB98]">mph</span>
            <span className="mx-1.5 text-white/25" aria-hidden="true">
              ·
            </span>
            <span className="font-mono-tabular font-semibold text-[#E8C073]">{telemetry.gear}</span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <TouchHoldButton
            label="Left"
            ariaLabel="Steer left"
            active={held.steerLeft}
            onHoldChange={(v) => setKey('steerLeft', v)}
            className={`min-h-[60px] min-w-[60px] sm:min-h-[64px] sm:min-w-[64px] shadow-xl ${
              held.steerLeft
                ? 'border-[#D4A656] bg-[#D4A656] text-[#17130E]'
                : 'border-white/20 bg-[#161411]/88 text-[#F4EFE6]'
            }`}
          >
            <ChevronLeft className="h-6 w-6" />
          </TouchHoldButton>

          <TouchHoldButton
            label="Right"
            ariaLabel="Steer right"
            active={held.steerRight}
            onHoldChange={(v) => setKey('steerRight', v)}
            className={`min-h-[60px] min-w-[60px] sm:min-h-[64px] sm:min-w-[64px] shadow-xl ${
              held.steerRight
                ? 'border-[#D4A656] bg-[#D4A656] text-[#17130E]'
                : 'border-white/20 bg-[#161411]/88 text-[#F4EFE6]'
            }`}
          >
            <ChevronRight className="h-6 w-6" />
          </TouchHoldButton>
        </div>
      </div>

      {/* Bottom-Right Thumb Cluster: Contextual Passenger/Start Action + Reverse / Brake / Drive Pedals */}
      <div
        className="fixed bottom-[max(12px,env(safe-area-inset-bottom))] right-[max(12px,env(safe-area-inset-right))] z-20 flex flex-col items-end gap-2 touch-none select-none"
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="flex items-center gap-2">
          {(passengerHud.onboardId !== null || passengerHud.nearbyWaitingId !== null) && (
            <button
              type="button"
              onClick={onPassengerAction}
              className={`min-h-[44px] px-3 rounded-xl border text-xs font-semibold flex items-center gap-1.5 shadow-lg cursor-pointer whitespace-nowrap touch-none select-none ${
                passengerHud.onboardId !== null
                  ? 'border-[#5ec2e6]/70 bg-[#1c3e4d]/95 text-[#b7ebff]'
                  : 'border-[#73c991]/75 bg-[#244a31]/95 text-[#b5f2c4]'
              }`}
            >
              {passengerHud.onboardId !== null ? (
                <>
                  <UserMinus className="h-4 w-4 shrink-0" />
                  <span>Unload</span>
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4 shrink-0" />
                  <span>Board</span>
                </>
              )}
            </button>
          )}

          {!telemetry.engineRunning && (
            <button
              type="button"
              onClick={telemetry.ignitionOn ? onCrankEngine : onToggleIgnition}
              disabled={telemetry.ignitionOn && telemetry.crankingProgress > 0}
              className="min-h-[44px] px-3 rounded-xl border border-[#D4A656] bg-[#D4A656] text-[#17130E] text-xs font-semibold flex items-center gap-1.5 shadow-lg cursor-pointer whitespace-nowrap disabled:opacity-60 touch-none select-none"
            >
              <Power className="h-4 w-4 shrink-0" />
              <span>
                {!telemetry.ignitionOn
                  ? 'Ignition'
                  : telemetry.crankingProgress > 0
                    ? 'Cranking...'
                    : 'Crank'}
              </span>
            </button>
          )}

          {controlMode === 'authentic' && (
            <button
              type="button"
              onClick={onHandbrakeCycle}
              aria-label="Cycle Model T handbrake lever between Park, Neutral, and High"
              className="min-h-[44px] px-3 rounded-xl border border-white/20 bg-[#161411]/90 text-[#EAE2D3] text-xs font-semibold shadow-lg cursor-pointer whitespace-nowrap touch-none select-none"
            >
              Lever: <span className="text-[#E8C073]">{handbrakeLabel}</span>
            </button>
          )}
        </div>

        <div className="flex items-end gap-2">
          <TouchHoldButton
            label="Rev"
            ariaLabel="Reverse gear"
            active={held.reverse}
            onHoldChange={(v) => setKey('reverse', v)}
            className={`min-h-[54px] min-w-[48px] px-2 shadow-xl ${
              held.reverse
                ? 'border-[#D4A656] bg-[#D4A656] text-[#17130E]'
                : 'border-white/20 bg-[#161411]/88 text-[#D8CEBE]'
            }`}
          >
            <RotateCcw className="h-4 w-4" />
          </TouchHoldButton>

          <TouchHoldButton
            label="Brake"
            ariaLabel="Apply brake"
            active={held.brake}
            onHoldChange={(v) => setKey('brake', v)}
            className={`min-h-[58px] min-w-[56px] px-2 shadow-xl ${
              held.brake
                ? 'border-[#E06C5A] bg-[#E06C5A] text-[#17130E]'
                : 'border-[#E06C5A]/60 bg-[#471d18]/92 text-[#f7b9af]'
            }`}
          >
            <span className="font-mono-tabular text-sm font-bold leading-none">II</span>
          </TouchHoldButton>

          <TouchHoldButton
            label={controlMode === 'authentic' ? 'Low' : 'Drive'}
            ariaLabel={controlMode === 'authentic' ? 'Hold Low pedal' : 'Accelerate forward'}
            active={held.drive}
            onHoldChange={(v) => setKey('drive', v)}
            className={`min-h-[64px] min-w-[64px] px-2 shadow-xl ${
              held.drive
                ? 'border-[#f0ca7d] bg-[#f0ca7d] text-[#17130E]'
                : 'border-[#D4A656]/75 bg-[#D4A656]/92 text-[#17130E]'
            }`}
          >
            <ChevronUp className="h-6 w-6 stroke-[2.5]" />
          </TouchHoldButton>
        </div>
      </div>
    </>
  );
};
