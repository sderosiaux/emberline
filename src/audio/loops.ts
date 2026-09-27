// Sustained sounds driven by the game each frame (beam weapon, charge-up, low-hull alarm).

import { type Ctx, holdAt } from './core'
import { osc } from './synth'
import type { LoopName } from './types'

export interface LoopVoice {
  set(vol: number | undefined, pitch: number | undefined): void
  stop(): void
}

interface Built {
  out: GainNode
  sources: AudioScheduledSourceNode[]
  level: number
  retune: (pitch: number, at: number) => void
}

function lfo(ctx: Ctx, rate: number, depth: number, target: AudioParam, w: OscillatorType = 'sine'): OscillatorNode {
  const l = ctx.createOscillator()
  l.type = w
  l.frequency.value = rate
  const g = ctx.createGain()
  g.gain.value = depth
  l.connect(g).connect(target)
  return l
}

function beam(ctx: Ctx, _t: number, pitch: number): Built {
  const base = 110
  const ratios = [1, 1.006, 2, 0.5]
  const gains = [0.5, 0.5, 0.18, 0.5]
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 1100
  lp.Q.value = 3
  const trem = ctx.createGain()
  trem.gain.value = 0.85
  const out = ctx.createGain()
  lp.connect(trem).connect(out)
  const oscs = ratios.map((r, i) => {
    const o = osc(ctx, i < 2 ? 'sawtooth' : 'sine', base * r * pitch)
    const g = ctx.createGain()
    g.gain.value = gains[i]
    o.connect(g).connect(lp)
    return o
  })
  const l1 = lfo(ctx, 2.7, 300, lp.frequency)
  const l2 = lfo(ctx, 11, 0.15, trem.gain)
  return {
    out, level: 0.11, sources: [...oscs, l1, l2],
    retune: (p, at) => {
      oscs.forEach((o, i) => o.frequency.setTargetAtTime(base * ratios[i] * p, at, 0.04))
      lp.frequency.setTargetAtTime(900 + 500 * p, at, 0.05)
    },
  }
}

function charge(ctx: Ctx, t: number, pitch: number): Built {
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 2400
  const out = ctx.createGain()
  lp.connect(out)
  const a = osc(ctx, 'sawtooth', 200 * pitch)
  const b = osc(ctx, 'sine', 400 * pitch)
  const bg = ctx.createGain()
  bg.gain.value = 0.6
  a.connect(lp)
  b.connect(bg).connect(lp)
  for (const [o, m] of [[a, 1], [b, 2]] as const) {
    o.frequency.setValueAtTime(200 * m * pitch, t)
    o.frequency.exponentialRampToValueAtTime(820 * m * pitch, t + 1.3)
  }
  const v = lfo(ctx, 9, 18, a.detune)
  const v2 = lfo(ctx, 9, 18, b.detune)
  return {
    out, level: 0.06, sources: [a, b, v, v2],
    retune: (p, at) => {
      holdAt(a.frequency, at)
      holdAt(b.frequency, at)
      a.frequency.setTargetAtTime(820 * p, at, 0.15)
      b.frequency.setTargetAtTime(1640 * p, at, 0.15)
    },
  }
}

function alarm(ctx: Ctx, _t: number, pitch: number): Built {
  const o = osc(ctx, 'triangle', 420 * pitch)
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 1400
  const trem = ctx.createGain()
  trem.gain.value = 0.55
  const out = ctx.createGain()
  o.connect(lp).connect(trem).connect(out)
  const step = lfo(ctx, 1.6, 55, o.frequency, 'square')
  const tr = lfo(ctx, 3.2, 0.45, trem.gain)
  return {
    out, level: 0.07, sources: [o, step, tr],
    retune: (p, at) => o.frequency.setTargetAtTime(420 * p, at, 0.05),
  }
}

const BUILDERS: Record<LoopName, (ctx: Ctx, t: number, pitch: number) => Built> = { beam, charge, alarm }

export function startLoop(ctx: Ctx, dest: AudioNode, name: LoopName, vol: number, pitch0: number): LoopVoice {
  let pitch = pitch0
  const t = ctx.currentTime
  const b = BUILDERS[name](ctx, t, pitch0)
  const g = b.out.gain
  let v = vol
  g.setValueAtTime(0, t)
  g.setTargetAtTime(b.level * v, t, 0.03)
  b.out.connect(dest)
  for (const s of b.sources) s.start(t)
  let alive = true
  return {
    set(nv, np) {
      if (!alive) return
      const now = ctx.currentTime
      if (nv !== undefined && nv !== v) {
        v = nv
        g.setTargetAtTime(b.level * Math.max(0, Math.min(1, v)), now, 0.04)
      }
      if (np !== undefined && Math.abs(np - pitch) > 0.002) {
        pitch = np
        b.retune(np, now)
      }
    },
    stop() {
      if (!alive) return
      alive = false
      const now = ctx.currentTime
      holdAt(g, now)
      g.setTargetAtTime(0, now, 0.03)
      for (const s of b.sources) s.stop(now + 0.25)
      b.sources[0].onended = () => b.out.disconnect()
    },
  }
}
