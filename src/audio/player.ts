// Step sequencer for one track. Driven either by the realtime lookahead timer (scheduleUntil called
// every ~25 ms with now+lookahead) or once for a whole offline render.

import { type Ctx, holdAt } from './core'
import { type Arrangement, type Ev, type Layer, type TrackSpec, LAYERS } from './composer'
import { playDrum, playNote, playPad } from './instruments'

const DEFAULT_MIN: Record<Layer, number> = { pad: 0, bass: 0, drums: 1, arp: 1, lead: 2, counter: 3, perc: 3 }
const DEFAULT_MIX: Record<Layer, number> = { pad: 0.6, bass: 0.65, drums: 0.4, arp: 0.8, lead: 1, counter: 0.5, perc: 0.6 }
const DEFAULT_REV: Record<Layer, number> = { pad: 0.5, bass: 0, drums: 0.1, arp: 0.35, lead: 0.35, counter: 0.4, perc: 0.15 }
const DEFAULT_DLY: Record<Layer, number> = { pad: 0, bass: 0, drums: 0, arp: 0.18, lead: 0.16, counter: 0, perc: 0 }

export interface PlayerOpts {
  ctx: Ctx
  out: AudioNode
  wet: AudioNode
  spec: TrackSpec
  arr: Arrangement
  start: number
  /** intensity for absolute bar n, read once at each bar boundary */
  level: (bar: number) => number
  /** tools only: restrict to these layers */
  solo?: Layer[]
}

export class SongPlayer {
  readonly out: GainNode
  private readonly wetOut: GainNode
  private readonly dlyIn: GainNode
  private readonly fx: AudioNode[]
  private layers: Record<Layer, GainNode>
  private readonly on: Record<Layer, boolean>
  private readonly min: Record<Layer, number>
  private readonly mix: Record<Layer, number>
  private readonly stepDur: number
  private t: number
  private n = 0
  private step = 0
  private lvl = 0

  constructor(private readonly o: PlayerOpts) {
    const { ctx, spec } = o
    this.stepDur = 60 / spec.bpm / 4
    this.t = o.start
    this.min = { ...DEFAULT_MIN, ...spec.layerMin }
    this.mix = { ...DEFAULT_MIX, ...spec.mix }
    this.on = { pad: false, bass: false, drums: false, arp: false, lead: false, counter: false, perc: false }

    this.out = ctx.createGain()
    this.out.connect(o.out)
    this.wetOut = ctx.createGain()
    this.wetOut.connect(o.wet)

    this.dlyIn = ctx.createGain()
    const dly = ctx.createDelay(2)
    dly.delayTime.value = Math.min(1.9, this.stepDur * 4 * (spec.delayBeats ?? 0.75))
    const fb = ctx.createGain()
    fb.gain.value = 0.32
    const damp = ctx.createBiquadFilter()
    damp.type = 'lowpass'
    damp.frequency.value = 2600
    this.dlyIn.connect(dly).connect(damp).connect(fb).connect(dly)
    damp.connect(this.out)
    damp.connect(this.wetOut)
    this.fx = [this.dlyIn, dly, damp, fb]

    this.layers = this.buildLayers()
  }

  private buildLayers(): Record<Layer, GainNode> {
    const { ctx, spec } = this.o
    const rev = { ...DEFAULT_REV, ...spec.rev }
    const dly = { ...DEFAULT_DLY, ...spec.dly }
    const out = {} as Record<Layer, GainNode>
    for (const l of LAYERS) {
      const g = ctx.createGain()
      g.gain.value = 0
      g.connect(this.out)
      if (rev[l] > 0) {
        const s = ctx.createGain()
        s.gain.value = rev[l]
        g.connect(s).connect(this.wetOut)
      }
      if (dly[l] > 0) {
        const s = ctx.createGain()
        s.gain.value = dly[l]
        g.connect(s).connect(this.dlyIn)
      }
      out[l] = g
    }
    return out
  }

  private wants(l: Layer): boolean {
    if (this.o.solo && !this.o.solo.includes(l)) return false
    return this.lvl >= this.min[l]
  }

  private enterBar(): void {
    this.lvl = this.o.level(this.n)
    const beat = this.stepDur * 4
    for (const l of LAYERS) {
      const want = this.wants(l)
      if (want === this.on[l]) continue
      this.on[l] = want
      const p = this.layers[l].gain
      holdAt(p, this.t)
      if (want) p.setTargetAtTime(this.mix[l], this.t, 0.012)
      else p.setTargetAtTime(0, this.t, beat / 3)
    }
  }

  private play(e: Ev, t: number): void {
    const { ctx, spec } = this.o
    const sd = this.stepDur
    if (e.k === 'd') {
      if (this.on[e.l]) playDrum(ctx, this.layers[e.l], t, e.d, e.v, spec.kit)
      return
    }
    if (e.k === 'p') {
      if (!this.on.pad) return
      const dur = e.len * sd
      if (spec.pad.poly) for (const m of e.ms) playNote(ctx, this.layers.pad, t, dur, m, e.v, spec.pad.poly)
      else if (spec.pad.p) playPad(ctx, this.layers.pad, t, dur, e.ms, e.v, spec.pad.p)
      return
    }
    const dur = e.len * sd
    switch (e.l) {
      case 'bass':
        if (this.on.bass && this.lvl > 0) playNote(ctx, this.layers.bass, t, dur, e.m, e.v, spec.bass.p)
        return
      case 'bassS':
        if (this.on.bass && this.lvl === 0) playNote(ctx, this.layers.bass, t, dur, e.m, e.v, spec.bass.p)
        return
      case 'arp':
        if (this.on.arp) playNote(ctx, this.layers.arp, t, dur, e.m, e.v, spec.arp.p)
        return
      case 'lead':
        if (this.on.lead) playNote(ctx, this.layers.lead, t, dur * 0.94, e.m, e.v, spec.lead.p, e.g)
        return
      case 'counter':
        if (this.on.counter) playNote(ctx, this.layers.counter, t, dur, e.m, e.v, spec.counter.p)
        return
    }
  }

  private barIndex(): number {
    const { bars, loopFrom } = this.o.arr
    if (this.n < bars.length) return this.n
    return loopFrom + ((this.n - bars.length) % (bars.length - loopFrom))
  }

  /** Schedule every step that starts before `until`. */
  scheduleUntil(until: number): void {
    const { arr, spec } = this.o
    const swing = (spec.swing ?? 0) * this.stepDur
    while (this.t < until) {
      if (this.step === 0) this.enterBar()
      const bar = arr.bars[this.barIndex()]
      const tt = this.t + (this.step % 2 === 1 ? swing : 0)
      for (const e of bar.steps[this.step]) this.play(e, tt)
      this.advance()
    }
  }

  private advance(): void {
    this.t += this.stepDur
    if (++this.step >= this.o.arr.N) {
      this.step = 0
      this.n++
    }
  }

  /** After a timer stall (background tab), skip missed steps instead of firing them all at once. */
  catchUp(now: number): void {
    while (this.t < now) {
      if (this.step === 0) this.lvl = this.o.level(this.n)
      this.advance()
    }
  }

  get nextTime(): number {
    return this.t
  }

  /** Silence everything already scheduled (pause). */
  halt(at: number): void {
    for (const l of LAYERS) {
      const g = this.layers[l]
      holdAt(g.gain, at)
      g.gain.setTargetAtTime(0, at, 0.015)
      setTimeout(() => g.disconnect(), 400)
    }
  }

  /** Continue from the current musical position with a fresh set of layer buses. */
  resume(at: number): void {
    this.t = at
    this.layers = this.buildLayers()
    for (const l of LAYERS) {
      this.on[l] = this.wants(l)
      if (this.on[l]) this.layers[l].gain.setTargetAtTime(this.mix[l], at, 0.03)
    }
  }

  /** Linear fade of the whole track (dry + wet); `from` restarts the ramp from a given level. */
  fade(to: number, at: number, seconds: number, from?: number): void {
    for (const g of [this.out.gain, this.wetOut.gain]) {
      if (from === undefined) holdAt(g, at)
      else g.setValueAtTime(from, at)
      g.linearRampToValueAtTime(to, at + Math.max(0.01, seconds))
    }
  }

  dispose(): void {
    for (const n of [this.out, this.wetOut, ...this.fx]) n.disconnect()
    for (const l of LAYERS) this.layers[l].disconnect()
  }
}
