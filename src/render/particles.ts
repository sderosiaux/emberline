import { glowTexture } from './sprites'
import { TAU } from '../core/math'

export const enum P { Glow, Spark, Smoke, Debris, Ring, Flash, Fire, Ember }

/** Color table: index → css. Keep small; each gets a cached glow texture. */
export const PCOL = [
  '#ffffff', // 0 white
  '#ffd27a', // 1 warm yellow
  '#ff7a1a', // 2 ember orange
  '#ff3b2e', // 3 red
  '#ff2e88', // 4 choir magenta
  '#76f2ff', // 5 cyan
  '#9dff6a', // 6 green
  '#c49bff', // 7 violet
  '#6fa8ff', // 8 blue
  '#3a3440', // 9 smoke dark
  '#8a8290', // 10 smoke light
  '#c6ff3d', // 11 credit
  '#ffe9b0', // 12 pale gold
  '#e8f6ff', // 13 ice
] as const
export const C = {
  white: 0, yellow: 1, orange: 2, red: 3, magenta: 4, cyan: 5, green: 6, violet: 7, blue: 8,
  smokeDark: 9, smokeLight: 10, credit: 11, gold: 12, ice: 13,
} as const

const N = 5000

export class Particles {
  x = new Float32Array(N); y = new Float32Array(N)
  vx = new Float32Array(N); vy = new Float32Array(N)
  life = new Float32Array(N); max = new Float32Array(N)
  size = new Float32Array(N); size2 = new Float32Array(N)
  rot = new Float32Array(N); spin = new Float32Array(N)
  drag = new Float32Array(N)
  type = new Uint8Array(N); col = new Uint8Array(N)
  ground = new Uint8Array(N)
  alive = new Uint8Array(N)
  private free: number[] = []
  private top = 0
  count = 0
  private tex: HTMLCanvasElement[] = []
  private softTex: HTMLCanvasElement[] = []
  /** Global density multiplier (settings: reduced effects). */
  density = 1

  constructor() {
    if (typeof document !== 'undefined') {
      this.tex = PCOL.map((c) => glowTexture(c, 64, 0.18))
      this.softTex = PCOL.map((c) => glowTexture(c, 64, 0.0))
    }
  }

  spawn(type: P, x: number, y: number, vx: number, vy: number, life: number, size: number, size2: number, col: number, drag = 0, ground = false) {
    let i: number
    if (this.free.length) i = this.free.pop()!
    else if (this.top < N) i = this.top++
    else return -1
    this.alive[i] = 1
    this.type[i] = type
    this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy
    this.life[i] = life; this.max[i] = life
    this.size[i] = size; this.size2[i] = size2
    this.col[i] = col
    this.drag[i] = drag
    this.rot[i] = Math.random() * TAU
    this.spin[i] = (Math.random() - 0.5) * 10
    this.ground[i] = ground ? 1 : 0
    this.count++
    return i
  }

  clear() {
    this.alive.fill(0)
    this.free.length = 0
    this.top = 0
    this.count = 0
  }

  update(dt: number, scroll: number) {
    for (let i = 0; i < this.top; i++) {
      if (!this.alive[i]) continue
      const l = (this.life[i] -= dt)
      if (l <= 0) { this.alive[i] = 0; this.free.push(i); this.count--; continue }
      const d = this.drag[i]
      if (d > 0) {
        const k = Math.exp(-d * dt)
        this.vx[i] *= k; this.vy[i] *= k
      }
      this.x[i] += this.vx[i] * dt
      this.y[i] += this.vy[i] * dt + (this.ground[i] ? scroll * dt : 0)
      this.rot[i] += this.spin[i] * dt
    }
  }

  /** Normal-blended layer: smoke, debris. */
  drawNormal(ctx: CanvasRenderingContext2D, groundOnly: boolean) {
    for (let i = 0; i < this.top; i++) {
      if (!this.alive[i]) continue
      if ((this.ground[i] === 1) !== groundOnly) continue
      const t = this.type[i]
      if (t !== P.Smoke && t !== P.Debris) continue
      const k = 1 - this.life[i] / this.max[i]
      const s = this.size[i] + (this.size2[i] - this.size[i]) * k
      if (t === P.Smoke) {
        ctx.globalAlpha = (1 - k) * (k < 0.1 ? k * 10 : 1) * 0.55
        ctx.drawImage(this.softTex[this.col[i]], this.x[i] - s, this.y[i] - s, s * 2, s * 2)
      } else {
        ctx.globalAlpha = Math.min(1, (1 - k) * 2)
        ctx.save()
        ctx.translate(this.x[i], this.y[i])
        ctx.rotate(this.rot[i])
        ctx.fillStyle = PCOL[this.col[i]]
        ctx.fillRect(-s / 2, -s / 3, s, s * 0.66)
        ctx.restore()
      }
    }
    ctx.globalAlpha = 1
  }

  /** Additive layer: glows, sparks, fire, rings, flashes. */
  drawAdd(ctx: CanvasRenderingContext2D) {
    ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i < this.top; i++) {
      if (!this.alive[i]) continue
      const t = this.type[i]
      if (t === P.Smoke || t === P.Debris) continue
      const k = 1 - this.life[i] / this.max[i]
      const s = this.size[i] + (this.size2[i] - this.size[i]) * k
      const x = this.x[i], y = this.y[i]
      switch (t) {
        case P.Glow:
        case P.Ember: {
          ctx.globalAlpha = 1 - k
          ctx.drawImage(this.tex[this.col[i]], x - s, y - s, s * 2, s * 2)
          break
        }
        case P.Fire: {
          ctx.globalAlpha = (1 - k) * 0.9
          const c = k < 0.25 ? 1 : k < 0.6 ? 2 : 3
          ctx.drawImage(this.softTex[k < 0.12 ? 0 : c], x - s, y - s, s * 2, s * 2)
          break
        }
        case P.Flash: {
          ctx.globalAlpha = (1 - k) ** 2
          ctx.drawImage(this.softTex[this.col[i]], x - s, y - s, s * 2, s * 2)
          break
        }
        case P.Spark: {
          ctx.globalAlpha = 1 - k
          ctx.strokeStyle = PCOL[this.col[i]]
          ctx.lineWidth = s
          const len = 0.028
          ctx.beginPath()
          ctx.moveTo(x, y)
          ctx.lineTo(x - this.vx[i] * len, y - this.vy[i] * len)
          ctx.stroke()
          break
        }
        case P.Ring: {
          ctx.globalAlpha = (1 - k) * 0.8
          ctx.strokeStyle = PCOL[this.col[i]]
          ctx.lineWidth = Math.max(1, 5 * (1 - k))
          ctx.beginPath()
          ctx.arc(x, y, s, 0, TAU)
          ctx.stroke()
          break
        }
      }
    }
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }
}
