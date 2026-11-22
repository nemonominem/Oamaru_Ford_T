import { SpatialTrafficAudioHints } from './oamaruTraffic';
import { EnvironmentState, VehicleState } from './types';

export class ModelTAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  // Vehicle & Surface
  private engineOsc: OscillatorNode | null = null;
  private engineSubOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private gearWhineOsc: OscillatorNode | null = null;
  private gearWhineGain: GainNode | null = null;
  private coilBuzzOsc: OscillatorNode | null = null;
  private coilBuzzGain: GainNode | null = null;
  private steamHissSource: AudioBufferSourceNode | null = null;
  private steamHissGain: GainNode | null = null;
  private roadNoiseSource: AudioBufferSourceNode | null = null;
  private roadFilter: BiquadFilterNode | null = null;
  private roadGain: GainNode | null = null;

  // Weather
  private rainSource: AudioBufferSourceNode | null = null;
  private rainFilter: BiquadFilterNode | null = null;
  private rainGain: GainNode | null = null;
  private windSource: AudioBufferSourceNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;

  // 1914 City Soundscape: Crowd Chatter, Discussions, Harbour Surf, Steam Train & Rival Cars
  private crowdVoiceSource: AudioBufferSourceNode | null = null;
  private crowdFormantLow: BiquadFilterNode | null = null;
  private crowdFormantMid: BiquadFilterNode | null = null;
  private crowdGain: GainNode | null = null;
  private crowdPanner: StereoPannerNode | null = null;
  private chatterLfo: OscillatorNode | null = null;
  private chatterLfoGain: GainNode | null = null;

  private cityAmbSource: AudioBufferSourceNode | null = null;
  private cityAmbFilter: BiquadFilterNode | null = null;
  private cityAmbGain: GainNode | null = null;

  private surfSource: AudioBufferSourceNode | null = null;
  private surfFilter: BiquadFilterNode | null = null;
  private surfGain: GainNode | null = null;
  private surfPanner: StereoPannerNode | null = null;

  private trainChuffSource: AudioBufferSourceNode | null = null;
  private trainChuffGain: GainNode | null = null;
  private trainPanner: StereoPannerNode | null = null;
  private trainLfo: OscillatorNode | null = null;

  private rivalCarOsc: OscillatorNode | null = null;
  private rivalCarGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private nextGullAt = 3.5;
  private nextHoofAt = 2.0;
  private nextChimeAt = 14.0;
  private nextDogBarkAt = 0;
  private nextSheepBleatAt = 0;
  private nextHorseSnortAt = 0;
  private nextTrainWhistleAt = 9.0;

  private muted = false;
  private initialized = false;

  private connectWithOptionalPan(
    source: AudioNode,
    pan: number
  ): void {
    if (!this.ctx || !this.masterGain) return;
    if (typeof this.ctx.createStereoPanner === 'function') {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = Math.max(-0.95, Math.min(0.95, pan));
      source.connect(panner);
      panner.connect(this.masterGain);
    } else {
      source.connect(this.masterGain);
    }
  }

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
    master.gain.value = this.muted ? 0 : 0.36;
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

    // Ignition coil-box trembler buzz (heard when ignition switch is ON before cranking)
    const coilOsc = ctx.createOscillator();
    coilOsc.type = 'sawtooth';
    coilOsc.frequency.value = 112;
    const coilFilt = ctx.createBiquadFilter();
    coilFilt.type = 'bandpass';
    coilFilt.frequency.value = 640;
    coilFilt.Q.value = 3.5;
    const coilGain = ctx.createGain();
    coilGain.gain.value = 0;
    coilOsc.connect(coilFilt);
    coilFilt.connect(coilGain);
    coilGain.connect(master);
    coilOsc.start();
    this.coilBuzzOsc = coilOsc;
    this.coilBuzzGain = coilGain;

    // Shared 3-second noise buffer
    const bufferSize = ctx.sampleRate * 3;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = noiseBuffer;

    // Speech-cadence modulated noise buffer for authentic murmur & discussions
    const chatterBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const cData = chatterBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const t = i / ctx.sampleRate;
      const syllableEnv =
        0.5 +
        0.5 *
          Math.sin(t * 22.0 + Math.sin(t * 5.3) * 1.8) *
          Math.cos(t * 11.7 + Math.sin(t * 3.1));
      cData[i] = (Math.random() * 2 - 1) * (0.25 + 0.75 * Math.max(0, syllableEnv));
    }

    // Chuff-modulated steam train buffer (~4 chuffs/sec)
    const chuffBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const chData = chuffBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const t = i / ctx.sampleRate;
      const pulse = Math.pow(Math.max(0, Math.sin(t * Math.PI * 4.0)), 2.2);
      chData[i] = (Math.random() * 2 - 1) * (0.12 + 0.88 * pulse);
    }

    // Radiator boiling steam hiss
    const steamSrc = ctx.createBufferSource();
    steamSrc.buffer = noiseBuffer;
    steamSrc.loop = true;
    const steamFilt = ctx.createBiquadFilter();
    steamFilt.type = 'bandpass';
    steamFilt.frequency.value = 3400;
    steamFilt.Q.value = 1.6;
    const steamGain = ctx.createGain();
    steamGain.gain.value = 0;
    steamSrc.connect(steamFilt);
    steamFilt.connect(steamGain);
    steamGain.connect(master);
    steamSrc.start();
    this.steamHissSource = steamSrc;
    this.steamHissGain = steamGain;

    // Road rumble
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

    // Rain patter
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

    // Coastal wind
    const windSrc = ctx.createBufferSource();
    windSrc.buffer = noiseBuffer;
    windSrc.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 340;
    windFilter.Q.value = 1.8;
    const windGain = ctx.createGain();
    windGain.gain.value = 0;
    windSrc.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(master);
    windSrc.start();
    this.windSource = windSrc;
    this.windFilter = windFilter;
    this.windGain = windGain;

    // Proximity Crowd Chatter & Discussions (dual vocal formant bands + stereo panner)
    const crowdSrc = ctx.createBufferSource();
    crowdSrc.buffer = chatterBuffer;
    crowdSrc.loop = true;

    const crowdFormantLow = ctx.createBiquadFilter();
    crowdFormantLow.type = 'bandpass';
    crowdFormantLow.frequency.value = 430;
    crowdFormantLow.Q.value = 2.6;

    const crowdFormantMid = ctx.createBiquadFilter();
    crowdFormantMid.type = 'bandpass';
    crowdFormantMid.frequency.value = 1180;
    crowdFormantMid.Q.value = 2.1;

    const crowdGain = ctx.createGain();
    crowdGain.gain.value = 0.02;

    const chatterLfo = ctx.createOscillator();
    chatterLfo.type = 'sine';
    chatterLfo.frequency.value = 3.8;
    const chatterLfoGain = ctx.createGain();
    chatterLfoGain.gain.value = 180;
    chatterLfo.connect(chatterLfoGain);
    chatterLfoGain.connect(crowdFormantMid.frequency);
    chatterLfo.start();

    crowdSrc.connect(crowdFormantLow);
    crowdSrc.connect(crowdFormantMid);
    crowdFormantLow.connect(crowdGain);
    crowdFormantMid.connect(crowdGain);
    if (typeof ctx.createStereoPanner === 'function') {
      const cPan = ctx.createStereoPanner();
      crowdGain.connect(cPan);
      cPan.connect(master);
      this.crowdPanner = cPan;
    } else {
      crowdGain.connect(master);
    }
    crowdSrc.start();

    this.crowdVoiceSource = crowdSrc;
    this.crowdFormantLow = crowdFormantLow;
    this.crowdFormantMid = crowdFormantMid;
    this.crowdGain = crowdGain;
    this.chatterLfo = chatterLfo;
    this.chatterLfoGain = chatterLfoGain;

    // Distant Oamaru City Hubbub (wagons, far voices, dock work)
    const citySrc = ctx.createBufferSource();
    citySrc.buffer = noiseBuffer;
    citySrc.loop = true;
    const cityAmbFilter = ctx.createBiquadFilter();
    cityAmbFilter.type = 'bandpass';
    cityAmbFilter.frequency.value = 520;
    cityAmbFilter.Q.value = 0.7;
    const cityAmbGain = ctx.createGain();
    cityAmbGain.gain.value = 0.02;
    citySrc.connect(cityAmbFilter);
    cityAmbFilter.connect(cityAmbGain);
    cityAmbGain.connect(master);
    citySrc.start();
    this.cityAmbSource = citySrc;
    this.cityAmbFilter = cityAmbFilter;
    this.cityAmbGain = cityAmbGain;

    // Pacific Harbour Surf near East Quay + stereo panner
    const surfSrc = ctx.createBufferSource();
    surfSrc.buffer = noiseBuffer;
    surfSrc.loop = true;
    const surfFilter = ctx.createBiquadFilter();
    surfFilter.type = 'lowpass';
    surfFilter.frequency.value = 380;
    const surfGain = ctx.createGain();
    surfGain.gain.value = 0;
    surfSrc.connect(surfFilter);
    surfFilter.connect(surfGain);
    if (typeof ctx.createStereoPanner === 'function') {
      const sPan = ctx.createStereoPanner();
      surfGain.connect(sPan);
      sPan.connect(master);
      this.surfPanner = sPan;
    } else {
      surfGain.connect(master);
    }
    surfSrc.start();
    this.surfSource = surfSrc;
    this.surfFilter = surfFilter;
    this.surfGain = surfGain;

    // 1914 NZR Harbour Shunting Locomotive Chuff
    const trainSrc = ctx.createBufferSource();
    trainSrc.buffer = chuffBuffer;
    trainSrc.loop = true;
    const trainFilt = ctx.createBiquadFilter();
    trainFilt.type = 'bandpass';
    trainFilt.frequency.value = 320;
    trainFilt.Q.value = 1.2;
    const trainGain = ctx.createGain();
    trainGain.gain.value = 0;
    trainSrc.connect(trainFilt);
    trainFilt.connect(trainGain);
    if (typeof ctx.createStereoPanner === 'function') {
      const tPan = ctx.createStereoPanner();
      trainGain.connect(tPan);
      tPan.connect(master);
      this.trainPanner = tPan;
    } else {
      trainGain.connect(master);
    }
    trainSrc.start();
    this.trainChuffSource = trainSrc;
    this.trainChuffGain = trainGain;

    const trainLfo = ctx.createOscillator();
    trainLfo.type = 'sine';
    trainLfo.frequency.value = 1.4;
    trainLfo.start();
    this.trainLfo = trainLfo;

    // Nearby Rival Vintage Car Chug
    const rivalOsc = ctx.createOscillator();
    rivalOsc.type = 'sawtooth';
    rivalOsc.frequency.value = 24;
    const rivalFilter = ctx.createBiquadFilter();
    rivalFilter.type = 'lowpass';
    rivalFilter.frequency.value = 170;
    const rivalGain = ctx.createGain();
    rivalGain.gain.value = 0;
    rivalOsc.connect(rivalFilter);
    rivalFilter.connect(rivalGain);
    rivalGain.connect(master);
    rivalOsc.start();
    this.rivalCarOsc = rivalOsc;
    this.rivalCarGain = rivalGain;

    this.initialized = true;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.36, this.ctx.currentTime, 0.05);
    }
    if (muted && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore speech synthesis errors
      }
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public speakStreetLine(
    text: string,
    role: string,
    isScolding: boolean,
    volumeScale: number
  ): void {
    if (this.muted || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      const synth = window.speechSynthesis;
      if (isScolding) {
        synth.cancel();
      } else if (synth.speaking || synth.pending) {
        return;
      }

      const utt = new SpeechSynthesisUtterance(text);
      const voices = synth.getVoices();
      const engVoice =
        voices.find((v) => /en[-_](NZ|AU|GB)/i.test(v.lang)) ??
        voices.find((v) => /^en/i.test(v.lang));
      if (engVoice) utt.voice = engVoice;

      if (role === 'Lady') {
        utt.pitch = isScolding ? 1.32 : 1.18;
      } else if (role === 'Newsboy') {
        utt.pitch = 1.28;
        utt.rate = 1.08;
      } else if (role === 'Constable') {
        utt.pitch = 0.84;
        utt.rate = isScolding ? 1.05 : 0.96;
      } else {
        utt.pitch = isScolding ? 1.06 : 0.94;
        utt.rate = isScolding ? 1.06 : 0.98;
      }

      utt.volume = Math.max(0.25, Math.min(1.0, volumeScale));
      synth.speak(utt);
    } catch {
      // ignore speech synthesis errors in restricted environments
    }
  }

  private playSeagullCall(now: number, volume: number, pan: number): void {
    if (!this.ctx || !this.masterGain || this.muted || volume < 0.01) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    const startFreq = 1650 + Math.random() * 380;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(startFreq * 0.62, now + 0.38);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);

    osc.connect(gain);
    this.connectWithOptionalPan(gain, pan);
    osc.start(now);
    osc.stop(now + 0.44);
  }

  private playHoofClipClop(now: number, volume: number, pan: number): void {
    if (!this.ctx || !this.masterGain || this.muted || volume < 0.01) return;
    [0, 0.14].forEach((offset, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      const base = idx === 0 ? 410 : 340;
      osc.frequency.setValueAtTime(base, now + offset);
      osc.frequency.exponentialRampToValueAtTime(120, now + offset + 0.055);

      gain.gain.setValueAtTime(volume, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.065);

      osc.connect(gain);
      this.connectWithOptionalPan(gain, pan);
      osc.start(now + offset);
      osc.stop(now + offset + 0.07);
    });
  }

  private playHorseSnort(now: number, intensity: number, pan: number): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted || intensity < 0.1) return;
    const vol = Math.min(0.18, 0.05 + intensity * 0.12);
    const nSrc = this.ctx.createBufferSource();
    nSrc.buffer = this.noiseBuffer;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.setValueAtTime(620, now);
    filt.frequency.exponentialRampToValueAtTime(240, now + 0.28);
    filt.Q.value = 2.4;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    nSrc.connect(filt);
    filt.connect(gain);
    this.connectWithOptionalPan(gain, pan);
    nSrc.start(now, Math.random() * 1.2, 0.32);
  }

  private playTrainWhistle(now: number, proximity: number, pan: number): void {
    if (!this.ctx || !this.masterGain || this.muted || proximity < 0.12) return;
    const vol = Math.min(0.14, 0.03 + proximity * 0.11);
    [311.13, 392.0].forEach((freq) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq * 0.98, now);
      osc.frequency.linearRampToValueAtTime(freq, now + 0.08);
      osc.frequency.setValueAtTime(freq, now + 0.85);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.94, now + 1.15);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(vol, now + 0.09);
      gain.gain.setValueAtTime(vol * 0.85, now + 0.82);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

      osc.connect(gain);
      this.connectWithOptionalPan(gain, pan);
      osc.start(now);
      osc.stop(now + 1.24);
    });
  }

  private playCivicBellChime(now: number): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    [523.25, 659.25].forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.65);

      gain.gain.setValueAtTime(0.001, now + idx * 0.65);
      gain.gain.linearRampToValueAtTime(0.045, now + idx * 0.65 + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + idx * 0.65 + 1.8);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now + idx * 0.65);
      osc.stop(now + idx * 0.65 + 1.85);
    });
  }

  private playDogBark(now: number, intensity: number, pan: number): void {
    if (!this.ctx || !this.masterGain || this.muted || intensity < 0.05) return;
    const barkCount = Math.random() < 0.62 ? 2 : 1;
    const pitchScale = 0.88 + Math.random() * 0.28;
    const vol = Math.min(0.24, 0.06 + intensity * 0.16);

    for (let b = 0; b < barkCount; b++) {
      const t0 = now + b * 0.175;
      const osc = this.ctx.createOscillator();
      const sub = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      sub.type = 'triangle';
      const fStart = (470 + Math.random() * 70) * pitchScale;
      const fEnd = (175 + Math.random() * 35) * pitchScale;
      osc.frequency.setValueAtTime(fStart * 0.85, t0);
      osc.frequency.exponentialRampToValueAtTime(fStart, t0 + 0.018);
      osc.frequency.exponentialRampToValueAtTime(fEnd, t0 + 0.11);

      sub.frequency.setValueAtTime(fStart * 0.5, t0);
      sub.frequency.exponentialRampToValueAtTime(fEnd * 0.5, t0 + 0.11);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(920 * pitchScale, t0);
      filter.frequency.exponentialRampToValueAtTime(420 * pitchScale, t0 + 0.11);
      filter.Q.value = 2.6;

      gain.gain.setValueAtTime(0.001, t0);
      gain.gain.linearRampToValueAtTime(vol, t0 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.125);

      osc.connect(filter);
      sub.connect(filter);
      filter.connect(gain);
      this.connectWithOptionalPan(gain, pan);

      osc.start(t0);
      sub.start(t0);
      osc.stop(t0 + 0.135);
      sub.stop(t0 + 0.135);

      if (this.noiseBuffer) {
        const nSrc = this.ctx.createBufferSource();
        nSrc.buffer = this.noiseBuffer;
        const nFilt = this.ctx.createBiquadFilter();
        nFilt.type = 'bandpass';
        nFilt.frequency.value = 1150 * pitchScale;
        nFilt.Q.value = 1.6;
        const nGain = this.ctx.createGain();
        nGain.gain.setValueAtTime(0.001, t0);
        nGain.gain.linearRampToValueAtTime(vol * 0.42, t0 + 0.01);
        nGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.075);
        nSrc.connect(nFilt);
        nFilt.connect(nGain);
        this.connectWithOptionalPan(nGain, pan);
        nSrc.start(t0, Math.random() * 1.5, 0.09);
      }
    }
  }

  private playSheepBleat(now: number, intensity: number, pan: number): void {
    if (!this.ctx || !this.masterGain || this.muted || intensity < 0.05) return;
    const dur = 0.44 + Math.random() * 0.22;
    const baseFreq = 215 + Math.random() * 68;
    const vol = Math.min(0.20, 0.055 + intensity * 0.14);

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(baseFreq * 0.94, now);
    osc.frequency.linearRampToValueAtTime(baseFreq * 1.06, now + dur * 0.28);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.88, now + dur);

    const vib = this.ctx.createOscillator();
    vib.type = 'sine';
    vib.frequency.value = 22 + Math.random() * 6;
    const vibGain = this.ctx.createGain();
    vibGain.gain.value = 18;
    vib.connect(vibGain);
    vibGain.connect(osc.frequency);

    const formant = this.ctx.createBiquadFilter();
    formant.type = 'bandpass';
    formant.frequency.setValueAtTime(760 + Math.random() * 190, now);
    formant.Q.value = 3.1;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.05);
    gain.gain.setValueAtTime(vol * 0.88, now + dur * 0.65);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    osc.connect(formant);
    formant.connect(gain);
    this.connectWithOptionalPan(gain, pan);

    osc.start(now);
    vib.start(now);
    osc.stop(now + dur + 0.02);
    vib.stop(now + dur + 0.02);
  }

  public playBackfirePop(): void {
    this.init();
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;

    const nSrc = this.ctx.createBufferSource();
    nSrc.buffer = this.noiseBuffer;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(680, now);
    filt.frequency.exponentialRampToValueAtTime(95, now + 0.14);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.32, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    nSrc.connect(filt);
    filt.connect(gain);
    gain.connect(this.masterGain);
    nSrc.start(now, Math.random() * 1.5, 0.18);

    const thump = this.ctx.createOscillator();
    thump.type = 'triangle';
    thump.frequency.setValueAtTime(110, now);
    thump.frequency.exponentialRampToValueAtTime(38, now + 0.12);
    const tGain = this.ctx.createGain();
    tGain.gain.setValueAtTime(0.28, now);
    tGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    thump.connect(tGain);
    tGain.connect(this.masterGain);
    thump.start(now);
    thump.stop(now + 0.14);
  }

  public playCrankKickback(): void {
    this.init();
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(185, now);
    osc.frequency.exponentialRampToValueAtTime(62, now + 0.14);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.26, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  public playErrandChime(): void {
    this.init();
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    [587.33, 880].forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.12);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.001, now + idx * 0.12);
      gain.gain.linearRampToValueAtTime(0.14, now + idx * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.65);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now + idx * 0.12);
      osc.stop(now + idx * 0.12 + 0.68);
    });
  }

  public update(state: VehicleState, env: EnvironmentState, spatial?: SpatialTrafficAudioHints): void {
    if (!this.initialized || !this.ctx) return;
    const now = this.ctx.currentTime;

    // Model T coil-box trembler buzz when ignition is ON prior to starting
    const coilActive = state.ignitionOn && !state.engineRunning && state.crankingProgress === 0;
    this.coilBuzzGain?.gain.setTargetAtTime(coilActive ? 0.045 : 0, now, 0.04);

    // Radiator boiling steam hiss
    const steamVol = state.isOverheating
      ? 0.065
      : state.engineTempC > 95
        ? ((state.engineTempC - 95) / 5.5) * 0.03
        : 0;
    this.steamHissGain?.gain.setTargetAtTime(steamVol, now, 0.18);

    if (!state.engineRunning) {
      this.engineGain?.gain.setTargetAtTime(0, now, 0.08);
      this.gearWhineGain?.gain.setTargetAtTime(0, now, 0.05);
    } else {
      const firingHz = Math.max(12, (state.rpm / 60) * 2);
      this.engineOsc?.frequency.setTargetAtTime(firingHz, now, 0.04);
      this.engineSubOsc?.frequency.setTargetAtTime(firingHz * 2, now, 0.04);

      const loadFilter = 140 + (state.rpm / 2000) * 320 + state.handThrottle * 160;
      this.engineFilter?.frequency.setTargetAtTime(loadFilter, now, 0.05);

      const engVol = 0.22 + state.handThrottle * 0.2;
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
    this.roadGain?.gain.setTargetAtTime(speedFactor * surfaceGain * (1 - env.snowCover * 0.35), now, 0.06);

    // Rain patter & coastal wind
    const targetRainVol = env.weather === 'rainy' ? 0.12 : 0;
    this.rainGain?.gain.setTargetAtTime(targetRainVol, now, 0.25);

    const targetWindVol =
      env.weather === 'windy'
        ? Math.min(0.14, 0.04 + env.windMps * 0.005)
        : env.weather === 'snowy' || env.weather === 'rainy'
          ? 0.03
          : 0.01;
    this.windFilter?.frequency.setTargetAtTime(260 + env.windMps * 14, now, 0.2);
    this.windGain?.gain.setTargetAtTime(targetWindVol, now, 0.25);

    // 1914 City Bustle, Proximity Crowd Discussions, Harbour Surf, Steam Train & Rival Cars
    const isDaytime = env.timeHour >= env.sunriseHour - 0.5 && env.timeHour <= env.sunsetHour + 1.5;
    const daytimeFactor = isDaytime ? 1.0 : 0.35;

    const crowdProx = spatial?.crowdProximity ?? 0.25;
    const densityScale = Math.min(1.5, 0.65 + (spatial?.crowdDensity ?? 4) * 0.1);
    const targetCrowdVol = (0.015 + crowdProx * 0.16 * densityScale) * daytimeFactor;
    this.crowdGain?.gain.setTargetAtTime(targetCrowdVol, now, 0.15);
    this.crowdFormantLow?.frequency.setTargetAtTime(390 + crowdProx * 120, now, 0.2);
    this.crowdPanner?.pan.setTargetAtTime(spatial?.crowdPan ?? 0, now, 0.12);

    this.cityAmbGain?.gain.setTargetAtTime(0.028 * daytimeFactor, now, 0.3);

    const harbourProx = spatial?.harbourProximity ?? 0;
    this.surfGain?.gain.setTargetAtTime(0.01 + harbourProx * 0.085, now, 0.25);
    this.surfPanner?.pan.setTargetAtTime(spatial?.harbourPan ?? 0, now, 0.2);

    const trainProx = spatial?.trainProximity ?? 0;
    this.trainChuffGain?.gain.setTargetAtTime(trainProx * 0.11, now, 0.18);
    this.trainPanner?.pan.setTargetAtTime(spatial?.trainPan ?? 0, now, 0.15);

    const carProx = spatial?.otherCarProximity ?? 0;
    this.rivalCarGain?.gain.setTargetAtTime(carProx * 0.09, now, 0.1);
    this.rivalCarOsc?.frequency.setTargetAtTime(22 + carProx * 6, now, 0.12);

    if (now >= this.nextGullAt) {
      this.nextGullAt = now + 4.5 + Math.random() * 6.5;
      if (harbourProx > 0.12 || env.weather !== 'rainy') {
        this.playSeagullCall(now, 0.018 + harbourProx * 0.045, spatial?.harbourPan ?? 0);
      }
    }

    if (now >= this.nextHoofAt) {
      this.nextHoofAt = now + 2.2 + Math.random() * 3.8;
      const horseProx = spatial?.horseProximity ?? 0;
      if (horseProx > 0.22) {
        this.playHoofClipClop(now, 0.02 + horseProx * 0.055, spatial?.horsePan ?? 0);
      }
    }

    const horseStartle = spatial?.horseStartleIntensity ?? 0;
    if (horseStartle > 0.25 && now >= this.nextHorseSnortAt) {
      this.nextHorseSnortAt = now + 2.8 + Math.random() * 1.4;
      this.playHorseSnort(now, horseStartle, spatial?.horsePan ?? 0);
    }

    if (trainProx > 0.16 && now >= this.nextTrainWhistleAt) {
      this.nextTrainWhistleAt = now + 18 + Math.random() * 10;
      this.playTrainWhistle(now, trainProx, spatial?.trainPan ?? 0);
    }

    if (now >= this.nextChimeAt) {
      this.nextChimeAt = now + 22 + Math.random() * 14;
      this.playCivicBellChime(now);
    }

    const barkIntensity = spatial?.dogBarkIntensity ?? 0;
    if (barkIntensity > 0.08 && now >= this.nextDogBarkAt) {
      const interval = Math.max(0.32, 0.78 - barkIntensity * 0.42) + Math.random() * 0.22;
      this.nextDogBarkAt = now + interval;
      this.playDogBark(now, barkIntensity, spatial?.dogPan ?? 0);
    }

    const sheepPanic = spatial?.sheepPanicIntensity ?? 0;
    if (sheepPanic > 0.08 && now >= this.nextSheepBleatAt) {
      const interval = Math.max(0.38, 0.96 - sheepPanic * 0.5) + Math.random() * 0.35;
      this.nextSheepBleatAt = now + interval;
      this.playSheepBleat(now, sheepPanic, spatial?.sheepPan ?? 0);
    }
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
      this.coilBuzzOsc?.stop();
      this.steamHissSource?.stop();
      this.roadNoiseSource?.stop();
      this.rainSource?.stop();
      this.windSource?.stop();
      this.crowdVoiceSource?.stop();
      this.chatterLfo?.stop();
      this.cityAmbSource?.stop();
      this.surfSource?.stop();
      this.trainChuffSource?.stop();
      this.trainLfo?.stop();
      this.rivalCarOsc?.stop();
      void this.ctx?.close();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    } catch {
      // ignore close errors
    }
    this.initialized = false;
  }
}
