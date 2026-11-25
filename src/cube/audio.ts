import { readCookie, writeCookie } from './dailyChallenge';
import {
  loadSpatialAudioPref,
  saveSpatialAudioPref,
  type SpatialAcousticProfile,
  type SpatialListenerPose,
  type Vec3,
} from './spatialAudio';
import type { AmbientSoundscapeId } from './types';

export { loadSpatialAudioPref, saveSpatialAudioPref } from './spatialAudio';
export type { SpatialAcousticProfile, SpatialListenerPose } from './spatialAudio';

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
 * Procedural 3D Spatial Web Audio synthesizer for physically accurate magnetic speedcube
 * mechanical acoustics (HRTF PannerNode + AudioListener camera tracking + studio room
 * early reflections) and soothing ambient focus soundscapes.
 * Zero external audio assets — all audio is synthesized cleanly in real time.
 */
class CubeAudioSynth {
  private ctx: AudioContext | null = null;
  private muted = false;
  private spatialEnabled = loadSpatialAudioPref();

  // 3D Spatial Listener & Studio Room Acoustic Bus
  private listenerPose: SpatialListenerPose = {
    position: [5.2, 4.0, 5.8],
    forward: [-0.6, -0.45, -0.66],
    up: [0, 1, 0],
  };
  private spatialDryBus: GainNode | null = null;
  private spatialRoomSend: GainNode | null = null;
  private clickNoiseBuffer: AudioBuffer | null = null;
  private slideNoiseBuffer: AudioBuffer | null = null;
  private lastSpatialTrigger: SpatialAcousticProfile | null = null;

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
      this.initSpatialGraph(this.ctx);
      this.applyListenerPoseToContext(this.ctx, this.listenerPose);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private initSpatialGraph(ctx: AudioContext) {
    // Dry spatial master bus
    const dryBus = ctx.createGain();
    dryBus.gain.value = 1.0;
    dryBus.connect(ctx.destination);
    this.spatialDryBus = dryBus;

    // Subtle procedural studio room early-reflection stereo convolver (~115ms intimate room)
    try {
      const irLen = Math.floor(ctx.sampleRate * 0.115);
      const irBuf = ctx.createBuffer(2, irLen, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const data = irBuf.getChannelData(ch);
        // Discrete early desk/wall reflection taps + warm exponential tail
        const taps = ch === 0 ? [0.009, 0.017, 0.029, 0.044] : [0.012, 0.021, 0.034, 0.051];
        for (const tSec of taps) {
          const idx = Math.floor(tSec * ctx.sampleRate);
          if (idx < irLen) {
            data[idx] += 0.32 * Math.exp(-tSec * 22);
          }
        }
        let lpState = 0;
        for (let i = 0; i < irLen; i++) {
          const t = i / irLen;
          const white = Math.random() * 2 - 1;
          lpState = lpState * 0.72 + white * 0.28;
          data[i] += lpState * 0.16 * Math.pow(1 - t, 2.8);
        }
      }

      const convolver = ctx.createConvolver();
      convolver.buffer = irBuf;

      const roomSend = ctx.createGain();
      roomSend.gain.value = 0.16;

      const roomFilter = ctx.createBiquadFilter();
      roomFilter.type = 'lowpass';
      roomFilter.frequency.value = 3400;

      roomSend.connect(convolver);
      convolver.connect(roomFilter);
      roomFilter.connect(ctx.destination);
      this.spatialRoomSend = roomSend;
    } catch {
      this.spatialRoomSend = null;
    }

    // Pre-generate crisp transient noise buffer (reused across all clicks — zero GC)
    const snapLen = Math.floor(ctx.sampleRate * 0.034);
    const snapBuf = ctx.createBuffer(1, snapLen, ctx.sampleRate);
    const snapData = snapBuf.getChannelData(0);
    for (let i = 0; i < snapLen; i++) {
      const env = Math.exp(-i / (snapLen * 0.22));
      snapData[i] = (Math.random() * 2 - 1) * env;
    }
    this.clickNoiseBuffer = snapBuf;

    // Pre-generate smooth friction slide buffer for ABS-on-ABS turn breakaway
    const slideLen = Math.floor(ctx.sampleRate * 0.075);
    const slideBuf = ctx.createBuffer(1, slideLen, ctx.sampleRate);
    const slideData = slideBuf.getChannelData(0);
    let smooth = 0;
    for (let i = 0; i < slideLen; i++) {
      const u = i / slideLen;
      const env = Math.sin(Math.PI * Math.min(1, u)) * Math.exp(-u * 1.4);
      const raw = Math.random() * 2 - 1;
      smooth = smooth * 0.52 + raw * 0.48;
      slideData[i] = smooth * env;
    }
    this.slideNoiseBuffer = slideBuf;
  }

  private applyListenerPoseToContext(ctx: AudioContext, pose: SpatialListenerPose) {
    const listener = ctx.listener;
    if (!listener) return;
    const now = ctx.currentTime;

    if (
      typeof listener.positionX !== 'undefined' &&
      typeof listener.forwardX !== 'undefined' &&
      typeof listener.upX !== 'undefined'
    ) {
      listener.positionX.setValueAtTime(pose.position[0], now);
      listener.positionY.setValueAtTime(pose.position[1], now);
      listener.positionZ.setValueAtTime(pose.position[2], now);
      listener.forwardX.setValueAtTime(pose.forward[0], now);
      listener.forwardY.setValueAtTime(pose.forward[1], now);
      listener.forwardZ.setValueAtTime(pose.forward[2], now);
      listener.upX.setValueAtTime(pose.up[0], now);
      listener.upY.setValueAtTime(pose.up[1], now);
      listener.upZ.setValueAtTime(pose.up[2], now);
    } else {
      const legacy = listener as AudioListener & {
        setPosition?: (x: number, y: number, z: number) => void;
        setOrientation?: (
          fx: number,
          fy: number,
          fz: number,
          ux: number,
          uy: number,
          uz: number
        ) => void;
      };
      legacy.setPosition?.(pose.position[0], pose.position[1], pose.position[2]);
      legacy.setOrientation?.(
        pose.forward[0],
        pose.forward[1],
        pose.forward[2],
        pose.up[0],
        pose.up[1],
        pose.up[2]
      );
    }
  }

  /**
   * Syncs the Web Audio 3D AudioListener pose with the Three.js camera without
   * eagerly constructing an AudioContext prior to user interaction.
   */
  public updateListenerPose(pose: SpatialListenerPose) {
    this.listenerPose = {
      position: [pose.position[0], pose.position[1], pose.position[2]],
      forward: [pose.forward[0], pose.forward[1], pose.forward[2]],
      up: [pose.up[0], pose.up[1], pose.up[2]],
    };
    if (this.ctx && this.ctx.state === 'running') {
      this.applyListenerPoseToContext(this.ctx, this.listenerPose);
    }
  }

  public getListenerPose(): SpatialListenerPose {
    return this.listenerPose;
  }

  public setSpatialEnabled(enabled: boolean) {
    this.spatialEnabled = enabled;
    saveSpatialAudioPref(enabled);
  }

  public isSpatialEnabled(): boolean {
    return this.spatialEnabled;
  }

  public getLastSpatialTrigger(): SpatialAcousticProfile | null {
    return this.lastSpatialTrigger;
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

  public async setSinkId(deviceId: string): Promise<void> {
    if (!this.ctx) return;
    const sinkable = this.ctx as AudioContext & {
      setSinkId?: (id: string) => Promise<void>;
    };
    if (typeof sinkable.setSinkId !== 'function') return;
    try {
      await sinkable.setSinkId(deviceId === 'default' ? '' : deviceId);
    } catch {
      // ignore unsupported sinkId or permission errors
    }
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
   * Creates an isolated 3D HRTF PannerNode (or centered direct GainNode when spatial audio is off)
   * feeding both the dry studio bus and subtle early-reflection room bus, with automatic disconnect.
   */
  private createSpatialVoiceOutput(
    ctx: AudioContext,
    pannerPosition: Vec3,
    stereoPan: number,
    cleanupAfterSec: number
  ): { input: AudioNode; dispose: () => void } {
    const dryDest = this.spatialDryBus ?? ctx.destination;
    const roomSend = this.spatialRoomSend;

    let spatialNode: AudioNode;
    if (this.spatialEnabled) {
      try {
        const panner = ctx.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'inverse';
        panner.refDistance = 1.0;
        panner.maxDistance = 14.0;
        panner.rolloffFactor = 0.85;
        panner.coneInnerAngle = 360;
        panner.coneOuterAngle = 360;
        panner.coneOuterGain = 0;

        const now = ctx.currentTime;
        if (typeof panner.positionX !== 'undefined') {
          panner.positionX.setValueAtTime(pannerPosition[0], now);
          panner.positionY.setValueAtTime(pannerPosition[1], now);
          panner.positionZ.setValueAtTime(pannerPosition[2], now);
        } else {
          const legacyPanner = panner as PannerNode & {
            setPosition?: (x: number, y: number, z: number) => void;
          };
          legacyPanner.setPosition?.(pannerPosition[0], pannerPosition[1], pannerPosition[2]);
        }

        panner.connect(dryDest);
        if (roomSend) panner.connect(roomSend);
        spatialNode = panner;
      } catch {
        // Fallback to StereoPannerNode if HRTF is unavailable in a constrained browser
        if (typeof ctx.createStereoPanner === 'function') {
          const stereo = ctx.createStereoPanner();
          stereo.pan.setValueAtTime(stereoPan, ctx.currentTime);
          stereo.connect(dryDest);
          if (roomSend) stereo.connect(roomSend);
          spatialNode = stereo;
        } else {
          const pass = ctx.createGain();
          pass.connect(dryDest);
          spatialNode = pass;
        }
      }
    } else {
      const mono = ctx.createGain();
      mono.connect(dryDest);
      spatialNode = mono;
    }

    let disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      try {
        spatialNode.disconnect();
      } catch {
        // already disconnected
      }
    };

    if (typeof window !== 'undefined') {
      window.setTimeout(dispose, Math.ceil((cleanupAfterSec + 0.08) * 1000));
    }

    return { input: spatialNode, dispose };
  }

  /**
   * Subtle ABS-on-ABS plastic breakaway slide brush triggered right as a layer begins rotating.
   */
  public playSpatialTurnSlide(profile: SpatialAcousticProfile) {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.slideNoiseBuffer) return;

    const now = ctx.currentTime;
    const pitchJitter = 0.96 + Math.random() * 0.08;
    const voice = this.createSpatialVoiceOutput(
      ctx,
      profile.pannerPosition,
      profile.stereoPan,
      0.14
    );

    const src = ctx.createBufferSource();
    src.buffer = this.slideNoiseBuffer;
    src.playbackRate.setValueAtTime(
      (profile.turnKind === 'rotation' ? 0.65 : 1.05) * pitchJitter,
      now
    );

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(
      Math.min(profile.filterCutoffHz, profile.clickFreqHz * 0.62) * pitchJitter,
      now
    );
    bp.Q.setValueAtTime(profile.turnKind === 'slice' ? 2.1 : 1.4, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(profile.slideGain, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.068);

    src.connect(bp);
    bp.connect(gain);
    gain.connect(voice.input);
    src.onended = () => {
      try {
        src.disconnect();
        bp.disconnect();
        gain.disconnect();
      } catch {
        // ignore
      }
      voice.dispose();
    };
    src.start(now);
  }

  /**
   * Physically modeled 3D-spatialized mechanical speedcube turn click:
   * 1. ABS/core cavity knock (pitched resonance sweep)
   * 2. Magnetic detent snap transient (shaped resonant noise + chassis occlusion lowpass)
   * 3. Spring/core or Mirror brushed-alloy harmonic overtone
   * 4. Micro corner-settle secondary click (+10ms) for tactile realism
   */
  public playSpatialTurnClick(profile: SpatialAcousticProfile) {
    this.lastSpatialTrigger = profile;
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Tiny organic micro-variation (±3.5%) so consecutive identical moves sound alive, never robotic
    const jitter = 0.965 + Math.random() * 0.07;

    const voice = this.createSpatialVoiceOutput(
      ctx,
      profile.pannerPosition,
      profile.stereoPan,
      Math.max(0.18, profile.decaySec + 0.12)
    );

    // Master occlusion filter simulating acoustic shadowing when turning far/back faces
    const occlusionLp = ctx.createBiquadFilter();
    occlusionLp.type = 'lowpass';
    occlusionLp.frequency.setValueAtTime(profile.filterCutoffHz, now);
    occlusionLp.Q.setValueAtTime(0.65, now);
    occlusionLp.connect(voice.input);

    // 1. ABS / Core Cavity Resonance Knock
    const bodyOsc = ctx.createOscillator();
    const bodyGain = ctx.createGain();
    bodyOsc.type = profile.turnKind === 'rotation' ? 'sine' : 'triangle';
    const bodyStart = profile.bodyFreqHz * jitter;
    bodyOsc.frequency.setValueAtTime(bodyStart, now);
    bodyOsc.frequency.exponentialRampToValueAtTime(
      Math.max(55, bodyStart * 0.36),
      now + profile.decaySec * 0.88
    );

    bodyGain.gain.setValueAtTime(0.0001, now);
    bodyGain.gain.linearRampToValueAtTime(profile.bodyGain, now + 0.0028);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + profile.decaySec);

    bodyOsc.connect(bodyGain);
    bodyGain.connect(occlusionLp);
    bodyOsc.start(now);
    bodyOsc.stop(now + profile.decaySec + 0.012);

    // 2. Magnetic Detent Snap Transient (high-Q resonant noise burst)
    if (this.clickNoiseBuffer && profile.snapGain > 0.005) {
      const snapSrc = ctx.createBufferSource();
      snapSrc.buffer = this.clickNoiseBuffer;

      const snapBp = ctx.createBiquadFilter();
      snapBp.type = 'bandpass';
      snapBp.frequency.setValueAtTime(profile.clickFreqHz * jitter, now);
      snapBp.Q.setValueAtTime(profile.filterQ, now);

      const snapGain = ctx.createGain();
      snapGain.gain.setValueAtTime(profile.snapGain, now);
      snapGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.029);

      snapSrc.connect(snapBp);
      snapBp.connect(snapGain);
      snapGain.connect(occlusionLp);
      snapSrc.start(now);

      // 4. Micro Corner-Settle Secondary Tick (+10ms) on crisp layer turns
      if (profile.turnKind !== 'rotation') {
        const settleTime = now + 0.0105;
        const settleSrc = ctx.createBufferSource();
        settleSrc.buffer = this.clickNoiseBuffer;
        settleSrc.playbackRate.setValueAtTime(1.22, settleTime);

        const settleBp = ctx.createBiquadFilter();
        settleBp.type = 'bandpass';
        settleBp.frequency.setValueAtTime(profile.clickFreqHz * 1.18 * jitter, settleTime);
        settleBp.Q.setValueAtTime(profile.filterQ * 1.15, settleTime);

        const settleGain = ctx.createGain();
        settleGain.gain.setValueAtTime(profile.snapGain * 0.34, settleTime);
        settleGain.gain.exponentialRampToValueAtTime(0.0001, settleTime + 0.018);

        settleSrc.connect(settleBp);
        settleBp.connect(settleGain);
        settleGain.connect(occlusionLp);
        settleSrc.start(settleTime);
      }
    }

    // 3. Spring/Core & Brushed-Alloy Metallic Overtone Ring (pronounced on Mirror Blocks & center slices)
    if (profile.metallicMix > 0.04) {
      const ringOsc = ctx.createOscillator();
      const ringGain = ctx.createGain();
      ringOsc.type = 'sine';
      const ringFreq = profile.overtoneFreqHz * jitter;
      ringOsc.frequency.setValueAtTime(ringFreq, now);
      ringOsc.frequency.exponentialRampToValueAtTime(ringFreq * 0.94, now + 0.042);

      const ringAmp = profile.snapGain * profile.metallicMix * 0.52;
      const ringDur = 0.022 + profile.metallicMix * 0.048;
      ringGain.gain.setValueAtTime(0.0001, now);
      ringGain.gain.linearRampToValueAtTime(ringAmp, now + 0.0018);
      ringGain.gain.exponentialRampToValueAtTime(0.0001, now + ringDur);

      ringOsc.connect(ringGain);
      ringGain.connect(occlusionLp);
      ringOsc.start(now);
      ringOsc.stop(now + ringDur + 0.01);
    }

    bodyOsc.onended = () => {
      try {
        bodyOsc.disconnect();
        bodyGain.disconnect();
        occlusionLp.disconnect();
      } catch {
        // ignore
      }
      voice.dispose();
    };
  }

  /**
   * Backward-compatible tactile turn click helper (delegates cleanly to centered physical click).
   */
  public playTurnClick(heavy = false) {
    this.playSpatialTurnClick({
      pannerPosition: [0, 0, 0],
      azimuthRad: 0,
      elevationRad: 0,
      stereoPan: 0,
      cameraDistance: 9.5,
      acousticDistance: 1.35,
      occlusionFactor: 0,
      bodyFreqHz: heavy ? 245 : 310,
      clickFreqHz: heavy ? 1860 : 2420,
      overtoneFreqHz: heavy ? 2950 : 3560,
      filterCutoffHz: 6200,
      filterQ: 2.5,
      bodyGain: heavy ? 0.17 : 0.13,
      snapGain: heavy ? 0.14 : 0.11,
      slideGain: 0.03,
      metallicMix: 0.12,
      decaySec: heavy ? 0.062 : 0.05,
      turnKind: heavy ? 'wide' : 'outer',
      notation: heavy ? 'Rw' : 'R',
    });
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
   * Magnetic morph swoosh when switching cube types, anchored cleanly to the cube's 3D space.
   */
  public playMorphWhoosh(worldPos?: Vec3) {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const voice = worldPos
      ? this.createSpatialVoiceOutput(ctx, worldPos, 0, 0.42)
      : { input: ctx.destination as AudioNode, dispose: () => {} };

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
    gain.connect(voice.input);
    osc.onended = () => {
      try {
        osc.disconnect();
        gain.disconnect();
      } catch {
        // ignore
      }
      voice.dispose();
    };
    osc.start(now);
    osc.stop(now + 0.38);
  }

  /**
   * Warm harmonic chord arpeggio on puzzle completion, blooming gently in 3D stereo around the cube.
   */
  public playVictoryChord(worldPos?: Vec3) {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Cmaj9 luminous studio chord: C5, E5, G5, B5, D6
    const notes = [523.25, 659.25, 783.99, 987.77, 1174.66];
    const base = worldPos ?? [0, 0, 0];

    notes.forEach((freq, idx) => {
      const start = now + idx * 0.075;
      const spread = (idx - 2) * 0.32;
      const notePos: Vec3 = [base[0] + spread, base[1] + idx * 0.12, base[2]];
      const voice = this.createSpatialVoiceOutput(ctx, notePos, spread * 0.65, 0.85 + idx * 0.08);

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.11, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.72);

      osc.connect(gain);
      gain.connect(voice.input);
      osc.onended = () => {
        try {
          osc.disconnect();
          gain.disconnect();
        } catch {
          // ignore
        }
        voice.dispose();
      };
      osc.start(start);
      osc.stop(start + 0.75);
    });
  }
}

export const cubeAudio = new CubeAudioSynth();

