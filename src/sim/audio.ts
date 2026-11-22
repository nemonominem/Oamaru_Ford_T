import { EnvironmentState, VehicleState } from './types';

export class ModelTAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineSubOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private gearWhineOsc: OscillatorNode | null = null;
  private gearWhineGain: GainNode | null = null;
  private roadNoiseSource: AudioBufferSourceNode | null = null;
  private roadFilter: BiquadFilterNode | null = null;
  private roadGain: GainNode | null = null;
  private rainSource: AudioBufferSourceNode | null = null;
  private rainFilter: BiquadFilterNode | null = null;
  private rainGain: GainNode | null = null;
  private muted = false;
  private initialized = false;

  public init(): void {
    if (this.initialized) {
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : 0.34;
    master.connect(ctx.destination);
    this.masterGain = master;

    // 4-cylinder Model T chug
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 180;
    filter.Q.value = 3.2;

    const engineGain = ctx.createGain();
    engineGain.gain.value = 0.0;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 18;

    const sub = ctx.createOscillator();
    sub.type = 'triangle';
    sub.frequency.value = 36;

    osc.connect(filter);
    sub.connect(filter);
    filter.connect(engineGain);
    engineGain.connect(master);

    osc.start();
    sub.start();

    this.engineOsc = osc;
    this.engineSubOsc = sub;
    this.engineFilter = filter;
    this.engineGain = engineGain;

    // Planetary gear band whine
    const whineOsc = ctx.createOscillator();
    whineOsc.type = 'sine';
    whineOsc.frequency.value = 210;
    const whineGain = ctx.createGain();
    whineGain.gain.value = 0;
    whineOsc.connect(whineGain);
    whineGain.connect(master);
    whineOsc.start();

    this.gearWhineOsc = whineOsc;
    this.gearWhineGain = whineGain;

    // Procedural noise buffer for road rumble & rain patter
    const bufferSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuffer;
    noiseSrc.loop = true;

    const roadFilter = ctx.createBiquadFilter();
    roadFilter.type = 'bandpass';
    roadFilter.frequency.value = 160;
    roadFilter.Q.value = 1.4;

    const roadGain = ctx.createGain();
    roadGain.gain.value = 0;

    noiseSrc.connect(roadFilter);
    roadFilter.connect(roadGain);
    roadGain.connect(master);
    noiseSrc.start();

    this.roadNoiseSource = noiseSrc;
    this.roadFilter = roadFilter;
    this.roadGain = roadGain;

    // Rain patter noise layer
    const rainSrc = ctx.createBufferSource();
    rainSrc.buffer = noiseBuffer;
    rainSrc.loop = true;

    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = 'bandpass';
    rainFilter.frequency.value = 2200;
    rainFilter.Q.value = 0.65;

    const rainGain = ctx.createGain();
    rainGain.gain.value = 0;

    rainSrc.connect(rainFilter);
    rainFilter.connect(rainGain);
    rainGain.connect(master);
    rainSrc.start();

    this.rainSource = rainSrc;
    this.rainFilter = rainFilter;
    this.rainGain = rainGain;

    this.initialized = true;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.34, this.ctx.currentTime, 0.05);
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public update(state: VehicleState, env: EnvironmentState): void {
    if (!this.initialized || !this.ctx) return;
    const now = this.ctx.currentTime;

    if (!state.engineRunning) {
      this.engineGain?.gain.setTargetAtTime(0, now, 0.08);
      this.gearWhineGain?.gain.setTargetAtTime(0, now, 0.05);
    } else {
      const firingHz = Math.max(12, (state.rpm / 60) * 2);
      this.engineOsc?.frequency.setTargetAtTime(firingHz, now, 0.04);
      this.engineSubOsc?.frequency.setTargetAtTime(firingHz * 2, now, 0.04);

      const loadFilter = 140 + (state.rpm / 2000) * 320 + state.handThrottle * 160;
      this.engineFilter?.frequency.setTargetAtTime(loadFilter, now, 0.05);

      const engVol = 0.24 + state.handThrottle * 0.22;
      this.engineGain?.gain.setTargetAtTime(engVol, now, 0.05);

      if (state.gear === 'LOW' || state.gear === 'REV') {
        const whineFreq = 160 + state.speedMph * 22;
        const whineVol = Math.min(0.08, 0.015 + state.speedMph * 0.005);
        this.gearWhineOsc?.frequency.setTargetAtTime(whineFreq, now, 0.05);
        this.gearWhineGain?.gain.setTargetAtTime(whineVol, now, 0.05);
      } else {
        this.gearWhineGain?.gain.setTargetAtTime(0, now, 0.06);
      }
    }

    const speedFactor = Math.min(1, state.speedMps / 12);
    let surfaceFreq = 150;
    let surfaceGain = 0.14;
    if (state.currentSurface === 'cobbles') {
      surfaceFreq = 95;
      surfaceGain = 0.28;
    } else if (state.currentSurface === 'mud') {
      surfaceFreq = 220;
      surfaceGain = 0.22;
    } else if (state.currentSurface === 'wharf') {
      surfaceFreq = 120;
      surfaceGain = 0.22;
    }
    this.roadFilter?.frequency.setTargetAtTime(surfaceFreq + speedFactor * 140, now, 0.06);
    this.roadGain?.gain.setTargetAtTime(speedFactor * surfaceGain, now, 0.06);

    // Rain patter layer
    const targetRainVol = env.weather === 'rain' ? 0.12 : 0;
    this.rainGain?.gain.setTargetAtTime(targetRainVol, now, 0.25);
  }

  public playHorn(): void {
    this.init();
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;

    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc1.type = 'sawtooth';
    osc2.type = 'sawtooth';
    osc1.frequency.setValueAtTime(375, now);
    osc1.frequency.exponentialRampToValueAtTime(340, now + 0.28);
    osc2.frequency.setValueAtTime(465, now);
    osc2.frequency.exponentialRampToValueAtTime(420, now + 0.28);

    filter.type = 'bandpass';
    filter.frequency.value = 780;
    filter.Q.value = 2.4;

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.35, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.36);
    osc2.stop(now + 0.36);
  }

  public dispose(): void {
    try {
      this.engineOsc?.stop();
      this.engineSubOsc?.stop();
      this.gearWhineOsc?.stop();
      this.roadNoiseSource?.stop();
      this.rainSource?.stop();
      void this.ctx?.close();
    } catch {
      // ignore close errors
    }
    this.initialized = false;
  }
}
