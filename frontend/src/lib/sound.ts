// Synthesised with the Web Audio API rather than shipped audio files: no
// copyrighted assets to source, no extra downloads, and nothing plays before
// the user's first gesture (the browser blocks it, and a silent AudioContext
// is pointless to create earlier anyway).
export type SoundName =
  | 'click'
  | 'key'
  | 'nav'
  | 'grant'
  | 'deny'
  | 'alert'
  | 'success'
  | 'error'
  | 'device'
  | 'boot';

type Settings = { enabled: boolean; volume: number };

const STORAGE_KEY = 'sentinel_sound_settings';
const DEFAULTS: Settings = { enabled: true, volume: 0.45 };

class SoundManager {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private settings: Settings = DEFAULTS;
  private loadingNodes: { osc: OscillatorNode; lfo: OscillatorNode; gain: GainNode; noise: AudioBufferSourceNode } | null = null;
  private lastPlayed: Record<string, number> = {};

  constructor() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Settings>;
        this.settings = {
          enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULTS.enabled,
          volume: typeof parsed.volume === 'number' ? Math.min(1, Math.max(0, parsed.volume)) : DEFAULTS.volume
        };
      }
    } catch {
      // Corrupt/unavailable storage - defaults are fine.
    }
  }

  getSettings(): Settings {
    return { ...this.settings };
  }

  update(patch: Partial<Settings>) {
    this.settings = {
      enabled: patch.enabled ?? this.settings.enabled,
      volume: patch.volume ?? this.settings.volume
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    if (this.master){
      this.master.gain.value = this.settings.enabled ? this.settings.volume * 0.5 : 0;
    }
    if (!this.settings.enabled) this.stopLoading();
  }

  /** Must be called from a user gesture at least once; safe to call often. */
  unlock() {
    if (!this.settings.enabled) return;
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') void ctx.resume();
  }

  private ensureContext(): AudioContext {
    if (!this.context) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.context = new Ctor();
      this.master = this.context.createGain();
      this.master.gain.value = this.settings.enabled ? this.settings.volume * 0.5 : 0;
      this.master.connect(this.context.destination);
    }
    return this.context;
  }

  private throttle(name: string, ms: number): boolean {
    const now = performance.now();
    if (now - (this.lastPlayed[name] ?? 0) < ms) return false;
    this.lastPlayed[name] = now;
    return true;
  }

  private tone(opts: {
    freq: number;
    endFreq?: number;
    duration: number;
    type?: OscillatorType;
    gain?: number;
    when?: number;
  }) {
    const ctx = this.ensureContext();
    const startAt = ctx.currentTime + (opts.when ?? 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = opts.type ?? 'square';
    osc.frequency.setValueAtTime(opts.freq, startAt);
    if (opts.endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.endFreq), startAt + opts.duration);
    const peak = opts.gain ?? 0.22;
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(peak, startAt + Math.min(0.02, opts.duration / 3));
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + opts.duration);
    osc.connect(gain).connect(this.master!);
    osc.start(startAt);
    osc.stop(startAt + opts.duration + 0.02);
  }

  private noise(duration: number, gainValue = 0.12, filterHz = 2400, when = 0) {
    const ctx = this.ensureContext();
    const startAt = ctx.currentTime + when;
    const frames = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterHz;
    filter.Q.value = 0.9;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, startAt);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    source.connect(filter).connect(gain).connect(this.master!);
    source.start(startAt);
  }

  play(name: SoundName) {
    if (!this.settings.enabled) return;
    this.unlock();
    switch (name) {
      case 'click':
        if (!this.throttle('click', 55)) return;
        this.tone({ freq: 1480, endFreq: 980, duration: 0.045, type: 'square', gain: 0.12 });
        break;
      case 'key':
        if (!this.throttle('key', 28)) return;
        this.tone({ freq: 2100 + Math.random() * 500, endFreq: 1200, duration: 0.03, type: 'triangle', gain: 0.06 });
        break;
      case 'nav':
        if (!this.throttle('nav', 120)) return;
        this.tone({ freq: 620, endFreq: 1180, duration: 0.11, type: 'sawtooth', gain: 0.1 });
        this.tone({ freq: 310, endFreq: 620, duration: 0.09, type: 'sine', gain: 0.05 });
        break;
      case 'grant':
        this.tone({ freq: 523.25, duration: 0.16, type: 'sine', gain: 0.2 });
        this.tone({ freq: 659.25, duration: 0.16, type: 'sine', gain: 0.2, when: 0.13 });
        this.tone({ freq: 783.99, duration: 0.4, type: 'sine', gain: 0.22, when: 0.26 });
        this.noise(0.25, 0.05, 5200, 0.24);
        break;
      case 'deny':
        this.tone({ freq: 180, endFreq: 90, duration: 0.28, type: 'sawtooth', gain: 0.26 });
        this.tone({ freq: 140, endFreq: 70, duration: 0.34, type: 'square', gain: 0.14, when: 0.16 });
        this.noise(0.3, 0.1, 700);
        break;
      case 'alert':
        this.tone({ freq: 880, duration: 0.18, type: 'square', gain: 0.2 });
        this.tone({ freq: 660, duration: 0.18, type: 'square', gain: 0.2, when: 0.2 });
        this.tone({ freq: 880, duration: 0.18, type: 'square', gain: 0.2, when: 0.4 });
        this.noise(0.5, 0.07, 1100, 0.4);
        break;
      case 'success':
        this.tone({ freq: 740, endFreq: 1180, duration: 0.18, type: 'triangle', gain: 0.18 });
        break;
      case 'error':
        this.tone({ freq: 320, endFreq: 190, duration: 0.22, type: 'sawtooth', gain: 0.2 });
        break;
      case 'device':
        this.tone({ freq: 440, duration: 0.1, type: 'sine', gain: 0.16 });
        this.tone({ freq: 880, duration: 0.16, type: 'sine', gain: 0.12, when: 0.08 });
        break;
      case 'boot':
        [220, 330, 440, 660].forEach((freq, index) => {
          this.tone({ freq, duration: 0.1, type: 'square', gain: 0.09, when: index * 0.09 });
        });
        this.noise(0.5, 0.04, 3800, 0.1);
        break;
    }
  }

  /** Low cinematic drone while a real operation is in flight. */
  startLoading() {
    if (!this.settings.enabled || this.loadingNodes) return;
    const ctx = this.ensureContext();
    const osc = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.value = 58;
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    lfo.type = 'sine';
    lfo.frequency.value = 0.28;
    lfoGain.gain.value = 18;
    lfo.connect(lfoGain).connect(osc.frequency);

    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 0.8);

    const frames = Math.floor(ctx.sampleRate * 2);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) data[i] = (Math.random() * 2 - 1) * 0.4;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 900;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.012;

    osc.connect(filter).connect(gain).connect(this.master!);
    noise.connect(noiseFilter).connect(noiseGain).connect(this.master!);

    osc.start();
    lfo.start();
    noise.start();
    this.loadingNodes = { osc, lfo, gain, noise };
  }

  stopLoading() {
    const nodes = this.loadingNodes;
    if (!nodes || !this.context) return;
    const now = this.context.currentTime;
    nodes.gain.gain.cancelScheduledValues(now);
    nodes.gain.gain.setValueAtTime(Math.max(0.0001, nodes.gain.gain.value), now);
    nodes.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    const stopAt = now + 0.4;
    try {
      nodes.osc.stop(stopAt);
      nodes.lfo.stop(stopAt);
      nodes.noise.stop(stopAt);
    } catch {
      // Already stopped - nothing to do.
    }
    this.loadingNodes = null;
  }

  /** Global click/keyboard feedback, wired once from App. */
  attachGlobalInteractions(): () => void {
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const interactive = target.closest('button, a, [role="button"], input[type="checkbox"], input[type="radio"], select, summary');
      if (interactive) this.play('click');
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const isTextEntry = Boolean(target?.closest('input, textarea, [contenteditable="true"]'));
      if (event.key === 'Enter') {
        this.play('click');
        return;
      }
      if (event.key.length === 1 || event.key === 'Backspace' || isTextEntry) this.play('key');
    };

    const onPointerDown = () => this.unlock();

    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('pointerdown', onPointerDown, { once: true });

    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }
}

export const sound = new SoundManager();
