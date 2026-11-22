/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ControlDock } from './components/ControlDock';
import { OamaruViewport } from './components/OamaruViewport';
import { ModelTAudioEngine } from './sim/audio';
import { createInitialVehicleState, triggerHandCrank } from './sim/physics';
import { getTerrainSample } from './sim/terrain';
import {
  CameraMode,
  ControlMode,
  EnvironmentState,
  HistoricalBuilding,
  TimeOfDayPreset,
  VehicleControls,
  VehicleState,
  WeatherType,
} from './sim/types';

export default function App() {
  const vehicleStateRef = useRef<VehicleState>(createInitialVehicleState());
  const controlsRef = useRef<VehicleControls>({
    steer: 0,
    horn: false,
    throttleInput: 0,
    brakeInput: 0,
    reverseInput: false,
    handThrottle: 0.16,
    sparkAdvance: 0.4,
    lowPedal: false,
    reversePedal: false,
    brakePedal: false,
    handbrakePos: 0.5,
  });

  const envRef = useRef<EnvironmentState>({
    weather: 'sun',
    timePreset: 'day',
    timeHour: 14.0,
    windMps: 1.5,
    wetness: 0,
    visibilityMeters: 280,
  });

  const cameraModeRef = useRef<CameraMode>('cockpit');
  const controlModeRef = useRef<ControlMode>('standard');
  const headlightsManualRef = useRef<boolean | null>(null);
  const audioRef = useRef<ModelTAudioEngine>(new ModelTAudioEngine());

  const [telemetry, setTelemetry] = useState<VehicleState>(() => ({
    ...vehicleStateRef.current,
    wheels: [...vehicleStateRef.current.wheels] as VehicleState['wheels'],
  }));
  const [envState, setEnvState] = useState<EnvironmentState>(() => ({ ...envRef.current }));
  const [cameraMode, setCameraMode] = useState<CameraMode>('cockpit');
  const [controlMode, setControlMode] = useState<ControlMode>('standard');
  const [muted, setMuted] = useState<boolean>(false);
  const [headlightsOn, setHeadlightsOn] = useState<boolean>(false);

  const pressedKeysRef = useRef<Set<string>>(new Set());

  const syncKeysToControls = useCallback(() => {
    const keys = pressedKeysRef.current;
    const ctrl = controlsRef.current;

    const left = keys.has('KeyA') || keys.has('ArrowLeft');
    const right = keys.has('KeyD') || keys.has('ArrowRight');
    ctrl.steer = (right ? 1 : 0) - (left ? 1 : 0);

    const fwd = keys.has('KeyW') || keys.has('ArrowUp');
    const back = keys.has('KeyS') || keys.has('ArrowDown');

    if (controlModeRef.current === 'standard') {
      ctrl.throttleInput = fwd ? 1 : 0;
      ctrl.brakeInput = back ? 1 : 0;
      ctrl.reverseInput = keys.has('KeyX');
      ctrl.handbrakePos = keys.has('Space') ? 1.0 : 0.5;
    } else {
      ctrl.lowPedal = keys.has('ShiftLeft') || keys.has('ShiftRight');
      ctrl.reversePedal = keys.has('KeyX');
      ctrl.brakePedal = back;
      if (fwd) {
        ctrl.handThrottle = Math.min(1, ctrl.handThrottle + 0.02);
      }
    }
  }, []);

  const handleResetVehicle = useCallback(() => {
    const fresh = createInitialVehicleState();
    vehicleStateRef.current = fresh;
    controlsRef.current.handThrottle = fresh.handThrottle;
    controlsRef.current.sparkAdvance = fresh.sparkAdvance;
    controlsRef.current.handbrakePos = 0.5;
  }, []);

  const handleJumpToBuilding = useCallback((building: HistoricalBuilding) => {
    const terrain = getTerrainSample(building.approachX, building.approachZ);
    const v = vehicleStateRef.current;
    v.x = building.approachX;
    v.z = building.approachZ;
    v.y = terrain.height;
    v.vx = 0;
    v.vy = 0;
    v.vz = 0;
    v.yaw = building.approachYaw;
    v.yawRate = 0;
    v.pitch = 0;
    v.roll = 0;
    v.gear = 'N';
  }, []);

  const handleWeatherChange = useCallback((weather: WeatherType) => {
    audioRef.current.init();
    envRef.current.weather = weather;
    setEnvState({ ...envRef.current });
  }, []);

  const handleTimePresetChange = useCallback((preset: TimeOfDayPreset) => {
    audioRef.current.init();
    envRef.current.timePreset = preset;
    if (preset === 'day') envRef.current.timeHour = 14.0;
    else if (preset === 'dusk') envRef.current.timeHour = 18.6;
    else if (preset === 'night') envRef.current.timeHour = 22.5;
    // Clear manual override so dusk/night auto-lamps behave naturally unless user toggles L
    headlightsManualRef.current = null;
    const isDark = envRef.current.timeHour >= 18.2 || envRef.current.timeHour <= 6.2;
    setHeadlightsOn(isDark || envRef.current.weather === 'fog');
    setEnvState({ ...envRef.current });
  }, []);

  const handleCrankEngine = useCallback(() => {
    audioRef.current.init();
    triggerHandCrank(vehicleStateRef.current);
  }, []);

  const handleHorn = useCallback(() => {
    audioRef.current.playHorn();
  }, []);

  const handleToggleMute = useCallback(() => {
    audioRef.current.init();
    setMuted((prev) => {
      const next = !prev;
      audioRef.current.setMuted(next);
      return next;
    });
  }, []);

  const handleToggleHeadlights = useCallback(() => {
    setHeadlightsOn((prev) => {
      const next = !prev;
      headlightsManualRef.current = next;
      return next;
    });
  }, []);

  const handleCameraChange = useCallback((mode: CameraMode) => {
    cameraModeRef.current = mode;
    setCameraMode(mode);
  }, []);

  const handleControlModeChange = useCallback((mode: ControlMode) => {
    controlModeRef.current = mode;
    setControlMode(mode);
    controlsRef.current.lowPedal = false;
    controlsRef.current.reversePedal = false;
    controlsRef.current.brakePedal = false;
    controlsRef.current.handbrakePos = 0.5;
  }, []);

  const handleTelemetryTick = useCallback((snapshot: VehicleState, envSnap: EnvironmentState) => {
    setTelemetry(snapshot);
    setEnvState(envSnap);
    if (headlightsManualRef.current === null) {
      const autoOn = envSnap.timeHour >= 18.2 || envSnap.timeHour <= 6.2 || envSnap.weather === 'fog';
      setHeadlightsOn(autoOn);
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      audioRef.current.init();

      if (e.code === 'Space') {
        e.preventDefault();
        if (controlModeRef.current === 'authentic' && !e.repeat) {
          const cur = controlsRef.current.handbrakePos;
          controlsRef.current.handbrakePos = cur > 0.7 ? 0.5 : cur < 0.25 ? 1.0 : 0.0;
        }
      }

      if (!e.repeat) {
        if (e.code === 'KeyH') audioRef.current.playHorn();
        else if (e.code === 'KeyR') handleResetVehicle();
        else if (e.code === 'KeyC') triggerHandCrank(vehicleStateRef.current);
        else if (e.code === 'KeyL') handleToggleHeadlights();
        else if (e.code === 'Digit1') handleCameraChange('cockpit');
        else if (e.code === 'Digit2') handleCameraChange('chase');
        else if (e.code === 'Digit3') handleCameraChange('bonnet');
        else if (e.code === 'Digit4') handleCameraChange('orbit');
      }

      if (e.code === 'KeyQ') {
        controlsRef.current.sparkAdvance = Math.max(0, controlsRef.current.sparkAdvance - 0.08);
      } else if (e.code === 'KeyE') {
        controlsRef.current.sparkAdvance = Math.min(1, controlsRef.current.sparkAdvance + 0.08);
      } else if (controlModeRef.current === 'authentic') {
        if (e.code === 'ArrowUp' || e.code === 'KeyW') {
          controlsRef.current.handThrottle = Math.min(1, controlsRef.current.handThrottle + 0.06);
        } else if (e.code === 'ArrowDown') {
          controlsRef.current.handThrottle = Math.max(0, controlsRef.current.handThrottle - 0.06);
        }
      }

      pressedKeysRef.current.add(e.code);
      syncKeysToControls();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      pressedKeysRef.current.delete(e.code);
      syncKeysToControls();
    };

    const onBlur = () => {
      pressedKeysRef.current.clear();
      syncKeysToControls();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      audioRef.current.dispose();
    };
  }, [handleCameraChange, handleResetVehicle, handleToggleHeadlights, syncKeysToControls]);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#141311]">
      <OamaruViewport
        vehicleStateRef={vehicleStateRef}
        controlsRef={controlsRef}
        envRef={envRef}
        cameraModeRef={cameraModeRef}
        controlModeRef={controlModeRef}
        headlightsManualRef={headlightsManualRef}
        audioRef={audioRef}
        onTelemetryTick={handleTelemetryTick}
      />

      <ControlDock
        telemetry={telemetry}
        env={envState}
        cameraMode={cameraMode}
        controlMode={controlMode}
        muted={muted}
        headlightsOn={headlightsOn}
        onCameraChange={handleCameraChange}
        onControlModeChange={handleControlModeChange}
        onWeatherChange={handleWeatherChange}
        onTimePresetChange={handleTimePresetChange}
        onToggleMute={handleToggleMute}
        onToggleHeadlights={handleToggleHeadlights}
        onResetVehicle={handleResetVehicle}
        onJumpToBuilding={handleJumpToBuilding}
        onCrankEngine={handleCrankEngine}
        onHorn={handleHorn}
        onHandThrottleChange={(v) => {
          audioRef.current.init();
          controlsRef.current.handThrottle = v;
        }}
        onSparkAdvanceChange={(v) => {
          audioRef.current.init();
          controlsRef.current.sparkAdvance = v;
        }}
        onHandbrakeLeverChange={(pos) => {
          audioRef.current.init();
          controlsRef.current.handbrakePos = pos;
        }}
        onPedalPress={(pedal, pressed) => {
          audioRef.current.init();
          if (pedal === 'low') controlsRef.current.lowPedal = pressed;
          else if (pedal === 'reverse') controlsRef.current.reversePedal = pressed;
          else controlsRef.current.brakePedal = pressed;
        }}
      />
    </main>
  );
}
