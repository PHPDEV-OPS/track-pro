import type { AmbientSound } from "@/lib/sounds";

// Background study sounds, synthesised in the browser with Web Audio (spec 0002). Client only.

const FADE_IN = 1;
const FADE_OUT = 0.6;
const CROSSFADE = 1;
// The target bell: three strikes, and the background dips for the whole ring.
const RING = { strikes: 3, gap: 1, decay: 1.6 };
const DUCK = { level: 0.15, down: 0.1, total: RING.strikes * RING.gap + 1 };
const LOOP_SEC = 8;

type Rand = () => number;

/** Uniform noise in [-1, 1]. */
export function whiteNoise(length: number, rand: Rand = Math.random) {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = rand() * 2 - 1;
  return out;
}

/** Pink (1/f) noise, Paul Kellet's refined filter. */
export function pinkNoise(length: number, rand: Rand = Math.random) {
  const out = new Float32Array(length);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < length; i++) {
    const w = rand() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return normalize(out);
}

/** Brown (1/f²) noise: a leaky random walk, detrended so the loop point has no click. */
export function brownNoise(length: number, rand: Rand = Math.random) {
  const out = new Float32Array(length);
  let last = 0;
  for (let i = 0; i < length; i++) {
    last = (last + 0.02 * (rand() * 2 - 1)) / 1.02;
    out[i] = last * 3.5;
  }
  const drift = out[length - 1] - out[0];
  for (let i = 0; i < length; i++) out[i] -= (drift * i) / (length - 1);
  return normalize(out);
}

/** Pink noise with a gentle random volume flicker, the raw material for rain. Starts and ends at full level so it loops. */
export function rainNoise(length: number, sampleRate: number, rand: Rand = Math.random) {
  const out = pinkNoise(length, rand);
  const step = Math.max(1, Math.round(sampleRate * 0.05));
  const points = Math.ceil(length / step) + 1;
  const env = Array.from({ length: points }, () => 0.7 + rand() * 0.3);
  env[0] = env[points - 1] = 1;
  for (let i = 0; i < length; i++) {
    const p = i / step;
    const k = Math.floor(p);
    const t = p - k;
    out[i] *= env[k] + (env[Math.min(k + 1, points - 1)] - env[k]) * t;
  }
  return out;
}

function normalize<T extends Float32Array>(buf: T): T {
  let peak = 0;
  for (const v of buf) peak = Math.max(peak, Math.abs(v));
  if (peak > 1) for (let i = 0; i < buf.length; i++) buf[i] /= peak;
  return buf;
}

/** Slider value 0..100 to gain, on a square curve so the low end is usable. */
export const volumeToGain = (v: number) => (Math.min(100, Math.max(0, v)) / 100) ** 2;

type Voice = { gain: GainNode; stop: (at: number) => void };

function ramp(param: AudioParam, to: number, at: number, sec: number) {
  param.cancelScheduledValues(at);
  param.setValueAtTime(param.value, at);
  param.linearRampToValueAtTime(to, at + sec);
}

class AmbientEngine {
  private ctx: AudioContext | null = null;
  private fade!: GainNode;
  private volume!: GainNode;
  private duckGain!: GainNode;
  private buffers = new Map<string, AudioBuffer>();
  private voice: Voice | null = null;
  private current: AmbientSound = "OFF";
  private playing = false;
  private release: ReturnType<typeof setTimeout> | undefined;
  private listeners = new Set<() => void>();

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };

  /** True once a click in this tab has started the audio context. */
  get unlocked() {
    return this.ctx !== null;
  }

  /** Call from a click handler: browsers only allow audio to start inside a user gesture. */
  unlock() {
    try {
      if (!this.ctx) {
        const ctx = new AudioContext();
        this.fade = ctx.createGain();
        this.volume = ctx.createGain();
        this.duckGain = ctx.createGain();
        this.fade.gain.value = 0;
        this.fade.connect(this.volume).connect(this.duckGain).connect(ctx.destination);
        this.ctx = ctx;
        this.listeners.forEach((fn) => fn());
      }
      void this.ctx.resume();
      return true;
    } catch {
      return false;
    }
  }

  /** Declarative: play `sound` at `volume` when `playing`, otherwise fade out and release. */
  sync(playing: boolean, sound: AmbientSound, volume: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      this.volume.gain.setTargetAtTime(volumeToGain(volume), now, 0.05);
      const shouldPlay = playing && sound !== "OFF";

      if (!shouldPlay) {
        if (!this.playing) return;
        this.playing = false;
        ramp(this.fade.gain, 0, now, FADE_OUT);
        clearTimeout(this.release);
        this.release = setTimeout(() => this.dropVoice(), FADE_OUT * 1000 + 50);
        return;
      }

      clearTimeout(this.release);
      if (sound !== this.current || !this.voice) {
        const old = this.voice;
        const next = this.makeVoice(sound);
        this.voice = next;
        this.current = sound;
        const xf = this.playing ? CROSSFADE : 0;
        ramp(next.gain.gain, 1, now, xf || 0.01);
        if (old) {
          ramp(old.gain.gain, 0, now, xf || 0.01);
          old.stop(now + xf + 0.05);
        }
      }
      if (!this.playing) {
        this.playing = true;
        ramp(this.fade.gain, 1, now, FADE_IN);
      }
    } catch {
      /* an audio failure leaves the timer working and silent */
    }
  }

  /**
   * Rings a bell when the session reaches its target (spec 0002 AC-5): a few struck notes with
   * inharmonic partials, straight to the speakers, while the background dips and then carries on.
   */
  ring() {
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      const start = ctx.currentTime + 0.05;
      for (let i = 0; i < RING.strikes; i++) {
        const at = start + i * RING.gap;
        // A small bell: fundamental plus the slightly sharp partials that make metal sound like metal.
        for (const [mult, level] of [[1, 0.22], [2.76, 0.08], [5.4, 0.04]] as const) {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.frequency.value = 880 * mult;
          g.gain.setValueAtTime(0, at);
          g.gain.linearRampToValueAtTime(level, at + 0.005);
          g.gain.exponentialRampToValueAtTime(0.0001, at + RING.decay / mult ** 0.5);
          o.connect(g).connect(ctx.destination);
          o.start(at);
          o.stop(at + RING.decay + 0.1);
        }
      }
      this.duck();
    } catch {
      /* an audio failure leaves the timer working and silent */
    }
  }

  /** Dip the background so the target bell is heard. */
  duck() {
    const ctx = this.ctx;
    if (!ctx || !this.playing) return;
    const g = this.duckGain.gain;
    const now = ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(DUCK.level, now + DUCK.down);
    g.setValueAtTime(DUCK.level, now + DUCK.total - 0.4);
    g.linearRampToValueAtTime(1, now + DUCK.total);
  }

  private dropVoice() {
    this.voice?.stop(this.ctx!.currentTime);
    this.voice = null;
    this.current = "OFF";
  }

  private buffer(kind: "WHITE" | "PINK" | "BROWN" | "RAIN") {
    const ctx = this.ctx!;
    let buf = this.buffers.get(kind);
    if (!buf) {
      const n = Math.round(ctx.sampleRate * LOOP_SEC);
      const data =
        kind === "WHITE"
          ? whiteNoise(n)
          : kind === "PINK"
            ? pinkNoise(n)
            : kind === "BROWN"
              ? brownNoise(n)
              : rainNoise(n, ctx.sampleRate);
      buf = ctx.createBuffer(1, n, ctx.sampleRate);
      buf.copyToChannel(data, 0);
      this.buffers.set(kind, buf);
    }
    return buf;
  }

  private makeVoice(sound: Exclude<AmbientSound, "OFF">): Voice {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.fade);
    const src = ctx.createBufferSource();
    src.loop = true;
    const level = ctx.createGain();
    const extra: AudioScheduledSourceNode[] = [];

    if (sound === "RAIN") {
      src.buffer = this.buffer("RAIN");
      const band = ctx.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = 1800;
      band.Q.value = 0.5;
      level.gain.value = 1;
      src.connect(band).connect(level);
    } else if (sound === "WAVES") {
      // Brown noise under a slow swell, one cycle every 8 to 12 seconds.
      src.buffer = this.buffer("BROWN");
      const swell = ctx.createGain();
      swell.gain.value = 0.55;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 1 / (8 + Math.random() * 4);
      const depth = ctx.createGain();
      depth.gain.value = 0.45;
      lfo.connect(depth).connect(swell.gain);
      lfo.start();
      extra.push(lfo);
      level.gain.value = 0.9;
      src.connect(swell).connect(level);
    } else {
      src.buffer = this.buffer(sound);
      level.gain.value = sound === "WHITE" ? 0.3 : sound === "PINK" ? 0.6 : 0.9;
      src.connect(level);
    }

    level.connect(gain);
    src.start();
    return {
      gain,
      stop: (at) => {
        for (const n of [src, ...extra]) {
          try {
            n.stop(at);
          } catch {
            /* already stopped */
          }
        }
        setTimeout(() => gain.disconnect(), Math.max(0, (at - ctx.currentTime) * 1000) + 100);
      },
    };
  }
}

let engine: AmbientEngine | null = null;

/** The one shared engine per tab. */
export function ambient() {
  return (engine ??= new AmbientEngine());
}
