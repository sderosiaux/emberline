/**
 * Vector motifs shared by baked background tiles and ground props, so a mesa in
 * the terrain and a scripted prop_mesa read as the same thing.
 * Light always comes from the upper-left; cast shadows fall to the lower-right.
 */
import { fbm2, rng } from '../../core/math'
import { blob, drain, field, hash3, li, path, rgba, smoothPath, type Ctx, type Pt, type RGB } from './kit'

/** Flat-topped rock plateau with stepped cliffs and a long cast shadow. */
export function mesa(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, seed: number, shadowLen = 1) {
  const pts = blob(cx, cy, rx, ry, seed, 0.28, 56)
  const r = Math.max(rx, ry)
  ctx.save()
  const rr = rng(seed)
  // cast shadow: a swept silhouette toward the lower-right, soft far edge
  for (let i = 0; i <= 10; i++) {
    const k = (i / 10) * 0.55 * shadowLen
    ctx.fillStyle = `rgba(80,44,58,${i === 10 ? 0.08 : 0.05})`
    smoothPath(ctx, pts, r * k * 0.8, r * k * 1.05)
    ctx.fill()
  }
  // talus: rubble fanned around the foot
  for (let i = 0; i < r * 0.8; i++) {
    const p = pts[rr.int(0, pts.length - 1)]
    const a = Math.atan2(p[1] - cy, p[0] - cx)
    const d = rr.range(2, r * 0.18)
    pebble(ctx, p[0] + Math.cos(a) * d + 3, p[1] + Math.sin(a) * d + 4, rr.range(1.2, 3.2), rr.int(1, 1e6), '#b98a60', '#6e4630')
  }
  // cliff walls
  const depth = Math.max(8, r * 0.22)
  for (let d = depth; d > 0; d -= 1.5) {
    const t = d / depth
    ctx.fillStyle = `rgb(${128 - t * 44},${72 - t * 26},${52 - t * 14})`
    smoothPath(ctx, pts, d * 0.7, d)
    ctx.fill()
  }
  // strata bands on the cliff
  ctx.strokeStyle = 'rgba(60,28,20,0.35)'
  ctx.lineWidth = 1
  for (let d = depth * 0.33; d < depth; d += depth * 0.33) {
    smoothPath(ctx, pts, d * 0.7, d)
    ctx.stroke()
  }
  // plateau top
  const g = ctx.createLinearGradient(cx - rx, cy - ry, cx + rx, cy + ry)
  g.addColorStop(0, '#dfae7c')
  g.addColorStop(0.55, '#c38e5e')
  g.addColorStop(1, '#a36f48')
  ctx.fillStyle = g
  smoothPath(ctx, pts)
  ctx.fill()
  // terraces
  for (const s of [0.78, 0.55]) {
    const inner = pts.map(([x, y]): Pt => [cx + (x - cx) * s + rr.range(-2, 2), cy + (y - cy) * s + rr.range(-2, 2)])
    ctx.fillStyle = rgba('#ecb785', 0.35)
    smoothPath(ctx, inner, -1.5, -2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(120,62,36,0.35)'
    ctx.lineWidth = 1.2
    smoothPath(ctx, inner)
    ctx.stroke()
  }
  // rim light on the upper-left edge
  ctx.save()
  smoothPath(ctx, pts)
  ctx.clip()
  ctx.strokeStyle = 'rgba(255,226,180,0.55)'
  ctx.lineWidth = 3
  smoothPath(ctx, pts, 1.5, 2)
  ctx.stroke()
  // speckle & erosion gullies
  for (let i = 0; i < r * 1.2; i++) {
    const a = rr.range(0, Math.PI * 2), d = Math.sqrt(rr.next())
    const x = cx + Math.cos(a) * rx * d, y = cy + Math.sin(a) * ry * d
    ctx.fillStyle = rr.chance(0.5) ? 'rgba(110,55,32,0.3)' : 'rgba(255,220,170,0.25)'
    ctx.fillRect(x, y, rr.range(1, 2.5), rr.range(1, 2.5))
  }
  ctx.restore()
  ctx.restore()
}

/** Small rock with shadow. */
export function pebble(ctx: Ctx, x: number, y: number, s: number, seed: number, light = '#c99a6c', dark = '#7b5236', shadow = 'rgba(70,40,30,0.3)') {
  const pts = blob(x, y, s, s * 0.8, seed, 0.35, 10)
  ctx.fillStyle = shadow
  path(ctx, pts, s * 0.5, s * 0.6)
  ctx.fill()
  const g = ctx.createLinearGradient(x - s, y - s, x + s, y + s)
  g.addColorStop(0, light)
  g.addColorStop(1, dark)
  ctx.fillStyle = g
  path(ctx, pts)
  ctx.fill()
}

/** Top-down conifer: layered needle whorls with a snow cap and a cast shadow. */
export function pine(ctx: Ctx, x: number, y: number, s: number, seed: number, dark = '#2c4a4c', mid = '#4d7270', snow = 0.5, shadow = true) {
  const r = rng(seed)
  const arms = 9 + r.int(0, 4)
  const rot = r.range(0, 6.28)
  const whorl = (rad: number, dx: number, dy: number) => {
    ctx.beginPath()
    for (let i = 0; i < arms * 2; i++) {
      const a = (i / (arms * 2)) * Math.PI * 2 + rot
      const rr = i % 2 === 0 ? rad * r.range(0.85, 1.1) : rad * 0.6
      const px = x + dx + Math.cos(a) * rr, py = y + dy + Math.sin(a) * rr
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
  }
  if (shadow) {
    ctx.fillStyle = 'rgba(50,70,110,0.2)'
    ctx.beginPath(); ctx.ellipse(x + s * 0.8, y + s, s * 1.1, s * 0.8, 0.8, 0, Math.PI * 2); ctx.fill()
  }
  ctx.fillStyle = dark
  whorl(s, 0, 0)
  ctx.fill()
  ctx.fillStyle = mid
  whorl(s * 0.66, -s * 0.12, -s * 0.15)
  ctx.fill()
  if (snow > 0) {
    ctx.fillStyle = `rgba(236,244,250,${snow})`
    whorl(s * 0.36, -s * 0.22, -s * 0.26)
    ctx.fill()
  }
}

/**
 * Lit asteroid/boulder sprite: noisy outline, dome + crater relief, light from
 * the upper-left. `ramp` runs shadow → highlight.
 */
export function rockSprite(size: number, seed: number, ramp: Uint8Array, craters = 5, rim: RGB | null = null) {
  const r = rng(seed)
  const cr = Array.from({ length: craters }, () => ({ x: r.range(-0.6, 0.6), y: r.range(-0.6, 0.6), s: r.range(0.08, 0.25) }))
  const lx = -0.6, ly = -0.7, lz = 0.4
  const h = (u: number, v: number) => {
    const a = Math.atan2(v, u)
    const rr = 0.78 + (fbm2(Math.cos(a) * 1.4 + 3, Math.sin(a) * 1.4 + 3, seed, 4) - 0.5) * 0.5
    const d = Math.hypot(u, v) / rr
    if (d >= 1) return -1
    let z = Math.sqrt(1 - d * d) + (fbm2(u * 3 + 9, v * 3 + 9, seed + 1, 4) - 0.5) * 0.5
    for (const c of cr) {
      const e = Math.hypot(u - c.x, v - c.y) / c.s
      if (e < 1.3) z += e < 1 ? -(1 - e * e) * c.s * 0.8 : (1.3 - e) * c.s * 0.8
    }
    return z
  }
  const e = 2 / size
  return drain(field(size, size, (x, y, o, i) => {
    const u = (x / size) * 2 - 1, v = (y / size) * 2 - 1
    const z = h(u, v)
    if (z < 0) { o[i + 3] = 0; return }
    const zx = h(u + e, v), zy = h(u, v + e)
    const nx = -((zx < 0 ? z : zx) - z) / e * 0.35, ny = -((zy < 0 ? z : zy) - z) / e * 0.35
    const l = (nx * lx + ny * ly + lz) / Math.hypot(nx, ny, 1)
    const j = li(l * 0.9 + 0.15 + (hash3(x, y, seed) - 0.5) * 0.06)
    o[i] = ramp[j]; o[i + 1] = ramp[j + 1]; o[i + 2] = ramp[j + 2]
    if (rim) {
      // back-light rim on the lower-right edge
      const edge = zx < 0 || zy < 0 ? 1 : 0
      if (edge) { o[i] = rim[0]; o[i + 1] = rim[1]; o[i + 2] = rim[2] }
    }
    o[i + 3] = 255
  }))
}

export interface HullPal { light: string; mid: string; dark: string; rim: string; line: string; window: string }
export const WRECK_PAL: HullPal = { light: '#56685f', mid: '#34423f', dark: '#1a2323', rim: '#9cc2b4', line: 'rgba(10,16,16,0.55)', window: 'rgba(150,190,170,0.35)' }

/**
 * Derelict capital-ship hull seen from above, bow up, snapped in two with a gap
 * of exposed ribs. Fills the box (0,0,w,h). Returns anchor points for blinking
 * emergency lights and spark emitters (relative to the box).
 */
export function wreck(ctx: Ctx, w: number, h: number, seed: number, pal: HullPal = WRECK_PAL) {
  const r = rng(seed)
  const cx = w / 2
  const hw = w * 0.42
  const brk = h * r.range(0.45, 0.62)
  const gap = h * 0.05
  const anchors: Pt[] = []
  // right-half outline, bow → stern
  const outline: Pt[] = [[0, 0], [hw * 0.25, h * 0.06], [hw * 0.62, h * 0.2], [hw * 0.85, h * 0.36], [hw, h * 0.5], [hw, h * 0.86], [hw * 0.8, h * 0.93], [hw * 0.8, h], [0, h]]
  const hullPath = () => {
    ctx.beginPath()
    ctx.moveTo(cx + outline[0][0], outline[0][1])
    for (const [px, py] of outline) ctx.lineTo(cx + px, py)
    for (let i = outline.length - 1; i >= 0; i--) ctx.lineTo(cx - outline[i][0], outline[i][1])
    ctx.closePath()
  }
  const jag = (y0: number) => {
    const pts: Pt[] = []
    for (let x = -hw - 4; x <= hw + 4; x += w * 0.06) pts.push([cx + x, y0 + r.range(-h * 0.03, h * 0.03)])
    return pts
  }
  const top = jag(brk - gap / 2), bot = jag(brk + gap / 2)
  const half = (upper: boolean, fn: () => void) => {
    ctx.save()
    ctx.beginPath()
    const edge = upper ? top : bot
    ctx.moveTo(-10, upper ? -10 : h + 10)
    for (const p of edge) ctx.lineTo(p[0], p[1])
    ctx.lineTo(w + 10, upper ? -10 : h + 10)
    ctx.closePath()
    ctx.clip()
    fn()
    ctx.restore()
  }
  const paint = () => {
    hullPath()
    const g = ctx.createLinearGradient(0, 0, w, h * 0.3)
    g.addColorStop(0, pal.light)
    g.addColorStop(0.5, pal.mid)
    g.addColorStop(1, pal.dark)
    ctx.fillStyle = g
    ctx.fill()
    ctx.save()
    hullPath()
    ctx.clip()
    // spine and armour bands
    ctx.fillStyle = 'rgba(0,0,0,0.18)'
    ctx.fillRect(cx - w * 0.06, 0, w * 0.12, h)
    ctx.fillStyle = 'rgba(255,255,255,0.06)'
    ctx.fillRect(cx - w * 0.06, 0, w * 0.03, h)
    ctx.strokeStyle = pal.line
    ctx.lineWidth = 1
    for (let y = h * 0.08; y < h; y += r.range(h * 0.03, h * 0.06)) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke() }
    for (const f of [0.3, 0.62]) for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + s * hw * f, 0); ctx.lineTo(cx + s * hw * f, h); ctx.stroke() }
    // turret mounts, dead windows
    for (let i = 0; i < 6; i++) {
      const ty = h * r.range(0.15, 0.9), tx = cx + (r.chance(0.5) ? -1 : 1) * hw * r.range(0.3, 0.6)
      const tr = w * r.range(0.05, 0.08)
      ctx.fillStyle = pal.dark
      ctx.beginPath(); ctx.arc(tx + 1.5, ty + 2, tr, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = pal.mid
      ctx.beginPath(); ctx.arc(tx, ty, tr, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = pal.rim
      ctx.globalAlpha = 0.35
      ctx.beginPath(); ctx.arc(tx, ty, tr, Math.PI, Math.PI * 1.6); ctx.stroke()
      ctx.globalAlpha = 1
    }
    ctx.fillStyle = pal.window
    for (let i = 0; i < 40; i++) ctx.fillRect(cx + (r.chance(0.5) ? -1 : 1) * hw * r.range(0.7, 0.9), h * r.range(0.3, 0.95), 1.5, 3)
    // scorch
    for (let i = 0; i < 5; i++) {
      const sx = cx + r.range(-hw, hw), sy = r.range(0, h), sr = w * r.range(0.1, 0.25)
      const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr)
      sg.addColorStop(0, 'rgba(5,8,8,0.3)')
      sg.addColorStop(1, 'rgba(5,8,8,0)')
      ctx.fillStyle = sg
      ctx.fillRect(sx - sr, sy - sr, sr * 2, sr * 2)
    }
    ctx.restore()
    // rim light along the upper-left edges
    ctx.strokeStyle = pal.rim
    ctx.globalAlpha = 0.55
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(cx, 0)
    for (const [px, py] of outline.slice(0, 6)) ctx.lineTo(cx - px, py)
    ctx.stroke()
    ctx.globalAlpha = 1
  }
  // the break: gutted interior visible between the torn halves
  ctx.save()
  hullPath()
  ctx.clip()
  const gapPath = () => {
    ctx.beginPath()
    top.forEach(([u, v], i) => (i ? ctx.lineTo(u, v) : ctx.moveTo(u, v)))
    for (let i = bot.length - 1; i >= 0; i--) ctx.lineTo(bot[i][0], bot[i][1])
    ctx.closePath()
  }
  const ig = ctx.createLinearGradient(0, brk - gap, 0, brk + gap)
  ig.addColorStop(0, '#020505')
  ig.addColorStop(0.5, '#0a1212')
  ig.addColorStop(1, '#020505')
  ctx.fillStyle = ig
  gapPath()
  ctx.fill()
  // collapsed decks and bulkheads inside
  ctx.fillStyle = pal.dark
  for (let k = 0; k < 4; k++) ctx.fillRect(cx - hw + r.range(0, hw * 0.4), brk - gap * 0.3 + k * gap * 0.18, hw * r.range(0.6, 1.4), Math.max(1, gap * 0.06))
  ctx.fillStyle = 'rgba(120,160,150,0.12)'
  for (let k = 0; k < 3; k++) ctx.fillRect(cx + r.range(-hw, hw * 0.5), brk - gap * 0.4, Math.max(1, w * 0.01), gap * 0.8)
  ctx.restore()
  half(true, paint)
  half(false, paint)
  // torn plating: dark scorched lip + bright ragged edge on both sides of the break
  ctx.save()
  hullPath()
  ctx.clip()
  for (const [edge, dir] of [[top, 1], [bot, -1]] as const) {
    const teeth = () => {
      ctx.beginPath()
      edge.forEach(([u, v], i) => {
        const tv = v + dir * (i % 2 ? gap * 0.22 : 0)
        if (i) ctx.lineTo(u, tv)
        else ctx.moveTo(u, tv)
      })
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'
    ctx.lineWidth = Math.max(2, w * 0.02)
    teeth(); ctx.stroke()
    ctx.strokeStyle = pal.rim
    ctx.globalAlpha = 0.45
    ctx.lineWidth = 1
    teeth(); ctx.stroke()
    ctx.globalAlpha = 1
  }
  ctx.restore()
  // exposed ribs bridging the break
  ctx.strokeStyle = pal.mid
  ctx.lineWidth = Math.max(1.5, w * 0.012)
  for (let x = -hw * 0.8; x <= hw * 0.8; x += w * 0.09) {
    const a = top[Math.min(top.length - 1, Math.round((x + hw + 4) / (w * 0.06)))]
    ctx.beginPath(); ctx.moveTo(cx + x, a[1] - 2); ctx.lineTo(cx + x + r.range(-4, 4), a[1] + gap * r.range(0.4, 1.1)); ctx.stroke()
  }
  anchors.push([cx - hw * 0.6, brk - gap / 2], [cx + hw * 0.5, brk + gap / 2], [cx, h * 0.12], [cx + hw * 0.8, h * 0.8], [cx - hw * 0.7, h * 0.9])
  return anchors
}
