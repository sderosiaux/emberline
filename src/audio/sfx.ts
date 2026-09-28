// Sound effect definitions: voice limits, routing, and the synthesized recipe for each sound.
// Samples from public/sfx (see samples.ts) are what normally plays; a recipe is the fallback when a
// sample couldn't load. Each recipe returns its duration so the voice manager knows when to recycle it.
// Loudness targets (pre-master): rapid-fire weapons ~0.1, hits ~0.05, explosions 0.3-0.6.
// Player sounds are square/saw/noise based; everything the Choir fires is a formant "vowel" voice.

import { type Mixer, mtof } from './core'
import { playNote, playPad, type SynthPreset } from './instruments'
import { type Dst, fm, formant, noise, tone } from './synth'
import type { Sample } from './samples'
import type { SfxName } from './types'

export interface SfxCtx extends Dst {
  t: number
  /** pitch multiplier */
  p: number
  r: () => number
}

export interface SfxDef {
  /** max simultaneous voices of this sound (oldest is stolen) */
  cap: number
  /** min seconds between two triggers (extra triggers are dropped) */
  gap: number
  /** 1 low .. 3 critical; decides who gets stolen when the global pool is full */
  prio: number
  /** random pitch spread (±fraction) */
  jitter?: number
  /** reverb send */
  wet?: number
  /** plays through the UI bus: ignores pause */
  ui?: boolean
  /** level trim applied on the voice gain (synth recipe only; samples carry their calibrated gain) */
  lvl?: number
  /** maps the requested pitch before playing (e.g. snap to a scale) */
  tune?: (p: number) => number
  fn: (c: SfxCtx) => number
}

const brass: SynthPreset = { osc: [{ w: 'sawtooth', det: -8 }, { w: 'sawtooth', det: 8 }], vol: 0.13, a: 0.02, d: 0.3, s: 0.7, r: 0.25, lp: { f: 1500, q: 1.2, env: 1.5, dec: 0.25, kt: 0.5 }, vib: { rate: 5, cents: 12, delay: 0.3 } }
const chime: SynthPreset = { osc: [{ w: 'sine' }], fm: { ratio: 3.5, index: 1.4, dec: 0.4, sus: 0.05 }, vol: 0.12, a: 0.002, d: 0.8, s: 0, r: 0.4 }

/** Major-pentatonic snap so credit streaks climb a melody instead of sliding. */
function pentPitch(p: number): number {
  const semis = 12 * Math.log2(Math.max(0.25, p))
  const oct = Math.floor(semis / 12)
  const within = semis - oct * 12
  const steps = [0, 2, 4, 7, 9, 12]
  let best = 0
  for (const s of steps) if (Math.abs(s - within) < Math.abs(best - within)) best = s
  return 2 ** ((oct * 12 + best) / 12)
}

function boom(c: SfxCtx, t: number, size: number, vol: number): void {
  const { p } = c
  noise(c, t, { kind: 'brown', dur: 0.3 + size * 0.9, vol: vol, flt: { type: 'lowpass', f: 1800 * p, f2: 140 * p, q: 0.8 } })
  tone(c, t, { f: 110 * p, f2: 30 * p, fs: 0.3 + size * 0.4, dur: 0.25 + size * 0.7, vol: vol * 0.9 })
  noise(c, t, { kind: 'pink', dur: 0.08 + size * 0.05, vol: vol * 0.35, flt: { type: 'bandpass', f: 1200 * p, q: 0.8 } })
}

function crackle(c: SfxCtx, t: number, n: number, span: number, vol: number): void {
  for (let i = 0; i < n; i++) {
    const at = t + c.r() * span
    noise(c, at, { dur: 0.02 + c.r() * 0.03, vol: vol * (0.5 + c.r() * 0.5), flt: { type: 'bandpass', f: (1500 + c.r() * 2500) * c.p, q: 2 } })
  }
}

function clank(c: SfxCtx, t: number, f: number, vol: number): void {
  for (const r of [1, 1.47, 2.09]) tone(c, t, { w: 'square', f: f * r * c.p, dur: 0.25, vol: vol, flt: { type: 'bandpass', f: f * 2.4 * c.p, q: 2.5 } })
  noise(c, t, { dur: 0.05, vol: vol * 1.5, flt: { type: 'bandpass', f: 2200 * c.p, q: 1.2 } })
}

function notes(c: SfxCtx, list: [number, number, number][], P: SynthPreset, semis = 0): void {
  for (const [at, midi, len] of list) playNote(c.ctx, c.out, c.t + at, len, midi + semis, 1, P)
}

export const SFX: Record<SfxName, SfxDef> = {
  // ------------------------------------------------ player weapons
  shot_pulse: { lvl: 2.5, cap: 4, gap: 0.035, prio: 1, jitter: 0.04, fn: (c) => {
    tone(c, c.t, { w: 'square', f: 900 * c.p, f2: 430 * c.p, dur: 0.07, vol: 0.075, flt: { type: 'lowpass', f: 3500 } })
    noise(c, c.t, { dur: 0.015, vol: 0.018, flt: { type: 'highpass', f: 3000 } })
    return 0.08
  } },
  shot_scatter: { lvl: 2.5, cap: 3, gap: 0.05, prio: 1, jitter: 0.05, fn: (c) => {
    noise(c, c.t, { kind: 'pink', dur: 0.13, vol: 0.2, flt: { type: 'bandpass', f: 1300 * c.p, f2: 380 * c.p, q: 0.9 } })
    tone(c, c.t, { w: 'square', f: 230 * c.p, f2: 85 * c.p, dur: 0.1, vol: 0.07, flt: { type: 'lowpass', f: 1400 } })
    return 0.14
  } },
  shot_arc: { lvl: 3, cap: 3, gap: 0.04, prio: 1, jitter: 0.06, fn: (c) => {
    const o = c.ctx.createOscillator()
    o.type = 'sawtooth'
    for (let i = 0; i < 6; i++) o.frequency.setValueAtTime((500 + c.r() * 1300) * c.p, c.t + i * 0.017)
    const bp = c.ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 2100
    bp.Q.value = 1.8
    const g = c.ctx.createGain()
    g.gain.setValueAtTime(0.11, c.t)
    g.gain.exponentialRampToValueAtTime(0.001, c.t + 0.11)
    o.connect(bp).connect(g).connect(c.out)
    o.start(c.t)
    o.stop(c.t + 0.12)
    noise(c, c.t, { dur: 0.06, vol: 0.04, flt: { type: 'highpass', f: 4000 } })
    return 0.12
  } },
  shot_missile: { lvl: 2.2, cap: 4, gap: 0.05, prio: 1, jitter: 0.08, fn: (c) => {
    noise(c, c.t, { kind: 'pink', dur: 0.32, a: 0.03, vol: 0.13, flt: { type: 'bandpass', f: 400 * c.p, f2: 2000 * c.p, q: 1.4 } })
    tone(c, c.t, { f: 130 * c.p, f2: 60 * c.p, dur: 0.08, vol: 0.14 })
    return 0.33
  } },
  shot_bloom: { lvl: 1.5, cap: 3, gap: 0.06, prio: 1, jitter: 0.05, fn: (c) => {
    tone(c, c.t, { f: 190 * c.p, f2: 55 * c.p, fs: 0.15, dur: 0.2, vol: 0.3 })
    tone(c, c.t, { w: 'triangle', f: 380 * c.p, f2: 120 * c.p, dur: 0.12, vol: 0.09, flt: { type: 'bandpass', f: 500, q: 3 } })
    noise(c, c.t, { dur: 0.07, vol: 0.07, flt: { type: 'lowpass', f: 700 } })
    return 0.21
  } },
  shot_helix: { lvl: 2.4, cap: 4, gap: 0.035, prio: 1, jitter: 0.03, fn: (c) => {
    tone(c, c.t, { w: 'triangle', f: 1000 * c.p, f2: 700 * c.p, dur: 0.12, vol: 0.07, vib: [32, 70] })
    tone(c, c.t, { w: 'triangle', f: 1500 * c.p, f2: 1050 * c.p, dur: 0.12, vol: 0.05, vib: [27, 90] })
    return 0.13
  } },
  shot_rail: { lvl: 1.6, cap: 2, gap: 0.08, prio: 2, jitter: 0.03, wet: 0.2, fn: (c) => {
    noise(c, c.t, { dur: 0.22, vol: 0.2, flt: { type: 'highpass', f: 1500 * c.p }, flt2: { type: 'lowpass', f: 7000 } })
    tone(c, c.t, { w: 'sawtooth', f: 110 * c.p, f2: 38 * c.p, dur: 0.35, vol: 0.2, flt: { type: 'lowpass', f: 1300, f2: 200 } })
    tone(c, c.t, { f: 2400 * c.p, f2: 300 * c.p, fs: 0.1, dur: 0.12, vol: 0.05 })
    return 0.36
  } },
  shot_mine: { lvl: 1.8, cap: 3, gap: 0.06, prio: 1, jitter: 0.05, fn: (c) => {
    tone(c, c.t, { w: 'triangle', f: 300 * c.p, f2: 140 * c.p, dur: 0.09, vol: 0.18 })
    noise(c, c.t, { dur: 0.04, vol: 0.08, flt: { type: 'lowpass', f: 900 } })
    return 0.1
  } },
  shot_drone: { lvl: 2, cap: 3, gap: 0.05, prio: 1, jitter: 0.06, fn: (c) => {
    tone(c, c.t, { w: 'square', f: 1700 * c.p, f2: 850 * c.p, dur: 0.045, vol: 0.035, flt: { type: 'lowpass', f: 4000 } })
    return 0.05
  } },

  // ------------------------------------------------ enemy (formant "choir" voices)
  enemy_shot: { lvl: 3.5, cap: 5, gap: 0.04, prio: 1, jitter: 0.07, fn: (c) => {
    formant(c, c.t, { f: 330 * c.p, f2: 250 * c.p, v: 'o', v2: 'u', dur: 0.13, vol: 0.13, a: 0.008 })
    return 0.14
  } },
  enemy_shot_heavy: { lvl: 1.6, cap: 3, gap: 0.07, prio: 1, jitter: 0.05, fn: (c) => {
    formant(c, c.t, { f: 150 * c.p, f2: 105 * c.p, v: 'a', v2: 'o', dur: 0.26, vol: 0.2 })
    tone(c, c.t, { f: 75 * c.p, f2: 55 * c.p, dur: 0.2, vol: 0.16 })
    return 0.27
  } },
  enemy_missile: { lvl: 2.2, cap: 3, gap: 0.08, prio: 1, jitter: 0.05, fn: (c) => {
    formant(c, c.t, { f: 220 * c.p, f2: 440 * c.p, v: 'i', v2: 'a', dur: 0.36, vol: 0.13, a: 0.03 })
    noise(c, c.t, { kind: 'pink', dur: 0.3, a: 0.05, vol: 0.06, flt: { type: 'bandpass', f: 600 * c.p, f2: 1600 * c.p, q: 1.5 } })
    return 0.37
  } },
  enemy_laser_charge: { lvl: 1.3, cap: 2, gap: 0.2, prio: 2, fn: (c) => {
    formant(c, c.t, { f: 110 * c.p, f2: 440 * c.p, v: 'u', v2: 'i', dur: 0.9, vol: 0.14, a: 0.6, vib: [7, 25] })
    return 0.92
  } },
  enemy_laser_fire: { lvl: 1.5, cap: 2, gap: 0.15, prio: 2, wet: 0.2, fn: (c) => {
    formant(c, c.t, { f: 220 * c.p, f2: 180 * c.p, v: 'a', dur: 0.6, vol: 0.18, a: 0.01, vib: [11, 30] })
    formant(c, c.t, { f: 221.5 * c.p, f2: 181 * c.p, v: 'e', dur: 0.6, vol: 0.1, a: 0.01 })
    noise(c, c.t, { dur: 0.08, vol: 0.08, flt: { type: 'bandpass', f: 2500, q: 1 } })
    return 0.62
  } },

  // ------------------------------------------------ hits & explosions
  hit_small: { lvl: 2, cap: 3, gap: 0.05, prio: 1, jitter: 0.1, fn: (c) => {
    tone(c, c.t, { w: 'triangle', f: 1500 * c.p, f2: 1100 * c.p, dur: 0.025, vol: 0.04 })
    noise(c, c.t, { dur: 0.02, vol: 0.03, flt: { type: 'bandpass', f: 2800, q: 1.2 } })
    return 0.03
  } },
  hit_armor: { lvl: 2, cap: 3, gap: 0.06, prio: 1, jitter: 0.06, fn: (c) => {
    fm(c, c.t, { f: 1250 * c.p, ratio: 2.76, index: 1.6, idec: 0.05, dur: 0.18, vol: 0.06 })
    tone(c, c.t, { f: 2900 * c.p, dur: 0.07, vol: 0.02 })
    return 0.19
  } },
  expl_small: { lvl: 1.8, cap: 6, gap: 0.03, prio: 1, jitter: 0.1, wet: 0.1, fn: (c) => {
    noise(c, c.t, { kind: 'pink', dur: 0.25, vol: 0.28, flt: { type: 'lowpass', f: 2500 * c.p, f2: 380 * c.p } })
    tone(c, c.t, { f: 140 * c.p, f2: 50 * c.p, dur: 0.15, vol: 0.26 })
    return 0.26
  } },
  expl_medium: { lvl: 1.3, cap: 4, gap: 0.05, prio: 2, jitter: 0.08, wet: 0.2, fn: (c) => {
    boom(c, c.t, 0.35, 0.45)
    return 0.7
  } },
  expl_large: { cap: 3, gap: 0.08, prio: 3, jitter: 0.05, wet: 0.3, fn: (c) => {
    boom(c, c.t, 1.1, 0.55)
    crackle(c, c.t + 0.18, 10, 1.1, 0.07)
    return 1.45
  } },
  expl_huge: { cap: 1, gap: 0.5, prio: 3, wet: 0.35, fn: (c) => {
    const { t, p } = c
    boom(c, t, 1, 0.55)
    boom(c, t + 0.45, 1.2, 0.45)
    crackle(c, t + 0.2, 16, 2.2, 0.07)
    noise(c, t + 0.9, { kind: 'brown', dur: 2.2, a: 0.5, vol: 0.4, flt: { type: 'lowpass', f: 300 * p, f2: 1200 * p, fs: 0.8, q: 1.5 } })
    tone(c, t + 0.9, { w: 'sawtooth', f: 180 * p, f2: 35 * p, dur: 2.2, a: 0.3, vol: 0.1, flt: { type: 'lowpass', f: 700, f2: 120 } })
    tone(c, t + 0.1, { f: 48 * p, f2: 24 * p, dur: 3, a: 0.2, vol: 0.4 })
    boom(c, t + 1.4, 1.3, 0.35)
    return 3.2
  } },

  // ------------------------------------------------ shields / hull
  shield_hit: { lvl: 4, cap: 2, gap: 0.07, prio: 2, jitter: 0.05, fn: (c) => {
    noise(c, c.t, { dur: 0.16, vol: 0.13, flt: { type: 'bandpass', f: 3000 * c.p, f2: 1800 * c.p, q: 3 } })
    tone(c, c.t, { f: 900 * c.p, f2: 1400 * c.p, dur: 0.12, vol: 0.05, vib: [40, 60] })
    return 0.17
  } },
  hull_hit: { cap: 2, gap: 0.08, prio: 2, jitter: 0.04, fn: (c) => {
    noise(c, c.t, { kind: 'brown', dur: 0.28, vol: 0.5, flt: { type: 'lowpass', f: 900 * c.p } })
    tone(c, c.t, { w: 'square', f: 90 * c.p, f2: 42 * c.p, dur: 0.22, vol: 0.2, flt: { type: 'lowpass', f: 500 } })
    tone(c, c.t, { f: 60 * c.p, dur: 0.32, vol: 0.15 })
    tone(c, c.t, { f: 64 * c.p, dur: 0.32, vol: 0.15 })
    noise(c, c.t + 0.02, { kind: 'pink', dur: 0.1, vol: 0.18, flt: { type: 'bandpass', f: 650, q: 2 } })
    return 0.33
  } },
  shield_down: { cap: 1, gap: 0.3, prio: 3, fn: (c) => {
    const P: SynthPreset = { osc: [{ w: 'square' }], vol: 0.09, a: 0.005, d: 0.2, s: 0.6, r: 0.08, lp: { f: 1800 } }
    notes(c, [[0, 76, 0.12], [0.14, 72, 0.12], [0.28, 67, 0.3]], P)
    tone(c, c.t + 0.28, { w: 'sawtooth', f: 800 * c.p, f2: 180 * c.p, dur: 0.55, vol: 0.06, flt: { type: 'lowpass', f: 1600, f2: 300 } })
    return 0.9
  } },
  shield_restored: { cap: 1, gap: 0.3, prio: 2, wet: 0.3, fn: (c) => {
    notes(c, [[0, 72, 0.2], [0.07, 76, 0.2], [0.14, 79, 0.2], [0.21, 84, 0.4]], chime)
    return 0.9
  } },
  low_hull: { cap: 1, gap: 0.5, prio: 2, fn: (c) => {
    tone(c, c.t, { w: 'triangle', f: 520 * c.p, dur: 0.13, vol: 0.14 })
    tone(c, c.t + 0.16, { w: 'triangle', f: 440 * c.p, dur: 0.16, vol: 0.14 })
    return 0.33
  } },

  // ------------------------------------------------ pickups
  pickup_credit: { lvl: 1.6, cap: 4, gap: 0.03, prio: 2, tune: pentPitch, fn: (c) => {
    const { p } = c
    tone(c, c.t, { w: 'square', f: 988 * p, dur: 0.045, vol: 0.06, flt: { type: 'lowpass', f: 5000 } })
    tone(c, c.t + 0.045, { w: 'square', f: 1319 * p, dur: 0.11, vol: 0.06, flt: { type: 'lowpass', f: 5000 } })
    return 0.16
  } },
  pickup_big: { lvl: 1.3, cap: 2, gap: 0.08, prio: 2, wet: 0.15, fn: (c) => {
    const f = [1047, 1319, 1568, 2093]
    f.forEach((x, i) => {
      tone(c, c.t + i * 0.05, { w: 'square', f: x * c.p, dur: 0.12, vol: 0.05, flt: { type: 'lowpass', f: 5000 } })
      tone(c, c.t + i * 0.05, { w: 'triangle', f: x * c.p * 0.5, dur: 0.14, vol: 0.07 })
    })
    return 0.35
  } },
  pickup_repair: { cap: 1, gap: 0.2, prio: 2, wet: 0.2, fn: (c) => {
    tone(c, c.t, { f: 300 * c.p, f2: 620 * c.p, dur: 0.4, a: 0.05, vol: 0.14, vib: [12, 40] })
    tone(c, c.t + 0.08, { w: 'triangle', f: 450 * c.p, f2: 930 * c.p, dur: 0.35, a: 0.05, vol: 0.08 })
    return 0.45
  } },
  pickup_special: { lvl: 1.5, cap: 1, gap: 0.2, prio: 2, wet: 0.3, fn: (c) => {
    ;[0, 2, 4, 6, 8, 10].forEach((s, i) => fm(c, c.t + i * 0.045, { f: mtof(76 + s) * c.p, ratio: 2, index: 1.2, dur: 0.2, vol: 0.06 }))
    return 0.5
  } },
  pickup_core: { cap: 1, gap: 0.5, prio: 3, wet: 0.5, fn: (c) => {
    for (const m of [57, 60, 64, 68]) formant(c, c.t, { f: mtof(m) * c.p, v: 'u', v2: 'a', dur: 1.2, a: 0.25, vol: 0.06 })
    fm(c, c.t + 0.15, { f: mtof(83) * c.p, ratio: 3.5, index: 1.5, dur: 1, vol: 0.06 })
    fm(c, c.t + 0.4, { f: mtof(80) * c.p, ratio: 3.5, index: 1.5, dur: 0.8, vol: 0.05 })
    return 1.25
  } },

  // ------------------------------------------------ specials
  special_ready: { cap: 1, gap: 0.3, prio: 2, wet: 0.25, fn: (c) => {
    notes(c, [[0, 79, 0.15], [0.1, 86, 0.35]], chime)
    return 0.8
  } },
  special_nova: { cap: 1, gap: 0.2, prio: 3, wet: 0.4, fn: (c) => {
    tone(c, c.t, { f: 70 * c.p, f2: 28 * c.p, dur: 0.9, vol: 0.5 })
    noise(c, c.t, { kind: 'brown', dur: 1, a: 0.08, vol: 0.45, flt: { type: 'lowpass', f: 250 * c.p, f2: 2500 * c.p, fs: 0.15, q: 2 } })
    noise(c, c.t + 0.1, { kind: 'pink', dur: 0.8, vol: 0.12, flt: { type: 'bandpass', f: 2500 * c.p, f2: 300 * c.p, q: 1 } })
    return 1.05
  } },
  special_overclock: { cap: 1, gap: 0.2, prio: 3, fn: (c) => {
    tone(c, c.t, { w: 'sawtooth', f: 55 * c.p, f2: 240 * c.p, lin: true, dur: 0.95, a: 0.05, vol: 0.14, flt: { type: 'lowpass', f: 300, f2: 2200, q: 4 } })
    tone(c, c.t, { w: 'sawtooth', f: 56.5 * c.p, f2: 243 * c.p, lin: true, dur: 0.95, a: 0.05, vol: 0.12, flt: { type: 'lowpass', f: 280, f2: 2000, q: 3 } })
    tone(c, c.t, { f: 40 * c.p, f2: 80 * c.p, dur: 0.95, vol: 0.2 })
    return 1
  } },
  special_phase: { lvl: 1.4, cap: 1, gap: 0.2, prio: 3, wet: 0.5, fn: (c) => {
    ;[1, 1.26, 1.5, 1.89, 2.52].forEach((r, i) => tone(c, c.t + i * 0.03, { f: 400 * r * c.p, f2: 1500 * r * c.p, dur: 0.75, a: 0.1, vol: 0.035, vib: [9 + i * 2, 60] }))
    noise(c, c.t, { dur: 0.7, a: 0.2, vol: 0.05, flt: { type: 'bandpass', f: 1500, f2: 6000, q: 4 } })
    return 0.8
  } },
  special_singularity: { cap: 1, gap: 0.3, prio: 3, wet: 0.4, fn: (c) => {
    noise(c, c.t, { kind: 'pink', dur: 1.05, a: 0.9, vol: 0.3, flt: { type: 'bandpass', f: 3000 * c.p, f2: 150 * c.p, q: 2 } })
    tone(c, c.t, { w: 'triangle', f: 220 * c.p, f2: 40 * c.p, dur: 1.05, a: 0.8, vol: 0.2 })
    tone(c, c.t + 1, { f: 90 * c.p, f2: 30 * c.p, dur: 0.35, vol: 0.5 })
    noise(c, c.t + 1, { kind: 'brown', dur: 0.3, vol: 0.3, flt: { type: 'lowpass', f: 600 } })
    return 1.4
  } },
  special_swarm: { lvl: 3.5, cap: 1, gap: 0.2, prio: 3, fn: (c) => {
    for (let i = 0; i < 8; i++) {
      const at = c.t + i * 0.055 + c.r() * 0.02
      const f = 450 + c.r() * 300
      noise(c, at, { kind: 'pink', dur: 0.22, a: 0.02, vol: 0.07, flt: { type: 'bandpass', f: f * c.p, f2: f * 4 * c.p, q: 1.6 } })
      tone(c, at, { w: 'square', f: (1400 + c.r() * 400) * c.p, f2: 700 * c.p, dur: 0.04, vol: 0.025, flt: { type: 'lowpass', f: 3500 } })
    }
    return 0.7
  } },

  // ------------------------------------------------ misc gameplay
  energy_empty: { lvl: 1.6, cap: 1, gap: 0.2, prio: 1, fn: (c) => {
    tone(c, c.t, { w: 'square', f: 110 * c.p, dur: 0.1, vol: 0.1, flt: { type: 'lowpass', f: 450 } })
    tone(c, c.t, { w: 'square', f: 116 * c.p, dur: 0.1, vol: 0.06, flt: { type: 'lowpass', f: 450 } })
    return 0.11
  } },
  boss_warning: { cap: 1, gap: 1, prio: 3, wet: 0.25, fn: (c) => {
    for (let i = 0; i < 3; i++) {
      const at = c.t + i * 0.62
      tone(c, at, { w: 'sawtooth', f: 280 * c.p, f2: 560 * c.p, fs: 0.4, lin: true, dur: 0.5, a: 0.04, vol: 0.14, flt: { type: 'lowpass', f: 1600, q: 2 } })
      formant(c, at, { f: 140 * c.p, f2: 280 * c.p, v: 'o', v2: 'a', dur: 0.5, a: 0.04, vol: 0.1 })
    }
    tone(c, c.t, { w: 'sawtooth', f: 55 * c.p, dur: 2, a: 0.2, vol: 0.1, flt: { type: 'lowpass', f: 300 } })
    return 2.05
  } },
  boss_phase: { cap: 1, gap: 0.5, prio: 3, wet: 0.3, fn: (c) => {
    clank(c, c.t, 180, 0.05)
    clank(c, c.t + 0.16, 150, 0.05)
    clank(c, c.t + 0.38, 120, 0.06)
    tone(c, c.t + 0.1, { w: 'sawtooth', f: 180 * c.p, f2: 520 * c.p, dur: 0.65, a: 0.1, vol: 0.08, flt: { type: 'lowpass', f: 900, q: 4 } })
    boom(c, c.t + 0.4, 0.6, 0.35)
    return 1.25
  } },
  boss_part: { cap: 2, gap: 0.15, prio: 3, wet: 0.25, fn: (c) => {
    noise(c, c.t, { kind: 'brown', dur: 0.5, vol: 0.45, flt: { type: 'lowpass', f: 1500 * c.p, f2: 300 * c.p } })
    clank(c, c.t, 210, 0.05)
    tone(c, c.t, { f: 90 * c.p, f2: 38 * c.p, dur: 0.4, vol: 0.35 })
    crackle(c, c.t + 0.1, 5, 0.4, 0.06)
    return 0.6
  } },
  secret: { lvl: 1.5, cap: 1, gap: 0.5, prio: 3, wet: 0.4, fn: (c) => {
    ;[0, 4, 6, 11, 14, 18, 16, 23].forEach((s, i) => fm(c, c.t + i * 0.075, { f: mtof(72 + s) * c.p, ratio: i % 2 ? 1.5 : 3, index: 1.2, dur: 0.25, vol: 0.06 }))
    formant(c, c.t + 0.62, { f: mtof(79) * c.p, f2: mtof(91) * c.p, v: 'i', v2: 'u', dur: 0.4, vol: 0.06, vib: [8, 60] })
    return 1.05
  } },

  // ------------------------------------------------ UI (ignores pause)
  ui_move: { lvl: 2, cap: 2, gap: 0.03, prio: 1, ui: true, fn: (c) => {
    tone(c, c.t, { w: 'triangle', f: 1200 * c.p, dur: 0.03, vol: 0.06 })
    return 0.035
  } },
  ui_select: { cap: 2, gap: 0.05, prio: 2, ui: true, fn: (c) => {
    tone(c, c.t, { w: 'triangle', f: 659 * c.p, dur: 0.06, vol: 0.1 })
    tone(c, c.t + 0.05, { w: 'triangle', f: 988 * c.p, dur: 0.09, vol: 0.1 })
    return 0.15
  } },
  ui_back: { cap: 2, gap: 0.05, prio: 2, ui: true, fn: (c) => {
    tone(c, c.t, { w: 'triangle', f: 988 * c.p, dur: 0.06, vol: 0.09 })
    tone(c, c.t + 0.05, { w: 'triangle', f: 659 * c.p, dur: 0.09, vol: 0.09 })
    return 0.15
  } },
  ui_buy: { cap: 2, gap: 0.08, prio: 2, ui: true, fn: (c) => {
    noise(c, c.t, { dur: 0.04, vol: 0.06, flt: { type: 'bandpass', f: 3500, q: 1.5 } })
    ;[79, 84, 88, 91].forEach((m, i) => fm(c, c.t + 0.03 + i * 0.05, { f: mtof(m) * c.p, ratio: 3.5, index: 1.3, dur: i === 3 ? 0.45 : 0.15, vol: 0.07 }))
    return 0.65
  } },
  ui_sell: { cap: 2, gap: 0.08, prio: 2, ui: true, fn: (c) => {
    ;[88, 84, 86, 81].forEach((m, i) => tone(c, c.t + i * 0.06, { w: 'square', f: mtof(m) * c.p, dur: 0.07, vol: 0.045, flt: { type: 'lowpass', f: 4500 } }))
    return 0.35
  } },
  ui_deny: { lvl: 1.4, cap: 1, gap: 0.12, prio: 2, ui: true, fn: (c) => {
    tone(c, c.t, { w: 'square', f: 140 * c.p, dur: 0.18, vol: 0.09, flt: { type: 'lowpass', f: 700 } })
    tone(c, c.t, { w: 'square', f: 148 * c.p, dur: 0.18, vol: 0.07, flt: { type: 'lowpass', f: 700 } })
    return 0.19
  } },
  ui_upgrade: { cap: 1, gap: 0.12, prio: 2, ui: true, fn: (c) => {
    ;[60, 64, 67, 72, 76].forEach((m, i) => tone(c, c.t + i * 0.05, { w: 'square', f: mtof(m) * c.p, dur: 0.1, vol: 0.05, flt: { type: 'lowpass', f: 3000 } }))
    tone(c, c.t, { w: 'sawtooth', f: 200 * c.p, f2: 900 * c.p, dur: 0.35, vol: 0.05, flt: { type: 'lowpass', f: 2000 } })
    fm(c, c.t + 0.25, { f: mtof(84) * c.p, ratio: 3.5, index: 1.2, dur: 0.35, vol: 0.06 })
    return 0.6
  } },

  // ------------------------------------------------ stingers
  mission_complete: { cap: 1, gap: 1, prio: 3, ui: true, wet: 0.35, fn: (c) => {
    const { ctx, out, t } = c
    const pad = { osc: [{ w: 'sawtooth' as const, det: -8 }, { w: 'sawtooth' as const, det: 8 }], vol: 0.05, a: 0.05, r: 0.8, lp: 1600 }
    notes(c, [[0, 67, 0.12], [0.13, 72, 0.12], [0.26, 76, 0.12], [0.39, 79, 0.3], [0.8, 80, 0.35], [1.2, 82, 0.35], [1.6, 84, 1.3]], brass)
    playPad(ctx, out, t + 0.8, 0.38, [56, 60, 63, 68], 1, pad)
    playPad(ctx, out, t + 1.2, 0.38, [58, 62, 65, 70], 1, pad)
    playPad(ctx, out, t + 1.6, 1.3, [60, 64, 67, 72], 1, pad)
    for (const [at, m] of [[0.8, 44], [1.2, 46], [1.6, 48]] as const) playNote(ctx, out, t + at, 0.35, m, 1, { osc: [{ w: 'sawtooth' }], vol: 0.2, a: 0.005, d: 0.3, s: 0.6, r: 0.2, lp: { f: 400 } })
    for (const at of [0.8, 1.2, 1.6]) tone(c, t + at, { f: 140, f2: 70, fs: 0.12, dur: 0.5, vol: 0.3 })
    fm(c, t + 1.6, { f: mtof(96), ratio: 3.5, index: 1, dur: 1.2, vol: 0.03 })
    return 3.2
  } },
  game_over: { cap: 1, gap: 1, prio: 3, ui: true, wet: 0.45, fn: (c) => {
    const { ctx, out, t } = c
    const pad = { osc: [{ w: 'sawtooth' as const, det: -7 }, { w: 'triangle' as const, det: 7 }], vol: 0.06, a: 0.2, r: 1, lp: 900 }
    playPad(ctx, out, t, 0.9, [55, 60, 63], 1, pad)
    playPad(ctx, out, t + 0.9, 0.9, [56, 60, 65], 1, pad)
    playPad(ctx, out, t + 1.8, 1.2, [55, 59, 62], 1, pad)
    const lead: SynthPreset = { ...brass, vol: 0.1, lp: { f: 1000 } }
    notes(c, [[0, 67, 0.8], [0.9, 68, 0.8], [1.8, 67, 0.5], [2.3, 60, 1]], lead)
    tone(c, t, { f: 65, dur: 3, a: 0.2, vol: 0.2 })
    return 3.4
  } },
  radio: { lvl: 1.4, cap: 1, gap: 0.2, prio: 2, fn: (c) => {
    noise(c, c.t, { dur: 0.16, vol: 0.06, flt: { type: 'bandpass', f: 2000, q: 1.5 } })
    tone(c, c.t + 0.02, { w: 'square', f: 1100 * c.p, dur: 0.06, vol: 0.05, flt: { type: 'lowpass', f: 3000 } })
    tone(c, c.t + 0.1, { w: 'square', f: 1400 * c.p, dur: 0.06, vol: 0.04, flt: { type: 'lowpass', f: 3000 } })
    return 0.2
  } },
  player_death: { cap: 1, gap: 1, prio: 3, wet: 0.4, fn: (c) => {
    boom(c, c.t, 1.1, 0.55)
    crackle(c, c.t + 0.1, 12, 1.2, 0.07)
    tone(c, c.t, { w: 'sawtooth', f: 800 * c.p, f2: 60 * c.p, dur: 1.4, vol: 0.08, flt: { type: 'lowpass', f: 2500, f2: 200 } })
    formant(c, c.t + 0.1, { f: 220 * c.p, f2: 70 * c.p, v: 'a', v2: 'u', dur: 1.5, vol: 0.1 })
    boom(c, c.t + 0.6, 0.8, 0.35)
    return 2
  } },
  chain_reaction: { cap: 2, gap: 0.2, prio: 3, wet: 0.3, fn: (c) => {
    for (let i = 0; i < 5; i++) {
      const at = c.t + i * (0.12 + c.r() * 0.08)
      const sub: SfxCtx = { ...c, p: c.p * (1.25 - i * 0.1) }
      boom(sub, at, 0.25 + i * 0.1, 0.32)
    }
    return 1.4
  } },
  shield_gen_down: { cap: 1, gap: 0.5, prio: 3, wet: 0.25, fn: (c) => {
    tone(c, c.t, { w: 'sawtooth', f: 900 * c.p, f2: 60 * c.p, dur: 1.2, vol: 0.09, flt: { type: 'lowpass', f: 4000, f2: 200 } })
    tone(c, c.t, { f: 1800 * c.p, f2: 120 * c.p, dur: 1.1, vol: 0.05 })
    noise(c, c.t, { dur: 0.25, vol: 0.08, flt: { type: 'bandpass', f: 3000, q: 3 } })
    tone(c, c.t + 1.15, { f: 110 * c.p, f2: 45 * c.p, dur: 0.25, vol: 0.3 })
    return 1.45
  } },
}

export interface Spawned {
  gain: GainNode
  tail: AudioNode
  dur: number
  src?: AudioScheduledSourceNode
}

/** Voice routing shared by samples and recipes: gain (vol) -> optional panner -> sfx/ui bus (+ reverb send). */
function route(mx: Mixer, def: SfxDef, level: number, pan: number): { gain: GainNode; tail: AudioNode } {
  const { ctx } = mx
  const gain = ctx.createGain()
  gain.gain.value = level
  let tail: AudioNode = gain
  if (pan !== 0) {
    const p = ctx.createStereoPanner()
    p.pan.value = Math.max(-1, Math.min(1, pan)) * 0.75
    gain.connect(p)
    tail = p
  }
  tail.connect(def.ui ? mx.uiIn : mx.sfxIn)
  if (def.wet) {
    const s = ctx.createGain()
    s.gain.value = def.wet
    tail.connect(s).connect(mx.sfxWetIn)
  }
  return { gain, tail }
}

/** Build one synthesized sfx voice (fallback path). */
export function spawnSfx(mx: Mixer, name: SfxName, t: number, vol: number, pitch: number, pan: number, r: () => number): Spawned {
  const def = SFX[name]
  const { gain, tail } = route(mx, def, vol * (def.lvl ?? 1), pan)
  const dur = def.fn({ ctx: mx.ctx, out: gain, t, p: def.tune ? def.tune(pitch) : pitch, r })
  return { gain, tail, dur }
}

/** Build one sample voice: pitch is playback rate, so it also scales the duration. */
export function spawnSample(mx: Mixer, name: SfxName, s: Sample, t: number, vol: number, pitch: number, pan: number): Spawned {
  const def = SFX[name]
  const { gain, tail } = route(mx, def, vol * s.gain, pan)
  const rate = Math.max(0.25, Math.min(4, def.tune ? def.tune(pitch) : pitch))
  const src = mx.ctx.createBufferSource()
  src.buffer = s.buf
  src.playbackRate.value = rate
  src.connect(gain)
  src.start(t)
  return { gain, tail, dur: s.buf.duration / rate, src }
}
