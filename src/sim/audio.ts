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
  private rivalCarPanner: StereoPannerNode | null = null;

  // Time-of-Day Dynamic Soundscape: Daytime Market Bustle vs Nocturnal City Hum & Crickets
  private marketBustleSource: AudioBufferSourceNode | null = null;
  private marketBustleGain: GainNode | null = null;
  private marketLfo: OscillatorNode | null = null;

  private nightHumOsc1: OscillatorNode | null = null;
  private nightHumOsc2: OscillatorNode | null = null;
  private nightHumNoiseSource: AudioBufferSourceNode | null = null;
  private nightHumGain: GainNode | null = null;

  private noiseBuffer: AudioBuffer | null = null;

  // Scottish Highland Bagpipes (3 continuous drones + Mixolydian chanter + stereo pan)
  private bagpipeDroneBass: OscillatorNode | null = null;
  private bagpipeDroneTenor1: OscillatorNode | null = null;
  private bagpipeDroneTenor2: OscillatorNode | null = null;
  private bagpipeChanterOsc: OscillatorNode | null = null;
  private bagpipeGain: GainNode | null = null;
  private bagpipePanner: StereoPannerNode | null = null;
  private nextPiperNoteAt = 0;
  private piperNoteIdx = 0;

  private nextGullAt = 3.5;
  private nextHoofAt = 2.0;
  private nextCarriageClatterAt = 3.0;
  private nextCricketAt = 0.8;
  private nextChimeAt = 14.0;
  private nextDogBarkAt = 0;
  private nextSheepBleatAt = 0;
  private nextHorseSnortAt = 0;
  private nextTrainWhistleAt = 9.0;
  private nextCrankChugAt = 0;

  private wasEngineRunning = false;
  private engineShutoffUntil = 0;
  private wasCoilActive = false;

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
    coilOsc.frequency.value = 118;
    const coilFilt = ctx.createBiquadFilter();
    coilFilt.type = 'bandpass';
    coilFilt.frequency.value = 940;
    coilFilt.Q.value = 5.2;
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

    // Nearby Rival Vintage Car Chug (distinct higher twin-cylinder tone + tight proximity so it never mimics player idle exhaust)
    const rivalOsc = ctx.createOscillator();
    rivalOsc.type = 'triangle';
    rivalOsc.frequency.value = 72;
    const rivalFilter = ctx.createBiquadFilter();
    rivalFilter.type = 'bandpass';
    rivalFilter.frequency.value = 260;
    rivalFilter.Q.value = 1.4;
    const rivalGain = ctx.createGain();
    rivalGain.gain.value = 0;
    rivalOsc.connect(rivalFilter);
    rivalFilter.connect(rivalGain);
    if (typeof ctx.createStereoPanner === 'function') {
      const rPan = ctx.createStereoPanner();
      rivalGain.connect(rPan);
      rPan.connect(master);
      this.rivalCarPanner = rPan;
    } else {
      rivalGain.connect(master);
    }
    rivalOsc.start();
    this.rivalCarOsc = rivalOsc;
    this.rivalCarGain = rivalGain;

    // Daytime Market Bustle & Street Chatter (peaks mid-day, silent at night)
    const marketSrc = ctx.createBufferSource();
    marketSrc.buffer = chatterBuffer;
    marketSrc.loop = true;
    const marketWarmFilt = ctx.createBiquadFilter();
    marketWarmFilt.type = 'bandpass';
    marketWarmFilt.frequency.value = 690;
    marketWarmFilt.Q.value = 1.6;
    const marketBrightFilt = ctx.createBiquadFilter();
    marketBrightFilt.type = 'bandpass';
    marketBrightFilt.frequency.value = 1520;
    marketBrightFilt.Q.value = 1.9;
    const marketGain = ctx.createGain();
    marketGain.gain.value = 0;
    const marketLfo = ctx.createOscillator();
    marketLfo.type = 'sine';
    marketLfo.frequency.value = 2.7;
    const marketLfoGain = ctx.createGain();
    marketLfoGain.gain.value = 210;
    marketLfo.connect(marketLfoGain);
    marketLfoGain.connect(marketBrightFilt.frequency);
    marketSrc.connect(marketWarmFilt);
    marketSrc.connect(marketBrightFilt);
    marketWarmFilt.connect(marketGain);
    marketBrightFilt.connect(marketGain);
    marketGain.connect(master);
    marketSrc.start();
    marketLfo.start();
    this.marketBustleSource = marketSrc;
    this.marketBustleGain = marketGain;
    this.marketLfo = marketLfo;

    // Nocturnal Distant Low-Frequency City & Harbour Hum (warm dusk/night undertone)
    const nightOsc1 = ctx.createOscillator();
    nightOsc1.type = 'sine';
    nightOsc1.frequency.value = 62;
    const nightOsc2 = ctx.createOscillator();
    nightOsc2.type = 'triangle';
    nightOsc2.frequency.value = 93;
    const nightNoise = ctx.createBufferSource();
    nightNoise.buffer = noiseBuffer;
    nightNoise.loop = true;
    const nightNoiseFilt = ctx.createBiquadFilter();
    nightNoiseFilt.type = 'lowpass';
    nightNoiseFilt.frequency.value = 115;
    nightNoiseFilt.Q.value = 0.8;
    const nightNoiseGain = ctx.createGain();
    nightNoiseGain.gain.value = 0.48;
    const nightOscGain = ctx.createGain();
    nightOscGain.gain.value = 0.22;
    const nightHumGain = ctx.createGain();
    nightHumGain.gain.value = 0;

    nightOsc1.connect(nightOscGain);
    nightOsc2.connect(nightOscGain);
    nightOscGain.connect(nightHumGain);
    nightNoise.connect(nightNoiseFilt);
    nightNoiseFilt.connect(nightNoiseGain);
    nightNoiseGain.connect(nightHumGain);
    nightHumGain.connect(master);

    nightOsc1.start();
    nightOsc2.start();
    nightNoise.start();
    this.nightHumOsc1 = nightOsc1;
    this.nightHumOsc2 = nightOsc2;
    this.nightHumNoiseSource = nightNoise;
    this.nightHumGain = nightHumGain;

    // Highland Bagpipes (reedy bandpass formant on 3 drones + chanter)
    const pipeFormant = ctx.createBiquadFilter();
    pipeFormant.type = 'bandpass';
    pipeFormant.frequency.value = 1150;
    pipeFormant.Q.value = 1.35;

    const pipeLowpass = ctx.createBiquadFilter();
    pipeLowpass.type = 'lowpass';
    pipeLowpass.frequency.value = 2800;

    const pipeGain = ctx.createGain();
    pipeGain.gain.value = 0;

    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.42;

    const dBass = ctx.createOscillator();
    dBass.type = 'sawtooth';
    dBass.frequency.value = 116.54; // Bb2

    const dTenor1 = ctx.createOscillator();
    dTenor1.type = 'sawtooth';
    dTenor1.frequency.value = 233.08; // Bb3

    const dTenor2 = ctx.createOscillator();
    dTenor2.type = 'sawtooth';
    dTenor2.frequency.value = 233.9; // Detuned chorus

    const chanterOsc = ctx.createOscillator();
    chanterOsc.type = 'sawtooth';
    chanterOsc.frequency.value = 466.16; // Bb4 chanter

    const chanterGain = ctx.createGain();
    chanterGain.gain.value = 0.72;

    dBass.connect(droneGain);
    dTenor1.connect(droneGain);
    dTenor2.connect(droneGain);
    droneGain.connect(pipeFormant);
    chanterOsc.connect(chanterGain);
    chanterGain.connect(pipeFormant);
    pipeFormant.connect(pipeLowpass);
    pipeLowpass.connect(pipeGain);

    if (typeof ctx.createStereoPanner === 'function') {
      const pPan = ctx.createStereoPanner();
      pipeGain.connect(pPan);
      pPan.connect(master);
      this.bagpipePanner = pPan;
    } else {
      pipeGain.connect(master);
    }

    dBass.start();
    dTenor1.start();
    dTenor2.start();
    chanterOsc.start();

    this.bagpipeDroneBass = dBass;
    this.bagpipeDroneTenor1 = dTenor1;
    this.bagpipeDroneTenor2 = dTenor2;
    this.bagpipeChanterOsc = chanterOsc;
    this.bagpipeGain = pipeGain;

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
    if (this.muted) return;
    if (role === 'Sheep') {
      this.playPassengerSheepBleat();
      return;
    }
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
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
      } else if (role === 'Schoolboy') {
        utt.pitch = 1.38;
        utt.rate = 1.12;
      } else if (role === 'Captain') {
        utt.pitch = 0.78;
        utt.rate = 0.94;
      } else if (role === 'Mechanic') {
        utt.pitch = 0.90;
        utt.rate = 1.02;
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

  private playCarriageClatter(now: number, intensity: number, pan: number): void {
    if (!this.ctx || !this.masterGain || this.muted || intensity < 0.03) return;
    const hoofVol = Math.min(0.11, 0.025 + intensity * 0.07);

    // 4-beat iron-shod trotting hoof cadence
    const hoofOffsets = [0, 0.13, 0.28, 0.41];
    hoofOffsets.forEach((offset, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      const base = idx % 2 === 0 ? 440 : 365;
      osc.frequency.setValueAtTime(base, now + offset);
      osc.frequency.exponentialRampToValueAtTime(135, now + offset + 0.05);

      gain.gain.setValueAtTime(0.001, now + offset);
      gain.gain.linearRampToValueAtTime(hoofVol, now + offset + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.06);

      osc.connect(gain);
      this.connectWithOptionalPan(gain, pan);
      osc.start(now + offset);
      osc.stop(now + offset + 0.065);
    });

    // Wooden spoked-wheel cobble rattle & iron-tyre clack
    if (this.noiseBuffer) {
      const rattleSrc = this.ctx.createBufferSource();
      rattleSrc.buffer = this.noiseBuffer;
      const rattleFilt = this.ctx.createBiquadFilter();
      rattleFilt.type = 'bandpass';
      rattleFilt.frequency.setValueAtTime(480 + Math.random() * 140, now);
      rattleFilt.Q.value = 1.9;
      const rattleGain = this.ctx.createGain();
      const rVol = Math.min(0.075, 0.016 + intensity * 0.052);
      rattleGain.gain.setValueAtTime(0.001, now);
      rattleGain.gain.linearRampToValueAtTime(rVol, now + 0.06);
      rattleGain.gain.setValueAtTime(rVol * 0.75, now + 0.34);
      rattleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.54);

      rattleSrc.connect(rattleFilt);
      rattleFilt.connect(rattleGain);
      this.connectWithOptionalPan(rattleGain, pan);
      rattleSrc.start(now, Math.random() * 1.4, 0.56);
    }
  }

  private playCricketChirp(now: number, intensity: number, pan: number): void {
    if (!this.ctx || !this.masterGain || this.muted || intensity < 0.05) return;
    const pulses = Math.random() < 0.65 ? 4 : 3;
    const baseFreq = 4150 + Math.random() * 480;
    const vol = Math.min(0.055, 0.015 + intensity * 0.036);

    for (let p = 0; p < pulses; p++) {
      const t0 = now + p * 0.044;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq, t0);
      osc.frequency.linearRampToValueAtTime(baseFreq * 1.03, t0 + 0.022);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0005, t0);
      gain.gain.linearRampToValueAtTime(vol, t0 + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.028);

      osc.connect(gain);
      this.connectWithOptionalPan(gain, pan);
      osc.start(t0);
      osc.stop(t0 + 0.032);
    }
  }

  private playHandCrankChug(now: number): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(64, now);
    osc.frequency.exponentialRampToValueAtTime(34, now + 0.14);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.11, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.18);
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

  public playPassengerBell(isBoarding: boolean): void {
    this.init();
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const notes = isBoarding ? [523.25, 659.25, 783.99] : [783.99, 523.25];
    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.09);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.001, now + idx * 0.09);
      gain.gain.linearRampToValueAtTime(0.12, now + idx * 0.09 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.36);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now + idx * 0.09);
      osc.stop(now + idx * 0.09 + 0.4);
    });
  }

  public playPassengerSheepBleat(): void {
    this.init();
    if (!this.ctx || !this.masterGain || this.muted) return;
    this.playSheepBleat(this.ctx.currentTime, 0.85, 0.35);
  }

  public playBagpipeDeflateCrash(pan = 0): void {
    this.init();
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;

    // Cushioned thud
    const thump = this.ctx.createOscillator();
    thump.type = 'triangle';
    thump.frequency.setValueAtTime(140, now);
    thump.frequency.exponentialRampToValueAtTime(36, now + 0.18);
    const tGain = this.ctx.createGain();
    tGain.gain.setValueAtTime(0.32, now);
    tGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    thump.connect(tGain);
    this.connectWithOptionalPan(tGain, pan);
    thump.start(now);
    thump.stop(now + 0.24);

    // Deflating tartan airbag groan (pitch sags steeply downward)
    [233.08, 493.88].forEach((startFreq, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(startFreq * 1.12, now);
      osc.frequency.exponentialRampToValueAtTime(startFreq * 0.24, now + 1.25);

      const filt = this.ctx.createBiquadFilter();
      filt.type = 'bandpass';
      filt.frequency.setValueAtTime(1250, now);
      filt.frequency.exponentialRampToValueAtTime(260, now + 1.25);
      filt.Q.value = 2.2;

      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(idx === 0 ? 0.16 : 0.14, now + 0.04);
      g.gain.setValueAtTime(idx === 0 ? 0.12 : 0.1, now + 0.7);
      g.gain.exponentialRampToValueAtTime(0.001, now + 1.32);

      osc.connect(filt);
      filt.connect(g);
      this.connectWithOptionalPan(g, pan);
      osc.start(now);
      osc.stop(now + 1.35);
    });
  }

  public update(state: VehicleState, env: EnvironmentState, spatial?: SpatialTrafficAudioHints): void {
    if (!this.initialized || !this.ctx) return;
    const now = this.ctx.currentTime;

    // Model T coil-box trembler buzz when ignition is ON prior to starting
    const coilActive = state.ignitionOn && !state.engineRunning && state.crankingProgress === 0;
    if (coilActive) {
      if (!this.wasCoilActive) {
        this.coilBuzzGain?.gain.cancelScheduledValues(now);
      }
      this.coilBuzzGain?.gain.setTargetAtTime(0.024, now, 0.04);
      this.wasCoilActive = true;
    } else {
      if (this.wasCoilActive) {
        this.coilBuzzGain?.gain.cancelScheduledValues(now);
        this.coilBuzzGain?.gain.setValueAtTime(0, now);
        this.wasCoilActive = false;
      } else {
        this.coilBuzzGain?.gain.cancelScheduledValues(now);
        this.coilBuzzGain?.gain.setValueAtTime(0, now);
      }
    }

    // Mechanical hand-crank compression chug while cranking
    if (state.ignitionOn && !state.engineRunning && state.crankingProgress > 0 && now >= this.nextCrankChugAt) {
      this.nextCrankChugAt = now + 0.24;
      this.playHandCrankChug(now);
    }

    // Radiator boiling steam hiss (silent when engine is off unless actively boiling over)
    const steamVol = state.isOverheating
      ? 0.055
      : state.engineRunning && state.engineTempC > 95
        ? ((state.engineTempC - 95) / 5.5) * 0.028
        : 0;
    this.steamHissGain?.gain.setTargetAtTime(steamVol, now, 0.16);

    // Player Model T Engine Audio: hard-anchored ramp to exact zero when engineRunning is false
    if (!state.engineRunning) {
      if (this.wasEngineRunning) {
        this.wasEngineRunning = false;
        this.engineShutoffUntil = now + 0.12;
        if (this.engineGain) {
          const g = this.engineGain.gain;
          if (typeof g.cancelAndHoldAtTime === 'function') {
            g.cancelAndHoldAtTime(now);
          } else {
            g.cancelScheduledValues(now);
            g.setValueAtTime(Math.min(0.45, Math.max(0, g.value)), now);
          }
          g.linearRampToValueAtTime(0, this.engineShutoffUntil);
          g.setValueAtTime(0, this.engineShutoffUntil + 0.01);
        }
        if (this.engineOsc) {
          const f = this.engineOsc.frequency;
          if (typeof f.cancelAndHoldAtTime === 'function') f.cancelAndHoldAtTime(now);
          else {
            f.cancelScheduledValues(now);
            f.setValueAtTime(f.value, now);
          }
          f.linearRampToValueAtTime(4, this.engineShutoffUntil);
        }
        if (this.engineSubOsc) {
          const f2 = this.engineSubOsc.frequency;
          if (typeof f2.cancelAndHoldAtTime === 'function') f2.cancelAndHoldAtTime(now);
          else {
            f2.cancelScheduledValues(now);
            f2.setValueAtTime(f2.value, now);
          }
          f2.linearRampToValueAtTime(8, this.engineShutoffUntil);
        }
        if (this.gearWhineGain) {
          const wg = this.gearWhineGain.gain;
          wg.cancelScheduledValues(now);
          wg.setValueAtTime(0, now);
        }
      } else if (now >= this.engineShutoffUntil) {
        this.engineGain?.gain.cancelScheduledValues(now);
        this.engineGain?.gain.setValueAtTime(0, now);
        this.gearWhineGain?.gain.cancelScheduledValues(now);
        this.gearWhineGain?.gain.setValueAtTime(0, now);
      }
    } else {
      this.wasEngineRunning = true;
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

    // Tire/surface roll noise: higher crisp gravel/timber frequency so coasting never mimics an exhaust rumble
    const speedFactor = Math.min(1, state.speedMps / 12);
    let surfaceFreq = 260;
    let surfaceGain = 0.11;
    if (state.currentSurface === 'cobbles') {
      surfaceFreq = 210;
      surfaceGain = 0.22;
    } else if (state.currentSurface === 'mud') {
      surfaceFreq = 320;
      surfaceGain = 0.18;
    } else if (state.currentSurface === 'wharf') {
      surfaceFreq = 240;
      surfaceGain = 0.18;
    }
    this.roadFilter?.frequency.setTargetAtTime(surfaceFreq + speedFactor * 220, now, 0.06);
    const targetRoadGain =
      state.speedMps < 0.45 ? 0 : Math.pow(speedFactor, 1.35) * surfaceGain * (1 - env.snowCover * 0.35);
    this.roadGain?.gain.setTargetAtTime(targetRoadGain, now, 0.05);

    // Rain patter & coastal wind (zero wind noise floor on calm sunny days)
    const targetRainVol = env.weather === 'rainy' ? 0.11 : 0;
    this.rainGain?.gain.setTargetAtTime(targetRainVol, now, 0.25);

    const targetWindVol =
      env.weather === 'windy'
        ? Math.min(0.13, 0.035 + env.windMps * 0.0045)
        : env.weather === 'snowy' || env.weather === 'rainy'
          ? 0.025
          : 0.002;
    this.windFilter?.frequency.setTargetAtTime(280 + env.windMps * 14, now, 0.2);
    this.windGain?.gain.setTargetAtTime(targetWindVol, now, 0.25);

    // Dynamic Solar Time-of-Day Curves (Dawn -> Bustling Market Day -> Dusk -> Quiet Night)
    const daySpan = Math.max(6, env.sunsetHour - env.sunriseHour);
    const sunAngle = ((env.timeHour - env.sunriseHour) / daySpan) * Math.PI;
    const sunSin = Math.sin(sunAngle);
    const dayFactor = Math.max(0, Math.min(1, (sunSin + 0.12) / 0.58));
    const marketPeakFactor = Math.max(0, Math.min(1, sunSin * 1.15));
    const nightFactor = Math.max(0, Math.min(1, (-sunSin + 0.18) / 0.52));

    const crowdProx = spatial?.crowdProximity ?? 0.25;
    const densityScale = Math.min(1.5, 0.65 + (spatial?.crowdDensity ?? 4) * 0.1);
    const crowdTimeScale = 0.12 + 0.88 * dayFactor;
    const targetCrowdVol = (0.008 + crowdProx * 0.14 * densityScale) * crowdTimeScale;
    this.crowdGain?.gain.setTargetAtTime(targetCrowdVol, now, 0.18);
    this.crowdFormantLow?.frequency.setTargetAtTime(390 + crowdProx * 120, now, 0.2);
    this.crowdPanner?.pan.setTargetAtTime(spatial?.crowdPan ?? 0, now, 0.12);

    // Daytime Market Chatter & Merchant Hubbub vs Nocturnal Low-Frequency City Hum
    const targetMarketVol =
      dayFactor < 0.02
        ? 0
        : (0.018 + crowdProx * 0.04) * dayFactor * (0.45 + 0.55 * marketPeakFactor);
    this.marketBustleGain?.gain.setTargetAtTime(targetMarketVol, now, 0.25);
    this.cityAmbGain?.gain.setTargetAtTime(0.002 + 0.012 * dayFactor, now, 0.3);

    const targetNightHumVol = nightFactor < 0.02 ? 0 : nightFactor * 0.042;
    this.nightHumGain?.gain.setTargetAtTime(targetNightHumVol, now, 0.35);

    const harbourProx = spatial?.harbourProximity ?? 0;
    this.surfGain?.gain.setTargetAtTime(harbourProx < 0.06 ? 0 : harbourProx * 0.08, now, 0.25);
    this.surfPanner?.pan.setTargetAtTime(spatial?.harbourPan ?? 0, now, 0.2);

    // Harbour shunting locomotive chuff only audible near Sumpter Wharf siding
    const trainProx = spatial?.trainProximity ?? 0;
    const targetTrainVol = trainProx < 0.32 ? 0 : Math.pow((trainProx - 0.32) / 0.68, 1.5) * 0.065 * (0.4 + 0.6 * dayFactor);
    this.trainChuffGain?.gain.setTargetAtTime(targetTrainVol, now, 0.18);
    this.trainPanner?.pan.setTargetAtTime(spatial?.trainPan ?? 0, now, 0.15);

    // Passing rival touring car (only briefly within 12m, distinct pitch so it doesn't mimic player's parked car)
    const carProx = spatial?.otherCarProximity ?? 0;
    const rivalVol = carProx < 0.28 ? 0 : Math.pow((carProx - 0.28) / 0.72, 2) * 0.028;
    this.rivalCarGain?.gain.setTargetAtTime(rivalVol, now, 0.08);
    this.rivalCarOsc?.frequency.setTargetAtTime(72 + carProx * 22, now, 0.1);
    this.rivalCarPanner?.pan.setTargetAtTime(spatial?.otherCarPan ?? 0, now, 0.1);

    // Daytime Seabirds & Nighttime Crickets
    if (now >= this.nextGullAt) {
      this.nextGullAt = now + 4.5 + Math.random() * 6.5;
      if (dayFactor > 0.25 && (harbourProx > 0.12 || env.weather !== 'rainy')) {
        this.playSeagullCall(now, (0.016 + harbourProx * 0.042) * dayFactor, spatial?.harbourPan ?? 0);
      }
    }

    if (now >= this.nextCricketAt) {
      this.nextCricketAt = now + (nightFactor > 0.5 ? 0.45 + Math.random() * 0.85 : 1.4);
      const cricketWeatherOk = env.weather !== 'snowy' && env.temperatureC > 2;
      const rainDamp = env.weather === 'rainy' ? 0.35 : 1.0;
      if (nightFactor > 0.22 && cricketWeatherOk) {
        const pan = (Math.random() * 2 - 1) * 0.82;
        this.playCricketChirp(now, nightFactor * rainDamp, pan);
      }
    }

    // Daytime Horse-Drawn Carriage & Dray Clatter + Hoofbeats
    const drayProx = spatial?.drayProximity ?? 0;
    if (now >= this.nextCarriageClatterAt) {
      this.nextCarriageClatterAt = now + (drayProx > 0.25 ? 0.85 + Math.random() * 0.6 : 2.8 + Math.random() * 2.8);
      if (drayProx > 0.08) {
        this.playCarriageClatter(now, drayProx * (0.45 + 0.55 * dayFactor), spatial?.drayPan ?? 0);
      } else if (dayFactor > 0.22) {
        const ambientClatter = dayFactor * (0.28 + 0.38 * marketPeakFactor);
        const pan = (Math.random() * 2 - 1) * 0.78;
        this.playCarriageClatter(now, ambientClatter, pan);
      }
    }

    if (now >= this.nextHoofAt) {
      this.nextHoofAt = now + 2.2 + Math.random() * 3.8;
      const horseProx = spatial?.horseProximity ?? 0;
      if (horseProx > 0.22 && dayFactor > 0.15) {
        this.playHoofClipClop(now, (0.02 + horseProx * 0.055) * dayFactor, spatial?.horsePan ?? 0);
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

    // Highland Bagpipes proximity & panicked weird-noise chase modulation
    const piperProx = spatial?.piperProximity ?? 0;
    const piperPanic = spatial?.piperPanicLevel ?? 0;
    const piperDown = spatial?.piperDown ?? false;
    const targetPipeGain = piperDown ? 0 : Math.pow(piperProx, 1.35) * (0.16 + piperPanic * 0.06);
    this.bagpipeGain?.gain.setTargetAtTime(targetPipeGain, now, piperDown ? 0.04 : 0.12);
    this.bagpipePanner?.pan.setTargetAtTime(spatial?.piperPan ?? 0, now, 0.09);

    if (!piperDown && piperProx > 0.02) {
      if (piperPanic > 0.2) {
        // Wobbly over-pressurized drones as Angus sprints away
        const wobble = Math.sin(now * 27) * (8 * piperPanic);
        const sag = Math.sin(now * 11) * (16 * piperPanic);
        this.bagpipeDroneBass?.frequency.setTargetAtTime(116.54 + sag * 0.45, now, 0.03);
        this.bagpipeDroneTenor1?.frequency.setTargetAtTime(233.08 + wobble + sag, now, 0.03);
        this.bagpipeDroneTenor2?.frequency.setTargetAtTime(233.9 - wobble + sag, now, 0.03);
      } else {
        this.bagpipeDroneBass?.frequency.setTargetAtTime(116.54, now, 0.08);
        this.bagpipeDroneTenor1?.frequency.setTargetAtTime(233.08, now, 0.08);
        this.bagpipeDroneTenor2?.frequency.setTargetAtTime(233.9, now, 0.08);
      }

      if (now >= this.nextPiperNoteAt) {
        // Traditional Bb Mixolydian Scottish bagpipe chanter pitches
        const chanterScale = [466.16, 523.25, 587.33, 622.25, 698.46, 783.99, 830.61, 932.33];
        const marchPhrase = [0, 2, 4, 5, 4, 2, 3, 2, 0, 1, 2, 4, 6, 5, 4, 2];
        if (piperPanic > 0.2) {
          // Weird, frantic, squeaky erratic bagpipe squawks while running away
          this.nextPiperNoteAt = now + 0.055 + Math.random() * 0.075;
          const randIdx = Math.floor(Math.random() * chanterScale.length);
          const squeakMult = 1.08 + piperPanic * (0.18 + Math.random() * 0.46);
          const warble = (Math.random() - 0.5) * 95 * piperPanic;
          this.bagpipeChanterOsc?.frequency.setValueAtTime(chanterScale[randIdx] * squeakMult + warble, now);
        } else {
          // Crisp Scottish march cadence
          this.nextPiperNoteAt = now + (this.piperNoteIdx % 4 === 0 ? 0.28 : 0.2);
          const noteFreq = chanterScale[marchPhrase[this.piperNoteIdx % marchPhrase.length]];
          this.bagpipeChanterOsc?.frequency.setValueAtTime(noteFreq, now);
          this.piperNoteIdx += 1;
        }
      }
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
      this.marketBustleSource?.stop();
      this.marketLfo?.stop();
      this.nightHumOsc1?.stop();
      this.nightHumOsc2?.stop();
      this.nightHumNoiseSource?.stop();
      this.bagpipeDroneBass?.stop();
      this.bagpipeDroneTenor1?.stop();
      this.bagpipeDroneTenor2?.stop();
      this.bagpipeChanterOsc?.stop();
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
