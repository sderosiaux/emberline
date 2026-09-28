import type { Enemy } from './entities'
import type { World } from './world'
import { PW, PH } from './consts'
import { clamp, lerp, easeInOutSine, angleDiff } from '../core/math'

/**
 * Movement controllers assigned by waves. Enemy defs own *attacks*; movers own
 * *where the enemy goes*, so the same fighter can swoop, strafe or hover.
 */
export interface Mover {
  update(e: Enemy, w: World, dt: number): void
  /** Mover wants the enemy removed (path finished off-screen). */
  done?: boolean
}

type Pt = [number, number]

/** Catmull-Rom path through points at constant-ish speed. Points may lie off-screen. */
export class PathMover implements Mover {
  done = false
  private seg = 0
  private u = 0
  private lens: number[] = []
  constructor(private pts: Pt[], private speed: number, private face = true, private loop = false) {
    for (let i = 0; i < pts.length - 1; i++) lensPush(this.lens, pts[i], pts[i + 1])
  }
  update(e: Enemy, _w: World, dt: number) {
    if (this.done) {
      // Keep flying along the final tangent at path speed so exits actually leave the screen.
      e.x += e.vx * dt; e.y += e.vy * dt
      if (e.x < -60 || e.x > PW + 60 || e.y < -60 || e.y > PH + 60) e.gone = true
      return
    }
    const n = this.pts.length
    this.u += (this.speed * dt) / Math.max(1, this.lens[this.seg])
    while (this.u >= 1) {
      this.u -= 1
      this.seg++
      if (this.seg >= n - 1) {
        if (this.loop) this.seg = 0
        else {
          this.done = true; this.seg = n - 2; this.u = 1
          const [ax, ay] = this.pts[n - 2], [bx, by] = this.pts[n - 1]
          const len = Math.hypot(bx - ax, by - ay) || 1
          e.vx = ((bx - ax) / len) * this.speed; e.vy = ((by - ay) / len) * this.speed
          e.x = bx; e.y = by
          return
        }
      }
    }
    const p0 = this.pts[Math.max(0, this.seg - 1)], p1 = this.pts[this.seg], p2 = this.pts[this.seg + 1], p3 = this.pts[Math.min(n - 1, this.seg + 2)]
    const t = Math.min(1, this.u)
    const x = cr(p0[0], p1[0], p2[0], p3[0], t), y = cr(p0[1], p1[1], p2[1], p3[1], t)
    e.vx = (x - e.x) / Math.max(dt, 1e-4)
    e.vy = (y - e.y) / Math.max(dt, 1e-4)
    e.x = x; e.y = y
    if (this.face && (e.vx !== 0 || e.vy !== 0)) {
      const target = Math.atan2(e.vy, e.vx) - Math.PI / 2
      e.rot += angleDiff(e.rot, target) * Math.min(1, dt * 10)
    }
  }
}

function lensPush(out: number[], a: Pt, b: Pt) { out.push(Math.hypot(b[0] - a[0], b[1] - a[1])) }
function cr(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t, t3 = t2 * t
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
}

/** Straight line with constant velocity (px/s). */
export class LineMover implements Mover {
  constructor(private vx: number, private vy: number, private face = false) {}
  update(e: Enemy, _w: World, dt: number) {
    e.vx = this.vx; e.vy = this.vy
    e.x += this.vx * dt; e.y += this.vy * dt
    if (this.face) e.rot = Math.atan2(this.vy, this.vx) - Math.PI / 2
  }
}

/** Descends while weaving horizontally. */
export class SineMover implements Mover {
  private t0: number
  constructor(private baseX: number, private vy: number, private amp: number, private freq: number, phase = 0) { this.t0 = phase }
  update(e: Enemy, _w: World, dt: number) {
    this.t0 += dt
    const nx = this.baseX + Math.sin(this.t0 * this.freq) * this.amp
    e.vx = (nx - e.x) / Math.max(dt, 1e-4)
    e.x = nx
    e.vy = this.vy
    e.y += this.vy * dt
    e.rot = -e.vx * 0.0015
  }
}

/** Fly to a station, hold (optionally drifting), then leave. */
export class HoverMover implements Mover {
  private phase: 0 | 1 | 2 = 0
  private t = 0
  private sx = 0
  private sy = 0
  private inited = false
  constructor(
    private tx: number, private ty: number, private enterTime: number, private hold: number,
    private exitVx = 0, private exitVy = -140, private drift = 0,
  ) {}
  update(e: Enemy, w: World, dt: number) {
    if (!this.inited) { this.sx = e.x; this.sy = e.y; this.inited = true }
    this.t += dt
    if (this.phase === 0) {
      const k = easeInOutSine(clamp(this.t / this.enterTime, 0, 1))
      e.x = lerp(this.sx, this.tx, k)
      e.y = lerp(this.sy, this.ty, k)
      if (this.t >= this.enterTime) { this.phase = 1; this.t = 0 }
    } else if (this.phase === 1) {
      if (this.drift) {
        const dx = w.player.x - e.x
        e.x += clamp(dx, -1, 1) * this.drift * dt
      }
      e.y = this.ty + Math.sin(e.age * 1.7) * 4
      if (this.t >= this.hold) { this.phase = 2; this.t = 0 }
    } else {
      e.vx = lerp(e.vx, this.exitVx, dt * 1.5)
      e.vy = lerp(e.vy, this.exitVy, dt * 1.5)
      e.x += e.vx * dt
      e.y += e.vy * dt
      e.noCull = false
    }
  }
}

/** Ground objects: locked to terrain scroll, optional crawl along the ground. */
export class GroundMover implements Mover {
  constructor(private vx = 0, private vy = 0) {}
  update(e: Enemy, w: World, dt: number) {
    e.x += this.vx * dt
    e.y += (w.scroll + this.vy) * dt
  }
}

/** Homing steering (interceptors, kamikazes). */
export class SeekMover implements Mover {
  constructor(private speed: number, private turn: number, private seekTime = 99) {}
  update(e: Enemy, w: World, dt: number) {
    const ang = Math.atan2(e.vy, e.vx)
    let na = ang
    if (e.age < this.seekTime && w.player.alive) {
      const want = Math.atan2(w.player.y - e.y, w.player.x - e.x)
      na = ang + clamp(angleDiff(ang, want), -this.turn * dt, this.turn * dt)
    }
    e.vx = Math.cos(na) * this.speed
    e.vy = Math.sin(na) * this.speed
    e.x += e.vx * dt
    e.y += e.vy * dt
    e.rot = na - Math.PI / 2
  }
}

/** Waypoint helpers for level scripts: 'L' = left edge, etc. */
export const X = (f: number) => f * PW
export const Y = (f: number) => f * PH
