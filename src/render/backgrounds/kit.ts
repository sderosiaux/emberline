/**
 * Shared toolkit for procedural biome backgrounds.
 *
 * Ground layers are pre-rendered into tall "tiles" (560×TILE_H). Several tile
 * variants are generated per biome and chained in a pseudo-random order, so the
 * ground doesn't visibly loop. Seamless joins come from SeamNoise: every lattice
 * row that falls on a tile edge is hashed with a shared "seam" seed, so the top
 * and bottom edge of every variant carry the exact same noise profile while the
 * interior is unique to the variant.
 */
import { PW, PH } from '../../game/consts'
import { makeCanvas } from '../sprites'
import { clamp, fbm2, rng, smoothstep } from '../../core/math'

export type BiomeId = 'cinder' | 'glasswater' | 'rime' | 'shoals' | 'halo' | 'graveyard' | 'heart' | 'garden'

export interface Background {
  /** scroll = ground px/s this frame. */
  update(dt: number, scroll: number): void
  /** Draw under all entities. ctx is already translated & clipped to the 560×720 playfield (origin top-left of playfield). */
  drawBase(ctx: CanvasRenderingContext2D): void
  /** Atmosphere above air units but below bullets/HUD. */
  drawOver(ctx: CanvasRenderingContext2D): void
  /** Mid-mission change triggered by level scripts. Unknown names ignored. */
  setPhase(name: string): void
}

export type Ctx = CanvasRenderingContext2D

/**
 * What a draw call must cover. The normal frame is [0,W]×[0,H]; for a camera pull-back
 * the renderer raises `top` (the terrain still to come above the field, which the tile
 * chain already holds), and paints side columns with their own `salt` (another variant
 * order) and `shift` (another vertical phase) so they are new ground, not copies.
 * Always reset to zeros after use.
 */
export const area = { top: 0, salt: 0, shift: 0 }

/** fillRect over the whole frame being drawn (the field plus any extension above it). */
export function fillFrame(ctx: Ctx) { ctx.fillRect(0, -area.top, W, H + area.top) }
export const W = PW
export const H = PH
export const TILE_H = 1024
/** Noise fields are evaluated at 1/FS resolution then upscaled (painterly softness, 4× cheaper). */
export const FS = 2
export const FW = W / FS
export const FH = TILE_H / FS

// ───────────────────────────── hashing & noise ─────────────────────────────

export function hash3(x: number, y: number, s: number) {
  let t = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1440662683)) | 0
  t = Math.imul(t ^ (t >>> 13), 1274126177)
  t ^= t >>> 16
  t = Math.imul(t, 0x85ebca6b)
  t ^= t >>> 13
  return (t >>> 0) / 4294967296
}
export const hashi = (a: number, b: number) => (hash3(a, b, 0x2545) * 0x7fffffff) | 0

const sm = (t: number) => t * t * (3 - 2 * t)

/** Value noise, periodic-by-seam along y (see file header). Cell heights must divide `period`. */
export class SeamNoise {
  constructor(readonly period: number, readonly seed: number, readonly seam: number) {}

  val(x: number, y: number, cx: number, cy: number, salt = 0) {
    const fx = x / cx, fy = y / cy
    const ix = Math.floor(fx), iy = Math.floor(fy)
    const u = sm(fx - ix), v = sm(fy - iy)
    const rows = Math.max(1, Math.round(this.period / cy))
    let r0 = iy % rows
    if (r0 < 0) r0 += rows
    const r1 = r0 + 1 >= rows ? 0 : r0 + 1
    const s0 = (r0 === 0 ? this.seam : this.seed) + salt
    const s1 = (r1 === 0 ? this.seam : this.seed) + salt
    const a = hash3(ix, r0, s0), b = hash3(ix + 1, r0, s0)
    const c = hash3(ix, r1, s1), d = hash3(ix + 1, r1, s1)
    const top = a + (b - a) * u
    return top + (c + (d - c) * u - top) * v
  }

  fbm(x: number, y: number, cx: number, cy: number, oct: number, salt = 0) {
    let a = 0.5, s = 0, n = 0
    for (let o = 0; o < oct; o++) {
      s += a * this.val(x, y, cx, cy, salt + o * 101)
      n += a
      a *= 0.5
      cx *= 0.5
      cy = Math.max(1, cy * 0.5)
    }
    return s / n
  }

  ridge(x: number, y: number, cx: number, cy: number, oct: number, salt = 0) {
    return 1 - Math.abs(2 * this.fbm(x, y, cx, cy, oct, salt) - 1)
  }
}

/** Tile variant noise for a biome (field-space coordinates, period FH). */
export const tileNoise = (seed: number, variant: number) =>
  new SeamNoise(FH, hashi(seed, variant + 11), hashi(seed, 0xbeef))

// ───────────────────────────── colour ─────────────────────────────

export type RGB = [number, number, number]
export function hex(h: string): RGB {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
export const rgba = (h: string, a: number) => {
  const [r, g, b] = hex(h)
  return `rgba(${r},${g},${b},${a})`
}
/** 256-entry RGB lookup table from gradient stops. */
export function lut(stops: [number, string][]): Uint8Array {
  const o = new Uint8Array(768)
  const cs = stops.map(([t, c]) => [t, ...hex(c)] as [number, number, number, number])
  for (let i = 0; i < 256; i++) {
    const t = i / 255
    let k = 0
    while (k < cs.length - 2 && t > cs[k + 1][0]) k++
    const a = cs[k], b = cs[Math.min(k + 1, cs.length - 1)]
    const f = b[0] === a[0] ? 0 : clamp((t - a[0]) / (b[0] - a[0]), 0, 1)
    o[i * 3] = a[1] + (b[1] - a[1]) * f
    o[i * 3 + 1] = a[2] + (b[2] - a[2]) * f
    o[i * 3 + 2] = a[3] + (b[3] - a[3]) * f
  }
  return o
}
export const li = (t: number) => ((t < 0 ? 0 : t > 1 ? 1 : t) * 255 | 0) * 3

/** Scratch colour register used by per-pixel painters (avoids allocations). */
export const C = { r: 0, g: 0, b: 0 }
export function cSet(L: Uint8Array, t: number) {
  const j = li(t)
  C.r = L[j]; C.g = L[j + 1]; C.b = L[j + 2]
}
export function cMix(r: number, g: number, b: number, t: number) {
  if (t <= 0) return
  if (t > 1) t = 1
  C.r += (r - C.r) * t; C.g += (g - C.g) * t; C.b += (b - C.b) * t
}
export function cMixL(L: Uint8Array, lt: number, t: number) {
  const j = li(lt)
  cMix(L[j], L[j + 1], L[j + 2], t)
}
export function cMul(k: number) { C.r *= k; C.g *= k; C.b *= k }
export function cAdd(k: number) { C.r += k; C.g += k; C.b += k }
export function cOut(o: Uint8ClampedArray, i: number, a = 255) {
  o[i] = C.r; o[i + 1] = C.g; o[i + 2] = C.b; o[i + 3] = a
}

// ───────────────────────────── canvases ─────────────────────────────

export function canvas(w: number, h: number) {
  const c = makeCanvas(w, h)
  const x = c.getContext('2d')!
  x.lineCap = 'round'
  x.lineJoin = 'round'
  return [c, x] as const
}

/** A resumable bake step: yields periodically so heavy tiles can be spread over frames. */
export type Job<T> = Generator<void, T, void>

export function drain<T>(j: Job<T>): T {
  let r = j.next()
  while (!r.done) r = j.next()
  return r.value
}

/** Per-pixel painter. fn writes RGBA into o[i..i+3] (alpha defaults to opaque). */
export function* field(w: number, h: number, fn: (x: number, y: number, o: Uint8ClampedArray, i: number) => void): Job<HTMLCanvasElement> {
  const [c, x] = canvas(w, h)
  const img = x.createImageData(w, h)
  const d = img.data
  let i = 0
  for (let y = 0; y < h; y++) {
    for (let xx = 0; xx < w; xx++, i += 4) {
      d[i + 3] = 255
      fn(xx, y, d, i)
    }
    if ((y & 7) === 7) yield
  }
  x.putImageData(img, 0, 0)
  return c
}

export function* grid(w: number, h: number, fn: (x: number, y: number) => number): Job<Float32Array> {
  const a = new Float32Array(w * h)
  let i = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) a[i++] = fn(x, y)
    if ((y & 7) === 7) yield
  }
  return a
}

/** Directional light from the upper-left on a heightfield. >0 lit, <0 shadowed. */
export function slope(hf: Float32Array, w: number, h: number, x: number, y: number) {
  const xl = x > 0 ? x - 1 : x, xr = x < w - 1 ? x + 1 : x
  const yu = y > 0 ? y - 1 : y, yd = y < h - 1 ? y + 1 : y
  return -((hf[y * w + xr] - hf[y * w + xl]) + (hf[yd * w + x] - hf[yu * w + x]))
}

/** Upscale a low-res field onto a fresh full-size canvas. */
export function upscale(src: HTMLCanvasElement, w: number, h: number) {
  const [c, x] = canvas(w, h)
  x.imageSmoothingEnabled = true
  x.imageSmoothingQuality = 'high'
  x.drawImage(src, 0, 0, w, h)
  return [c, x] as const
}

const memo = new Map<string, unknown>()
/** Seed-independent textures (small, bounded set): cached for the page lifetime. */
export function cached<T>(key: string, make: () => T): T {
  if (!memo.has(key)) memo.set(key, make())
  return memo.get(key) as T
}

/**
 * Per-seed terrain (several MB of canvas each). The attract screen picks random
 * seeds, so an unbounded cache would grow on every menu visit until the browser
 * starts failing canvas allocations. Keep the most recent entries only; evicted
 * canvases stay alive for any instance still holding them and are freed by GC.
 */
const LRU_MAX = 12
const lru = new Map<string, unknown>()
export function cachedSeeded<T>(key: string, make: () => T): T {
  if (lru.has(key)) {
    const v = lru.get(key) as T
    lru.delete(key)
    lru.set(key, v)
    return v
  }
  const v = make()
  lru.set(key, v)
  while (lru.size > LRU_MAX) lru.delete(lru.keys().next().value as string)
  return v
}

// ───────────────────────────── scrolling ─────────────────────────────

/**
 * A biome's tile variants. Variant 0 bakes synchronously at creation; the rest
 * bake in small time slices from update() and join the rotation once ready.
 * Shared through `cached`, so a second instance reuses finished work.
 */
export class TileSet {
  readonly ready: HTMLCanvasElement[] = []
  private jobs: Job<HTMLCanvasElement>[] = []
  constructor(count: number, make: (v: number) => Job<HTMLCanvasElement>) {
    this.ready.push(drain(make(0)))
    for (let v = 1; v < count; v++) this.jobs.push(make(v))
  }
  bake(budgetMs = 1.2) {
    if (!this.jobs.length) return
    const end = performance.now() + budgetMs
    while (this.jobs.length && performance.now() < end) {
      const r = this.jobs[0].next()
      if (r.done) { this.ready.push(r.value); this.jobs.shift() }
    }
  }
}

/** Chains tile variants vertically; content moves down as `pos` grows. */
export class Scroller {
  pos = 0
  private chosenBy = [new Map<number, number>(), new Map<number, number>(), new Map<number, number>()]
  constructor(readonly set: TileSet, readonly seed: number, readonly th = TILE_H) {}

  /** Variant for tile k, fixed the first time k is needed; never the same twice in a row. */
  variant(k: number) {
    const chosen = this.chosenBy[area.salt % this.chosenBy.length]
    const hit = chosen.get(k)
    if (hit !== undefined) return hit
    const n = this.set.ready.length
    let v = Math.floor(hash3(k, 5 + area.salt * 17, this.seed) * n)
    const prev = chosen.get(k - 1)
    if (n > 1 && v === prev) v = (v + 1) % n
    chosen.set(k, v)
    chosen.delete(k - 4)
    return v
  }

  private get at() { return this.pos + area.shift }

  /** Screen y of tile k's top edge. Whole pixels: fractional joins leave a visible hairline. */
  top(k: number) { return Math.round(H + this.at - (k + 1) * this.th) }

  update(dt: number, speed: number) {
    this.pos += speed * dt
    this.set.bake()
  }

  /** sx selects a W-wide layer inside the tile (tiles may pack several layers side by side). */
  draw(ctx: Ctx, dx = 0, dy = 0, sx = 0) {
    const th = this.th, y0 = -area.top
    for (let k = Math.floor((this.at + dy) / th); ; k++) {
      const top = this.top(k) + Math.round(dy)
      if (top + th <= y0) break
      const sy = Math.max(0, y0 - top), ey = Math.min(th, H - top)
      const img = this.set.ready[this.variant(k)]
      if (ey > sy) ctx.drawImage(img, sx, sy, W, ey - sy, dx, top + sy, W, ey - sy)
      if (top <= y0) break
    }
  }

  /** Re-blit the ground strip [y, y+h) shifted horizontally (heat shimmer, glitches). */
  strip(ctx: Ctx, y: number, h: number, dx: number) {
    const th = this.th
    const k = Math.floor((this.at + H - y) / th)
    const top = this.top(k)
    let sy = y - top
    let sh = h
    if (sy < 0) { sh += sy; sy = 0 }
    if (sy + sh > th) sh = th - sy
    if (sh <= 0) return
    const img = this.set.ready[this.variant(k)]
    ctx.drawImage(img, 0, sy, W, sh, dx, top + sy, W, sh)
  }
}

/** Draw an image repeated vertically, content moving down with offset. */
export function vtile(ctx: Ctx, img: HTMLCanvasElement, offset: number, x = 0, w = img.width) {
  const h = img.height
  let y = (offset % h) - h
  while (y > -area.top) y -= h
  for (; y < H; y += h) ctx.drawImage(img, x, y, w, h)
}

/** Draw an image repeated in both axes. */
export function tile2(ctx: Ctx, img: HTMLCanvasElement, ox: number, oy: number, s = 1) {
  const w = img.width * s, h = img.height * s
  let x0 = (ox % w) - w
  if (x0 > 0) x0 -= w
  let y0 = (oy % h) - h
  while (y0 > -area.top) y0 -= h
  for (let y = y0; y < H; y += h) for (let x = x0; x < W; x += w) ctx.drawImage(img, x, y, w, h)
}

// ───────────────────────────── phases ─────────────────────────────

/** Linear 0↔1 fade toward a target, eased on read. */
export class Fader {
  v: number
  t: number
  constructor(v = 0, readonly dur = 2) { this.v = this.t = v }
  step(dt: number) {
    const k = dt / this.dur
    this.v = this.v < this.t ? Math.min(this.t, this.v + k) : Math.max(this.t, this.v - k)
  }
  get e() { return smoothstep(clamp(this.v, 0, 1)) }
}

// ───────────────────────────── shapes & textures ─────────────────────────────

export type Pt = [number, number]

/** Noisy closed blob outline. */
export function blob(cx: number, cy: number, rx: number, ry: number, seed: number, rough = 0.25, n = 48): Pt[] {
  const pts: Pt[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const u = Math.cos(a), v = Math.sin(a)
    const k = 1 + rough * (fbm2(u * 1.3 + 5, v * 1.3 + 5, seed, 4) * 2 - 1) * 1.6
    pts.push([cx + u * rx * k, cy + v * ry * k])
  }
  return pts
}

export function path(ctx: Ctx, pts: Pt[], dx = 0, dy = 0, s = 1, cx = 0, cy = 0) {
  ctx.beginPath()
  for (let i = 0; i < pts.length; i++) {
    const x = cx + (pts[i][0] - cx) * s + dx, y = cy + (pts[i][1] - cy) * s + dy
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
}

/** Smooth closed path through points (quadratic midpoints). */
export function smoothPath(ctx: Ctx, pts: Pt[], dx = 0, dy = 0) {
  const n = pts.length
  ctx.beginPath()
  const m = (i: number): Pt => {
    const a = pts[i % n], b = pts[(i + 1) % n]
    return [(a[0] + b[0]) / 2 + dx, (a[1] + b[1]) / 2 + dy]
  }
  const s = m(0)
  ctx.moveTo(s[0], s[1])
  for (let i = 1; i <= n; i++) {
    const p = pts[i % n], q = m(i)
    ctx.quadraticCurveTo(p[0] + dx, p[1] + dy, q[0], q[1])
  }
  ctx.closePath()
}

/** Soft cloud/fog sprite: fbm-shaped alpha inside an elliptical falloff. */
export function cloudSprite(w: number, h: number, seed: number, color: string, cover = 0.45, sharp = 3, scale = 0.018) {
  const [r, g, b] = hex(color)
  const lw = Math.ceil(w / 2), lh = Math.ceil(h / 2)
  const f = drain(field(lw, lh, (x, y, o, i) => {
    const u = (x / lw) * 2 - 1, v = (y / lh) * 2 - 1
    const fall = clamp(1 - (u * u + v * v), 0, 1)
    const n = fbm2(x * scale * 2, y * scale * 2, seed, 5)
    const a = clamp((n - cover) * sharp + fall * 0.9 - 0.45, 0, 1) * fall
    o[i] = r; o[i + 1] = g; o[i + 2] = b; o[i + 3] = a * 255
  }))
  return upscale(f, w, h)[0]
}

/** Vertically wrapping star field. */
export function starTile(w: number, h: number, seed: number, count: number, colors: string[], rMin: number, rMax: number, aMin: number, aMax: number, glowFrac = 0) {
  const [c, x] = canvas(w, h)
  const r = rng(seed)
  for (let i = 0; i < count; i++) {
    const px = r.range(0, w), py = r.range(0, h)
    const rr = rMin + (rMax - rMin) * r.next() ** 3
    const a = r.range(aMin, aMax)
    const col = r.pick(colors)
    for (const oy of [0, -h, h]) {
      const yy = py + oy
      if (yy < -12 || yy > h + 12) continue
      if (r.next() < glowFrac || rr > rMax * 0.7) {
        const g = x.createRadialGradient(px, yy, 0, px, yy, rr * 4)
        g.addColorStop(0, rgba(col, a * 0.5))
        g.addColorStop(1, rgba(col, 0))
        x.fillStyle = g
        x.fillRect(px - rr * 4, yy - rr * 4, rr * 8, rr * 8)
      }
      x.fillStyle = rgba(col, a)
      x.beginPath()
      x.arc(px, yy, rr, 0, Math.PI * 2)
      x.fill()
    }
  }
  return c
}

/** Soft radial sprite (cheaper than gradients per frame). */
export function softDot(size: number, color: string, hardness = 0) {
  const [c, x] = canvas(size, size)
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, rgba(color, 1))
  g.addColorStop(hardness, rgba(color, hardness > 0 ? 1 : 0.6))
  g.addColorStop(1, rgba(color, 0))
  x.fillStyle = g
  x.fillRect(0, 0, size, size)
  return c
}

/** Draw a centred image with rotation/scale/alpha. */
export function blit(ctx: Ctx, img: HTMLCanvasElement, x: number, y: number, rot = 0, s = 1, a = 1, sy = s) {
  const w = img.width * s, h = img.height * sy
  ctx.globalAlpha = a
  if (rot === 0) ctx.drawImage(img, x - w / 2, y - h / 2, w, h)
  else {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(rot)
    ctx.drawImage(img, -w / 2, -h / 2, w, h)
    ctx.restore()
  }
  ctx.globalAlpha = 1
}

/** Wrap a y coordinate into [-m, H+m). */
export function wrapY(y: number, m: number) {
  const span = H + 2 * m
  return ((((y + m) % span) + span) % span) - m
}
export function wrapX(x: number, m: number) {
  const span = W + 2 * m
  return ((((x + m) % span) + span) % span) - m
}
