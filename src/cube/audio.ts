import { readCookie, writeCookie } from './dailyChallenge';
import type { AmbientSoundscapeId } from './types';

export interface AmbientSoundscapeMeta {
  id: AmbientSoundscapeId;
  name: string;
  shortLabel: string;
  description: string;
}

export const AMBIENT_SOUNDSCAPES: AmbientSoundscapeMeta[] = [
  {
    id: 'off',
    name: 'Off',
    shortLabel: 'Off',
    description: 'Cube clicks only',
  },
  {
    id: 'rainy',
    name: 'Rainy Studio',
    shortLabel: 'Rainy Studio',
    description: 'Warm window rain & soft pattering',
  },
  {
    id: 'lofi',
    name: 'Lo-fi Beats',
    shortLabel: 'Lo-fi Beats',
    description: 'Mellow Rhodes chords & 74 BPM pulse',
  },
  {
    id: 'whitenoise',
    name: 'White Noise',
    shortLabel: 'White Noise',
    description: 'Velvet sculpted focus noise',
  },
];

const VALID_SOUNDSCAPES = new Set<AmbientSoundscapeId>(['off', 'rainy', 'lofi', 'whitenoise']);
const AMBIENT_STORAGE_KEY = 'kubi_ambient_prefs_v1';

export function loadAmbientPrefs(): { soundscape: AmbientSoundscapeId; volume: number } {
  let soundscape: AmbientSoundscapeId = 'off';
  let volume = 0.45;

  try {
    const raw = localStorage.getItem(AMBIENT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { soundscape?: string; volume?: number };
      if (parsed.soundscape && VALID_SOUNDSCAPES.has(parsed.soundscape as AmbientSoundscapeId)) {
        soundscape = parsed.soundscape as AmbientSoundscapeId;
      }
      if (typeof parsed.volume === 'number' && Number.isFinite(parsed.volume)) {
        volume = Math.max(0, Math.min(1, parsed.volume));
      }
      return { soundscape, volume };
    }
  } catch {
    // fallback to cookie
  }

  const cookieScape = readCookie('kubi_soundscape') as AmbientSoundscapeId | null;
  if (cookieScape && VALID_SOUNDSCAPES.has(cookieScape)) {
    soundscape = cookieScape;
  }
  const cookieVol = readCookie('kubi_ambient_vol');
  if (cookieVol !== null) {
    const num = Number(cookieVol);
    if (Number.isFinite(num)) volume = Math.max(0, Math.min(1, num));
  }
  return { soundscape, volume };
}

export function saveAmbientPrefs(soundscape: AmbientSoundscapeId, volume: number): void {
  const clampedVol = Math.max(0, Math.min(1, Number(volume.toFixed(2))));
  try {
    localStorage.setItem(
      AMBIENT_STORAGE_KEY,
      JSON.stringify({ soundscape, volume: clampedVol })
    );
  } catch {
    // ignore storage restrictions
  }
  writeCookie('kubi_soundscape', soundscape);
  writeCookie('kubi_ambient_vol', String(clampedVol));
}

/**
 * Procedural Web Audio synthesizer for tactile magnetic speedcube acoustics
 * and soothing ambient focus soundscapes (Rainy Studio, Lo-fi Beats, White Noise).
 * Zero external audio assets — all audio is synthesized cleanly in real time.
 */
class CubeAudioSynth {
  private ctx: AudioContext | null = null;
  private muted = false;

  // Ambient soundscape graph
  private soundscape: AmbientSoundscapeId = 'off';
  private ambientVolume = 0.45;
  private ambientMasterGain: GainNode | null = null;
  private activeNodes: AudioNode[] = [];
  private activeTimers: number[] = [];

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setMuted(muted: boolean) {
    this.muted = muted;
    if (this.ambientMasterGain && this.ctx) {
      const target = muted ? 0.0001 : this.effectiveAmbientGain();
      this.ambientMasterGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.ambientMasterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public getSoundscape(): AmbientSoundscapeId {
    return this.soundscape;
  }

  public setAmbientVolume(volume: number) {
    this.ambientVolume = Math.max(0, Math.min(1, volume));
    if (this.ambientMasterGain && this.ctx && !this.muted) {
      this.ambientMasterGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.ambientMasterGain.gain.setTargetAtTime(
        this.effectiveAmbientGain(),
        this.ctx.currentTime,
        0.06
      );
    }
  }

  private effectiveAmbientGain(): number {
    // Keep background soundscapes warm and unobtrusive beneath speedcube clicks
    return Math.max(0.0001, this.ambientVolume * 0.24);
  }

  private stopAmbientGraph() {
    for (const id of this.activeTimers) {
      window.clearInterval(id);
    }
    this.activeTimers = [];

    for (const node of this.activeNodes) {
      try {
        if ('stop' in node && typeof (node as AudioScheduledSourceNode).stop === 'function') {
          (node as AudioScheduledSourceNode).stop();
        }
        node.disconnect();
      } catch {
        // node already stopped
      }
    }
    this.activeNodes = [];

    if (this.ambientMasterGain) {
      try {
        this.ambientMasterGain.disconnect();
      } catch {
        // ignore
      }
      this.ambientMasterGain = null;
    }
  }

  /**
   * Switches active ambient soundscape smoothly. Safe to call on user interaction.
   */
  public setSoundscape(next: AmbientSoundscapeId) {
    this.soundscape = next;
    this.stopAmbientGraph();

    if (next === 'off') return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const master = ctx.createGain();
    const now = ctx.currentTime;
    master.gain.setValueAtTime(0.0001, now);
    master.gain.linearRampToValueAtTime(
      this.muted ? 0.0001 : this.effectiveAmbientGain(),
      now + 0.45
    );
    master.connect(ctx.destination);
    this.ambientMasterGain = master;

    if (next === 'rainy') {
      this.buildRainyStudio(ctx, master);
    } else if (next === 'whitenoise') {
      this.buildVelvetWhiteNoise(ctx, master);
    } else if (next === 'lofi') {
      this.buildLofiBeats(ctx, master);
    }
  }

  private createLoopingNoiseBuffer(ctx: AudioContext, seconds: number, pink: boolean): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      let b3 = 0;
      let b4 = 0;
      let b5 = 0;
      let b6 = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        if (!pink) {
          data[i] = white * 0.5;
        } else {
          b0 = 0.99886 * b0 + white * 0.0555179;
          b1 = 0.99332 * b1 + white * 0.0750759;
          b2 = 0.96900 * b2 + white * 0.1538520;
          b3 = 0.86650 * b3 + white * 0.3104856;
          b4 = 0.55000 * b4 + white * 0.5329522;
          b5 = -0.7616 * b5 - white * 0.0168980;
          data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.08;
          b6 = white * 0.115926;
        }
      }
    }
    return buffer;
  }

  private buildRainyStudio(ctx: AudioContext, master: GainNode) {
    // Layer 1: Warm steady rainfall bed (lowpass pink noise)
    const rainBed = ctx.createBufferSource();
    rainBed.buffer = this.createLoopingNoiseBuffer(ctx, 4, true);
    rainBed.loop = true;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 920;
    lp.Q.value = 0.7;

    const bedGain = ctx.createGain();
    bedGain.gain.value = 0.9;

    // Gentle breeze LFO modulating rain cutoff
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.11;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain);
    lfoGain.connect(lp.frequency);

    rainBed.connect(lp);
    lp.connect(bedGain);
    bedGain.connect(master);

    // Layer 2: Soft window-pane droplet shimmer
    const shimmer = ctx.createBufferSource();
    shimmer.buffer = this.createLoopingNoiseBuffer(ctx, 3, false);
    shimmer.loop = true;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2600;
    bp.Q.value = 1.6;

    const shimmerGain = ctx.createGain();
    shimmerGain.gain.value = 0.14;

    shimmer.connect(bp);
    bp.connect(shimmerGain);
    shimmerGain.connect(master);

    rainBed.start();
    shimmer.start();
    lfo.start();
    this.activeNodes.push(rainBed, lp, bedGain, lfo, lfoGain, shimmer, bp, shimmerGain);
  }

  private buildVelvetWhiteNoise(ctx: AudioContext, master: GainNode) {
    const src = ctx.createBufferSource();
    src.buffer = this.createLoopingNoiseBuffer(ctx, 4, true);
    src.loop = true;

    const shelf = ctx.createBiquadFilter();
    shelf.type = 'lowpass';
    shelf.frequency.value = 3800;
    shelf.Q.value = 0.5;

    const gain = ctx.createGain();
    gain.gain.value = 0.82;

    src.connect(shelf);
    shelf.connect(gain);
    gain.connect(master);

    src.start();
    this.activeNodes.push(src, shelf, gain);
  }

  private buildLofiBeats(ctx: AudioContext, master: GainNode) {
    // Subtle vinyl warmth bed
    const vinyl = ctx.createBufferSource();
    vinyl.buffer = this.createLoopingNoiseBuffer(ctx, 3, true);
    vinyl.loop = true;

    const vinylFilter = ctx.createBiquadFilter();
    vinylFilter.type = 'bandpass';
    vinylFilter.frequency.value = 1800;
    vinylFilter.Q.value = 0.9;

    const vinylGain = ctx.createGain();
    vinylGain.gain.value = 0.08;

    vinyl.connect(vinylFilter);
    vinylFilter.connect(vinylGain);
    vinylGain.connect(master);
    vinyl.start();
    this.activeNodes.push(vinyl, vinylFilter, vinylGain);

    // Warm mellow low-pass bus for chords & drums
    const bus = ctx.createBiquadFilter();
    bus.type = 'lowpass';
    bus.frequency.value = 1450;
    bus.Q.value = 0.8;
    bus.connect(master);
    this.activeNodes.push(bus);

    // Jazz chillhop chord progression: Cmaj7 -> Am7 -> Dm7 -> G9
    const chords = [
      [261.63, 329.63, 392.0, 493.88],
      [220.0, 261.63, 329.63, 392.0],
      [293.66, 349.23, 440.0, 523.25],
      [196.0, 246.94, 349.23, 440.0],
    ];

    const stepMs = Math.round((60 / 74 / 2) * 1000); // ~74 BPM eighth-note grid
    let step = 0;

    const triggerStep = () => {
      if (this.soundscape !== 'lofi' || !this.ctx || !this.ambientMasterGain) return;
      const now = ctx.currentTime + 0.02;
      const beatInBar = step % 8;

      // Play warm Rhodes chord at start of every 2 bars (every 16 eighth-notes)
      if (step % 16 === 0) {
        const chord = chords[Math.floor(step / 16) % chords.length];
        chord.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = idx === 0 ? 'triangle' : 'sine';
          // Slight warm tape detune
          osc.frequency.setValueAtTime(freq * (1 + (idx - 1.5) * 0.0014), now);

          g.gain.setValueAtTime(0.0001, now);
          g.gain.linearRampToValueAtTime(0.11, now + 0.08);
          g.gain.exponentialRampToValueAtTime(0.025, now + 2.6);
          g.gain.exponentialRampToValueAtTime(0.0001, now + 3.1);

          osc.connect(g);
          g.connect(bus);
          osc.start(now);
          osc.stop(now + 3.15);
        });
      }

      // Soft muted boom-bap kick on beats 0 and 5 (syncopated chillhop groove)
      if (beatInBar === 0 || beatInBar === 5) {
        const kick = ctx.createOscillator();
        const kGain = ctx.createGain();
        kick.type = 'sine';
        kick.frequency.setValueAtTime(118, now);
        kick.frequency.exponentialRampToValueAtTime(42, now + 0.12);
        kGain.gain.setValueAtTime(0.0001, now);
        kGain.gain.linearRampToValueAtTime(0.32, now + 0.008);
        kGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
        kick.connect(kGain);
        kGain.connect(bus);
        kick.start(now);
        kick.stop(now + 0.2);
      }

      // Soft brushed snare on beats 2 and 6
      if (beatInBar === 2 || beatInBar === 6) {
        const snareLen = Math.floor(ctx.sampleRate * 0.08);
        const snareBuf = ctx.createBuffer(1, snareLen, ctx.sampleRate);
        const ch = snareBuf.getChannelData(0);
        for (let i = 0; i < snareLen; i++) {
          ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / (snareLen * 0.3));
        }
        const snare = ctx.createBufferSource();
        snare.buffer = snareBuf;
        const sFilter = ctx.createBiquadFilter();
        sFilter.type = 'bandpass';
        sFilter.frequency.value = 1400;
        const sGain = ctx.createGain();
        sGain.gain.setValueAtTime(0.16, now);
        sGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.085);
        snare.connect(sFilter);
        sFilter.connect(sGain);
        sGain.connect(bus);
        snare.start(now);
      }

      step += 1;
    };

    triggerStep();
    const timerId = window.setInterval(triggerStep, stepMs);
    this.activeTimers.push(timerId);
  }

  /**
   * Tactile magnetic speedcube turn click: short filtered burst + crisp plastic detent snap.
   */
  public playTurnClick(heavy = false) {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const pitchJitter = 0.92 + Math.random() * 0.16;

    // 1. Short wooden/ABS body knock
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    const baseFreq = (heavy ? 240 : 320) * pitchJitter;
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.38, now + 0.045);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(heavy ? 0.14 : 0.09, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);

    // 2. Magnetic snap transient (bandpass noise)
    const bufferSize = Math.floor(ctx.sampleRate * 0.028);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const env = Math.exp(-i / (bufferSize * 0.25));
      data[i] = (Math.random() * 2 - 1) * env;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime((heavy ? 1800 : 2500) * pitchJitter, now);
    filter.Q.setValueAtTime(2.4, now);

    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(heavy ? 0.13 : 0.09, now);
    nGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);

    noise.connect(filter);
    filter.connect(nGain);
    nGain.connect(ctx.destination);
    noise.start(now);
  }

  /**
   * Subtle crisp UI haptic tick on button/theme/puzzle switch.
   */
  public playUiTick() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(680, now);
    osc.frequency.exponentialRampToValueAtTime(420, now + 0.025);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.05, now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.032);
  }

  /**
   * Magnetic morph swoosh when switching cube types.
   */
  public playMorphWhoosh() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(520, now + 0.16);
    osc.frequency.exponentialRampToValueAtTime(280, now + 0.34);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.09, now + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.38);
  }

  /**
   * Warm harmonic chord arpeggio on puzzle completion.
   */
  public playVictoryChord() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Cmaj9 luminous studio chord: C5, E5, G5, B5, D6
    const notes = [523.25, 659.25, 783.99, 987.77, 1174.66];

    notes.forEach((freq, idx) => {
      const start = now + idx * 0.075;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.11, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.72);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.75);
    });
  }
}

export const cubeAudio = new CubeAudioSynth();
