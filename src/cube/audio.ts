/**
 * Procedural Web Audio synthesizer for tactile magnetic speedcube acoustics.
 * Zero external audio assets — all sounds are synthesized on the fly.
 */
class CubeAudioSynth {
  private ctx: AudioContext | null = null;
  private muted = false;

  private ensureContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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
  }

  public isMuted(): boolean {
    return this.muted;
  }

  /**
   * Tactile magnetic speedcube turn click: short filtered burst + crisp plastic detent snap.
   */
  public playTurnClick(heavy = false) {
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
