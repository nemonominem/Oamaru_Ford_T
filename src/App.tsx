/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ControlDock } from './components/ControlDock';
import { OamaruViewport } from './components/OamaruViewport';
import { ModelTAudioEngine } from './sim/audio';
import { computeAmbientTempC, getSeasonClimateInfo, pickLikelyWeather } from './sim/climate';
import { ActiveErrandState, OAMARU_ERRANDS, loadTrialRecords } from './sim/errands';
import { createInitialVehicleState, toggleIgnition, triggerHandCrank } from './sim/physics';
import { PassengerHudState, PassengerSpec } from './sim/passengers';
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

function buildInitialEnv(): EnvironmentState {
  const dayOfYear = 45; // 14 Feb (Oamaru Summer)
  const timeHour = 14.0;
  const info = getSeasonClimateInfo(dayOfYear);
  const weather = pickLikelyWeather(dayOfYear, timeHour, 0);
  const temperatureC = computeAmbientTempC(dayOfYear, timeHour, weather);

  return {
    weather,
    autoWeather: true,
    dayOfYear,
    seasonName: info.seasonName,
    dateLabel: info.dateLabel,
    temperatureC,
    sunriseHour: info.sunriseHour,
    sunsetHour: info.sunsetHour,
    timePreset: 'day',
    timeHour,
    windMps: weather === 'windy' ? 14.8 : weather === 'rainy' ? 7.8 : 1.8,
    wetness: weather === 'rainy' ? 1.0 : 0,
    snowCover: weather === 'snowy' ? 1.0 : 0,
    visibilityMeters: weather === 'snowy' ? 85 : weather === 'rainy' ? 110 : 300,
  };
}

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

  const envRef = useRef<EnvironmentState>(buildInitialEnv());

  const cameraModeRef = useRef<CameraMode>('cockpit');
  const controlModeRef = useRef<ControlMode>('standard');
  const headlightsManualRef = useRef<boolean | null>(null);
  const wiperOnRef = useRef<boolean>(false);
  const audioRef = useRef<ModelTAudioEngine>(new ModelTAudioEngine());
  const hornTriggerRef = useRef<number>(0);
  const passengerActionTriggerRef = useRef<number>(0);
  const resetTriggerRef = useRef<number>(0);

  const [telemetry, setTelemetry] = useState<VehicleState>(() => ({
    ...vehicleStateRef.current,
    wheels: [...vehicleStateRef.current.wheels] as VehicleState['wheels'],
  }));
  const [envState, setEnvState] = useState<EnvironmentState>(() => ({ ...envRef.current }));
  const [cameraMode, setCameraMode] = useState<CameraMode>('cockpit');
  const [controlMode, setControlMode] = useState<ControlMode>('standard');
  const [muted, setMuted] = useState<boolean>(false);
  const [headlightsOn, setHeadlightsOn] = useState<boolean>(false);
  const [wiperOn, setWiperOn] = useState<boolean>(false);
  const [passengerHud, setPassengerHud] = useState<PassengerHudState>({
    onboardId: null,
    onboardName: null,
    onboardRole: null,
    dropoffLabel: null,
    dropoffX: null,
    dropoffZ: null,
    nearbyWaitingId: null,
    nearbyWaitingName: null,
    nearbyWaitingRole: null,
    nearbyWaitingDist: null,
    waitingPoints: [],
    coachTip: null,
    noticeText: null,
  });

  const [errandState, setErrandState] = useState<ActiveErrandState>(() => ({
    errandIndex: 0,
    phase: 'idle',
    completedCount: loadTrialRecords().errandsCompleted,
    cleanStreak: 0,
    statusMessage: null,
  }));
  const errandStateRef = useRef<ActiveErrandState>(errandState);
  errandStateRef.current = errandState;

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
    resetTriggerRef.current += 1;
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

  const handleJumpToPassenger = useCallback((spec: PassengerSpec) => {
    const terrain = getTerrainSample(spec.approachX, spec.approachZ);
    const v = vehicleStateRef.current;
    v.x = spec.approachX;
    v.z = spec.approachZ;
    v.y = terrain.height;
    v.vx = 0;
    v.vy = 0;
    v.vz = 0;
    v.yaw = spec.approachYaw;
    v.yawRate = 0;
    v.pitch = 0;
    v.roll = 0;
    v.gear = 'N';
  }, []);

  const applySeasonWeatherForDateTime = useCallback((dayOfYear: number, timeHour: number, forcePick: boolean) => {
    const env = envRef.current;
    const info = getSeasonClimateInfo(dayOfYear);
    env.dayOfYear = dayOfYear;
    env.seasonName = info.seasonName;
    env.dateLabel = info.dateLabel;
    env.sunriseHour = info.sunriseHour;
    env.sunsetHour = info.sunsetHour;
    env.timeHour = timeHour;

    if (env.autoWeather || forcePick) {
      env.weather = pickLikelyWeather(dayOfYear, timeHour, 0);
    }
    env.temperatureC = computeAmbientTempC(dayOfYear, timeHour, env.weather);
    setEnvState({ ...env });
  }, []);

  const handleWeatherChange = useCallback((weather: WeatherType) => {
    audioRef.current.init();
    envRef.current.weather = weather;
    envRef.current.autoWeather = false;
    envRef.current.temperatureC = computeAmbientTempC(
      envRef.current.dayOfYear,
      envRef.current.timeHour,
      weather
    );
    setEnvState({ ...envRef.current });
  }, []);

  const handleAutoWeatherToggle = useCallback(() => {
    audioRef.current.init();
    const env = envRef.current;
    env.autoWeather = !env.autoWeather;
    if (env.autoWeather) {
      env.weather = pickLikelyWeather(env.dayOfYear, env.timeHour, 0);
      env.temperatureC = computeAmbientTempC(env.dayOfYear, env.timeHour, env.weather);
    }
    setEnvState({ ...env });
  }, []);

  const handleDayOfYearChange = useCallback(
    (dayOfYear: number) => {
      audioRef.current.init();
      applySeasonWeatherForDateTime(dayOfYear, envRef.current.timeHour, envRef.current.autoWeather);
    },
    [applySeasonWeatherForDateTime]
  );

  const handleTimeHourChange = useCallback(
    (hour: number) => {
      audioRef.current.init();
      const env = envRef.current;
      env.timePreset = 'day';
      if (hour >= env.sunsetHour - 0.8 && hour <= env.sunsetHour + 0.8) env.timePreset = 'dusk';
      else if (hour > env.sunsetHour + 0.8 || hour < env.sunriseHour - 0.5) env.timePreset = 'night';

      applySeasonWeatherForDateTime(env.dayOfYear, hour, env.autoWeather);
      headlightsManualRef.current = null;
    },
    [applySeasonWeatherForDateTime]
  );

  const handleTimePresetChange = useCallback(
    (preset: TimeOfDayPreset) => {
      audioRef.current.init();
      const env = envRef.current;
      env.timePreset = preset;
      let targetHour = env.timeHour;
      if (preset === 'day') targetHour = 13.5;
      else if (preset === 'dusk') targetHour = Math.round((env.sunsetHour - 0.15) * 4) / 4;
      else if (preset === 'night') targetHour = 22.5;

      applySeasonWeatherForDateTime(env.dayOfYear, targetHour, env.autoWeather);
      headlightsManualRef.current = null;
      const isDark = targetHour >= env.sunsetHour - 0.2 || targetHour <= env.sunriseHour;
      setHeadlightsOn(isDark || env.weather === 'rainy' || env.weather === 'snowy');
    },
    [applySeasonWeatherForDateTime]
  );

  const handleCrankEngine = useCallback(() => {
    audioRef.current.init();
    triggerHandCrank(vehicleStateRef.current, controlModeRef.current, controlsRef.current.sparkAdvance);
  }, []);

  const handleToggleIgnition = useCallback(() => {
    audioRef.current.init();
    toggleIgnition(vehicleStateRef.current, controlModeRef.current, controlsRef.current.sparkAdvance);
    setTelemetry({
      ...vehicleStateRef.current,
      wheels: [...vehicleStateRef.current.wheels] as VehicleState['wheels'],
    });
  }, []);

  const handleHorn = useCallback(() => {
    hornTriggerRef.current += 1;
    audioRef.current.playHorn();
  }, []);

  const handlePassengerAction = useCallback(() => {
    audioRef.current.init();
    passengerActionTriggerRef.current += 1;
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

  const handleToggleWiper = useCallback(() => {
    setWiperOn((prev) => {
      const next = !prev;
      wiperOnRef.current = next;
      return next;
    });
  }, []);

  const handleStartOrAdvanceErrand = useCallback(() => {
    audioRef.current.init();
    setErrandState((prev) => {
      const nextIdx = prev.phase === 'idle' ? prev.errandIndex : (prev.errandIndex + 1) % OAMARU_ERRANDS.length;
      return {
        ...prev,
        errandIndex: nextIdx,
        phase: 'to-pickup',
        statusMessage: null,
      };
    });
  }, []);

  const handleCancelErrand = useCallback(() => {
    setErrandState((prev) => ({
      ...prev,
      phase: 'idle',
      statusMessage: null,
    }));
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
      const autoOn =
        envSnap.timeHour >= envSnap.sunsetHour - 0.2 ||
        envSnap.timeHour <= envSnap.sunriseHour ||
        envSnap.weather === 'rainy' ||
        envSnap.weather === 'snowy';
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
        if (e.code === 'KeyH') {
          hornTriggerRef.current += 1;
          audioRef.current.playHorn();
        } else if (e.code === 'KeyP') handlePassengerAction();
        else if (e.code === 'KeyI') handleToggleIgnition();
        else if (e.code === 'KeyR') handleResetVehicle();
        else if (e.code === 'KeyC') {
          triggerHandCrank(vehicleStateRef.current, controlModeRef.current, controlsRef.current.sparkAdvance);
        } else if (e.code === 'KeyL') handleToggleHeadlights();
        else if (e.code === 'KeyV') handleToggleWiper();
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
  }, [
    handleCameraChange,
    handlePassengerAction,
    handleResetVehicle,
    handleToggleHeadlights,
    handleToggleIgnition,
    handleToggleWiper,
    syncKeysToControls,
  ]);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#141311]">
      <OamaruViewport
        vehicleStateRef={vehicleStateRef}
        controlsRef={controlsRef}
        envRef={envRef}
        cameraModeRef={cameraModeRef}
        controlModeRef={controlModeRef}
        headlightsManualRef={headlightsManualRef}
        wiperOnRef={wiperOnRef}
        audioRef={audioRef}
        hornTriggerRef={hornTriggerRef}
        passengerActionTriggerRef={passengerActionTriggerRef}
        resetTriggerRef={resetTriggerRef}
        passengerHud={passengerHud}
        onPassengerHudChange={setPassengerHud}
        onPassengerAction={handlePassengerAction}
        errandState={errandState}
        errandStateRef={errandStateRef}
        onErrandUpdate={setErrandState}
        onTelemetryTick={handleTelemetryTick}
      />

      <ControlDock
        telemetry={telemetry}
        env={envState}
        cameraMode={cameraMode}
        controlMode={controlMode}
        muted={muted}
        headlightsOn={headlightsOn}
        wiperOn={wiperOn}
        errandState={errandState}
        passengerHud={passengerHud}
        onPassengerAction={handlePassengerAction}
        onCameraChange={handleCameraChange}
        onControlModeChange={handleControlModeChange}
        onWeatherChange={handleWeatherChange}
        onAutoWeatherToggle={handleAutoWeatherToggle}
        onDayOfYearChange={handleDayOfYearChange}
        onTimeHourChange={handleTimeHourChange}
        onTimePresetChange={handleTimePresetChange}
        onToggleMute={handleToggleMute}
        onToggleHeadlights={handleToggleHeadlights}
        onToggleWiper={handleToggleWiper}
        onStartOrAdvanceErrand={handleStartOrAdvanceErrand}
        onCancelErrand={handleCancelErrand}
        onToggleIgnition={handleToggleIgnition}
        onResetVehicle={handleResetVehicle}
        onJumpToBuilding={handleJumpToBuilding}
        onJumpToPassenger={handleJumpToPassenger}
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
