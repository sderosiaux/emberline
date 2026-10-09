import type { World } from './world'
import type { Enemy } from './entities'
import type { Mover } from './movers'
import { PathMover, LineMover, SineMover, HoverMover, GroundMover, SeekMover, HordeMover } from './movers'
import type { RevealOpts } from './camera'
import { PW, PH } from './consts'
import type { BiomeId } from '../render/backgrounds'
import type { TrackId } from '../audio/audio'
import { audio } from '../audio/audio'

export interface MissionDef {
  id: string
  /** Display number, e.g. "03" or "??". */
  num: string
  name: string
  biome: BiomeId
  track: TrackId
  scroll: number
  briefing: string[]
  /** Optional short note shown in results for secrets hinting. */
  script(L: LevelScript): void
}

type Step = { t: number; fn: (w: World) => void; gate?: 'air' | 'boss' | 'flag'; flag?: string; timeout?: number; mark?: 'reveal' }

/** Where a formation member starts and how it moves. */
export interface Slot { x: number; y: number; mover: Mover | null }
export type Formation = (i: number, n: number) => Slot

/**
 * Level scripting DSL. A mission script is plain code that appends timed steps;
 * `gate()` pauses the timeline until the air is clear so pacing adapts to the
 * player's firepower instead of piling waves on top of each other.
 */
export class LevelScript {
  steps: Step[] = []
  t = 0
  constructor(public mission: MissionDef) {}

  at(t: number) { this.t = t; return this }
  wait(dt: number) { this.t += dt; return this }
  do(fn: (w: World) => void) { this.steps.push({ t: this.t, fn }); return this }

  /** Pause timeline until air enemies are gone (or timeout). */
  gate(timeout = 18) { this.steps.push({ t: this.t, fn: () => {}, gate: 'air', timeout }); return this }
  /** Pause until a world flag is set (e.g. boss defeated). */
  until(flag: string, timeout = 9999) { this.steps.push({ t: this.t, fn: () => {}, gate: 'flag', flag, timeout }); return this }

  wave(id: string, n: number, gap: number, f: Formation, opts: { elite?: boolean; hp?: number; tag?: string; onSpawn?: (e: Enemy, w: World, i: number) => void } = {}) {
    for (let i = 0; i < n; i++) {
      const t0 = this.t + i * gap
      this.steps.push({
        t: t0, fn: (w) => {
          const s = f(i, n)
          const e = w.spawn(id, s.x, s.y, { mover: s.mover, elite: opts.elite, hp: opts.hp, tag: opts.tag })
          opts.onSpawn?.(e, w, i)
        },
      })
    }
    return this
  }

  /** Spawn a ground unit at the top edge, scrolling with terrain. */
  ground(id: string, x: number, opts: { vx?: number; vy?: number; tag?: string; y?: number; elite?: boolean; onSpawn?: (e: Enemy, w: World) => void } = {}) {
    this.steps.push({
      t: this.t, fn: (w) => {
        const e = w.spawn(id, x, opts.y ?? -40, { mover: new GroundMover(opts.vx ?? 0, opts.vy ?? 0), tag: opts.tag, elite: opts.elite ?? false })
        opts.onSpawn?.(e, w)
      },
    })
    return this
  }

  decor(sprite: string, x: number, o: { y?: number; depth?: number; rot?: number; scale?: number; vx?: number; alpha?: number; above?: boolean } = {}) {
    this.steps.push({
      t: this.t, fn: (w) => w.decor.push({ sprite, x, y: o.y ?? -200, rot: o.rot ?? 0, scale: o.scale ?? 1, depth: o.depth ?? 1, vx: o.vx ?? 0, alpha: o.alpha ?? 1, above: o.above ?? false }),
    })
    return this
  }

  radio(who: string, text: string, tone: 'ally' | 'enemy' | 'odd' = 'ally') { return this.do((w) => w.emit({ type: 'radio', who, text, tone })) }
  banner(text: string, sub?: string) { return this.do((w) => w.emit({ type: 'banner', text, sub })) }
  phase(name: string) { return this.do((w) => w.events.push({ type: 'phase', name })) }
  intensity(level: 0 | 1 | 2 | 3) { return this.do((w) => { if (!w.preview) audio.music.setIntensity(level) }) }
  /** Strategic pull-back: show what is massing above the field, then push back in. */
  reveal(o: RevealOpts & { banner?: string } = {}) { this.steps.push({ t: this.t, fn: (w) => w.reveal(o), mark: 'reveal' }); return this }

  /**
   * A massed formation staged far above the field (only visible on a pull-back), rows
   * listed front to back: `[enemyId, count]`. Pair with `reveal()` and a `gate()`.
   */
  horde(rows: [string, number][], o: { vy?: number; x0?: number; x1?: number; gap?: number; elite?: boolean } = {}) {
    const gap = o.gap ?? 54
    rows.forEach(([id, n], r) => this.wave(id, n, 0, F.horde(r, o.vy ?? 75, gap, o.x0, o.x1), { elite: o.elite }))
    return this
  }

  scroll(speed: number, over = 2) {
    return this.do((w) => {
      const from = w.scroll, t0 = w.time
      const step = () => {
        const k = Math.min(1, (w.time - t0) / over)
        w.scroll = from + (speed - from) * k
        if (k < 1) w.after(0.05, step)
      }
      step()
    })
  }
}

export class LevelRunner {
  private i = 0
  t = 0
  private gateT = 0
  done = false
  constructor(public L: LevelScript, private w: World) {
    L.steps.sort((a, b) => a.t - b.t)
  }

  get progress() { return this.L.steps.length ? this.i / this.L.steps.length : 1 }

  update(dt: number) {
    const w = this.w
    const steps = this.L.steps
    while (this.i < steps.length) {
      const s = steps[this.i]
      if (s.t > this.t) break
      if (s.gate) {
        this.gateT += dt
        const clear = s.gate === 'air'
          ? !w.enemies.some((e) => e.layer === 'air' && !e.dead && !e.gone && !e.s.ignoreGate)
          : w.flags.has(s.flag!)
        if (!clear && this.gateT < (s.timeout ?? 18)) return
        this.gateT = 0
        // shift remaining schedule so relative spacing after the gate is preserved
        const lag = this.t - s.t
        for (let k = this.i + 1; k < steps.length; k++) steps[k].t += lag
      }
      s.fn(w)
      this.i++
    }
    this.t += dt
    if (this.i >= steps.length) this.done = true
  }
}

// ───────────────────────── formations ─────────────────────────

type Pt = [number, number]
const off = (pts: Pt[], dx: number, dy: number): Pt[] => pts.map(([x, y]) => [x + dx, y + dy])

export const F = {
  /** Straight down in a column at x. */
  column: (x: number, vy = 170, spacing = 0): Formation => (i) => ({ x, y: -30 - i * spacing, mover: new LineMover(0, vy, false) }),
  /** Horizontal line entering from top, all descending together. */
  line: (vy = 120, x0 = 80, x1 = PW - 80): Formation => (i, n) => ({ x: x0 + ((x1 - x0) * i) / Math.max(1, n - 1), y: -30, mover: new LineMover(0, vy) }),
  /** V formation descending. */
  vee: (cx: number, vy = 140, sx = 40, sy = 30): Formation => (i) => {
    const k = Math.ceil(i / 2) * (i % 2 ? -1 : 1)
    return { x: cx + k * sx, y: -30 - Math.abs(k) * sy, mover: new LineMover(0, vy) }
  },
  sine: (x: number, amp = 90, freq = 2, vy = 120): Formation => (i) => ({ x, y: -30, mover: new SineMover(x, vy, amp, freq, -i * 0.35) }),
  /** Follow a path; members queue along it (spawned over time with wave gap). */
  path: (pts: Pt[], speed = 220, loop = false): Formation => () => ({ x: pts[0][0], y: pts[0][1], mover: new PathMover(pts, speed, true, loop) }),
  /** Mirror a path left/right alternately for crossing patterns. */
  cross: (pts: Pt[], speed = 220): Formation => (i) => {
    const p = i % 2 ? pts.map(([x, y]) => [PW - x, y] as Pt) : pts
    return { x: p[0][0], y: p[0][1], mover: new PathMover(p, speed) }
  },
  /** Enter to station positions spread across the top, hold, then leave. */
  hover: (y = 140, hold = 6, x0 = 90, x1 = PW - 90, exitVy = -120): Formation => (i, n) => {
    const tx = n === 1 ? (x0 + x1) / 2 : x0 + ((x1 - x0) * i) / (n - 1)
    return { x: tx, y: -50, mover: new HoverMover(tx, y + (i % 2) * 24, 1.4, hold, 0, exitVy) }
  },
  hoverAt: (tx: number, ty: number, hold = 6, fromX?: number, exitVy = -120): Formation => () => ({ x: fromX ?? tx, y: -60, mover: new HoverMover(tx, ty, 1.6, hold, 0, exitVy) }),
  /** From a side edge, sweeping across. side -1 = from left. */
  sweep: (side: -1 | 1, y: number, vx = 200, vy = 30): Formation => (i) => ({ x: side < 0 ? -30 - i * 36 : PW + 30 + i * 36, y: y + i * 6, mover: new LineMover(-side * vx, vy) }),
  /** Swoop in from top corner, arc through the middle, exit the opposite side. */
  swoop: (side: -1 | 1, depth = 0.45, speed = 240): Formation => () => {
    const L = side < 0
    const pts: Pt[] = L
      ? [[-30, 60], [PW * 0.25, PH * depth * 0.7], [PW * 0.5, PH * depth], [PW * 0.75, PH * depth * 0.6], [PW + 40, 40]]
      : [[PW + 30, 60], [PW * 0.75, PH * depth * 0.7], [PW * 0.5, PH * depth], [PW * 0.25, PH * depth * 0.6], [-40, 40]]
    return { x: pts[0][0], y: pts[0][1], mover: new PathMover(pts, speed) }
  },
  /** Dive: enter top, dip toward the lower screen, pull back up. */
  dive: (x: number, speed = 260): Formation => (i) => {
    const pts: Pt[] = [[x, -30], [x, PH * 0.35], [x + (i % 2 ? 90 : -90), PH * 0.6], [x + (i % 2 ? 160 : -160), PH * 0.3], [x + (i % 2 ? 200 : -200), -60]]
    return { x, y: -30, mover: new PathMover(pts, speed) }
  },
  /** Loop: enter from a side, loop once in the upper half, exit. */
  loop: (side: -1 | 1, cy = 200, r = 110, speed = 230): Formation => () => {
    const cx = PW / 2
    const s = side
    const pts: Pt[] = [[s < 0 ? -30 : PW + 30, cy - r], [cx - s * r * 0.2, cy - r], [cx + s * r, cy], [cx, cy + r], [cx - s * r, cy], [cx, cy - r], [cx + s * r * 1.4, cy - r * 0.4], [s < 0 ? PW + 40 : -40, cy + 40]]
    return { x: pts[0][0], y: pts[0][1], mover: new PathMover(pts, speed) }
  },
  seek: (x: number, speed = 240, turn = 2.6): Formation => () => ({ x, y: -30, mover: new SeekMover(speed, turn, 3.2) }),
  /** Drifting objects (asteroids, mines). */
  drift: (x: number, vx: number, vy: number): Formation => () => ({ x, y: -50, mover: new LineMover(vx, vy) }),
  /** Self-moving (enemy def controls movement). */
  self: (x: number, y = -30): Formation => () => ({ x, y, mover: null }),
  spreadSelf: (x0: number, x1: number, y = -30): Formation => (i, n) => ({ x: n === 1 ? (x0 + x1) / 2 : x0 + ((x1 - x0) * i) / (n - 1), y, mover: null }),
  offsetPath: (pts: Pt[], dx: number, dy: number, speed = 220) => F.path(off(pts, dx, dy), speed),
  /** Row `row` of a massed block staged above the field; members peel off left/right of centre. */
  horde: (row: number, vy = 75, gap = 54, x0 = 70, x1 = PW - 70): Formation => (i, n) => {
    const x = n === 1 ? (x0 + x1) / 2 : x0 + ((x1 - x0) * i) / (n - 1) + (row % 2 ? 16 : -16)
    const side = x < PW / 2 ? -1 : 1
    return { x, y: -150 - row * gap, mover: new HordeMover(x, vy, 110 + (row % 3) * 55 + Math.abs(x - PW / 2) * 0.12, side, row * 0.7 + i * 0.25) }
  },
}
