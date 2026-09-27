// One-shot building blocks shared by sfx, loops and drums. Each call builds a tiny graph that
// ends itself (sources stop, then the graph is garbage once unreferenced).

import { type Ctx, res } from './core'

export type Wave = 'sine' | 'square' | 'sawtooth' | 'triangle' | 'pulse'
export type Vowel = 'a' | 'e' | 'i' | 'o' | 'u'

export interface Dst {
  ctx: Ctx
  out: AudioNode
}

export const VOWELS: Record<Vowel, [number, number, number]> = {
  a: [780, 1150, 2800],
  e: [420, 1700, 2600],
  i: [300, 2100, 2900],
  o: [460, 820, 2750],
  u: [330, 700, 2500],
}

const FLOOR = 0.0004

export function osc(ctx: Ctx, w: Wave, f: number): OscillatorNode {
  const o = ctx.createOscillator()
  if (w === 'pulse') o.setPeriodicWave(res(ctx).pulse)
  else o.type = w
  o.frequency.value = f
  return o
}

/** Gain with linear attack then exponential decay to silence at t+dur. */
export function envGain(ctx: Ctx, t: number, vol: number, a: number, dur: number): GainNode {
  const g = ctx.createGain()
  const peak = Math.max(vol, FLOOR * 2)
  const att = Math.min(a, dur * 0.5)
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(peak, t + att)
  g.gain.exponentialRampToValueAtTime(FLOOR, t + dur)
  g.gain.setValueAtTime(0, t + dur + 0.005)
  return g
}

export function sweep(p: AudioParam, t: number, v0: number, v1: number, dur: number, lin = false): void {
  p.setValueAtTime(v0, t)
  if (v1 === v0) return
  if (lin) p.linearRampToValueAtTime(v1, t + dur)
  else p.exponentialRampToValueAtTime(Math.max(v1, 0.001), t + dur)
}

export interface FilterOpts {
  type: BiquadFilterType
  f: number
  f2?: number
  q?: number
  /** sweep time, defaults to note duration */
  fs?: number
}

export function filter(ctx: Ctx, t: number, o: FilterOpts, dur: number): BiquadFilterNode {
  const b = ctx.createBiquadFilter()
  b.type = o.type
  b.Q.value = o.q ?? 0.7
  sweep(b.frequency, t, o.f, o.f2 ?? o.f, o.fs ?? dur)
  return b
}

export interface ToneOpts {
  w?: Wave
  f: number
  /** end frequency of the pitch sweep */
  f2?: number
  /** sweep time, defaults to dur */
  fs?: number
  lin?: boolean
  dur: number
  vol: number
  a?: number
  det?: number
  flt?: FilterOpts
  /** vibrato [rateHz, cents] */
  vib?: [number, number]
}

export function tone(d: Dst, t: number, o: ToneOpts): void {
  const { ctx } = d
  const src = osc(ctx, o.w ?? 'sine', o.f)
  sweep(src.frequency, t, o.f, o.f2 ?? o.f, o.fs ?? o.dur, o.lin)
  if (o.det) src.detune.value = o.det
  const env = envGain(ctx, t, o.vol, o.a ?? 0.003, o.dur)
  let head: AudioNode = src
  if (o.flt) head = head.connect(filter(ctx, t, o.flt, o.dur))
  head.connect(env).connect(d.out)
  const stop = t + o.dur + 0.02
  if (o.vib) {
    const l = osc(ctx, 'sine', o.vib[0])
    const lg = ctx.createGain()
    lg.gain.value = o.vib[1]
    l.connect(lg).connect(src.detune)
    l.start(t)
    l.stop(stop)
  }
  src.start(t)
  src.stop(stop)
}

export interface NoiseOpts {
  kind?: 'white' | 'pink' | 'brown'
  dur: number
  vol: number
  a?: number
  flt?: FilterOpts
  flt2?: FilterOpts
}

export function noise(d: Dst, t: number, o: NoiseOpts): void {
  const { ctx } = d
  const r = res(ctx)
  const src = ctx.createBufferSource()
  src.buffer = r[o.kind ?? 'white']
  src.loop = o.dur > 1.5
  const env = envGain(ctx, t, o.vol, o.a ?? 0.002, o.dur)
  let head: AudioNode = src
  if (o.flt) head = head.connect(filter(ctx, t, o.flt, o.dur))
  if (o.flt2) head = head.connect(filter(ctx, t, o.flt2, o.dur))
  head.connect(env).connect(d.out)
  src.start(t, Math.random() * 0.4)
  src.stop(t + o.dur + 0.02)
}

export interface FmOpts {
  f: number
  f2?: number
  ratio: number
  index: number
  /** time for the modulation index to fall to 15% */
  idec?: number
  dur: number
  vol: number
  a?: number
}

export function fm(d: Dst, t: number, o: FmOpts): void {
  const { ctx } = d
  const car = osc(ctx, 'sine', o.f)
  const mod = osc(ctx, 'sine', o.f * o.ratio)
  sweep(car.frequency, t, o.f, o.f2 ?? o.f, o.dur)
  sweep(mod.frequency, t, o.f * o.ratio, (o.f2 ?? o.f) * o.ratio, o.dur)
  const mg = ctx.createGain()
  const depth = o.f * o.index
  mg.gain.setValueAtTime(depth, t)
  mg.gain.exponentialRampToValueAtTime(depth * 0.15, t + (o.idec ?? o.dur * 0.6))
  mod.connect(mg).connect(car.frequency)
  const env = envGain(ctx, t, o.vol, o.a ?? 0.002, o.dur)
  car.connect(env).connect(d.out)
  const stop = t + o.dur + 0.02
  car.start(t)
  mod.start(t)
  car.stop(stop)
  mod.stop(stop)
}

/** Parallel bandpass formant bank; returns [input, output]. Vowel can morph over `morph` seconds. */
export function formantBank(ctx: Ctx, t: number, v1: Vowel, v2: Vowel | undefined, morph: number, gain = 1): [AudioNode, AudioNode] {
  const input = ctx.createGain()
  const output = ctx.createGain()
  output.gain.value = gain
  const a = VOWELS[v1]
  const b = VOWELS[v2 ?? v1]
  const amps = [1, 0.55, 0.25]
  const qs = [7, 11, 16]
  for (let i = 0; i < 3; i++) {
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = qs[i]
    bp.frequency.setValueAtTime(a[i], t)
    if (b[i] !== a[i]) bp.frequency.linearRampToValueAtTime(b[i], t + morph)
    const g = ctx.createGain()
    g.gain.value = amps[i]
    input.connect(bp).connect(g).connect(output)
  }
  return [input, output]
}

export interface FormantOpts {
  f: number
  f2?: number
  v: Vowel
  v2?: Vowel
  dur: number
  vol: number
  a?: number
  w?: Wave
  vib?: [number, number]
}

/** "Choir machine" voice: buzzy source through vowel formants. Used for everything the enemy says. */
export function formant(d: Dst, t: number, o: FormantOpts): void {
  const { ctx } = d
  const src = osc(ctx, o.w ?? 'sawtooth', o.f)
  sweep(src.frequency, t, o.f, o.f2 ?? o.f, o.dur)
  const [fin, fout] = formantBank(ctx, t, o.v, o.v2, o.dur, 3.2)
  const env = envGain(ctx, t, o.vol, o.a ?? 0.01, o.dur)
  src.connect(fin)
  fout.connect(env).connect(d.out)
  const stop = t + o.dur + 0.02
  if (o.vib) {
    const l = osc(ctx, 'sine', o.vib[0])
    const lg = ctx.createGain()
    lg.gain.value = o.vib[1]
    l.connect(lg).connect(src.detune)
    l.start(t)
    l.stop(stop)
  }
  src.start(t)
  src.stop(stop)
}
