// Music voices: one generic subtractive/FM/formant voice, a chord pad, and a synthesized drum kit.

import { type Ctx, mtof, res } from './core'
import { type Vowel, type Wave, formantBank, noise, osc, tone } from './synth'

export interface OscSpec {
  w: Wave
  /** cents */
  det?: number
  oct?: number
  g?: number
}

export interface SynthPreset {
  osc: OscSpec[]
  vol: number
  a: number
  d: number
  s: number
  r: number
  lp?: { f: number; q?: number; env?: number; dec?: number; kt?: number }
  vib?: { rate: number; cents: number; delay: number }
  glide?: number
  fm?: { ratio: number; index: number; dec: number; sus?: number }
  vowel?: [Vowel, Vowel]
}

const MAX_F = 16000

export function playNote(ctx: Ctx, dest: AudioNode, t: number, dur: number, midi: number, vel: number, P: SynthPreset, fromMidi?: number): void {
  const f = mtof(midi)
  const end = t + dur
  const stop = end + P.r * 1.6 + 0.02
  const amp = ctx.createGain()
  const peak = Math.max(P.vol * vel, 0.0005)
  const a = Math.min(P.a, dur * 0.5)
  const g = amp.gain
  g.setValueAtTime(0, t)
  g.linearRampToValueAtTime(peak, t + a)
  g.setTargetAtTime(peak * P.s + 0.0001, t + a, P.d / 3)
  g.setTargetAtTime(0, end, P.r / 4)

  const head: AudioNode = amp
  if (P.vowel) {
    const [fin, fout] = formantBank(ctx, t, P.vowel[0], P.vowel[1], dur, 3)
    fout.connect(dest)
    amp.connect(fin)
  } else if (P.lp) {
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.Q.value = P.lp.q ?? 0.8
    const base = Math.min(MAX_F, P.lp.f * (f / 261.6) ** (P.lp.kt ?? 0))
    const top = Math.min(MAX_F, base * (1 + (P.lp.env ?? 0)))
    // Ramps (not setTarget) so the automation ends: Chrome recomputes biquad coefficients per
    // sample while a filter param is automating, which dominated CPU with setTarget tails.
    lp.frequency.setValueAtTime(top, t)
    if (top !== base) lp.frequency.exponentialRampToValueAtTime(base, t + Math.min(dur, P.lp.dec ?? 0.2))
    amp.connect(lp).connect(dest)
  } else {
    amp.connect(dest)
  }

  let mod: GainNode | undefined
  if (P.fm) {
    const m = osc(ctx, 'sine', f * P.fm.ratio)
    mod = ctx.createGain()
    const depth = f * P.fm.index
    mod.gain.setValueAtTime(depth, t)
    mod.gain.setTargetAtTime(depth * (P.fm.sus ?? 0.1), t, P.fm.dec / 3)
    m.connect(mod)
    m.start(t)
    m.stop(stop)
  }
  let vib: GainNode | undefined
  if (P.vib && dur > P.vib.delay) {
    const l = osc(ctx, 'sine', P.vib.rate)
    vib = ctx.createGain()
    vib.gain.setValueAtTime(0, t)
    vib.gain.setValueAtTime(0, t + P.vib.delay)
    vib.gain.linearRampToValueAtTime(P.vib.cents, t + P.vib.delay + 0.25)
    l.connect(vib)
    l.start(t)
    l.stop(stop)
  }
  for (const o of P.osc) {
    const fo = f * 2 ** (o.oct ?? 0)
    const s = osc(ctx, o.w, fo)
    if (o.det) s.detune.value = o.det
    if (fromMidi !== undefined && P.glide) {
      s.frequency.setValueAtTime(mtof(fromMidi) * 2 ** (o.oct ?? 0), t)
      s.frequency.exponentialRampToValueAtTime(fo, t + P.glide)
    }
    if (mod) mod.connect(s.frequency)
    if (vib) vib.connect(s.detune)
    if (o.g !== undefined && o.g !== 1) {
      const og = ctx.createGain()
      og.gain.value = o.g
      s.connect(og).connect(head)
    } else s.connect(head)
    s.start(t)
    s.stop(stop)
  }
}

export interface PadPreset {
  osc: OscSpec[]
  vol: number
  a: number
  r: number
  lp?: number
  q?: number
  /** cutoff multiplier reached at the end of the chord (slow filter movement) */
  sweep?: number
  vowel?: [Vowel, Vowel]
}

export function playPad(ctx: Ctx, dest: AudioNode, t: number, dur: number, midis: number[], vel: number, P: PadPreset): void {
  const end = t + dur
  const stop = end + P.r * 1.6 + 0.02
  const amp = ctx.createGain()
  const peak = P.vol * vel
  amp.gain.setValueAtTime(0, t)
  amp.gain.linearRampToValueAtTime(peak, t + Math.min(P.a, dur * 0.6))
  amp.gain.setTargetAtTime(0, end, P.r / 4)
  const mix = ctx.createGain()
  if (P.vowel) {
    const [fin, fout] = formantBank(ctx, t, P.vowel[0], P.vowel[1], dur, 3)
    mix.connect(fin)
    fout.connect(amp)
  } else {
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.Q.value = P.q ?? 0.7
    const f0 = P.lp ?? 2000
    lp.frequency.setValueAtTime(f0, t)
    lp.frequency.linearRampToValueAtTime(Math.min(MAX_F, f0 * (P.sweep ?? 1)), end)
    mix.connect(lp).connect(amp)
  }
  amp.connect(dest)
  for (const m of midis) {
    for (const o of P.osc) {
      const s = osc(ctx, o.w, mtof(m) * 2 ** (o.oct ?? 0))
      if (o.det) s.detune.value = o.det
      if (o.g !== undefined && o.g !== 1) {
        const og = ctx.createGain()
        og.gain.value = o.g
        s.connect(og).connect(mix)
      } else s.connect(mix)
      s.start(t)
      s.stop(stop)
    }
  }
}

// ---------------------------------------------------------------- drums

export type DrumName = 'k' | 's' | 'c' | 'h' | 'o' | 'r' | 't' | 'm' | 'n' | 'x' | 'p' | 'b'

export interface KitPreset {
  kick: { f0: number; f1: number; dec: number; click: number; vol: number; sq: number }
  snare: { tone: number; dec: number; bp: number; vol: number }
  hat: { f: number; dec: number; open: number; vol: number }
  clap: { f: number; vol: number }
  tom: { f: number; vol: number }
  rim: { f: number; vol: number }
  crash: { vol: number }
  shaker: { vol: number }
  metal: { f: number; vol: number }
}

export const DEFAULT_KIT: KitPreset = {
  kick: { f0: 140, f1: 46, dec: 0.32, click: 0.12, vol: 0.6, sq: 0 },
  snare: { tone: 190, dec: 0.17, bp: 1800, vol: 0.4 },
  hat: { f: 7500, dec: 0.035, open: 0.22, vol: 0.075 },
  clap: { f: 1150, vol: 0.4 },
  tom: { f: 95, vol: 0.3 },
  rim: { f: 820, vol: 0.18 },
  crash: { vol: 0.075 },
  shaker: { vol: 0.05 },
  metal: { f: 420, vol: 0.07 },
}

type DeepPartial<T> = { [K in keyof T]?: Partial<T[K]> }

export function kit(over: DeepPartial<KitPreset> = {}): KitPreset {
  const k = { ...DEFAULT_KIT } as KitPreset
  for (const key of Object.keys(DEFAULT_KIT) as (keyof KitPreset)[]) {
    ;(k as unknown as Record<string, object>)[key] = { ...DEFAULT_KIT[key], ...(over[key] ?? {}) }
  }
  return k
}

export function playDrum(ctx: Ctx, dest: AudioNode, t: number, d: DrumName, v: number, K: KitPreset): void {
  const o = { ctx, out: dest }
  switch (d) {
    case 'k': {
      const s = osc(ctx, 'sine', K.kick.f0)
      s.frequency.setValueAtTime(K.kick.f0, t)
      s.frequency.exponentialRampToValueAtTime(K.kick.f1, t + 0.07)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(K.kick.vol * v, t + 0.002)
      g.gain.setTargetAtTime(0, t + 0.02, K.kick.dec / 4)
      s.connect(g).connect(dest)
      s.start(t)
      s.stop(t + K.kick.dec * 1.8)
      if (K.kick.click > 0) noise(o, t, { dur: 0.012, vol: K.kick.click * v, flt: { type: 'bandpass', f: 2600, q: 0.8 } })
      if (K.kick.sq > 0) tone(o, t, { w: 'square', f: K.kick.f0 * 0.7, f2: K.kick.f1, fs: 0.06, dur: 0.12, vol: K.kick.sq * v, flt: { type: 'lowpass', f: 400 } })
      return
    }
    case 's':
      tone(o, t, { w: 'triangle', f: K.snare.tone * 1.5, f2: K.snare.tone, fs: 0.04, dur: 0.11, vol: K.snare.vol * 0.7 * v })
      noise(o, t, { dur: K.snare.dec, vol: K.snare.vol * v, flt: { type: 'bandpass', f: K.snare.bp, q: 0.6 } })
      return
    case 'c': {
      const src = ctx.createBufferSource()
      src.buffer = res(ctx).white
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = K.clap.f
      bp.Q.value = 1.2
      const g = ctx.createGain()
      const pk = K.clap.vol * v
      g.gain.setValueAtTime(0, t)
      for (let i = 0; i < 3; i++) {
        g.gain.setValueAtTime(pk, t + i * 0.011)
        g.gain.setTargetAtTime(pk * 0.15, t + i * 0.011 + 0.001, 0.003)
      }
      g.gain.setValueAtTime(pk, t + 0.034)
      g.gain.setTargetAtTime(0, t + 0.035, 0.045)
      src.connect(bp).connect(g).connect(dest)
      src.start(t, Math.random())
      src.stop(t + 0.3)
      return
    }
    case 'h':
    case 'o':
      noise(o, t, { dur: d === 'h' ? K.hat.dec : K.hat.open, vol: K.hat.vol * v * (d === 'o' ? 0.8 : 1), flt: { type: 'highpass', f: K.hat.f, q: 0.9 } })
      return
    case 'r':
      tone(o, t, { w: 'triangle', f: K.rim.f, dur: 0.035, vol: K.rim.vol * v })
      noise(o, t, { dur: 0.018, vol: K.rim.vol * 0.6 * v, flt: { type: 'bandpass', f: 2400, q: 1.5 } })
      return
    case 't':
    case 'm':
    case 'n': {
      const f = K.tom.f * (d === 't' ? 1 : d === 'm' ? 1.33 : 1.7)
      tone(o, t, { f: f * 1.6, f2: f, fs: 0.12, dur: 0.42, vol: K.tom.vol * v })
      noise(o, t, { dur: 0.05, vol: K.tom.vol * 0.25 * v, flt: { type: 'lowpass', f: 900 } })
      return
    }
    case 'x':
      noise(o, t, { dur: 1.3, vol: K.crash.vol * v, flt: { type: 'highpass', f: 3800, q: 0.5 }, flt2: { type: 'lowpass', f: 9500, f2: 5000 } })
      return
    case 'p':
      noise(o, t, { dur: 0.07, a: 0.012, vol: K.shaker.vol * v, flt: { type: 'bandpass', f: 6200, q: 1.1 } })
      return
    case 'b': {
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = K.metal.f * 2.2
      bp.Q.value = 3
      bp.connect(dest)
      const md = { ctx, out: bp }
      for (const r of [1, 1.47, 2.13]) tone(md, t, { w: 'square', f: K.metal.f * r, dur: 0.24, vol: K.metal.vol * v })
      return
    }
  }
}
