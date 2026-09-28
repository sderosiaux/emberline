// Context-agnostic plumbing: everything here works on AudioContext and OfflineAudioContext alike,
// which is what lets tools/audio-check render the exact same graph the game plays.

export type Ctx = BaseAudioContext

/** Music bus level relative to sfx at full user volume. */
export const MUSIC_TRIM = 0.5

export const mtof = (m: number): number => 440 * 2 ** ((m - 69) / 12)

export function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

interface Shared {
  white: AudioBuffer
  pink: AudioBuffer
  brown: AudioBuffer
  pulse: PeriodicWave
  ir: AudioBuffer
}

const shared = new WeakMap<Ctx, Shared>()

/** Per-context buffers built once: noise sources, pulse wave, reverb impulse. */
export function res(ctx: Ctx): Shared {
  let s = shared.get(ctx)
  if (!s) {
    s = { ...makeNoise(ctx), pulse: makePulse(ctx, 0.25), ir: makeImpulse(ctx, 2.4) }
    shared.set(ctx, s)
  }
  return s
}

function makeNoise(ctx: Ctx): { white: AudioBuffer; pink: AudioBuffer; brown: AudioBuffer } {
  const len = Math.floor(ctx.sampleRate * 2)
  const rnd = makeRng(0xe1b3)
  const white = ctx.createBuffer(1, len, ctx.sampleRate)
  const pink = ctx.createBuffer(1, len, ctx.sampleRate)
  const brown = ctx.createBuffer(1, len, ctx.sampleRate)
  const w = white.getChannelData(0)
  const p = pink.getChannelData(0)
  const b = brown.getChannelData(0)
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0
  for (let i = 0; i < len; i++) {
    const x = rnd() * 2 - 1
    w[i] = x * 0.9
    // Paul Kellet's pink filter
    b0 = 0.99886 * b0 + x * 0.0555179
    b1 = 0.99332 * b1 + x * 0.0750759
    b2 = 0.969 * b2 + x * 0.153852
    b3 = 0.8665 * b3 + x * 0.3104856
    b4 = 0.55 * b4 + x * 0.5329522
    b5 = -0.7616 * b5 - x * 0.016898
    p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11
    b6 = x * 0.115926
    last = (last + 0.02 * x) / 1.02
    b[i] = last * 3.2
  }
  return { white, pink, brown }
}

function makePulse(ctx: Ctx, duty: number): PeriodicWave {
  const n = 40
  const real = new Float32Array(n)
  const imag = new Float32Array(n)
  for (let k = 1; k < n; k++) real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty)
  return ctx.createPeriodicWave(real, imag)
}

function makeImpulse(ctx: Ctx, seconds: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds)
  const ir = ctx.createBuffer(2, len, ctx.sampleRate)
  const pre = Math.floor(ctx.sampleRate * 0.018)
  const rnd = makeRng(0x5eed)
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch)
    let lp = 0
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / ctx.sampleRate
      // Darkens as it decays: the one-pole coefficient closes over time, so no fizzy tail.
      const k = 0.55 + 0.4 * Math.min(1, t / seconds)
      lp = lp * k + (rnd() * 2 - 1) * (1 - k)
      d[i] = lp * Math.exp((-6.9 * t) / (seconds * 0.8))
    }
    // Unit energy: a noise-like input comes out at roughly the same RMS it went in.
    let e = 0
    for (let i = 0; i < len; i++) e += d[i] * d[i]
    const k = 1 / Math.sqrt(e || 1)
    for (let i = 0; i < len; i++) d[i] *= k
  }
  return ir
}

/** Soft clipper transfer curve: linear below 0.6, tanh knee above, ceiling ≈ 0.89 even for |x| ≥ 1. */
function clipCurve(): Float32Array<ArrayBuffer> {
  const n = 2048
  const c = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    const a = Math.abs(x)
    c[i] = a < 0.6 ? x : Math.sign(x) * (0.6 + 0.37 * Math.tanh((a - 0.6) / 0.37))
  }
  return c
}

export interface Mixer {
  ctx: Ctx
  master: GainNode
  musicIn: GainNode
  musicWetIn: GainNode
  sfxIn: GainNode
  sfxWetIn: GainNode
  uiIn: GainNode
  /** [dry, wet] pairs so reverb tails follow the same volume/duck/pause as the dry signal. */
  musicVol: GainNode[]
  musicDuck: GainNode[]
  musicPause: GainNode[]
  sfxVol: GainNode[]
  sfxPause: GainNode[]
}

function chain(ctx: Ctx, from: AudioNode, to: AudioNode, n: number): GainNode[] {
  const gs: GainNode[] = []
  let prev = from
  for (let i = 0; i < n; i++) {
    const g = ctx.createGain()
    prev.connect(g)
    gs.push(g)
    prev = g
  }
  prev.connect(to)
  return gs
}

/** Master gain at full user volume. Chrome's compressor adds automatic makeup gain (~+6 dB with
 *  the settings below), so the chain is trimmed down here instead of fighting it. */
export const MASTER_TRIM = 0.8

export function createMixer(ctx: Ctx, dest: AudioNode): Mixer {
  const master = ctx.createGain()
  master.gain.value = MASTER_TRIM

  const shelf = ctx.createBiquadFilter()
  shelf.type = 'highshelf'
  shelf.frequency.value = 7000
  shelf.gain.value = -4
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -14
  comp.knee.value = 12
  comp.ratio.value = 2.5
  comp.attack.value = 0.006
  comp.release.value = 0.22
  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -3
  limiter.knee.value = 0
  limiter.ratio.value = 20
  limiter.attack.value = 0.001
  limiter.release.value = 0.12
  const clip = ctx.createWaveShaper()
  clip.curve = clipCurve()
  master.connect(shelf).connect(comp).connect(limiter).connect(clip).connect(dest)

  const revIn = ctx.createGain()
  const conv = ctx.createConvolver()
  conv.normalize = false
  conv.buffer = res(ctx).ir
  const revOut = ctx.createGain()
  revOut.gain.value = 0.9
  revIn.connect(conv).connect(revOut).connect(master)

  const musicIn = ctx.createGain()
  const musicWetIn = ctx.createGain()
  const [mdA, mpA, mvA] = chain(ctx, musicIn, master, 3)
  const [mdB, mpB, mvB] = chain(ctx, musicWetIn, revIn, 3)

  const sfxIn = ctx.createGain()
  const sfxWetIn = ctx.createGain()
  const uiIn = ctx.createGain()
  const [spA, svA] = chain(ctx, sfxIn, master, 2)
  const [spB, svB] = chain(ctx, sfxWetIn, revIn, 2)
  uiIn.connect(svA)

  return {
    ctx, master, musicIn, musicWetIn, sfxIn, sfxWetIn, uiIn,
    musicVol: [mvA, mvB], musicDuck: [mdA, mdB], musicPause: [mpA, mpB],
    sfxVol: [svA, svB], sfxPause: [spA, spB],
  }
}

/** Detach a finished voice's output from the graph. Chrome keeps every connected node in the
 *  render graph until it is disconnected or garbage-collected, so per-note subgraphs that are
 *  merely silent pile up and render cost grows minute after minute. */
export function releaseOn(src: AudioScheduledSourceNode, out: AudioNode): void {
  src.onended = () => out.disconnect()
}

/** Freeze a param at its current automated value so a new ramp starts from there (no jumps). */
export function holdAt(p: AudioParam, at: number): void {
  if (typeof p.cancelAndHoldAtTime === 'function') p.cancelAndHoldAtTime(at)
  else {
    const v = p.value
    p.cancelScheduledValues(at)
    p.setValueAtTime(v, at)
  }
}

export function glideAll(nodes: GainNode[], value: number, at: number, tau: number): void {
  for (const g of nodes) {
    holdAt(g.gain, at)
    g.gain.setTargetAtTime(value, at, tau)
  }
}
