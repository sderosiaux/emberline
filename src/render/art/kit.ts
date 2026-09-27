/**
 * Art kit shared by every painter in this folder: smooth/mirrored outlines,
 * a "lit body" fill (rim light upper-left, core shadow lower-right, ink line),
 * glass, lenses, rivets, hazard stripes, exhaust plumes and seeded rocks.
 */
import { PAL, lin, rad, light } from '../paint'

export type Ctx = CanvasRenderingContext2D
/** [x, y] or [x, y, 1] where the trailing 1 marks a sharp corner. */
export type Pt = [number, number] | [number, number, number]
export type PathFn = (c: Ctx) => void

const mid = (a: Pt, b: Pt): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]

/** Closed path through pts, rounded at every vertex except those flagged sharp. */
export function smoothPoly(c: Ctx, pts: Pt[]) {
  const n = pts.length
  c.beginPath()
  const s0 = pts[0][2] === 1
  if (s0) c.moveTo(pts[0][0], pts[0][1])
  else { const m = mid(pts[n - 1], pts[0]); c.moveTo(m[0], m[1]) }
  for (let k = s0 ? 1 : 0; k < n; k++) {
    const p = pts[k], q = pts[(k + 1) % n]
    if (p[2] === 1) c.lineTo(p[0], p[1])
    else { const m = mid(p, q); c.quadraticCurveTo(p[0], p[1], m[0], m[1]) }
  }
  c.closePath()
}

/**
 * Left/right symmetric outline from the right half (x ≥ 0 relative to cx,
 * listed top → bottom). Points on the axis must only be first/last.
 * kL/kR squash each side independently (used for banking).
 */
export function sym(cx: number, pts: Pt[], kL = 1, kR = 1): PathFn {
  const right: Pt[] = pts.map(p => [cx + p[0] * kR, p[1], p[2] ?? 0] as Pt)
  const left: Pt[] = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    if (p[0] === 0) continue
    left.push([cx - p[0] * kL, p[1], p[2] ?? 0])
  }
  const all = right.concat(left)
  return c => smoothPoly(c, all)
}

export function polyFn(pts: Pt[], smooth = false): PathFn {
  const sharp: Pt[] = smooth ? pts : pts.map(p => [p[0], p[1], 1] as Pt)
  return c => smoothPoly(c, sharp)
}

export function ellipseFn(x: number, y: number, rx: number, ry: number, rot = 0): PathFn {
  return c => { c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2) }
}

export function octagonFn(cx: number, cy: number, r: number, k = 0.41): PathFn {
  const a = r * k
  return polyFn([[cx - a, cy - r], [cx + a, cy - r], [cx + r, cy - a], [cx + r, cy + a], [cx + a, cy + r], [cx - a, cy + r], [cx - r, cy + a], [cx - r, cy - a]])
}

export function rrFn(x: number, y: number, w: number, h: number, r: number): PathFn {
  return c => { c.beginPath(); c.roundRect(x, y, w, h, r) }
}

/** Mirror a path function around x = cx (for drawing both wings with one outline). */
export function mirrored(cx: number, path: PathFn): PathFn {
  return c => { c.save(); c.translate(cx * 2, 0); c.scale(-1, 1); path(c); c.restore() }
}

export interface ShapeOpts { lw?: number; rim?: number; shade?: number; ink?: string }

/**
 * Fill a path as a lit volume: base fill, inner rim light along upper-left
 * edges, core shadow along lower-right edges, ink outline.
 */
export function shape(c: Ctx, path: PathFn, fill: string | CanvasGradient, o: ShapeOpts = {}) {
  const lw = o.lw ?? 1.2
  const rim = o.rim ?? 0.5
  const shade = o.shade ?? 0.4
  c.save()
  path(c)
  c.fillStyle = fill
  c.fill()
  c.save()
  path(c)
  c.clip()
  if (shade > 0) {
    c.save(); c.translate(-1.5, -1.7); path(c)
    c.strokeStyle = `rgba(8,6,16,${shade})`; c.lineWidth = 2.6; c.stroke(); c.restore()
  }
  if (rim > 0) {
    c.save(); c.translate(1, 1.2); path(c)
    c.strokeStyle = `rgba(255,255,255,${rim})`; c.lineWidth = 1.2; c.stroke(); c.restore()
  }
  c.restore()
  if (lw > 0) {
    path(c)
    c.strokeStyle = o.ink ?? PAL.ink
    c.lineWidth = lw
    c.stroke()
  }
  c.restore()
}

/** Soft specular bloom centred at (x, y), clipped to the path. */
export function gloss(c: Ctx, path: PathFn, x: number, y: number, r: number, a = 0.5) {
  c.save()
  path(c)
  c.clip()
  c.fillStyle = rad(c, x, y, r, [[0, `rgba(255,255,255,${a})`], [1, 'rgba(255,255,255,0)']])
  c.fillRect(x - r, y - r, r * 2, r * 2)
  c.restore()
}

/** Glass with a vertical gradient, inner glint and ink rim. */
export function glass(c: Ctx, path: PathFn, x0: number, y0: number, x1: number, y1: number,
  cols: [string, string, string] = ['#b8fff8', PAL.teal, PAL.tealDark], lw = 1) {
  c.save()
  path(c)
  c.fillStyle = lin(c, x0, y0, x1, y1, [[0, cols[0]], [0.4, cols[1]], [1, cols[2]]])
  c.fill()
  c.clip()
  c.globalAlpha = 0.75
  c.strokeStyle = '#ffffff'
  c.lineWidth = 0.9
  c.beginPath()
  const dx = x1 - x0, dy = y1 - y0
  c.moveTo(x0 + dx * 0.25 - 1.2, y0 + dy * 0.18)
  c.quadraticCurveTo(x0 + dx * 0.12 - 1.4, y0 + dy * 0.4, x0 + dx * 0.2 - 1.2, y0 + dy * 0.62)
  c.stroke()
  c.restore()
  if (lw > 0) { path(c); c.strokeStyle = PAL.ink; c.lineWidth = lw; c.stroke() }
}

/** A round lens: dark glass, coloured iris ring, hot pupil, white glint. */
export function lens(c: Ctx, x: number, y: number, r: number, iris: string, pupil = '#ffffff', glow = 0.6) {
  c.save()
  c.beginPath(); c.arc(x, y, r + 0.8, 0, Math.PI * 2)
  c.fillStyle = PAL.ink; c.fill()
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2)
  c.fillStyle = rad(c, x - r * 0.3, y - r * 0.3, r * 1.4, [[0, '#3a3450'], [0.6, '#120f1c'], [1, '#07060c']])
  c.fill()
  c.strokeStyle = iris; c.lineWidth = Math.max(0.7, r * 0.18)
  c.beginPath(); c.arc(x, y, r * 0.62, 0, Math.PI * 2); c.stroke()
  c.restore()
  light(c, x, y, r * 0.9 * glow + 0.8, iris, pupil)
  c.save()
  c.fillStyle = 'rgba(255,255,255,0.85)'
  c.beginPath(); c.ellipse(x - r * 0.38, y - r * 0.42, r * 0.28, r * 0.17, -0.6, 0, Math.PI * 2); c.fill()
  c.restore()
}

export function rivets(c: Ctx, pts: [number, number][], r = 0.6) {
  c.save()
  for (const [x, y] of pts) {
    c.fillStyle = 'rgba(0,0,0,0.55)'
    c.beginPath(); c.arc(x + 0.25, y + 0.3, r, 0, Math.PI * 2); c.fill()
    c.fillStyle = 'rgba(255,255,255,0.55)'
    c.beginPath(); c.arc(x - 0.1, y - 0.1, r * 0.7, 0, Math.PI * 2); c.fill()
  }
  c.restore()
}

/** Diagonal two-colour stripes clipped to a path (hazard marks). */
export function stripes(c: Ctx, path: PathFn, a: string, b: string, step = 3, angle = 0.8, lw = 1) {
  c.save()
  path(c)
  c.fillStyle = a
  c.fill()
  c.clip()
  const cw = c.canvas.width, ch = c.canvas.height
  const L = Math.max(cw, ch)
  c.translate(cw / 4, ch / 4)
  c.rotate(angle)
  c.fillStyle = b
  for (let x = -L; x < L; x += step * 2) c.fillRect(x, -L, step, L * 2)
  c.restore()
  if (lw > 0) { path(c); c.strokeStyle = PAL.ink; c.lineWidth = lw; c.stroke() }
}

/** Additive teardrop plume. dir = +1 plume goes down (+y), -1 goes up. */
export function plume(c: Ctx, x: number, y: number, len: number, wid: number, col: string, hot: string, dir = 1) {
  c.save()
  c.globalCompositeOperation = 'lighter'
  const y1 = y + len * dir
  c.fillStyle = lin(c, x, y, x, y1, [[0, hot], [0.3, col], [1, 'rgba(0,0,0,0)']])
  c.beginPath()
  c.moveTo(x - wid / 2, y)
  c.quadraticCurveTo(x - wid * 0.45, y + len * 0.45 * dir, x, y1)
  c.quadraticCurveTo(x + wid * 0.45, y + len * 0.45 * dir, x + wid / 2, y)
  c.closePath()
  c.fill()
  c.restore()
}

/** Deterministic PRNG so every paint is identical between runs. */
export function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Irregular rounded blob outline (rocks, organic nodes). */
export function blobFn(cx: number, cy: number, rx: number, ry: number, seed: number, n = 11, jag = 0.18): PathFn {
  const r = rng(seed)
  const pts: Pt[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (r() - 0.5) * 0.35
    const k = 1 - jag + r() * jag * 2
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k, r() < 0.3 ? 1 : 0])
  }
  return c => smoothPoly(c, pts)
}

/** A short line of emissive light (engine strip, running light) without the ink under-stroke. */
export function glowLine(c: Ctx, x0: number, y0: number, x1: number, y1: number, w: number, col: string, a = 1) {
  c.save()
  c.globalCompositeOperation = 'lighter'
  c.lineCap = 'round'
  c.globalAlpha = a * 0.45
  c.strokeStyle = col; c.lineWidth = w * 2.6
  c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke()
  c.globalAlpha = a
  c.lineWidth = w
  c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke()
  c.restore()
}

/** Dark grille of n parallel slots inside a rect (vents, intakes). */
export function grille(c: Ctx, x: number, y: number, w: number, h: number, n: number, vertical = false) {
  c.save()
  c.fillStyle = 'rgba(10,8,16,0.8)'
  c.beginPath(); c.roundRect(x, y, w, h, 1); c.fill()
  c.strokeStyle = 'rgba(255,255,255,0.18)'
  c.lineWidth = 0.6
  c.beginPath()
  for (let i = 1; i < n; i++) {
    if (vertical) { const xx = x + (w * i) / n; c.moveTo(xx, y + 0.6); c.lineTo(xx, y + h - 0.6) }
    else { const yy = y + (h * i) / n; c.moveTo(x + 0.6, yy); c.lineTo(x + w - 0.6, yy) }
  }
  c.stroke()
  c.restore()
}
